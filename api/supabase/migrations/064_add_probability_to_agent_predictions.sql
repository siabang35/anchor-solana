-- ============================================================================
-- 064_agent_predictions_schema_alignment.sql
-- Aligns agent_predictions table with AgentRunnerService insert payload:
--   probability, reasoning, projected_curve
-- Also relaxes prediction_data NOT NULL since it's no longer used by the service
-- ============================================================================

-- 1. Add probability column (DECIMAL for the agent's predicted probability)
ALTER TABLE agent_predictions
ADD COLUMN IF NOT EXISTS probability DECIMAL(5,4);

-- 2. Add reasoning column (TEXT for AI inference reasoning)
ALTER TABLE agent_predictions
ADD COLUMN IF NOT EXISTS reasoning TEXT;

-- 3. Add projected_curve column (JSONB for time-series probability curve)
ALTER TABLE agent_predictions
ADD COLUMN IF NOT EXISTS projected_curve JSONB;

-- 4. Make prediction_data nullable (the new service uses probability/reasoning/projected_curve instead)
ALTER TABLE agent_predictions
ALTER COLUMN prediction_data DROP NOT NULL;

-- Set default for prediction_data so old inserts without it don't fail
ALTER TABLE agent_predictions
ALTER COLUMN prediction_data SET DEFAULT '{}'::jsonb;

-- 5. Add index on probability for leaderboard scoring lookups
CREATE INDEX IF NOT EXISTS idx_agent_predictions_comp_agent
ON agent_predictions(competition_id, agent_id, timestamp DESC);

-- 6. Ensure realtime is enabled for agent_predictions (frontend listens to INSERT events)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_predictions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.agent_predictions REPLICA IDENTITY FULL;

-- 7. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
