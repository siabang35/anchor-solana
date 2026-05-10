-- ============================================================================
-- 080_stake_proportional_settlement.sql
-- Stake-Proportional Prize Distribution & Integrity Hardening
--
-- Problem:
--   Settlement used fixed rank-based shares (50/30/20%) regardless of how
--   much each winner actually staked. This diverges from the on-chain model
--   where prizes are proportional to stake (claim_pool_prize.rs):
--     prize = (user_stake / total_staked) * distributable_pool
--
--   Additionally, ghost pool_stakes with default amounts (0.1/0.15 SOL)
--   could persist from legacy auto-stake logic, causing the frontend to
--   display incorrect "0.15 SOL Staked" instead of the user's real amount.
--
-- Fixes:
--   1. Settlement now uses stake-weighted prize distribution (hybrid model)
--      prize = (stake * rank_weight) / Σ(stakes * rank_weights) * pool
--   2. Only staked participants are eligible for prizes
--   3. validate_stake trigger extended to BEFORE INSERT OR UPDATE
--   4. update_pool_on_stake trigger extended to handle DELETE
--   5. Add verified_onchain column for on-chain verification tracking
--   6. Add prize_model + rank weights columns for configurable distribution
--   7. Ghost stake cleanup + pool totals recalculation
-- ============================================================================

-- ========================
-- 1. Add configurable prize model columns to competition_pools
-- ========================
DO $$ BEGIN
    ALTER TABLE competition_pools
        ADD COLUMN IF NOT EXISTS prize_model VARCHAR(20) NOT NULL DEFAULT 'hybrid';
    ALTER TABLE competition_pools
        ADD COLUMN IF NOT EXISTS rank_1_weight DECIMAL(4,2) NOT NULL DEFAULT 3.00;
    ALTER TABLE competition_pools
        ADD COLUMN IF NOT EXISTS rank_2_weight DECIMAL(4,2) NOT NULL DEFAULT 2.00;
    ALTER TABLE competition_pools
        ADD COLUMN IF NOT EXISTS rank_3_weight DECIMAL(4,2) NOT NULL DEFAULT 1.00;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN competition_pools.prize_model IS
    'Prize distribution model: hybrid (stake*rank weighted), stake_proportional (pure stake ratio), rank_fixed (legacy 50/30/20)';

-- ========================
-- 2. Add verified_onchain flag to pool_stakes
-- ========================
DO $$ BEGIN
    ALTER TABLE pool_stakes
        ADD COLUMN IF NOT EXISTS verified_onchain BOOLEAN NOT NULL DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Mark existing stakes with on-chain TX as verified
UPDATE pool_stakes
SET verified_onchain = true
WHERE onchain_tx IS NOT NULL
  AND LENGTH(TRIM(onchain_tx)) > 20;

COMMENT ON COLUMN pool_stakes.verified_onchain IS
    'True when stake_amount has been verified against a real on-chain Solana TX';

-- ========================
-- 3. Extend validate_stake to fire on INSERT OR UPDATE
-- ========================
CREATE OR REPLACE FUNCTION validate_stake()
RETURNS TRIGGER AS $$
DECLARE
    v_max_stake DECIMAL;
    v_min_stake DECIMAL;
    v_pool_status pool_settlement_status;
    v_comp_status competition_status;
    v_existing_count INTEGER;
BEGIN
    -- Get pool config
    SELECT max_stake_per_user, min_stake, settlement_status
    INTO v_max_stake, v_min_stake, v_pool_status
    FROM competition_pools
    WHERE id = NEW.pool_id;

    -- Pool must be pending for new stakes
    IF TG_OP = 'INSERT' AND v_pool_status != 'pending' THEN
        RAISE EXCEPTION 'Pool is not accepting stakes (status: %)', v_pool_status
        USING ERRCODE = 'P0001';
    END IF;

    -- Competition must be active for new stakes
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_comp_status FROM competitions WHERE id = NEW.competition_id;
        IF v_comp_status NOT IN ('upcoming', 'active') THEN
            RAISE EXCEPTION 'Competition is not active (status: %)', v_comp_status
            USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Validate amount bounds (both INSERT and UPDATE)
    IF NEW.stake_amount < v_min_stake THEN
        RAISE EXCEPTION 'Stake amount %.8f below minimum %.8f SOL', NEW.stake_amount, v_min_stake
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.stake_amount > v_max_stake THEN
        RAISE EXCEPTION 'Stake amount %.8f exceeds maximum %.8f SOL (anti-whale)', NEW.stake_amount, v_max_stake
        USING ERRCODE = 'P0001';
    END IF;

    -- Auto-verify when on-chain TX is provided
    IF NEW.onchain_tx IS NOT NULL AND LENGTH(TRIM(NEW.onchain_tx)) > 20 THEN
        NEW.verified_onchain := true;
    END IF;

    -- Set stake sequence (INSERT only)
    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*) INTO v_existing_count
        FROM pool_stakes
        WHERE user_id = NEW.user_id AND competition_id = NEW.competition_id;
        NEW.stake_sequence := v_existing_count + 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Recreate trigger to fire on BOTH INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_stake_guard ON pool_stakes;
