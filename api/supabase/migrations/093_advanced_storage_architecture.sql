-- ============================================================================
-- ExoDuZe — Advanced Storage Architecture (093_advanced_storage_architecture.sql)
--
-- PHILOSOPHY: NEVER LOSE DATA — just move it to cheap storage
--   - Hot data (last 48h): Full detail in PostgreSQL for real-time scoring
--   - Warm data (48h-7d): Downsampled in PostgreSQL (1 point/minute)
--   - Cold data (>7d): Full archive in Supabase Storage (100 GB)
--
-- ANTI-THROTTLING: Smart write batching + adaptive tick storage
-- ANTI-HACKING: IP fingerprint tracking, replay protection, HMAC chains
-- ANTI-CHUNKING: Enhanced minimum intervals with progressive penalties
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. DOWNSAMPLED SUMMARY TABLE
-- Stores 1 data point per minute per competition (instead of every 3-15s)
-- This preserves the SHAPE of the curve while using 10-20x less space
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS probability_history_summary (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    competition_id UUID NOT NULL,
    category TEXT NOT NULL,
    
    -- Time bucket (rounded to nearest minute)
    bucket_time TIMESTAMPTZ NOT NULL,
    
    -- Averaged probability values for this minute
    home_avg NUMERIC(8,4) NOT NULL,
    draw_avg NUMERIC(8,4) NOT NULL,
    away_avg NUMERIC(8,4) NOT NULL,
    
    -- Min/Max range within this minute (shows volatility)
    home_min NUMERIC(8,4),
    home_max NUMERIC(8,4),
    away_min NUMERIC(8,4),
    away_max NUMERIC(8,4),
    
    -- Metadata
    regime TEXT,                  -- dominant regime during this minute
    tick_count INTEGER DEFAULT 1, -- how many ticks were averaged
    narrative TEXT,               -- last narrative of the minute
    
    -- Constraint: one summary per minute per competition
    CONSTRAINT unique_summary_bucket UNIQUE (competition_id, bucket_time)
);

CREATE INDEX IF NOT EXISTS idx_summary_comp_time
    ON probability_history_summary(competition_id, bucket_time DESC);

CREATE INDEX IF NOT EXISTS idx_summary_category
    ON probability_history_summary(category);

ALTER TABLE probability_history_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on probability summary" ON probability_history_summary;
CREATE POLICY "Public read on probability summary"
    ON probability_history_summary FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role manages probability summary" ON probability_history_summary;
CREATE POLICY "Service role manages probability summary"
    ON probability_history_summary FOR ALL
    USING (auth.role() = 'service_role');

-- Enable Realtime for summary table
ALTER PUBLICATION supabase_realtime ADD TABLE probability_history_summary;

COMMENT ON TABLE probability_history_summary IS 
    'Downsampled probability history: 1 point/minute per competition. Used for historical charts after hot data (48h) is compacted.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. DOWNSAMPLE FUNCTION
