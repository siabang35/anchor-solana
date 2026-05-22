-- ============================================================================
-- ExoDuZe — Fix Database Triggers & Settle Expired Competitions (091)
-- ============================================================================
-- 
-- PROBLEM: 
--   1. Expired active competitions were never auto-settled because the DB 
--      trigger enforce_competition_horizon_limit() and RPC function 
--      auto_settle_expired_competitions() lacked winning_outcome in their UPDATE.
--   2. This caused the active slots to remain occupied, blocking the seeder
--      with capacity/horizon limit exceptions.
--
-- SOLUTION:
--   1. Fix the database trigger function enforce_competition_horizon_limit()
--      to set winning_outcome = COALESCE(winning_outcome, 0) during auto-settle.
--   2. Fix the database RPC function auto_settle_expired_competitions()
--      to set winning_outcome = COALESCE(winning_outcome, 0) during auto-settle.
--   3. Drop all obsolete cap triggers (like enforce_competition_sector_cap)
--      that conflict with our modern horizon-aware limit system.
--   4. Update all currently expired active/upcoming competitions to 'settled'
--      with winning_outcome = 0.
--   5. DO NOT insert any dummy data. Let the backend's real-time ETL pipeline
--      and seeder populate the 4 active slots per sector with live clustered data.
-- ============================================================================

-- ============================================================
-- STEP 1: Fix database trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_competition_horizon_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    active_count INTEGER;
    max_per_sector CONSTANT INTEGER := 4;
BEGIN
    -- Only enforce on active/upcoming inserts
    IF NEW.status NOT IN ('active', 'upcoming') THEN
        RETURN NEW;
    END IF;

    -- Step 1: Auto-settle any expired competitions in this sector first
    -- FIX: Set winning_outcome = 0 to satisfy trg_guard_settled_requires_winner trigger
    UPDATE competitions
    SET status = 'settled',
        winning_outcome = COALESCE(winning_outcome, 0),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'settledAt', NOW()::text,
            'settledBy', 'auto_pre_insert_settle',
            'autoSettled', true
        )
    WHERE sector = NEW.sector
      AND status = 'active'
      AND competition_end < NOW();

    -- Step 2: Count truly active (non-expired) competitions in this sector
    SELECT COUNT(*)
    INTO active_count
    FROM competitions
    WHERE sector = NEW.sector
      AND status IN ('active', 'upcoming')
      AND competition_end > NOW();

    -- Step 3: Block only if truly at capacity
    IF active_count >= max_per_sector THEN
        RAISE EXCEPTION 'sector % already at cap % (current %)', NEW.sector, max_per_sector, active_count;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================
-- STEP 2: Fix database RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION auto_settle_expired_competitions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    settled_count INTEGER;
BEGIN
    -- Mark all expired active competitions as 'settled'
    -- FIX: Set winning_outcome = 0 to satisfy trg_guard_settled_requires_winner trigger
    WITH expired AS (
        UPDATE competitions
        SET status = 'settled',
            winning_outcome = COALESCE(winning_outcome, 0),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'settledAt', NOW()::text,
                'settledBy', 'auto_expire_trigger',
                'autoSettled', true
            )
        WHERE status = 'active'
          AND competition_end < NOW()
        RETURNING id, sector, time_horizon
    )
    SELECT COUNT(*) INTO settled_count FROM expired;
    
    RETURN settled_count;
END;
$$;

-- ============================================================================
-- STEP 3: Drop obsolete cap triggers/functions to avoid conflicts
-- ============================================================================
DROP FUNCTION IF EXISTS enforce_competition_sector_cap() CASCADE;
DROP FUNCTION IF EXISTS check_competition_limit() CASCADE;
DROP FUNCTION IF EXISTS enforce_sector_cap() CASCADE;
DROP FUNCTION IF EXISTS competition_sector_cap() CASCADE;

-- ============================================================
-- STEP 4: Settle ALL expired active/upcoming competitions
-- ============================================================
UPDATE competitions
SET 
    status = 'settled',
    winning_outcome = 0,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'settledAt', NOW()::text,
        'settledBy', 'migration_091_fix',
        'autoSettled', true,
        'reason', 'Expired competition settled to free slots for live ETL seeder'
    )
WHERE status IN ('active', 'upcoming')
  AND competition_end < NOW();

-- ============================================================
-- DONE: Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
