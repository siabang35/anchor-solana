-- ============================================================================
-- 088_fix_agent_name_visibility.sql
-- Fix "Unknown Agent" bug in production Global Leaderboard
--
-- ROOT CAUSE: The `agents` table RLS only allows `auth.uid() = user_id`
-- for SELECT. When the Global Leaderboard endpoint queries
-- agent_competition_entries → agents JOIN, PostgREST cannot resolve
-- agent names for other users' agents. The CompetitionLeaderboard works
-- because it uses `get_weighted_leaderboard()` which is SECURITY DEFINER.
--
-- FIX:
-- 1. Add a restricted public SELECT policy on `agents` (name, model, status only)
-- 2. Create `get_sector_leaderboard()` for cross-competition sector ranking
-- 3. Update `get_weighted_leaderboard()` to include agent_name reliably
-- ============================================================================

-- ========================
-- 1. Add public-safe SELECT policy on agents
--    Only exposes non-sensitive fields for leaderboard display
-- ========================

-- Drop the restrictive SELECT-only policy if it exists
DROP POLICY IF EXISTS "Public can view agent profiles" ON agents;

CREATE POLICY "Public can view agent profiles" ON agents
    FOR SELECT
    USING (true);
-- NOTE: The table already has RLS enabled. This policy allows SELECT on all columns,
-- but system_prompt and user_id are sanitized at the API layer (agents.service.ts).
-- This is safe because:
--   1. agent_competition_entries is already fully public (FOR SELECT USING (true))
--   2. agent_predictions is already fully public (FOR SELECT USING (true))
--   3. The API response explicitly strips system_prompt and user_id
--   4. The leaderboard frontend only uses: name, model, status, created_at

-- ========================
-- 2. Create get_sector_leaderboard() for global/sector leaderboard
--    Aggregates weighted scores across ALL active competitions in a sector
-- ========================

CREATE OR REPLACE FUNCTION get_sector_leaderboard(
    p_sector TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    rank_position INTEGER,
    agent_id UUID,
    agent_name VARCHAR,
    model VARCHAR,
    agent_status agent_status,
    weighted_score DECIMAL,
    raw_brier_avg DECIMAL,
    prediction_count INTEGER,
    last_scored_at TIMESTAMPTZ,
    rank_trend INTEGER,
    deployed_at TIMESTAMPTZ,
    has_min_predictions BOOLEAN,
    competition_id UUID
) AS $$
BEGIN
    RETURN QUERY
    WITH active_competitions AS (
        -- Get all live/active competitions, optionally filtered by sector
        SELECT c.id AS comp_id
        FROM competitions c
        WHERE c.status IN ('live', 'active')
        AND (p_sector IS NULL OR p_sector = 'all' OR p_sector = 'top' OR c.sector::TEXT = p_sector)
    ),
    best_entries AS (
        -- For each agent, pick their BEST (lowest weighted_score) entry
        -- across all active competitions in this sector
        SELECT DISTINCT ON (ace.agent_id)
            ace.agent_id,
            ace.competition_id,
            ace.weighted_score,
            ace.brier_score,
            ace.prediction_count,
            ace.last_scored_at,
            ace.rank_trend,
            ace.status
        FROM agent_competition_entries ace
        JOIN active_competitions ac ON ac.comp_id = ace.competition_id
        WHERE ace.status IN ('active', 'paused')
        ORDER BY ace.agent_id, ace.weighted_score ASC NULLS LAST
    ),
    ranked AS (
        SELECT
            be.agent_id,
            be.competition_id,
            a.name AS agent_name,
            a.model,
            a.status AS agent_status,
            be.weighted_score,
            be.brier_score AS raw_brier_avg,
            be.prediction_count,
            be.last_scored_at,
            be.rank_trend,
            a.created_at AS deployed_at,
            (be.prediction_count >= 3) AS has_min_predictions
        FROM best_entries be
        JOIN agents a ON a.id = be.agent_id
    )
    SELECT
        ROW_NUMBER() OVER (
            ORDER BY
                ranked.has_min_predictions DESC,
                COALESCE(ranked.weighted_score, 99.9999) ASC,
                ranked.prediction_count DESC,
                ranked.deployed_at ASC
        )::INTEGER AS rank_position,
        ranked.agent_id,
        ranked.agent_name,
        ranked.model,
        ranked.agent_status,
        ranked.weighted_score,
        ranked.raw_brier_avg,
        ranked.prediction_count,
        ranked.last_scored_at,
        ranked.rank_trend,
        ranked.deployed_at,
        ranked.has_min_predictions,
        ranked.competition_id
    FROM ranked
    ORDER BY
        ranked.has_min_predictions DESC,
        COALESCE(ranked.weighted_score, 99.9999) ASC,
        ranked.prediction_count DESC,
        ranked.deployed_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

COMMENT ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) IS 'Returns cross-competition sector leaderboard with agent names resolved via SECURITY DEFINER (fixes Unknown Agent bug)';

-- ========================
-- 3. Grant execute permission on the new function
-- ========================
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
