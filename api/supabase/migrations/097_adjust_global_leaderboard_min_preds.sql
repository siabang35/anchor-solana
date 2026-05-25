-- ============================================================================
-- 097_adjust_global_leaderboard_min_preds.sql
--
-- Adjust minimum predictions threshold for global leaderboard dynamically based
-- on the competition time horizon:
-- - 2h horizon: minimum 15 predictions
-- - 7h horizon: minimum 20 predictions
-- - 12h horizon: minimum 30 predictions
-- - 24h horizon: minimum 40 predictions
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.global_leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.global_leaderboard AS
SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    a.model,
    a.user_id,
    a.status AS agent_status,
    a.created_at AS deployed_at,
    
    -- Aggregated metrics
    COUNT(DISTINCT ace.competition_id) AS competitions_entered,
    SUM(coalesce(ace.prediction_count, 0)) AS total_predictions,
    AVG(NULLIF(ace.weighted_score, 0)) AS avg_weighted_score,
    MIN(ace.weighted_score) AS best_weighted_score,
    
    -- Win record
    COUNT(DISTINCT pw.id) AS total_wins,
    SUM(COALESCE(pw.prize_amount, 0)) AS total_prize_earned,
    
    -- Calculated accuracy (inverse of avg weighted score)
    CASE 
        WHEN AVG(NULLIF(ace.weighted_score, 0)) IS NOT NULL 
        THEN GREATEST(0, LEAST(99.9, 98.0 * EXP(-AVG(NULLIF(ace.weighted_score, 0)) * 6)))
        ELSE 0 
    END AS global_accuracy,
    
    -- Global rank score (lower = better)
    -- Incorporates both accuracy (average weighted score) and volume (bonus penalty based on total prediction count)
    COALESCE(AVG(NULLIF(ace.weighted_score, 0)), 99.9999) + (2.0 / COALESCE(NULLIF(SUM(coalesce(ace.prediction_count, 0)), 0), 1)) AS rank_score

FROM public.agents a
JOIN public.agent_competition_entries ace ON ace.agent_id = a.id AND ace.status IN ('active', 'paused', 'completed')
JOIN public.competitions c ON c.id = ace.competition_id
LEFT JOIN public.pool_winners pw ON pw.agent_id = a.id AND pw.competition_id = c.id
WHERE a.status IN ('active', 'paused')
  AND (
    (c.time_horizon = '2h' AND ace.prediction_count >= 15) OR
    (c.time_horizon = '7h' AND ace.prediction_count >= 20) OR
    (c.time_horizon = '12h' AND ace.prediction_count >= 30) OR
    (c.time_horizon = '24h' AND ace.prediction_count >= 40) OR
    (c.time_horizon IS NULL AND ace.prediction_count >= 40)
  )
GROUP BY a.id, a.name, a.model, a.user_id, a.status, a.created_at
ORDER BY rank_score ASC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_leaderboard_agent ON public.global_leaderboard(agent_id);
CREATE INDEX IF NOT EXISTS idx_global_leaderboard_rank ON public.global_leaderboard(rank_score ASC);

-- Grant select permissions
GRANT SELECT ON public.global_leaderboard TO anon, authenticated, service_role;
