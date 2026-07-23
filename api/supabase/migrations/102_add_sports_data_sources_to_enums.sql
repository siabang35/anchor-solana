-- ============================================================================
-- 102_add_sports_data_sources_to_enums.sql
-- Fix: SportsSync / SportsService fails with:
--      invalid input value for enum market_data_source_type: "thesportsdb"
--
-- Solution: Add thesportsdb, apifootball, api_football to market_data_source_type
--           and data_source PostgreSQL ENUMs.
-- ============================================================================

DO $$
BEGIN
    -- Add to market_data_source_type
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_data_source_type') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'thesportsdb' AND enumtypid = 'market_data_source_type'::regtype) THEN
            ALTER TYPE market_data_source_type ADD VALUE 'thesportsdb';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apifootball' AND enumtypid = 'market_data_source_type'::regtype) THEN
            ALTER TYPE market_data_source_type ADD VALUE 'apifootball';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'api_football' AND enumtypid = 'market_data_source_type'::regtype) THEN
            ALTER TYPE market_data_source_type ADD VALUE 'api_football';
        END IF;
    END IF;

    -- Add to data_source (if exists)
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_source') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'thesportsdb' AND enumtypid = 'data_source'::regtype) THEN
            ALTER TYPE data_source ADD VALUE 'thesportsdb';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apifootball' AND enumtypid = 'data_source'::regtype) THEN
            ALTER TYPE data_source ADD VALUE 'apifootball';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'api_football' AND enumtypid = 'data_source'::regtype) THEN
            ALTER TYPE data_source ADD VALUE 'api_football';
        END IF;
    END IF;
END $$;
