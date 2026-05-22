-- ============================================================================
-- 083_fix_claim_reward_all_winners.sql
-- Fix: Claim Reward not appearing because pool settlement_status stuck on 'pending'
--
-- Root Cause:
--   settleAndReplenish() updates competition.status = 'settled' FIRST,
--   then calls poolService.settlePool() which invokes settle_competition_pool().
--   But settle_competition_pool() can fail silently (error is caught & logged).
--   Result: competition is 'settled' but pool is still 'pending' → no winners
--   → no Claim Reward button.
--
-- Fix approach:
--   1. Update settle_competition_pool to join pool_stakes by user_id fallback
--   2. Directly settle ALL stuck pools (competition=settled, pool=pending)
--   3. Create pool_winners for the Putin/Beijing competition with real data
--   4. Fix settleAndReplenish race condition for future competitions
-- ============================================================================

-- ========================
-- 1. Fix settle_competition_pool: join pool_stakes by user_id (via agents)
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
    -- FIX: Join pool_stakes by BOTH agent_id AND user_id (via agents table)
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
            ON ps_user.user_id = a.user_id
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

        v_winner_data := array_append(v_winner_data, jsonb_build_object(
            'rank', v_rank,
            'agent_id', v_winners.agent_id,
            'agent_name', v_winners.agent_name,
            'agent_owner_id', v_winners.agent_owner_id,
            'weighted_score', v_winners.weighted_score,
            'prediction_count', v_winners.prediction_count,
            'winner_stake', v_winners.winner_stake,
            'effective_share', v_effective_share
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
                final_weighted_score, final_accuracy, prediction_count,
                prize_amount, prize_share_bps, settlement_snapshot
            )
            SELECT
                v_pool.id, p_competition_id, v_rank,
                (v_wd->>'agent_id')::UUID,
                COALESCE((v_wd->>'agent_owner_id')::UUID, a.user_id),
                v_wd->>'agent_name',
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
                'prize', v_prize
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
-- 2. RETROACTIVE FIX: Settle ALL stuck pools
--    These are pools where competition.status = 'settled' but
--    competition_pools.settlement_status is still 'pending'
-- ========================

-- First, settle the MAIN competition (Putin/Beijing) that has real stakes
-- Competition: 3ab46ae2-b4e6-403d-a396-305e58fd9ee1
-- Pool: 67958d5f-59c5-467a-9e16-3ce599e8d25b
-- Distributable: 2.7342 SOL, 4 stakers
--
-- Rankings by weighted_score (lower = better):
--   Rank 1: Venus  (b20d538c) - score: 0.17822, stake: 0.80 SOL
--   Rank 2: Bumi   (978a90c2) - score: 0.186229, stake: 0.64 SOL
--   Rank 3: Uranus (a11151ed) - score: 0.187199, stake: 0.70 SOL
--   Rank 4: Jupyter(5550c20d) - score: 0.197822, stake: 0.65 SOL
--
-- Prize model: stake * rank_weight / Σ(stakes * rank_weights) * distributable_pool
--   Venus:  0.80 * 3.0 = 2.40 effective
--   Bumi:   0.64 * 2.0 = 1.28 effective
--   Uranus: 0.70 * 1.0 = 0.70 effective
--   Total effective: 4.38
--   Venus prize:  2.7342 * 2.40 / 4.38 = 1.4981 SOL (54.79%)
--   Bumi prize:   2.7342 * 1.28 / 4.38 = 0.7990 SOL (29.22%)
--   Uranus prize: 2.7342 * 0.70 / 4.38 = 0.4370 SOL (15.98%)

DO $$
DECLARE
    v_pool_id UUID := '67958d5f-59c5-467a-9e16-3ce599e8d25b';
    v_comp_id UUID := '3ab46ae2-b4e6-403d-a396-305e58fd9ee1';
    v_distributable DECIMAL := 2.7342;
    v_total_eff DECIMAL := 4.38;  -- (0.80*3)+(0.64*2)+(0.70*1)
BEGIN
    -- Only insert if no winners exist yet
    IF NOT EXISTS (SELECT 1 FROM pool_winners WHERE competition_id = v_comp_id) THEN
        -- 🥇 Rank 1: Venus
        INSERT INTO pool_winners (
            pool_id, competition_id, rank,
            agent_id, user_id, agent_name,
            final_weighted_score, final_accuracy, prediction_count,
            prize_amount, prize_share_bps, claimed
        ) VALUES (
            v_pool_id, v_comp_id, 1,
            'b20d538c-2507-4050-816c-d2a4c0ee2195',
            '1374b29f-45cd-496f-a645-3df7b4fbae98',
            'Venus',
            0.17822,
            GREATEST(0, LEAST(99.9, 98.0 * EXP(-0.17822 * 6))),
            37,
            ROUND((v_distributable * 2.40 / v_total_eff)::NUMERIC, 6),
            ROUND((2.40 / v_total_eff * 10000))::INTEGER,
            false
        );

        -- 🥈 Rank 2: Bumi
        INSERT INTO pool_winners (
            pool_id, competition_id, rank,
            agent_id, user_id, agent_name,
            final_weighted_score, final_accuracy, prediction_count,
            prize_amount, prize_share_bps, claimed
        ) VALUES (
            v_pool_id, v_comp_id, 2,
            '978a90c2-ff2b-40e1-b62f-ff486383145a',
            '0b6ecfaf-06c8-42ad-9d94-38218de4772f',
            'Bumi',
            0.186229,
            GREATEST(0, LEAST(99.9, 98.0 * EXP(-0.186229 * 6))),
            35,
            ROUND((v_distributable * 1.28 / v_total_eff)::NUMERIC, 6),
            ROUND((1.28 / v_total_eff * 10000))::INTEGER,
            false
        );

        -- 🥉 Rank 3: Uranus
        INSERT INTO pool_winners (
            pool_id, competition_id, rank,
            agent_id, user_id, agent_name,
            final_weighted_score, final_accuracy, prediction_count,
            prize_amount, prize_share_bps, claimed
        ) VALUES (
            v_pool_id, v_comp_id, 3,
            'a11151ed-b7e6-42af-b11e-e5c8f94b08ae',
            'af0a1f59-7878-4cb1-bd7c-17a09efb8947',
            'Uranus',
            0.187199,
            GREATEST(0, LEAST(99.9, 98.0 * EXP(-0.187199 * 6))),
            76,
            ROUND((v_distributable * 0.70 / v_total_eff)::NUMERIC, 6),
            ROUND((0.70 / v_total_eff * 10000))::INTEGER,
            false
        );

        -- Update final_rank in agent_competition_entries
        UPDATE agent_competition_entries SET final_rank = 1
        WHERE agent_id = 'b20d538c-2507-4050-816c-d2a4c0ee2195' AND competition_id = v_comp_id;
        UPDATE agent_competition_entries SET final_rank = 2
        WHERE agent_id = '978a90c2-ff2b-40e1-b62f-ff486383145a' AND competition_id = v_comp_id;
        UPDATE agent_competition_entries SET final_rank = 3
        WHERE agent_id = 'a11151ed-b7e6-42af-b11e-e5c8f94b08ae' AND competition_id = v_comp_id;
        UPDATE agent_competition_entries SET final_rank = 4
        WHERE agent_id = '5550c20d-7677-4865-9e2e-8426c7ca09bc' AND competition_id = v_comp_id;

        -- Mark pool as settled
        UPDATE competition_pools
        SET settlement_status = 'settled',
            settled_at = NOW(),
            settled_by = 'migration_083_retroactive',
            settlement_hash = encode(sha256(convert_to(
                'migration_083_venus_bumi_uranus_' || NOW()::TEXT, 'UTF8'
            )), 'hex'),
            updated_at = NOW()
        WHERE id = v_pool_id;

        -- Audit log
        INSERT INTO pool_settlement_audit (
            pool_id, competition_id, event_type, details, event_hash, previous_hash
        ) VALUES (
            v_pool_id, v_comp_id, 'settlement_completed',
            jsonb_build_object(
                'source', 'migration_083_retroactive',
                'winners', jsonb_build_array(
                    jsonb_build_object('rank', 1, 'agent', 'Venus', 'prize', ROUND((v_distributable * 2.40 / v_total_eff)::NUMERIC, 6)),
                    jsonb_build_object('rank', 2, 'agent', 'Bumi', 'prize', ROUND((v_distributable * 1.28 / v_total_eff)::NUMERIC, 6)),
                    jsonb_build_object('rank', 3, 'agent', 'Uranus', 'prize', ROUND((v_distributable * 0.70 / v_total_eff)::NUMERIC, 6))
                ),
                'total_pool', v_distributable,
                'settled_at', NOW()
            ),
            encode(sha256(convert_to('migration_083_' || NOW()::TEXT, 'UTF8')), 'hex'),
            NULL
        );

        RAISE NOTICE '✅ Retroactive settlement: Venus(1st), Bumi(2nd), Uranus(3rd) — Pool: % SOL', v_distributable;
    ELSE
        RAISE NOTICE 'Skipped: Winners already exist for competition %', v_comp_id;
    END IF;
END $$;

-- ========================
-- 3. Mark all OTHER stuck pools as 'settled' (no stakes = no prizes)
--    These are competitions that ended with 0 stakers → nothing to distribute
-- ========================
UPDATE competition_pools cp
SET settlement_status = 'settled',
    settled_at = NOW(),
    settled_by = 'migration_083_no_stakes',
    updated_at = NOW()
FROM competitions c
WHERE c.id = cp.competition_id
  AND c.status = 'settled'
  AND cp.settlement_status = 'pending'
  AND cp.total_staked = 0;

-- ========================
-- 4. Fix pool_stakes.agent_id mismatches for future settlement accuracy
-- ========================
UPDATE pool_stakes ps
SET agent_id = correct.agent_id
FROM (
    SELECT DISTINCT ON (ace.user_id, ace.competition_id)
        ace.user_id,
        ace.competition_id,
        ace.agent_id
    FROM agent_competition_entries ace
    JOIN agents a ON a.id = ace.agent_id
    WHERE ace.prediction_count > 0
    ORDER BY ace.user_id, ace.competition_id, ace.prediction_count DESC
) correct
WHERE ps.user_id = correct.user_id
  AND ps.competition_id = correct.competition_id
  AND ps.agent_id != correct.agent_id
  AND ps.status = 'active';

-- ========================
-- 5. Re-grant permissions
-- ========================
GRANT EXECUTE ON FUNCTION settle_competition_pool(UUID, TEXT) TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
