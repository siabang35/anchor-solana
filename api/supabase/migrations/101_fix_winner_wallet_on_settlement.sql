-- ============================================================================
-- 101_fix_winner_wallet_on_settlement.sql
-- Fix: Winners can't claim prizes because pool_winners.user_id is a Supabase
--      auth UUID, not a Solana wallet pubkey. The frontend and backend both
--      check against the connected wallet, which never matches a UUID.
--
-- Root Cause:
--   settle_competition_pool() inserts user_id from agents.user_id (UUID).
--   But in ExoDuZe's wallet-auth pattern, user_id IS the wallet pubkey.
--   For users who signed up via email/OAuth, user_id is a UUID, and
--   their wallet address is stored separately in wallet_addresses table.
--
-- Fix:
--   1. Ensure winner_wallet column exists on pool_winners
--   2. Update settle_competition_pool() to also populate winner_wallet
--      by resolving the agent owner's Solana wallet address at settlement time
--   3. Retroactively fix all existing pool_winners with missing winner_wallet
-- ============================================================================

-- ========================
-- 0. Ensure winner_wallet column exists (MUST be before functions & updates)
-- ========================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pool_winners' AND column_name = 'winner_wallet'
    ) THEN
        ALTER TABLE pool_winners ADD COLUMN winner_wallet TEXT;
    END IF;
END $$;