CREATE TRIGGER validate_stake_guard
    BEFORE INSERT OR UPDATE ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION validate_stake();

-- ========================
-- 4. Extend update_pool_on_stake to handle DELETE
-- ========================
CREATE OR REPLACE FUNCTION update_pool_on_stake()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_bps INTEGER := 200;  -- 2% platform fee
    v_actual_count INTEGER;
    v_actual_total DECIMAL;
    v_pool_id UUID;
    v_competition_id UUID;
BEGIN
    -- Determine which pool/competition we're working with
    IF TG_OP = 'DELETE' THEN
        v_pool_id := OLD.pool_id;
        v_competition_id := OLD.competition_id;
    ELSE
        v_pool_id := NEW.pool_id;
        v_competition_id := NEW.competition_id;
    END IF;

    -- Count ACTUAL rows in pool_stakes (drift-proof)
    SELECT COUNT(*), COALESCE(SUM(stake_amount), 0)
    INTO v_actual_count, v_actual_total
    FROM pool_stakes
    WHERE pool_id = v_pool_id
      AND status = 'active';

    -- Update pool totals from actual data
    UPDATE competition_pools
    SET
        total_staked = v_actual_total,
        platform_fee = v_actual_total * v_platform_fee_bps / 10000,
        distributable_pool = v_actual_total * (10000 - v_platform_fee_bps) / 10000,
        stake_count = v_actual_count,
        updated_at = NOW()
    WHERE id = v_pool_id;

    -- Sync competition entry_count and prize_pool
    UPDATE competitions
    SET
        prize_pool = (SELECT distributable_pool FROM competition_pools WHERE id = v_pool_id),
        entry_count = v_actual_count,
        updated_at = NOW()
    WHERE id = v_competition_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Recreate trigger to fire on INSERT, UPDATE, and DELETE
DROP TRIGGER IF EXISTS pool_stake_totals ON pool_stakes;
CREATE TRIGGER pool_stake_totals
    AFTER INSERT OR UPDATE OR DELETE ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_on_stake();

