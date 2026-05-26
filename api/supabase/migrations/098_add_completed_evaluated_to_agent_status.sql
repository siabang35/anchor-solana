-- ============================================================================
-- 098_add_completed_evaluated_to_agent_status.sql
-- Add 'completed' and 'evaluated' to agent_status enum type to prevent
-- database errors when querying historical/settled tournament entries.
-- ============================================================================

DO $$ BEGIN
    ALTER TYPE public.agent_status ADD VALUE 'completed';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE public.agent_status ADD VALUE 'evaluated';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
