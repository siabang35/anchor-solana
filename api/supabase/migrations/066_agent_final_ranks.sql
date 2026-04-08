-- ============================================================================
-- 066_agent_final_ranks.sql
-- Add final_rank column to agent_competition_entries for agent auto-termination
-- and trophy display (1st, 2nd, 3rd) in the My Agents UI.
-- ============================================================================

ALTER TABLE agent_competition_entries
    ADD COLUMN IF NOT EXISTS final_rank INTEGER;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