-- ========================
-- 1. Updated settle_competition_pool: populate winner_wallet at settlement
-- ========================
CREATE OR REPLACE FUNCTION settle_competition_pool(
    p_competition_id UUID,
    p_settled_by TEXT DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
    v_pool competition_pools%ROWTYPE;
    v_winners RECORD;
    v_rank INTEGER := 0;
    v_prize DECIMAL;
    v_rank_weight DECIMAL;
    v_effective_share DECIMAL;
    v_total_effective DECIMAL := 0;
    v_result JSONB := '[]'::JSONB;
    v_snapshot JSONB;
    v_winner_data JSONB[] := ARRAY[]::JSONB[];
    v_wd JSONB;
    v_resolved_wallet TEXT;
BEGIN
    -- Lock the pool row for settlement
    SELECT * INTO v_pool
    FROM competition_pools
    WHERE competition_id = p_competition_id
    FOR UPDATE;

    IF v_pool IS NULL THEN
        RAISE EXCEPTION 'No pool found for competition %', p_competition_id;
    END IF;

    IF v_pool.settlement_status NOT IN ('pending', 'settling') THEN
        RAISE EXCEPTION 'Pool already in status: %', v_pool.settlement_status;
    END IF;

    -- Mark as settling (lock)
    UPDATE competition_pools
    SET settlement_status = 'settling', updated_at = NOW()
    WHERE id = v_pool.id;

    -- Get full leaderboard snapshot for audit
    BEGIN
        SELECT jsonb_agg(row_to_json(lb.*)) INTO v_snapshot
        FROM get_weighted_leaderboard(p_competition_id, 100) lb;
    EXCEPTION WHEN OTHERS THEN
        v_snapshot := '[]'::JSONB;
    END;

    -- ═══════════════════════════════════════════════════════════════
    -- PHASE 1: Collect top 3 winners + their actual stakes
    -- ═══════════════════════════════════════════════════════════════
    FOR v_winners IN
        SELECT
            ace.agent_id,
            a.name AS agent_name,
            a.user_id AS agent_owner_id,
            ace.weighted_score,
            ace.brier_score AS raw_brier_avg,
            ace.prediction_count,
            COALESCE(
                ps_agent.stake_amount,
                ps_user.stake_amount,
                0
            ) AS winner_stake
        FROM agent_competition_entries ace
        JOIN agents a ON a.id = ace.agent_id
        LEFT JOIN pool_stakes ps_agent
            ON ps_agent.agent_id = ace.agent_id
            AND ps_agent.competition_id = p_competition_id
            AND ps_agent.status = 'active'
        LEFT JOIN pool_stakes ps_user
            ON ps_user.user_id::TEXT = a.user_id::TEXT
            AND ps_user.competition_id = p_competition_id
            AND ps_user.status = 'active'
            AND ps_agent.id IS NULL
        WHERE ace.competition_id = p_competition_id
          AND ace.prediction_count > 0
          AND (
              COALESCE(ps_agent.stake_amount, 0) > 0
              OR COALESCE(ps_user.stake_amount, 0) > 0
          )
        ORDER BY
            (ace.prediction_count >= COALESCE(
                (SELECT min_predictions FROM leaderboard_score_config WHERE competition_id = p_competition_id),
                3
            )) DESC,
            COALESCE(ace.weighted_score, 99.9999) ASC,
            ace.prediction_count DESC,
            a.created_at ASC
        LIMIT 3
    LOOP
        v_rank := v_rank + 1;

        CASE v_rank
            WHEN 1 THEN v_rank_weight := COALESCE(v_pool.rank_1_weight, 3.00);
            WHEN 2 THEN v_rank_weight := COALESCE(v_pool.rank_2_weight, 2.00);
            WHEN 3 THEN v_rank_weight := COALESCE(v_pool.rank_3_weight, 1.00);
            ELSE CONTINUE;
        END CASE;

        v_effective_share := v_winners.winner_stake * v_rank_weight;
        v_total_effective := v_total_effective + v_effective_share;

        -- ═══════════════════════════════════════════════════════
        -- FIX: Resolve wallet address for the agent owner
        -- Priority: 1) user_id IS a Solana pubkey (32-44 chars, no dashes)
        --           2) Look up from pool_stakes (staker wallet)
        --           3) Look up from wallet_addresses table
        -- ═══════════════════════════════════════════════════════
        v_resolved_wallet := NULL;

        -- Check if user_id is already a Solana wallet pubkey (no dashes, 32-44 chars)
        IF v_winners.agent_owner_id IS NOT NULL
           AND length(v_winners.agent_owner_id::TEXT) >= 32
           AND length(v_winners.agent_owner_id::TEXT) <= 44
           AND position('-' IN v_winners.agent_owner_id::TEXT) = 0 THEN
            v_resolved_wallet := v_winners.agent_owner_id::TEXT;
        ELSE
            -- Try pool_stakes: the user_id who staked for this agent (they used their wallet)
            SELECT ps2.user_id::TEXT INTO v_resolved_wallet
            FROM pool_stakes ps2
            WHERE ps2.competition_id = p_competition_id
              AND (ps2.agent_id = v_winners.agent_id OR ps2.user_id::TEXT = v_winners.agent_owner_id::TEXT)
              AND ps2.status = 'active'
              AND length(ps2.user_id::TEXT) >= 32
              AND length(ps2.user_id::TEXT) <= 44
              AND position('-' IN ps2.user_id::TEXT) = 0
            LIMIT 1;

            -- Try wallet_addresses table
            IF v_resolved_wallet IS NULL THEN
                SELECT wa.address INTO v_resolved_wallet
                FROM wallet_addresses wa
                WHERE wa.user_id::TEXT = v_winners.agent_owner_id::TEXT
                LIMIT 1;
            END IF;
        END IF;

        v_winner_data := array_append(v_winner_data, jsonb_build_object(
            'rank', v_rank,
            'agent_id', v_winners.agent_id,
            'agent_name', v_winners.agent_name,
            'agent_owner_id', v_winners.agent_owner_id,
            'weighted_score', v_winners.weighted_score,
            'prediction_count', v_winners.prediction_count,
            'winner_stake', v_winners.winner_stake,
            'effective_share', v_effective_share,
            'resolved_wallet', v_resolved_wallet
        ));
    END LOOP;

    -- ═══════════════════════════════════════════════════════════════
    -- PHASE 2: Calculate proportional prizes and insert winners
    -- ═══════════════════════════════════════════════════════════════
    IF v_total_effective > 0 THEN
        FOREACH v_wd IN ARRAY v_winner_data
        LOOP
            v_effective_share := (v_wd->>'effective_share')::DECIMAL;
            v_prize := v_pool.distributable_pool * v_effective_share / v_total_effective;
            v_rank := (v_wd->>'rank')::INTEGER;

            INSERT INTO pool_winners (
                pool_id, competition_id, rank,
                agent_id, user_id, agent_name,
                winner_wallet,
                final_weighted_score, final_accuracy, prediction_count,
                prize_amount, prize_share_bps, settlement_snapshot
            )
            SELECT
                v_pool.id, p_competition_id, v_rank,
                (v_wd->>'agent_id')::UUID,
                COALESCE((v_wd->>'agent_owner_id')::UUID, a.user_id),
                v_wd->>'agent_name',
                v_wd->>'resolved_wallet',
                (v_wd->>'weighted_score')::DECIMAL,
                GREATEST(0, LEAST(99.9, 98.0 * EXP(-COALESCE((v_wd->>'weighted_score')::DECIMAL, 0) * 6))),
                (v_wd->>'prediction_count')::INTEGER,
                v_prize,
                CASE WHEN v_total_effective > 0
                    THEN ROUND(v_effective_share / v_total_effective * 10000)::INTEGER
                    ELSE 0
                END,
                v_snapshot
            FROM agents a WHERE a.id = (v_wd->>'agent_id')::UUID;

            UPDATE agent_competition_entries
            SET final_rank = v_rank
            WHERE agent_id = (v_wd->>'agent_id')::UUID
              AND competition_id = p_competition_id;

            v_result := v_result || jsonb_build_object(
                'rank', v_rank,
                'agent_id', v_wd->>'agent_id',
                'agent_name', v_wd->>'agent_name',
                'stake', v_wd->>'winner_stake',
                'effective_share_pct', ROUND(v_effective_share / v_total_effective * 100, 2),
                'prize', v_prize,
                'wallet', v_wd->>'resolved_wallet'
            );
        END LOOP;
    END IF;

    -- Finalize settlement
    UPDATE competition_pools
    SET
        settlement_status = 'settled',
        settled_at = NOW(),
        settled_by = p_settled_by,
        settlement_hash = encode(sha256(convert_to(v_result::TEXT || NOW()::TEXT, 'UTF8')), 'hex'),
        updated_at = NOW()
    WHERE id = v_pool.id;

    UPDATE competitions
    SET status = 'settled', updated_at = NOW()
    WHERE id = p_competition_id;

    -- Audit log
    BEGIN
        INSERT INTO pool_settlement_audit (
            pool_id, competition_id, event_type, details, event_hash, previous_hash
        )
        VALUES (
            v_pool.id, p_competition_id, 'settlement_completed',
            jsonb_build_object(
                'winners', v_result,
                'total_pool', v_pool.distributable_pool,
                'winner_count', v_rank,
                'settled_by', p_settled_by
            ),
            encode(sha256(convert_to(v_result::TEXT, 'UTF8')), 'hex'),
            NULL
        );
    EXCEPTION WHEN OTHERS THEN
        -- Non-blocking: settlement still succeeds even if audit fails
        NULL;
    END;

    RETURN jsonb_build_object(
        'status', 'settled',
        'pool_total', v_pool.total_staked,
        'distributable', v_pool.distributable_pool,
        'platform_fee', v_pool.platform_fee,
        'winner_count', v_rank,
        'winners', v_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION settle_competition_pool(UUID, TEXT) TO service_role;

-- ========================
-- 2. Retroactively fix existing pool_winners with missing winner_wallet
--    Resolve wallet from: pool_stakes.user_id (if it's a wallet pubkey)
--                         OR wallet_addresses.address
-- ========================
UPDATE pool_winners pw
SET winner_wallet = resolved.wallet
FROM (
    SELECT DISTINCT ON (pw2.id)
        pw2.id AS winner_id,
        COALESCE(
            -- Direct: user_id is already a wallet pubkey
            CASE
                WHEN length(pw2.user_id::TEXT) >= 32
                     AND length(pw2.user_id::TEXT) <= 44
                     AND position('-' IN pw2.user_id::TEXT) = 0
                THEN pw2.user_id::TEXT
                ELSE NULL
            END,
            -- From pool_stakes: find the staker's wallet
            (
                SELECT ps.user_id::TEXT
                FROM pool_stakes ps
                WHERE ps.competition_id = pw2.competition_id
                  AND (ps.agent_id = pw2.agent_id OR ps.user_id::TEXT = pw2.user_id::TEXT)
                  AND ps.status = 'active'
                  AND length(ps.user_id::TEXT) >= 32
                  AND length(ps.user_id::TEXT) <= 44
                  AND position('-' IN ps.user_id::TEXT) = 0
                LIMIT 1
            ),
            -- From wallet_addresses table
            (
                SELECT wa.address
                FROM wallet_addresses wa
                WHERE wa.user_id::TEXT = pw2.user_id::TEXT
                LIMIT 1
            )
        ) AS wallet
    FROM pool_winners pw2
    WHERE pw2.winner_wallet IS NULL
       OR pw2.winner_wallet = ''
) resolved
WHERE pw.id = resolved.winner_id
  AND resolved.wallet IS NOT NULL;

-- ========================
-- 3. Grant RLS-compatible read on pool_winners for claim eligibility
-- ========================
GRANT SELECT ON pool_winners TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
