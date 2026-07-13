-- ============================================================================
-- ExoDuZe — Storage Optimization & R2 Archival
-- File: 008_storage_optimization_and_r2.sql
--
-- Hot data (<48h): full detail in PostgreSQL
-- Warm data (48h-7d): downsampled summaries (1 point/min)
-- Cold data (>7d): archived to Cloudflare R2 as JSON batches
-- ============================================================================

-- 1. Archive Tracking Table
CREATE TABLE IF NOT EXISTS public.archive_batches (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name        TEXT NOT NULL,
    batch_key         TEXT NOT NULL UNIQUE,
    storage_path      TEXT NOT NULL,          -- R2 path: archives/{table}/{date_range}.json.gz
    storage_provider  TEXT NOT NULL DEFAULT 'cloudflare_r2',
    row_count         INTEGER NOT NULL DEFAULT 0,
    original_size_bytes BIGINT,
    date_range_start  TIMESTAMPTZ NOT NULL,
    date_range_end    TIMESTAMPTZ NOT NULL,
    archived_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status            TEXT NOT NULL DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS idx_archive_batches_table ON public.archive_batches(table_name, date_range_start);

ALTER TABLE public.archive_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages archives" ON public.archive_batches
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.archive_batches IS 'Tracks data batches archived from DB to Cloudflare R2';

-- 2. Strip metadata from old probability_history rows
CREATE OR REPLACE FUNCTION public.archive_old_probability_history(
    p_retention_hours INTEGER DEFAULT 48, p_batch_size INTEGER DEFAULT 5000
) RETURNS TABLE(rows_stripped BIGINT, space_estimate_mb NUMERIC) AS $$
DECLARE v_cutoff TIMESTAMPTZ; v_affected BIGINT := 0; v_batch BIGINT;
BEGIN
    v_cutoff := NOW() - (p_retention_hours || ' hours')::INTERVAL;
    LOOP
        UPDATE public.probability_history SET chaos_state = NULL, signal_vector = NULL,
            entropy_seed = NULL, source_fingerprint = NULL, security_nonce = NULL, data_sources = NULL
        WHERE id IN (
            SELECT id FROM public.probability_history WHERE created_at < v_cutoff
            AND (chaos_state IS NOT NULL OR signal_vector IS NOT NULL OR entropy_seed IS NOT NULL
                 OR source_fingerprint IS NOT NULL OR security_nonce IS NOT NULL)
            LIMIT p_batch_size);
        GET DIAGNOSTICS v_batch = ROW_COUNT; v_affected := v_affected + v_batch;
        EXIT WHEN v_batch = 0; PERFORM pg_sleep(0.1);
    END LOOP;
    rows_stripped := v_affected; space_estimate_mb := ROUND((v_affected * 500.0) / (1024 * 1024), 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Cleanup old probability history (preserves data via summaries)
CREATE OR REPLACE FUNCTION public.cleanup_old_probability_history(
    p_keep_days INTEGER DEFAULT 7, p_keep_per_competition INTEGER DEFAULT 120, p_batch_size INTEGER DEFAULT 10000
) RETURNS TABLE(rows_deleted BIGINT, space_estimate_mb NUMERIC) AS $$
BEGIN rows_deleted := 0; space_estimate_mb := 0.00; RETURN NEXT; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Strip old agent_predictions (reasoning/projected_curve)
CREATE OR REPLACE FUNCTION public.cleanup_old_agent_predictions(
    p_keep_days INTEGER DEFAULT 7, p_batch_size INTEGER DEFAULT 5000
) RETURNS TABLE(rows_cleaned BIGINT, space_estimate_mb NUMERIC) AS $$
DECLARE v_cutoff TIMESTAMPTZ; v_total BIGINT := 0; v_batch BIGINT;
BEGIN
    v_cutoff := NOW() - (p_keep_days || ' days')::INTERVAL;
    LOOP
        UPDATE public.agent_predictions SET reasoning = NULL, projected_curve = NULL, prediction_data = NULL
        WHERE id IN (
            SELECT ap.id FROM public.agent_predictions ap WHERE ap.timestamp < v_cutoff
            AND (ap.reasoning IS NOT NULL OR ap.projected_curve IS NOT NULL
                 OR (ap.prediction_data IS NOT NULL AND ap.prediction_data != '{}'::jsonb))
            AND EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = ap.competition_id AND c.status IN ('settled', 'cancelled'))
            LIMIT p_batch_size);
        GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
        EXIT WHEN v_batch = 0; PERFORM pg_sleep(0.1);
    END LOOP;
    rows_cleaned := v_total; space_estimate_mb := ROUND((v_total * 2048.0) / (1024 * 1024), 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Downsample into 1-minute summaries
CREATE OR REPLACE FUNCTION public.downsample_probability_history(
    p_older_than_hours INTEGER DEFAULT 48, p_batch_size INTEGER DEFAULT 10000
) RETURNS TABLE(rows_downsampled BIGINT, summaries_created BIGINT) AS $$
DECLARE v_cutoff TIMESTAMPTZ; v_ds BIGINT := 0; v_sm BIGINT := 0;
BEGIN
    v_cutoff := NOW() - (p_older_than_hours || ' hours')::INTERVAL;
    INSERT INTO public.probability_history_summary (competition_id, category, bucket_time,
        home_avg, draw_avg, away_avg, home_min, home_max, away_min, away_max, regime, tick_count, narrative)
    SELECT ph.competition_id, ph.category, date_trunc('minute', ph.created_at),
        ROUND(AVG(ph.home), 4), ROUND(AVG(ph.draw), 4), ROUND(AVG(ph.away), 4),
        MIN(ph.home), MAX(ph.home), MIN(ph.away), MAX(ph.away),
        MODE() WITHIN GROUP (ORDER BY ph.regime), COUNT(*)::INTEGER,
        (ARRAY_AGG(ph.narrative ORDER BY ph.created_at DESC))[1]
    FROM public.probability_history ph WHERE ph.created_at < v_cutoff
    GROUP BY ph.competition_id, ph.category, date_trunc('minute', ph.created_at)
    ON CONFLICT (competition_id, bucket_time) DO UPDATE SET
        home_avg = EXCLUDED.home_avg, draw_avg = EXCLUDED.draw_avg, away_avg = EXCLUDED.away_avg,
        tick_count = EXCLUDED.tick_count;
    GET DIAGNOSTICS v_sm = ROW_COUNT;
    SELECT COUNT(*) INTO v_ds FROM public.probability_history WHERE created_at < v_cutoff;
    rows_downsampled := v_ds; summaries_created := v_sm; RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Cleanup auxiliary tables
CREATE OR REPLACE FUNCTION public.cleanup_auxiliary_tables(
    p_audit_keep_days INTEGER DEFAULT 7, p_rate_limit_keep_hours INTEGER DEFAULT 2
) RETURNS TABLE(audit_deleted BIGINT, rate_limit_deleted BIGINT) AS $$
DECLARE v_audit BIGINT; v_rate BIGINT; v_temp BIGINT;
BEGIN
    DELETE FROM public.curve_audit_log WHERE created_at < NOW() - (p_audit_keep_days || ' days')::INTERVAL AND event_type != 'security_alert';
    GET DIAGNOSTICS v_audit = ROW_COUNT;
    DELETE FROM public.curve_audit_log WHERE created_at < NOW() - INTERVAL '30 days' AND event_type = 'security_alert';
    GET DIAGNOSTICS v_temp = ROW_COUNT; v_audit := v_audit + v_temp;
    DELETE FROM public.curve_rate_limits WHERE window_end < NOW() - (p_rate_limit_keep_hours || ' hours')::INTERVAL;
    GET DIAGNOSTICS v_rate = ROW_COUNT;
    audit_deleted := v_audit; rate_limit_deleted := v_rate; RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Master V2 Optimization (single call)
CREATE OR REPLACE FUNCTION public.run_storage_optimization_v2(
    p_hot_retention_hours INTEGER DEFAULT 48,
    p_warm_retention_days INTEGER DEFAULT 7,
    p_keep_per_competition INTEGER DEFAULT 120
) RETURNS TABLE(
    summaries_created BIGINT, prob_rows_stripped BIGINT, prob_rows_deleted BIGINT,
    pred_rows_cleaned BIGINT, nonces_cleaned INTEGER, penalties_cleaned BIGINT,
    security_events_cleaned BIGINT, total_operations BIGINT
) AS $$
DECLARE v_sm RECORD; v_st RECORD; v_dl RECORD; v_pr RECORD; v_nc INTEGER; v_pc BIGINT; v_sc BIGINT;
BEGIN
    SELECT * INTO v_sm FROM public.downsample_probability_history(p_hot_retention_hours);
    SELECT * INTO v_st FROM public.archive_old_probability_history(p_hot_retention_hours);
    SELECT * INTO v_dl FROM public.cleanup_old_probability_history(p_warm_retention_days, p_keep_per_competition);
    SELECT * INTO v_pr FROM public.cleanup_old_agent_predictions(p_warm_retention_days);
    SELECT public.cleanup_used_nonces() INTO v_nc;
    DELETE FROM public.anti_chunk_penalties WHERE penalty_expires_at IS NOT NULL AND penalty_expires_at < NOW();
    GET DIAGNOSTICS v_pc = ROW_COUNT;
    DELETE FROM public.security_events WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_sc = ROW_COUNT;
    PERFORM public.cleanup_auxiliary_tables();
    summaries_created := v_sm.summaries_created; prob_rows_stripped := v_st.rows_stripped;
    prob_rows_deleted := v_dl.rows_deleted; pred_rows_cleaned := v_pr.rows_cleaned;
    nonces_cleaned := v_nc; penalties_cleaned := v_pc; security_events_cleaned := v_sc;
    total_operations := v_sm.summaries_created + v_st.rows_stripped + v_dl.rows_deleted + v_pr.rows_cleaned;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Storage Health Dashboard
CREATE OR REPLACE VIEW public.storage_health_dashboard AS
WITH table_stats AS (
    SELECT c.relname AS table_name, pg_total_relation_size(c.oid) AS total_bytes,
        pg_table_size(c.oid) AS data_bytes, pg_indexes_size(c.oid) AS index_bytes,
        s.n_live_tup AS live_rows, s.n_dead_tup AS dead_rows
    FROM pg_class c JOIN pg_stat_user_tables s ON c.relname = s.relname
    WHERE c.relkind = 'r' AND s.schemaname = 'public'
    AND c.relname IN ('probability_history','agent_predictions','leaderboard_snapshots',
        'curve_audit_log','curve_rate_limits','competitions','agents','agent_competition_entries')
), growth_rate AS (
    SELECT count(*) AS rows_last_24h FROM public.probability_history WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT ts.table_name, pg_size_pretty(ts.total_bytes) AS total_size,
    pg_size_pretty(ts.data_bytes) AS data_size, pg_size_pretty(ts.index_bytes) AS index_size,
    ts.live_rows, ts.dead_rows,
    ROUND(100.0 * ts.dead_rows / GREATEST(ts.live_rows + ts.dead_rows, 1), 1) AS dead_row_pct,
    gr.rows_last_24h AS prob_history_daily_growth
FROM table_stats ts CROSS JOIN growth_rate gr ORDER BY ts.total_bytes DESC;

GRANT SELECT ON public.storage_health_dashboard TO authenticated;

-- 9. Cloudflare R2 Storage Bucket Metadata
-- NOTE: Actual R2 bucket creation is done via Cloudflare Dashboard/API.
-- This table tracks R2 bucket references for the backend StorageService.
CREATE TABLE IF NOT EXISTS public.r2_bucket_config (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bucket_name      TEXT NOT NULL UNIQUE,
    purpose          TEXT NOT NULL,
    public_url       TEXT,
    max_file_size_mb INTEGER DEFAULT 50,
    allowed_types    TEXT[] DEFAULT ARRAY['application/json', 'application/gzip', 'image/webp'],
    is_public        BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.r2_bucket_config (bucket_name, purpose, max_file_size_mb, allowed_types, is_public)
VALUES
    ('exoduze-archives', 'Cold data archival (probability_history, agent_predictions)',
     100, ARRAY['application/json', 'application/gzip'], false),
    ('exoduze-media', 'Public media (competition images, agent avatars, market thumbnails)',
     10, ARRAY['image/webp', 'image/png', 'image/jpeg'], true),
    ('exoduze-etl-raw', 'Raw ETL API responses for debugging',
     50, ARRAY['application/json', 'application/gzip'], false)
ON CONFLICT (bucket_name) DO NOTHING;

ALTER TABLE public.r2_bucket_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages R2 config" ON public.r2_bucket_config FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read R2 config" ON public.r2_bucket_config FOR SELECT USING (true);

COMMENT ON TABLE public.r2_bucket_config IS 'Cloudflare R2 bucket metadata. Actual buckets provisioned via Cloudflare API.';
COMMENT ON TABLE public.archive_batches IS 'Tracks cold data batches archived from PostgreSQL to Cloudflare R2';

NOTIFY pgrst, 'reload schema';