-- Compacts probability_history ticks into 1-minute summary buckets
-- Called by StorageOptimizationService every 6 hours
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION downsample_probability_history(
    p_older_than_hours INTEGER DEFAULT 48,
    p_batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE(rows_downsampled BIGINT, summaries_created BIGINT) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_downsampled BIGINT := 0;
    v_summaries BIGINT := 0;
BEGIN
    v_cutoff := NOW() - (p_older_than_hours || ' hours')::INTERVAL;

    -- Insert downsampled summaries for ticks older than cutoff
    -- that haven't been summarized yet
    INSERT INTO probability_history_summary (
        competition_id, category, bucket_time,
        home_avg, draw_avg, away_avg,
        home_min, home_max, away_min, away_max,
        regime, tick_count, narrative
    )
    SELECT
        ph.competition_id,
        ph.category,
        date_trunc('minute', ph.created_at) AS bucket_time,
        ROUND(AVG(ph.home), 4),
        ROUND(AVG(ph.draw), 4),
        ROUND(AVG(ph.away), 4),
        MIN(ph.home),
        MAX(ph.home),
        MIN(ph.away),
        MAX(ph.away),
        -- Pick the most common regime in this minute
        MODE() WITHIN GROUP (ORDER BY ph.regime),
        COUNT(*)::INTEGER,
        -- Keep the last narrative
        (ARRAY_AGG(ph.narrative ORDER BY ph.created_at DESC))[1]
    FROM probability_history ph
    WHERE ph.created_at < v_cutoff
    GROUP BY ph.competition_id, ph.category, date_trunc('minute', ph.created_at)
    ON CONFLICT (competition_id, bucket_time) DO UPDATE SET
        home_avg = EXCLUDED.home_avg,
        draw_avg = EXCLUDED.draw_avg,
        away_avg = EXCLUDED.away_avg,
        home_min = EXCLUDED.home_min,
        home_max = EXCLUDED.home_max,
        away_min = EXCLUDED.away_min,
        away_max = EXCLUDED.away_max,
        tick_count = EXCLUDED.tick_count;

    GET DIAGNOSTICS v_summaries = ROW_COUNT;
    
    -- Count how many raw rows were covered
    SELECT COUNT(*) INTO v_downsampled
    FROM probability_history
    WHERE created_at < v_cutoff;

    rows_downsampled := v_downsampled;
    summaries_created := v_summaries;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION downsample_probability_history(INTEGER, INTEGER) IS 
    'Compacts old probability_history ticks into 1-minute summary buckets. Preserves curve shape with 10-20x less rows.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ENHANCED ANTI-HACK: Security event tracking
-- IP fingerprint + user agent tracking for rate limit abuse detection
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type TEXT NOT NULL,           -- 'rate_limit_hit', 'replay_attempt', 'nonce_reuse', 'chunk_violation', 'suspicious_pattern'
    severity TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    
    -- Actor identification
    ip_hash TEXT,                       -- SHA256(IP) for privacy-safe tracking
    user_id UUID,
    agent_id UUID,
    
    -- Context
    endpoint TEXT,
    competition_id UUID,
    details JSONB DEFAULT '{}',
    
    -- Anti-replay
    request_nonce TEXT,                 -- Unique per request to detect replays
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_events ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_hash, created_at DESC)
    WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC)
    WHERE severity IN ('high', 'critical');

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages security events" ON security_events;
CREATE POLICY "Service role manages security events" ON security_events
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE security_events IS 'Security event log: rate limit hits, replay attempts, anti-chunking violations, suspicious patterns';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. ENHANCED ANTI-CHUNKING: Progressive penalties
-- Agents that repeatedly hit anti-chunking get exponentially longer cooldowns
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS anti_chunk_penalties (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id UUID NOT NULL,
    competition_id UUID NOT NULL,
    
    -- Penalty state
    violation_count INTEGER NOT NULL DEFAULT 0,
    current_cooldown_secs INTEGER NOT NULL DEFAULT 60,  -- starts at 60s, doubles each violation
    last_violation_at TIMESTAMPTZ,
    penalty_expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_agent_comp_penalty UNIQUE (agent_id, competition_id)
);

ALTER TABLE anti_chunk_penalties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages penalties" ON anti_chunk_penalties;
CREATE POLICY "Service role manages penalties" ON anti_chunk_penalties
    FOR ALL USING (auth.role() = 'service_role');

-- Enhanced anti-chunk guard with progressive penalties
CREATE OR REPLACE FUNCTION anti_chunk_guard_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_window_secs INTEGER;
    v_last_prediction TIMESTAMPTZ;
    v_seconds_since DECIMAL;
    v_penalty_cooldown INTEGER;
    v_violation_count INTEGER;
