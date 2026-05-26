-- ============================================================================
-- ExoDuZe — Fix Entry Counts and Synchronize Denormalized Totals
-- 093_fix_entry_counts.sql
-- ============================================================================

-- 1. Recalculate and update ALL competition_pools from verified active pool_stakes
-- This ensures pools with 0 active stakes are correctly reset to 0 instead of being skipped.
UPDATE competition_pools cp
SET
    stake_count = COALESCE(sub.actual_count, 0),
    total_staked = COALESCE(sub.actual_total, 0),
    platform_fee = COALESCE(sub.actual_total, 0) * 200 / 10000,
    distributable_pool = COALESCE(sub.actual_total, 0) * 9800 / 10000,
    updated_at = NOW()
FROM (
    SELECT 
        cp_inner.id AS pool_id,
        COUNT(ps.id) AS actual_count,
        COALESCE(SUM(ps.stake_amount), 0) AS actual_total
    FROM competition_pools cp_inner
    LEFT JOIN pool_stakes ps ON ps.pool_id = cp_inner.id 
                            AND ps.status = 'active' 
                            AND ps.verified_onchain = true
    GROUP BY cp_inner.id
) sub
WHERE cp.id = sub.pool_id;

-- 2. Synchronize ALL competitions entry_counts and prize_pools from competition_pools
UPDATE competitions c
SET 
    entry_count = COALESCE(cp.stake_count, 0),
    prize_pool = COALESCE(cp.distributable_pool, 0),
    updated_at = NOW()
FROM competition_pools cp
WHERE cp.competition_id = c.id;

-- 3. Clean up any agent_competition_entries whose status is 'active' or 'paused'
-- but have no active on-chain stake, setting them to 'pending'.
UPDATE agent_competition_entries ace
SET status = 'pending'
WHERE ace.status IN ('active', 'paused')
  AND NOT EXISTS (
      SELECT 1 FROM pool_stakes ps
      WHERE ps.agent_id = ace.agent_id
        AND ps.competition_id = ace.competition_id
        AND ps.status = 'active'
        AND ps.verified_onchain = true
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
