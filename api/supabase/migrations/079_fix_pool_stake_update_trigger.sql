-- ============================================================================
-- Fix: Pool stake UPDATE trigger + recalculate existing pool data
-- (079_fix_pool_stake_update_trigger.sql)
--
-- Problem: The pool trigger only fired on INSERT, not UPDATE.
--          When the wager sync endpoint UPDATEs an existing pool_stake
--          (e.g., changing 0.15 → 0.4 SOL), pool totals weren't recalculated.
--          This caused the UI to show stale "0.15 SOL Staked" values
--          even after a user staked 0.4 SOL on-chain.
--
-- Fix:
--   1. Extend trigger function to handle both INSERT and UPDATE
--   2. Recreate trigger to fire on AFTER INSERT OR UPDATE
--   3. Recalculate ALL existing pool totals from actual pool_stakes rows
-- ============================================================================

-- ========================
-- 1. Extend trigger to handle INSERT + UPDATE
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
    IF TG_OP = 'INSERT' THEN
        v_pool_id := NEW.pool_id;
        v_competition_id := NEW.competition_id;
    ELSIF TG_OP = 'UPDATE' THEN
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

    -- Sync competition entry_count and prize_pool from actual data
    UPDATE competitions
    SET 
        prize_pool = (SELECT distributable_pool FROM competition_pools WHERE id = v_pool_id),
        entry_count = v_actual_count,
        updated_at = NOW()
    WHERE id = v_competition_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ========================
-- 2. Recreate trigger to fire on BOTH INSERT and UPDATE
-- ========================
DROP TRIGGER IF EXISTS pool_stake_totals ON pool_stakes;
CREATE TRIGGER pool_stake_totals
    AFTER INSERT OR UPDATE ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_on_stake();

-- ========================
-- 3. Recalculate ALL existing pool data from actual pool_stakes rows
--    This fixes any historical drift (e.g., 0.15 vs 0.4 discrepancies)
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

-- Sync competitions table
UPDATE competitions c
SET 
    entry_count = COALESCE(cp.stake_count, 0),
    prize_pool = COALESCE(cp.distributable_pool, 0),
    updated_at = NOW()
FROM competition_pools cp
WHERE cp.competition_id = c.id;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
