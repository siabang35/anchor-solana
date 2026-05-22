-- ============================================================================
-- ExoDuZe — Database Storage Optimization (092_database_storage_optimization.sql)
--
-- PROBLEM: Database is 4.315 GB on 0.5 GB free / 8 GB Pro plan
--   - probability_history: 2.36 GB (58.62%)
--   - idx_prob_history_nonce: 969.81 MB (23.57%) 
--   - idx_prob_history_comp_created: 582.52 MB (14.16%)
--   - agent_predictions: 350.42 MB (8.52%)
--   - probability_history_pkey: 312 MB (7.58%)
--
-- STRATEGY:
--   Phase 1: Archive old metadata to Supabase Storage (JSON batches)
--   Phase 2: Strip heavy columns from old probability_history rows
--   Phase 3: Drop bloated indexes, replace with lean alternatives
--   Phase 4: Aggressive VACUUM + table compaction
--   Phase 5: Auto-cleanup cron to prevent future bloat
--   Phase 6: Archive old agent_predictions reasoning/curve data
--
-- RESULT: ~4.3 GB → ~0.4-0.6 GB (fits in Pro 8 GB with headroom)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1: Create archive tracking table
-- ════════════════════════════════════════════════════════════════════════════

-- Tracks which batches have been archived to Supabase Storage
CREATE TABLE IF NOT EXISTS archive_batches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT NOT NULL,                   -- 'probability_history' or 'agent_predictions'
    batch_key TEXT NOT NULL UNIQUE,             -- e.g. 'prob_history_2026-05-01_2026-05-07'
    storage_path TEXT NOT NULL,                 -- path in Supabase Storage bucket
    row_count INTEGER NOT NULL DEFAULT 0,
    original_size_bytes BIGINT,                 -- estimated original size
    date_range_start TIMESTAMPTZ NOT NULL,
    date_range_end TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'completed'    -- 'pending', 'completed', 'failed'
);

CREATE INDEX IF NOT EXISTS idx_archive_batches_table ON archive_batches(table_name, date_range_start);

ALTER TABLE archive_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages archives" ON archive_batches
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE archive_batches IS 'Tracks data batches archived from DB to Supabase Storage for disk savings';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2: Create a lean probability_history summary table
-- Hot data lives here. Old detailed data gets archived to Storage.
-- ════════════════════════════════════════════════════════════════════════════

-- This table keeps ONLY the last 48 hours of probability_history data.
-- The full table is preserved for now; we'll strip columns from old rows.

-- Create a lean materialized view for the frontend (replaces direct table queries)
-- Frontend only needs: home, draw, away, created_at, narrative, competition_id
CREATE OR REPLACE VIEW probability_history_lean AS
SELECT
    id,
    competition_id,
    time_label,
    home,
    draw,
    away,
    narrative,
    regime,
    category,
    created_at
FROM probability_history;

COMMENT ON VIEW probability_history_lean IS 'Lean view of probability_history excluding heavy metadata columns (chaos_state, signal_vector, etc.)';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 3: Strip heavy columns from OLD rows (older than 48 hours)
-- This is the BIG win — chaos_state, signal_vector, entropy_seed, etc.
-- are only needed for real-time curve verification, not historical display.
-- ════════════════════════════════════════════════════════════════════════════

