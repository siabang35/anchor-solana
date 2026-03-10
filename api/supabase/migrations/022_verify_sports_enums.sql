-- ============================================================
-- Migration 022: Verify and Consolidate Sports Data Source Enums
-- Ensures ALL required enum values exist for AFL, MMA, and other sports
-- Anti-hack: Uses idempotent checks to prevent duplicate insertions
-- ============================================================

-- Consolidated check for all required data_source enum values
-- Each block checks if the value exists before adding to prevent errors

DO $$
BEGIN
    -- Core API-Sports endpoints
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apibasketball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apibasketball';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apibaseball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apibaseball';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiafl' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apiafl';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiformula1' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apiformula1';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihandball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apihandball';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihockey' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apihockey';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apimma' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apimma';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinba' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apinba';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinfl' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apinfl';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apirugby' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apirugby';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apivolleyball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apivolleyball';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'etl_orchestrator' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'etl_orchestrator';
    END IF;
END $$;

-- Update comment to document all available sources
COMMENT ON TYPE data_source IS 'Data sources for sports data: thesportsdb, apifootball, apibasketball, apibaseball, apiafl, apiformula1, apihandball, apihockey, apimma, apinba, apinfl, apirugby, apivolleyball, manual, etl_orchestrator';

-- ============================================================
-- Verification queries (for debugging - run manually if needed)
-- ============================================================
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'data_source'::regtype;
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'sport_type'::regtype;
