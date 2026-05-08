-- ============================================================================
-- ExoDuZe — Fix Competition Lifecycle: Replace cap trigger with horizon-aware enforcement
-- ============================================================================
-- 
-- PROBLEM: A DB trigger blocks inserts when sector has 4 active competitions,
--          but expired competitions (competition_end < now) still have status='active',
--          causing false cap violations even though the seeder correctly detected
--          missing horizon slots.
--
-- SOLUTION:
--   1. Drop any existing per-sector cap triggers (they conflict with horizon-aware logic)
--   2. Create a function to auto-settle expired competitions before new inserts
--   3. Replace the cap trigger with a smarter horizon-aware one that:
--      a) Auto-settles expired competitions in the same sector BEFORE checking
--      b) Only counts truly active (non-expired) competitions
--      c) Enforces the 4-per-sector limit on non-expired competitions only
--   4. The unique index idx_unique_sector_horizon_active remains the primary dedup guard
-- ============================================================================

-- 1. Drop ALL existing cap enforcement triggers (including any manually-applied ones)
DROP TRIGGER IF EXISTS check_competition_limit ON "public"."competitions";
DROP TRIGGER IF EXISTS enforce_sector_cap ON "public"."competitions";
DROP TRIGGER IF EXISTS competition_sector_cap ON "public"."competitions";
DROP FUNCTION IF EXISTS enforce_competition_category_limit();
DROP FUNCTION IF EXISTS enforce_sector_cap();
DROP FUNCTION IF EXISTS check_sector_cap();

-- 2. Create a standalone function to auto-settle expired competitions
--    This is called by the trigger AND can be called directly from app code via RPC
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
    WITH expired AS (
        UPDATE competitions
        SET status = 'settled',
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

-- 3. Create the new horizon-aware competition limit trigger
--    This trigger:
--    a) First auto-settles any expired competitions in the same sector
--    b) Then checks if the sector has room (max 4 non-expired active/upcoming)
--    c) Only blocks if there are truly 4 live (non-expired) competitions
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
    UPDATE competitions
    SET status = 'settled',
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

DROP TRIGGER IF EXISTS check_competition_horizon_limit ON "public"."competitions";
CREATE TRIGGER check_competition_horizon_limit
    BEFORE INSERT ON "public"."competitions"
    FOR EACH ROW
    EXECUTE FUNCTION enforce_competition_horizon_limit();

-- 4. Grant execute permission on the auto-settle function for RPC calls
GRANT EXECUTE ON FUNCTION auto_settle_expired_competitions() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_settle_expired_competitions() TO service_role;
GRANT EXECUTE ON FUNCTION auto_settle_expired_competitions() TO anon;

-- 5. Run auto-settle NOW to clean up any currently stuck competitions
SELECT auto_settle_expired_competitions();

-- 6. Ensure the unique horizon index is still in place (safety net)
DROP INDEX IF EXISTS idx_unique_sector_horizon_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sector_horizon_active
  ON "public"."competitions" (sector, time_horizon)
  WHERE status IN ('active', 'upcoming') AND time_horizon IS NOT NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
