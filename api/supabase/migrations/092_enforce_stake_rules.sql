-- ============================================================================
-- ExoDuZe — Enforce Stake Rules and Leaderboard Guard
-- 092_enforce_stake_rules.sql
-- ============================================================================

-- 1. Clean up existing agent_competition_entries status
-- If an entry is 'active' or 'paused', but has no active verified on-chain stake, set it to 'pending'
UPDATE agent_competition_entries ace
SET status = 'pending'
WHERE ace.status IN ('active', 'paused')
  AND NOT EXISTS (
      SELECT 1 FROM pool_stakes ps
      WHERE ps.agent_id = ace.agent_id
        AND ps.competition_id = ace.competition_id
        AND ps.status = 'active'
        AND ps.verified_onchain = true
  );

-- 2. Clean up agents status
-- If an agent is 'active' but has no active competition entries, set it to 'paused'
UPDATE agents a
SET status = 'paused'
WHERE a.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM agent_competition_entries ace
      WHERE ace.agent_id = a.id
        AND ace.status = 'active'
  );

-- 3. Redefine get_weighted_leaderboard to strictly enforce verified stakes
CREATE OR REPLACE FUNCTION get_weighted_leaderboard(
    p_competition_id UUID,
    p_limit INTEGER DEFAULT 50
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
    has_min_predictions BOOLEAN
) AS $$
DECLARE
    v_min_preds INTEGER;
BEGIN
    -- Get minimum prediction count from config
    SELECT COALESCE(lsc.min_predictions, 3) INTO v_min_preds
    FROM leaderboard_score_config lsc
    WHERE lsc.competition_id = p_competition_id;

    IF v_min_preds IS NULL THEN
        v_min_preds := 3;
    END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT
            ace.agent_id,
            a.name AS agent_name,
            a.model,
            a.status AS agent_status,
            ace.weighted_score,
            ace.brier_score AS raw_brier_avg,
            ace.prediction_count,
            ace.last_scored_at,
            ace.rank_trend,
            a.created_at AS deployed_at,
            (ace.prediction_count >= v_min_preds) AS has_min_predictions
        FROM agent_competition_entries ace
        JOIN agents a ON a.id = ace.agent_id
        WHERE ace.competition_id = p_competition_id
        AND ace.status IN ('active', 'paused', 'completed', 'evaluated')
        -- Double Guard: Enforce verified stake at SQL level
        AND EXISTS (
            SELECT 1 FROM pool_stakes ps
            WHERE ps.agent_id = ace.agent_id
              AND ps.competition_id = ace.competition_id
              AND ps.status IN ('active', 'claimed')
              AND ps.verified_onchain = true
        )
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
        ranked.has_min_predictions
    FROM ranked
    ORDER BY
        ranked.has_min_predictions DESC,
        COALESCE(ranked.weighted_score, 99.9999) ASC,
        ranked.prediction_count DESC,
        ranked.deployed_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