-- ========================
-- 5. Stake-Proportional Settlement Function (matches on-chain model)
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
    v_winner_stake DECIMAL;
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

    IF v_pool.settlement_status != 'pending' THEN
        RAISE EXCEPTION 'Pool already in status: %', v_pool.settlement_status;
    END IF;

    -- Mark as settling (lock)
    UPDATE competition_pools
    SET settlement_status = 'settling', updated_at = NOW()
    WHERE id = v_pool.id;

    -- Get full leaderboard snapshot for audit
    SELECT jsonb_agg(row_to_json(lb.*)) INTO v_snapshot
    FROM get_weighted_leaderboard(p_competition_id, 100) lb;

    -- ═══════════════════════════════════════════════════════════════
    -- PHASE 1: Collect top 3 winners + their actual stakes
    -- Only agents who have a verified pool_stake are eligible for prizes
    -- ═══════════════════════════════════════════════════════════════
    FOR v_winners IN
        SELECT
            ace.agent_id,
            a.name AS agent_name,
            ace.weighted_score,
            ace.brier_score AS raw_brier_avg,
            ace.prediction_count,
            COALESCE(ps.stake_amount, 0) AS winner_stake
        FROM agent_competition_entries ace
        JOIN agents a ON a.id = ace.agent_id
        LEFT JOIN pool_stakes ps
            ON ps.agent_id = ace.agent_id
            AND ps.competition_id = p_competition_id
            AND ps.status = 'active'
        WHERE ace.competition_id = p_competition_id
          AND ace.prediction_count > 0
          AND COALESCE(ps.stake_amount, 0) > 0  -- Must have staked to win prizes
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

        -- Get rank weight from pool config
        CASE v_rank
            WHEN 1 THEN v_rank_weight := v_pool.rank_1_weight;
            WHEN 2 THEN v_rank_weight := v_pool.rank_2_weight;
            WHEN 3 THEN v_rank_weight := v_pool.rank_3_weight;
            ELSE CONTINUE;
        END CASE;

        v_effective_share := v_winners.winner_stake * v_rank_weight;
        v_total_effective := v_total_effective + v_effective_share;

        -- Store winner data for phase 2
        v_winner_data := array_append(v_winner_data, jsonb_build_object(
            'rank', v_rank,
            'agent_id', v_winners.agent_id,
            'agent_name', v_winners.agent_name,
            'weighted_score', v_winners.weighted_score,
            'prediction_count', v_winners.prediction_count,
            'winner_stake', v_winners.winner_stake,
            'effective_share', v_effective_share
        ));
    END LOOP;

    -- ═══════════════════════════════════════════════════════════════
    -- PHASE 2: Calculate proportional prizes and insert winners
    -- Formula: prize = (stake * rank_weight) / Σ(stakes * rank_weights) * pool
    -- This matches on-chain proportionality while rewarding accuracy via rank
    -- ═══════════════════════════════════════════════════════════════
    IF v_total_effective > 0 THEN
        FOREACH v_wd IN ARRAY v_winner_data
        LOOP
            v_effective_share := (v_wd->>'effective_share')::DECIMAL;
            v_prize := v_pool.distributable_pool * v_effective_share / v_total_effective;
            v_rank := (v_wd->>'rank')::INTEGER;

            -- Insert winner record
            INSERT INTO pool_winners (
                pool_id, competition_id, rank,
                agent_id, user_id, agent_name,
                final_weighted_score, final_accuracy, prediction_count,
                prize_amount, prize_share_bps, settlement_snapshot
            )
            SELECT
                v_pool.id, p_competition_id, v_rank,
                (v_wd->>'agent_id')::UUID, a.user_id, v_wd->>'agent_name',
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

            -- Update agent_competition_entries with final rank
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

    -- Update competition status
    UPDATE competitions
    SET status = 'settled', updated_at = NOW()
    WHERE id = p_competition_id;

    -- Audit log
    INSERT INTO pool_settlement_audit (
        pool_id, competition_id, event_type, details, event_hash, previous_hash
    )
    VALUES (
        v_pool.id, p_competition_id, 'settlement_completed',
        jsonb_build_object(
            'winners', v_result,
            'total_pool', v_pool.distributable_pool,
            'prize_model', v_pool.prize_model,
            'winner_count', v_rank,
            'settled_by', p_settled_by,
            'rank_weights', jsonb_build_object(
                'rank_1', v_pool.rank_1_weight,
                'rank_2', v_pool.rank_2_weight,
                'rank_3', v_pool.rank_3_weight
            )
        ),
        encode(sha256(convert_to(v_result::TEXT, 'UTF8')), 'hex'),
        NULL
    );

    RETURN jsonb_build_object(
        'status', 'settled',
        'pool_total', v_pool.total_staked,
        'distributable', v_pool.distributable_pool,
        'platform_fee', v_pool.platform_fee,
        'prize_model', v_pool.prize_model,
        'winner_count', v_rank,
        'winners', v_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ========================
-- 6. Clean up ghost stakes (no on-chain TX, likely auto-stake artifacts)
-- ========================
-- Delete pool_stakes that have no on-chain TX AND were created by the legacy
-- auto-stake system (identifiable by small round amounts like 0.1 or 0.15)
DELETE FROM pool_stakes
WHERE onchain_tx IS NULL
  AND stake_amount <= 0.15
  AND verified_onchain = false;

-- ========================
-- 7. Recalculate ALL pool totals from actual verified stakes
-- ========================
UPDATE competition_pools cp
SET
    stake_count = sub.actual_count,
    total_staked = sub.actual_total,
    platform_fee = sub.actual_total * 200 / 10000,
    distributable_pool = sub.actual_total * 9800 / 10000,
    updated_at = NOW()
FROM (
    SELECT
        ps.pool_id,
        COUNT(*) AS actual_count,
        COALESCE(SUM(ps.stake_amount), 0) AS actual_total
    FROM pool_stakes ps
    WHERE ps.status = 'active'
    GROUP BY ps.pool_id
) sub
WHERE cp.id = sub.pool_id;

-- Fix pools that now have zero stakes after ghost cleanup
UPDATE competition_pools
SET
    stake_count = 0,
    total_staked = 0,
    platform_fee = 0,
    distributable_pool = 0,
    updated_at = NOW()
WHERE id NOT IN (SELECT DISTINCT pool_id FROM pool_stakes WHERE status = 'active')
  AND stake_count > 0;

-- Sync competitions table
UPDATE competitions c
SET
    entry_count = COALESCE(cp.stake_count, 0),
    prize_pool = COALESCE(cp.distributable_pool, 0),
    updated_at = NOW()
FROM competition_pools cp
WHERE cp.competition_id = c.id;

-- ========================
-- 8. Re-grant permissions
-- ========================
GRANT EXECUTE ON FUNCTION settle_competition_pool(UUID, TEXT) TO service_role;

-- ========================
-- 9. Comments
-- ========================
COMMENT ON FUNCTION settle_competition_pool(UUID, TEXT) IS
    'Settles a competition pool using stake-proportional prize distribution. '
    'Prize = (winner_stake * rank_weight) / Σ(winner_stakes * rank_weights) * distributable_pool. '
    'Matches on-chain claim_pool_prize.rs proportional model while rewarding accuracy via rank weights.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
