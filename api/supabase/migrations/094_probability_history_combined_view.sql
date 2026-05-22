-- ============================================================================
-- ExoDuZe — Probability History Combined View (094_probability_history_combined_view.sql)
--
-- Redefines probability_history_lean view to union:
--   1. Recent high-frequency probability_history records (last 48 hours)
--   2. Historic downsampled probability_history_summary records (older than 48 hours)
-- This allows the frontend to retrieve the entire historical curve seamlessly
-- even after raw records are pruned from the primary table.
-- ============================================================================

DROP VIEW IF EXISTS probability_history_lean CASCADE;

CREATE OR REPLACE VIEW probability_history_lean AS
SELECT
    id::text AS id,
    competition_id,
    time_label,
    home,
    draw,
    away,
    narrative,
    regime,
    category,
    created_at
FROM probability_history
UNION ALL
SELECT
    ('summary_' || id)::text AS id,
    competition_id,
    to_char(bucket_time, 'HH12:MI:SS AM') AS time_label,
    home_avg AS home,
    draw_avg AS draw,
    away_avg AS away,
    narrative,
    regime,
    category,
    bucket_time AS created_at
FROM probability_history_summary s
WHERE NOT EXISTS (
    SELECT 1 FROM probability_history ph
    WHERE ph.competition_id = s.competition_id
    AND ph.created_at >= s.bucket_time
    AND ph.created_at < s.bucket_time + INTERVAL '1 minute'
);

COMMENT ON VIEW probability_history_lean IS 'Unified view combining high-res hot probability history and downsampled historical summaries.';

-- Grant access to anon and authenticated roles
GRANT SELECT ON probability_history_lean TO anon, authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
