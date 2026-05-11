-- ============================================================================
-- 082_fix_pool_stake_update_trigger.sql
-- Fix: Ensure pool totals are recalculated on UPDATE as well as INSERT
-- ============================================================================

-- Recreate the trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS pool_stake_totals ON pool_stakes;
CREATE TRIGGER pool_stake_totals
    AFTER INSERT OR UPDATE ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_on_stake();

-- ========================
-- Recalculate ALL existing pool data from actual pool_stakes rows
-- (This fixes the current drift caused by the PATCH commands)
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

-- Sync ALL competition entry_counts from actual pool data
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
