-- ============================================================================
-- Fix: Pool stake_count and entry_count drift (073_fix_pool_stake_count_drift.sql)
--
-- Problem: The update_pool_on_stake() trigger used `stake_count + 1` which
-- is vulnerable to drift when inserts are retried, rolled back, or rows
-- are deleted. This caused entry_count to show 5 when only 3 valid
-- pool_stakes exist.
--
-- Fix:
--   1. Replace naive `+1` increment with actual COUNT(*) from pool_stakes
--   2. Recalculate total_staked from actual rows (not cumulative addition)
--   3. Sync all existing competition entry_counts to match reality
-- ============================================================================

-- ========================
-- 1. Fix the trigger: use COUNT(*) and SUM() from actual rows
-- ========================
CREATE OR REPLACE FUNCTION update_pool_on_stake()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_bps INTEGER := 200;  -- 2% platform fee
    v_actual_count INTEGER;
    v_actual_total DECIMAL;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Count ACTUAL rows in pool_stakes (drift-proof)
        SELECT COUNT(*), COALESCE(SUM(stake_amount), 0)
        INTO v_actual_count, v_actual_total
        FROM pool_stakes
        WHERE pool_id = NEW.pool_id
          AND status = 'active';

        UPDATE competition_pools
        SET 
            total_staked = v_actual_total,
            platform_fee = v_actual_total * v_platform_fee_bps / 10000,
            distributable_pool = v_actual_total * (10000 - v_platform_fee_bps) / 10000,
            stake_count = v_actual_count,
            updated_at = NOW()
        WHERE id = NEW.pool_id;

        -- Sync competition entry_count and prize_pool from actual data
        UPDATE competitions
        SET 
            prize_pool = (SELECT distributable_pool FROM competition_pools WHERE id = NEW.pool_id),
            entry_count = v_actual_count,
            updated_at = NOW()
        WHERE id = NEW.competition_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Recreate the trigger (same name, so it replaces)
DROP TRIGGER IF EXISTS pool_stake_totals ON pool_stakes;
CREATE TRIGGER pool_stake_totals
    AFTER INSERT ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_on_stake();

-- ========================
-- 2. Recalculate ALL existing pool data from actual pool_stakes rows
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
WHERE cp.id = sub.pool_id
  AND (cp.stake_count != sub.actual_count OR cp.total_staked != sub.actual_total);

-- Also fix pools with zero stakes (no pool_stakes rows but non-zero counters)
UPDATE competition_pools
SET
    stake_count = 0,
    total_staked = 0,
    platform_fee = 0,
    distributable_pool = 0,
    updated_at = NOW()
WHERE id NOT IN (SELECT DISTINCT pool_id FROM pool_stakes WHERE status = 'active')
  AND stake_count > 0;

-- ========================
-- 3. Sync ALL competition entry_counts from actual pool data
-- ========================
UPDATE competitions c
SET 
    entry_count = COALESCE(cp.stake_count, 0),
    prize_pool = COALESCE(cp.distributable_pool, 0),
    updated_at = NOW()
FROM competition_pools cp
WHERE cp.competition_id = c.id
  AND (c.entry_count != COALESCE(cp.stake_count, 0) 
       OR c.prize_pool != COALESCE(cp.distributable_pool, 0));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