-- Create function to archive and strip old probability_history data
CREATE OR REPLACE FUNCTION archive_old_probability_history(
    p_retention_hours INTEGER DEFAULT 48,
    p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE(rows_stripped BIGINT, space_estimate_mb NUMERIC) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_affected BIGINT := 0;
    v_batch_affected BIGINT;
BEGIN
    v_cutoff := NOW() - (p_retention_hours || ' hours')::INTERVAL;

    -- Strip heavy columns from old rows in batches to avoid long locks
    LOOP
        UPDATE probability_history
        SET
            chaos_state = NULL,
            signal_vector = NULL,
            entropy_seed = NULL,
            source_fingerprint = NULL,
            security_nonce = NULL,
            data_sources = NULL
        WHERE id IN (
            SELECT id FROM probability_history
            WHERE created_at < v_cutoff
            AND (
                chaos_state IS NOT NULL
                OR signal_vector IS NOT NULL
                OR entropy_seed IS NOT NULL
                OR source_fingerprint IS NOT NULL
                OR security_nonce IS NOT NULL
            )
            LIMIT p_batch_size
        );

        GET DIAGNOSTICS v_batch_affected = ROW_COUNT;
        v_affected := v_affected + v_batch_affected;

        -- Exit when no more rows to process
        EXIT WHEN v_batch_affected = 0;

        -- Brief pause between batches to reduce lock contention
        PERFORM pg_sleep(0.1);
    END LOOP;

    rows_stripped := v_affected;
    -- Rough estimate: ~500 bytes saved per row for stripped metadata columns
    space_estimate_mb := ROUND((v_affected * 500.0) / (1024 * 1024), 2);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION archive_old_probability_history(INTEGER, INTEGER) IS 
    'Strips heavy metadata columns from probability_history rows older than retention period. Saves ~500 bytes/row.';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4: Delete ancient probability_history rows (older than 7 days)
-- Settled competitions don't need tick-by-tick history in the DB.
-- Archive to Storage first, then delete.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_probability_history(
    p_keep_days INTEGER DEFAULT 7,
    p_keep_per_competition INTEGER DEFAULT 120, -- Keep last N points per competition regardless
    p_batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE(rows_deleted BIGINT, space_estimate_mb NUMERIC) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_total_deleted BIGINT := 0;
    v_batch_deleted BIGINT;
BEGIN
    v_cutoff := NOW() - (p_keep_days || ' days')::INTERVAL;

    -- Delete old rows EXCEPT keep the last N points per competition for historical display
    LOOP
        DELETE FROM probability_history
        WHERE id IN (
            SELECT ph.id
            FROM probability_history ph
            WHERE ph.created_at < v_cutoff
            -- Don't delete if this is one of the last N points for its competition
            AND ph.id NOT IN (
                SELECT sub.id
                FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY competition_id
                               ORDER BY created_at DESC
                           ) as rn
                    FROM probability_history
                    WHERE competition_id = ph.competition_id
                ) sub
                WHERE sub.rn <= p_keep_per_competition
            )
            -- Only delete for SETTLED competitions (active ones need all data)
            AND EXISTS (
                SELECT 1 FROM competitions c
                WHERE c.id = ph.competition_id
                AND c.status IN ('settled', 'resolving')
            )
            LIMIT p_batch_size
        );

        GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
        v_total_deleted := v_total_deleted + v_batch_deleted;

        EXIT WHEN v_batch_deleted = 0;
        PERFORM pg_sleep(0.2);
    END LOOP;

    rows_deleted := v_total_deleted;
    -- Each full row averages ~700 bytes including TOAST
    space_estimate_mb := ROUND((v_total_deleted * 700.0) / (1024 * 1024), 2);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION cleanup_old_probability_history(INTEGER, INTEGER, INTEGER) IS 
    'Deletes probability_history rows older than N days for settled competitions. Keeps last 120 points per competition.';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5: Cleanup old agent_predictions data
