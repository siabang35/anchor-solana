-- ============================================================================
-- 091_remove_auto_enrollment.sql
-- Remove auto-enrollment logic and update category leaderboard to show history
-- ============================================================================

-- 1. Redefine auto_enroll_agents_into_competition to do nothing and return 0
CREATE OR REPLACE FUNCTION auto_enroll_agents_into_competition(
    p_new_competition_id UUID,
    p_sector TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
BEGIN
    -- Do nothing: auto-enrollment is disabled to ensure agents must stake to run in a competition
    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Redefine get_sector_leaderboard to query settled competitions and completed entries
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
    WITH settled_competitions AS (
        -- Get all settled/completed competitions, optionally filtered by sector
        SELECT c.id AS comp_id
        FROM competitions c
        WHERE c.status = 'settled'
        AND (p_sector IS NULL OR p_sector = 'all' OR p_sector = 'top' OR c.sector::TEXT = p_sector)
    ),
    best_entries AS (
        -- For each agent, pick their BEST (lowest weighted_score) historical entry
        -- across all settled competitions in this sector
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
        JOIN settled_competitions sc ON sc.comp_id = ace.competition_id
        WHERE ace.status IN ('completed', 'evaluated', 'terminated')
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

-- Grant execute permissions on the updated function
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sector_leaderboard(TEXT, INTEGER) TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