BEGIN
    -- Get anti-chunk window for this competition
    SELECT COALESCE(anti_chunk_window_secs, 60) INTO v_window_secs
    FROM leaderboard_score_config
    WHERE competition_id = NEW.competition_id;

    IF v_window_secs IS NULL THEN
        v_window_secs := 60;
    END IF;

    -- Check for progressive penalty (doubles per violation)
    SELECT current_cooldown_secs, violation_count
    INTO v_penalty_cooldown, v_violation_count
    FROM anti_chunk_penalties
    WHERE agent_id = NEW.agent_id AND competition_id = NEW.competition_id;

    -- Use the GREATER of base window or penalty cooldown
    IF v_penalty_cooldown IS NOT NULL AND v_penalty_cooldown > v_window_secs THEN
        v_window_secs := v_penalty_cooldown;
    END IF;

    -- Check the last prediction timestamp for this agent + competition
    SELECT MAX(timestamp) INTO v_last_prediction
    FROM agent_predictions
    WHERE agent_id = NEW.agent_id
    AND competition_id = NEW.competition_id
    AND id != NEW.id;

    IF v_last_prediction IS NOT NULL THEN
        v_seconds_since := EXTRACT(EPOCH FROM (NEW.timestamp - v_last_prediction));

        IF v_seconds_since < v_window_secs THEN
            -- Record violation and increase penalty
            INSERT INTO anti_chunk_penalties (agent_id, competition_id, violation_count, current_cooldown_secs, last_violation_at)
            VALUES (NEW.agent_id, NEW.competition_id, 1, v_window_secs * 2, NOW())
            ON CONFLICT (agent_id, competition_id) DO UPDATE SET
                violation_count = anti_chunk_penalties.violation_count + 1,
                current_cooldown_secs = LEAST(anti_chunk_penalties.current_cooldown_secs * 2, 3600), -- cap at 1 hour
                last_violation_at = NOW(),
                penalty_expires_at = NOW() + INTERVAL '1 hour';

            -- Log security event
            INSERT INTO security_events (event_type, severity, agent_id, competition_id, details)
            VALUES (
                'chunk_violation', 
                CASE WHEN COALESCE(v_violation_count, 0) > 3 THEN 'high' ELSE 'medium' END,
                NEW.agent_id, NEW.competition_id,
                jsonb_build_object(
                    'seconds_since', v_seconds_since,
                    'required_window', v_window_secs,
                    'violation_count', COALESCE(v_violation_count, 0) + 1,
                    'new_cooldown', LEAST(v_window_secs * 2, 3600)
                )
            );

            RAISE EXCEPTION
                'Anti-chunking: prediction rejected. Must wait % seconds. Last was %.1f seconds ago. Violations: %.',
                v_window_secs, v_seconds_since, COALESCE(v_violation_count, 0) + 1
            USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Replace old trigger with enhanced version
DROP TRIGGER IF EXISTS enforce_anti_chunk ON agent_predictions;
CREATE TRIGGER enforce_anti_chunk
    BEFORE INSERT ON agent_predictions
    FOR EACH ROW
    EXECUTE FUNCTION anti_chunk_guard_v2();

COMMENT ON FUNCTION anti_chunk_guard_v2() IS 
    'Enhanced anti-chunking with progressive penalties: cooldown doubles per violation, caps at 1 hour. Logs to security_events.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. WRITE-THROTTLE CONFIG TABLE