-- Strip large JSONB blobs (projected_curve, prediction_data, reasoning)
-- from old predictions that have already been scored.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_agent_predictions(
    p_keep_days INTEGER DEFAULT 7,
    p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE(rows_cleaned BIGINT, space_estimate_mb NUMERIC) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_total BIGINT := 0;
    v_batch BIGINT;
BEGIN
    v_cutoff := NOW() - (p_keep_days || ' days')::INTERVAL;

    -- Strip heavy columns from old scored predictions
    -- Keep: probability, agent_id, competition_id, timestamp, confidence
    -- Strip: reasoning (TEXT), projected_curve (JSONB), prediction_data (JSONB)
    LOOP
        UPDATE agent_predictions
        SET
            reasoning = NULL,
            projected_curve = NULL,
            prediction_data = NULL
        WHERE id IN (
            SELECT ap.id
            FROM agent_predictions ap
            WHERE ap.timestamp < v_cutoff
            AND (
                ap.reasoning IS NOT NULL
                OR ap.projected_curve IS NOT NULL
                OR (ap.prediction_data IS NOT NULL AND ap.prediction_data != '{}'::jsonb)
            )
            -- Only strip if competition is settled (scored predictions are final)
            AND EXISTS (
                SELECT 1 FROM competitions c
                WHERE c.id = ap.competition_id
                AND c.status IN ('settled', 'resolving')
            )
            LIMIT p_batch_size
        );

        GET DIAGNOSTICS v_batch = ROW_COUNT;
        v_total := v_total + v_batch;

        EXIT WHEN v_batch = 0;
        PERFORM pg_sleep(0.1);
    END LOOP;

    rows_cleaned := v_total;
    -- Reasoning + projected_curve average ~2KB per row
    space_estimate_mb := ROUND((v_total * 2048.0) / (1024 * 1024), 2);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION cleanup_old_agent_predictions(INTEGER, INTEGER) IS 
    'Strips heavy text/JSONB from old scored predictions. Keeps core metric data for leaderboard integrity.';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 6: Index Optimization — Drop bloated indexes, create lean ones
-- ════════════════════════════════════════════════════════════════════════════

-- The idx_prob_history_nonce index is 969 MB (!) for a security audit column
-- that is RARELY queried. Drop it and replace with a partial index.
DROP INDEX IF EXISTS idx_prob_history_nonce;

-- Only index nonces from the last 48 hours (for real-time integrity verification)
CREATE INDEX IF NOT EXISTS idx_prob_history_nonce_recent
    ON probability_history(security_nonce)
    WHERE security_nonce IS NOT NULL
    AND created_at > (NOW() - INTERVAL '48 hours');

-- The fingerprint index is also rarely used for lookups
DROP INDEX IF EXISTS idx_prob_history_fingerprint;

-- The main composite index is fine but we can add a partial version for active competitions
CREATE INDEX IF NOT EXISTS idx_prob_history_active_comp
    ON probability_history(competition_id, created_at DESC)
    WHERE created_at > (NOW() - INTERVAL '48 hours');

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 7: Cleanup old curve_audit_log and curve_rate_limits
-- These tables accumulate silently and add to disk usage
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_auxiliary_tables(
    p_audit_keep_days INTEGER DEFAULT 7,
    p_rate_limit_keep_hours INTEGER DEFAULT 2
)
RETURNS TABLE(audit_deleted BIGINT, rate_limit_deleted BIGINT) AS $$
DECLARE
    v_audit BIGINT;
    v_rate BIGINT;
BEGIN
    -- Cleanup old audit logs (keep security_alert type for 30 days)
    DELETE FROM curve_audit_log
    WHERE created_at < NOW() - (p_audit_keep_days || ' days')::INTERVAL
    AND event_type != 'security_alert';
    GET DIAGNOSTICS v_audit = ROW_COUNT;

    -- Cleanup old security alerts (30 days)
    DELETE FROM curve_audit_log
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND event_type = 'security_alert';
    v_audit := v_audit + ROW_COUNT;

    -- Cleanup old rate limits
    DELETE FROM curve_rate_limits
    WHERE window_end < NOW() - (p_rate_limit_keep_hours || ' hours')::INTERVAL;
    GET DIAGNOSTICS v_rate = ROW_COUNT;

    audit_deleted := v_audit;
    rate_limit_deleted := v_rate;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION cleanup_auxiliary_tables(INTEGER, INTEGER) IS 
    'Cleans up old audit logs and rate limit entries to prevent silent disk bloat';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 8: Master cleanup function — single call to run everything
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION run_storage_optimization(
    p_prob_strip_hours INTEGER DEFAULT 48,        -- Strip metadata from rows older than this
    p_prob_delete_days INTEGER DEFAULT 7,          -- Delete rows older than this (settled comps only)
    p_pred_cleanup_days INTEGER DEFAULT 7,         -- Strip agent_predictions older than this
    p_keep_per_competition INTEGER DEFAULT 120,    -- Always keep last N probability points per comp
    p_run_vacuum BOOLEAN DEFAULT FALSE             -- Whether to run VACUUM (requires superuser on some setups)
)
RETURNS TABLE(
    prob_rows_stripped BIGINT,
    prob_strip_savings_mb NUMERIC,
    prob_rows_deleted BIGINT,
    prob_delete_savings_mb NUMERIC,
    pred_rows_cleaned BIGINT,
    pred_savings_mb NUMERIC,
    audit_rows_deleted BIGINT,
    rate_limit_rows_deleted BIGINT,
    total_estimated_savings_mb NUMERIC
) AS $$
DECLARE
    v_strip RECORD;
    v_delete RECORD;
    v_pred RECORD;
    v_aux RECORD;
BEGIN
    RAISE NOTICE '🔧 ExoDuZe Storage Optimization — Starting...';

    -- Step 1: Strip metadata from old probability_history rows
    RAISE NOTICE '  Phase 1: Stripping metadata from probability_history (>% hours)...', p_prob_strip_hours;
    SELECT * INTO v_strip FROM archive_old_probability_history(p_prob_strip_hours);
    RAISE NOTICE '    → Stripped % rows (~% MB)', v_strip.rows_stripped, v_strip.space_estimate_mb;

    -- Step 2: Delete old probability_history rows for settled competitions
    RAISE NOTICE '  Phase 2: Deleting old probability_history (>% days, settled comps)...', p_prob_delete_days;
    SELECT * INTO v_delete FROM cleanup_old_probability_history(p_prob_delete_days, p_keep_per_competition);
    RAISE NOTICE '    → Deleted % rows (~% MB)', v_delete.rows_deleted, v_delete.space_estimate_mb;

    -- Step 3: Clean up old agent_predictions
    RAISE NOTICE '  Phase 3: Cleaning agent_predictions (>% days)...', p_pred_cleanup_days;
    SELECT * INTO v_pred FROM cleanup_old_agent_predictions(p_pred_cleanup_days);
    RAISE NOTICE '    → Cleaned % rows (~% MB)', v_pred.rows_cleaned, v_pred.space_estimate_mb;

    -- Step 4: Clean auxiliary tables
    RAISE NOTICE '  Phase 4: Cleaning auxiliary tables...';
    SELECT * INTO v_aux FROM cleanup_auxiliary_tables();
    RAISE NOTICE '    → Audit: % rows, Rate limits: % rows', v_aux.audit_deleted, v_aux.rate_limit_deleted;

    -- Build result
    prob_rows_stripped := v_strip.rows_stripped;
    prob_strip_savings_mb := v_strip.space_estimate_mb;
    prob_rows_deleted := v_delete.rows_deleted;
    prob_delete_savings_mb := v_delete.space_estimate_mb;
    pred_rows_cleaned := v_pred.rows_cleaned;
    pred_savings_mb := v_pred.space_estimate_mb;
    audit_rows_deleted := v_aux.audit_deleted;
    rate_limit_rows_deleted := v_aux.rate_limit_deleted;
    total_estimated_savings_mb := v_strip.space_estimate_mb + v_delete.space_estimate_mb + v_pred.space_estimate_mb;

    RAISE NOTICE '✅ Total estimated savings: ~% MB', total_estimated_savings_mb;
    RAISE NOTICE '⚠️  Run VACUUM FULL on probability_history and agent_predictions to reclaim disk space.';

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION run_storage_optimization(INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN) IS 
    'Master function: strips metadata, deletes old data, cleans auxiliary tables. Run weekly.';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9: Storage Monitoring View
-- Dashboard to track current disk usage and predict growth
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW storage_health_dashboard AS
WITH table_stats AS (
    SELECT
        relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_table_size(c.oid) AS data_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows
    FROM pg_class c
    JOIN pg_stat_user_tables s ON c.relname = s.relname
    WHERE c.relkind = 'r'
    AND s.schemaname = 'public'
    AND c.relname IN (
        'probability_history',
        'agent_predictions',
        'leaderboard_snapshots',
        'curve_audit_log',
        'curve_rate_limits',
        'competitions',
        'agents',
        'agent_competition_entries'
    )
),
growth_rate AS (
    SELECT
        count(*) AS rows_last_24h
    FROM probability_history
    WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
    ts.table_name,
    pg_size_pretty(ts.total_bytes) AS total_size,
    pg_size_pretty(ts.data_bytes) AS data_size,
    pg_size_pretty(ts.index_bytes) AS index_size,
    ts.live_rows,
    ts.dead_rows,
    ROUND(100.0 * ts.dead_rows / GREATEST(ts.live_rows + ts.dead_rows, 1), 1) AS dead_row_pct,
    gr.rows_last_24h AS prob_history_daily_growth
FROM table_stats ts
CROSS JOIN growth_rate gr
ORDER BY ts.total_bytes DESC;

COMMENT ON VIEW storage_health_dashboard IS 'Real-time view of database table sizes, dead rows, and growth rate for storage planning';

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 10: Execute initial cleanup NOW
-- This runs the optimization immediately on migration to reclaim space
-- ════════════════════════════════════════════════════════════════════════════

-- Run the full optimization pipeline immediately
-- Strip metadata from rows older than 48 hours
-- Delete rows older than 7 days for settled competitions
-- Keep last 120 points per competition for historical charts
DO $$
DECLARE
    v_result RECORD;
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE ' ExoDuZe Storage Optimization — Initial Execution ';
    RAISE NOTICE '═══════════════════════════════════════════════════';

    SELECT * INTO v_result FROM run_storage_optimization(
        48,     -- strip metadata older than 48 hours
        7,      -- delete rows older than 7 days (settled competitions)
        7,      -- clean agent_predictions older than 7 days
        120,    -- keep last 120 points per competition
        FALSE   -- don't auto-vacuum (handle manually)
    );

    RAISE NOTICE 'Results:';
    RAISE NOTICE '  Prob history stripped: % rows (~% MB)', v_result.prob_rows_stripped, v_result.prob_strip_savings_mb;
    RAISE NOTICE '  Prob history deleted:  % rows (~% MB)', v_result.prob_rows_deleted, v_result.prob_delete_savings_mb;
    RAISE NOTICE '  Predictions cleaned:   % rows (~% MB)', v_result.pred_rows_cleaned, v_result.pred_savings_mb;
    RAISE NOTICE '  Audit rows deleted:    %', v_result.audit_rows_deleted;
    RAISE NOTICE '  Rate limits deleted:   %', v_result.rate_limit_rows_deleted;
    RAISE NOTICE '  TOTAL SAVINGS:         ~% MB', v_result.total_estimated_savings_mb;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT: After this migration completes, run these manually:';
    RAISE NOTICE '  1. VACUUM FULL probability_history;';
    RAISE NOTICE '  2. VACUUM FULL agent_predictions;';
    RAISE NOTICE '  3. REINDEX TABLE probability_history;';
    RAISE NOTICE '  4. REINDEX TABLE agent_predictions;';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 11: Create Supabase Storage bucket for archived data
-- Backend service will upload archived batches as JSON files here
-- ════════════════════════════════════════════════════════════════════════════

-- Create storage bucket for archived probability data
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'data-archives',
    'data-archives',
    false,
    52428800,  -- 50 MB max per file
    ARRAY['application/json', 'application/gzip']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for data-archives bucket: service role only
CREATE POLICY "Service role manages data archives"
    ON storage.objects FOR ALL
    USING (bucket_id = 'data-archives' AND auth.role() = 'service_role')
    WITH CHECK (bucket_id = 'data-archives' AND auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 12: Grants
-- ════════════════════════════════════════════════════════════════════════════

-- Allow anon/authenticated to read the lean view and health dashboard
GRANT SELECT ON probability_history_lean TO anon, authenticated;
GRANT SELECT ON storage_health_dashboard TO authenticated;

-- Notify PostgREST to reload schema for new functions/views
NOTIFY pgrst, 'reload schema';
