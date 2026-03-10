-- ============================================================
-- Migration: Add new data sources for all API-Sports endpoints
-- ============================================================

-- Add new enum values for all API-Sports data sources
-- PostgreSQL requires adding enum values one at a time

DO $$
BEGIN
    -- Check and add apibasketball
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apibasketball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apibasketball';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apiafl
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiafl' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apiafl';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apiformula1
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiformula1' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apiformula1';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apihandball
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihandball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apihandball';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apihockey
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihockey' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apihockey';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apimma
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apimma' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apimma';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apinba
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinba' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apinba';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apinfl
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinfl' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apinfl';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apirugby
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apirugby' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apirugby';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add apivolleyball
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apivolleyball' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'apivolleyball';
    END IF;
END $$;

-- ============================================================
-- Add index for faster queries by data source
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sports_leagues_source ON sports_leagues(source);
CREATE INDEX IF NOT EXISTS idx_sports_teams_source ON sports_teams(source);
CREATE INDEX IF NOT EXISTS idx_sports_events_source ON sports_events(source);

-- ============================================================
-- Add comments for documentation
-- ============================================================

COMMENT ON TYPE data_source IS 'Data sources for sports data: thesportsdb, apifootball, apibasketball, apiafl, apiformula1, apihandball, apihockey, apimma, apinba, apinfl, apirugby, apivolleyball, manual';