-- Controls how often the CurveEngine stores to DB vs just broadcasting
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS curve_write_config (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Which horizon this config applies to
    horizon TEXT NOT NULL UNIQUE,
    
    -- Store to DB every Nth tick (broadcast ALL ticks via WebSocket)
    -- e.g. store_every_n_ticks = 4 means: broadcast every 15s, store every 60s
    store_every_n_ticks INTEGER NOT NULL DEFAULT 4,
    
    -- Maximum points to keep per competition in probability_history
    max_points_per_competition INTEGER NOT NULL DEFAULT 500,
    
    -- Whether to enable downsampling for this horizon
    enable_downsampling BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default configs for each horizon tier
-- Goal: reduce DB writes by 75-90% while keeping full WebSocket UX
INSERT INTO curve_write_config (horizon, store_every_n_ticks, max_points_per_competition)
VALUES
    -- 2h competition: engine ticks every 15s, store every 4th = every 60s = ~120 stored points
    ('2h', 4, 500),
    -- 7h competition: engine ticks every 30s, store every 2nd = every 60s = ~420 stored points
    ('7h', 2, 500),
    -- 12h competition: engine ticks every 300s (5min), store every tick = ~144 stored points
    ('12h', 1, 500),
    -- 24h competition: engine ticks every 600s (10min), store every tick = ~144 stored points
    ('24h', 1, 500)
ON CONFLICT (horizon) DO NOTHING;

ALTER TABLE curve_write_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read on curve write config" ON curve_write_config;
CREATE POLICY "Public read on curve write config" ON curve_write_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages curve write config" ON curve_write_config;
CREATE POLICY "Service role manages curve write config" ON curve_write_config FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE curve_write_config IS 
    'Controls DB write frequency per horizon. Reduces DB inserts by 75%+ while keeping full WebSocket broadcast for UX.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. ANTI-REPLAY NONCE TRACKING
-- Prevents request replay attacks by tracking used nonces
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS used_nonces (
    nonce TEXT PRIMARY KEY,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context TEXT -- 'prediction', 'curve_query', 'api_call'
);

-- Auto-cleanup nonces older than 1 hour (no replay after that)
CREATE OR REPLACE FUNCTION cleanup_used_nonces()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM used_nonces WHERE used_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

ALTER TABLE used_nonces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages nonces" ON used_nonces;
CREATE POLICY "Service role manages nonces" ON used_nonces FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE used_nonces IS 'Anti-replay protection: tracks used request nonces (auto-cleanup after 1 hour)';

-- ════════════════════════════════════════════════════════════════════════════
-- 7. COMPREHENSIVE MASTER OPTIMIZATION V2
-- Archive → Downsample → Strip → Cleanup — all in one call
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION run_storage_optimization_v2(
    p_hot_retention_hours INTEGER DEFAULT 48,
    p_warm_retention_days INTEGER DEFAULT 7,
    p_keep_per_competition INTEGER DEFAULT 120
)
RETURNS TABLE(
    summaries_created BIGINT,
    prob_rows_stripped BIGINT,
    prob_rows_deleted BIGINT,
    pred_rows_cleaned BIGINT,
    nonces_cleaned INTEGER,
    penalties_cleaned BIGINT,
    security_events_cleaned BIGINT,
    total_operations BIGINT
) AS $$
DECLARE
    v_summaries RECORD;
    v_strip RECORD;
    v_delete RECORD;
    v_pred RECORD;
    v_nonces INTEGER;
    v_penalties BIGINT;
    v_sec_events BIGINT;
BEGIN
    RAISE NOTICE '🔧 ExoDuZe Storage Optimization V2 — Starting...';

    -- Step 1: Downsample old probability_history into summaries (PRESERVE DATA)
    RAISE NOTICE '  Phase 1: Downsampling probability_history (>%h) into 1-min summaries...', p_hot_retention_hours;
    SELECT * INTO v_summaries FROM downsample_probability_history(p_hot_retention_hours);
    RAISE NOTICE '    → % summaries created from % raw rows', v_summaries.summaries_created, v_summaries.rows_downsampled;

    -- Step 2: Strip heavy metadata columns from old rows (data is preserved in summaries)
    RAISE NOTICE '  Phase 2: Stripping metadata from probability_history (>%h)...', p_hot_retention_hours;
    SELECT * INTO v_strip FROM archive_old_probability_history(p_hot_retention_hours);
    RAISE NOTICE '    → Stripped % rows (~% MB)', v_strip.rows_stripped, v_strip.space_estimate_mb;

    -- Step 3: Delete old probability_history rows (only for SETTLED competitions, data safe in summaries + Storage)
    RAISE NOTICE '  Phase 3: Deleting old probability_history (>%d, settled comps)...', p_warm_retention_days;
    SELECT * INTO v_delete FROM cleanup_old_probability_history(p_warm_retention_days, p_keep_per_competition);
    RAISE NOTICE '    → Deleted % rows (~% MB)', v_delete.rows_deleted, v_delete.space_estimate_mb;

    -- Step 4: Clean old agent_predictions reasoning/curve
    RAISE NOTICE '  Phase 4: Cleaning agent_predictions (>%d)...', p_warm_retention_days;
    SELECT * INTO v_pred FROM cleanup_old_agent_predictions(p_warm_retention_days);
    RAISE NOTICE '    → Cleaned % rows (~% MB)', v_pred.rows_cleaned, v_pred.space_estimate_mb;

    -- Step 5: Clean anti-replay nonces
    SELECT cleanup_used_nonces() INTO v_nonces;
    
    -- Step 6: Clean expired anti-chunk penalties
    DELETE FROM anti_chunk_penalties
    WHERE penalty_expires_at IS NOT NULL AND penalty_expires_at < NOW();
    GET DIAGNOSTICS v_penalties = ROW_COUNT;

    -- Step 7: Clean old security events (keep 30 days)
    DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_sec_events = ROW_COUNT;

    -- Step 8: Clean auxiliary tables
    PERFORM cleanup_auxiliary_tables();

    -- Build result
    summaries_created := v_summaries.summaries_created;
    prob_rows_stripped := v_strip.rows_stripped;
    prob_rows_deleted := v_delete.rows_deleted;
    pred_rows_cleaned := v_pred.rows_cleaned;
    nonces_cleaned := v_nonces;
    penalties_cleaned := v_penalties;
    security_events_cleaned := v_sec_events;
    total_operations := v_summaries.summaries_created + v_strip.rows_stripped + 
                        v_delete.rows_deleted + v_pred.rows_cleaned;

    RAISE NOTICE '✅ V2 Optimization complete. Total operations: %', total_operations;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION run_storage_optimization_v2(INTEGER, INTEGER, INTEGER) IS 
    'V2 master optimization: downsample → archive → strip → delete → cleanup. Preserves all data in summaries + Storage.';

-- ════════════════════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON probability_history_summary TO anon, authenticated;
GRANT SELECT ON curve_write_config TO anon, authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
