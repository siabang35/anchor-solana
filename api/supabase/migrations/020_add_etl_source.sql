-- ============================================================
-- Migration: Add 'etl_orchestrator' to data_source enum
-- ============================================================

DO $$
BEGIN
    -- Check and add etl_orchestrator
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'etl_orchestrator' AND enumtypid = 'data_source'::regtype) THEN
        ALTER TYPE data_source ADD VALUE 'etl_orchestrator';
    END IF;
END $$;
