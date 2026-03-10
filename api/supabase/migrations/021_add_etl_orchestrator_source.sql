-- ============================================================
-- Migration: Add etl_orchestrator data source enum value
-- Required for the ETL Orchestrator to properly track sync operations
-- ============================================================

DO $$
BEGIN
    -- Check and add etl_orchestrator
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'etl_orchestrator' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'etl_orchestrator';
    END IF;
END $$;

-- Add helpful comment
COMMENT ON TYPE data_source IS 'Data sources for sports data: thesportsdb, apifootball, apibasketball, apibaseball, apiafl, apiformula1, apihandball, apihockey, apimma, apinba, apinfl, apirugby, apivolleyball, manual, etl_orchestrator';
