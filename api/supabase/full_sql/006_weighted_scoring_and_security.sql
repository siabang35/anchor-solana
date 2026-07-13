-- ============================================================================
-- ExoDuZe — Weighted Live Scoring, Anti-Chunking, HMAC Integrity
-- File: 006_weighted_scoring_and_security.sql
-- ============================================================================

-- 1. Leaderboard Score Config (per-competition tuning)
CREATE TABLE IF NOT EXISTS public.leaderboard_score_config (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id          UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    weight_mode             score_weight_mode NOT NULL DEFAULT 'hybrid',
    min_predictions         INTEGER NOT NULL DEFAULT 3,
    max_score_velocity      DECIMAL(8,4) NOT NULL DEFAULT 0.2000,
    anti_chunk_window_secs  INTEGER NOT NULL DEFAULT 10,
    min_weight              DECIMAL(4,2) NOT NULL DEFAULT 0.50,
    max_weight              DECIMAL(4,2) NOT NULL DEFAULT 2.00,
    volatility_lookback     INTEGER NOT NULL DEFAULT 20,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_config_per_competition UNIQUE (competition_id),
    CONSTRAINT valid_weight_bounds CHECK (min_weight > 0 AND max_weight > min_weight),
    CONSTRAINT valid_velocity CHECK (max_score_velocity > 0),
    CONSTRAINT valid_chunk_window CHECK (anti_chunk_window_secs >= 5)
);

CREATE INDEX IF NOT EXISTS idx_lb_config_comp ON public.leaderboard_score_config(competition_id);

ALTER TABLE public.leaderboard_score_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages score config" ON public.leaderboard_score_config FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public can view score config" ON public.leaderboard_score_config FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_lb_config_updated_at ON public.leaderboard_score_config;
CREATE TRIGGER update_lb_config_updated_at BEFORE UPDATE ON public.leaderboard_score_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Leaderboard Snapshots (append-only HMAC-chained scoring history)
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
    id                             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id                       UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    competition_id                 UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    prediction_id                  UUID REFERENCES public.agent_predictions(id) ON DELETE SET NULL,
    raw_brier                      DECIMAL(10,6) NOT NULL,
    curve_difficulty_weight        DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
    weighted_brier                 DECIMAL(10,6) NOT NULL,
    cumulative_weighted_score      DECIMAL(10,6) NOT NULL,
    prediction_count               INTEGER NOT NULL DEFAULT 1,
    curve_probability_at_prediction DECIMAL(8,4),
    curve_volatility_at_prediction  DECIMAL(8,4),
    time_remaining_hours           DECIMAL(8,2),
    snapshot_hash                  TEXT NOT NULL,
    previous_hash                  TEXT,
    server_nonce                   TEXT NOT NULL,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_agent_comp ON public.leaderboard_snapshots(agent_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_comp_created ON public.leaderboard_snapshots(competition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_hash ON public.leaderboard_snapshots(snapshot_hash) WHERE snapshot_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_integrity ON public.leaderboard_snapshots(competition_id, id ASC);

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view leaderboard snapshots" ON public.leaderboard_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role manages leaderboard snapshots" ON public.leaderboard_snapshots FOR ALL USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_snapshots;
ALTER TABLE public.leaderboard_snapshots REPLICA IDENTITY FULL;

COMMENT ON TABLE public.leaderboard_snapshots IS 'Append-only HMAC-SHA256 chained scoring history for forensic audit';

-- 3. Curve Audit Log
CREATE TABLE IF NOT EXISTS public.curve_audit_log (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type       TEXT NOT NULL,
    competition_id   UUID,
    category         TEXT,
    details          JSONB DEFAULT '{}',
    ip_address       INET,
    user_agent       TEXT,
    fingerprint      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.curve_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_competition ON public.curve_audit_log(competition_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.curve_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_security ON public.curve_audit_log(event_type, created_at DESC) WHERE event_type = 'security_alert';

ALTER TABLE public.curve_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages audit log" ON public.curve_audit_log FOR ALL USING (auth.role() = 'service_role');

-- 4. Curve Rate Limits
CREATE TABLE IF NOT EXISTS public.curve_rate_limits (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier       TEXT NOT NULL,
    identifier_type  TEXT NOT NULL,
    endpoint         TEXT NOT NULL,
    request_count    INTEGER DEFAULT 1,
    window_start     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_end       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 minute'),
    is_blocked       BOOLEAN DEFAULT FALSE,
    blocked_until    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rate_window UNIQUE (identifier, identifier_type, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.curve_rate_limits(identifier, identifier_type, endpoint, window_start DESC);
ALTER TABLE public.curve_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages rate limits" ON public.curve_rate_limits FOR ALL USING (auth.role() = 'service_role');

-- 5. Anti-Chunk Penalties (progressive)
CREATE TABLE IF NOT EXISTS public.anti_chunk_penalties (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id             UUID NOT NULL,
    competition_id       UUID NOT NULL,
    violation_count      INTEGER NOT NULL DEFAULT 0,
    current_cooldown_secs INTEGER NOT NULL DEFAULT 60,
    last_violation_at    TIMESTAMPTZ,
    penalty_expires_at   TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_comp_penalty UNIQUE (agent_id, competition_id)
);

ALTER TABLE public.anti_chunk_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages penalties" ON public.anti_chunk_penalties FOR ALL USING (auth.role() = 'service_role');

-- 6. Security Events
CREATE TABLE IF NOT EXISTS public.security_events (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type       TEXT NOT NULL,
    severity         TEXT NOT NULL DEFAULT 'low',
    ip_hash          TEXT,
    user_id          UUID,
    agent_id         UUID,
    endpoint         TEXT,
    competition_id   UUID,
    details          JSONB DEFAULT '{}',
    request_nonce    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_events_type ON public.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_severity ON public.security_events(severity, created_at DESC) WHERE severity IN ('high', 'critical');
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages security events" ON public.security_events FOR ALL USING (auth.role() = 'service_role');

-- 7. Used Nonces (anti-replay)
CREATE TABLE IF NOT EXISTS public.used_nonces (
    nonce    TEXT PRIMARY KEY,
    used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context  TEXT
);
ALTER TABLE public.used_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages nonces" ON public.used_nonces FOR ALL USING (auth.role() = 'service_role');

-- 8. Curve Write Config (DB write throttling per horizon)
CREATE TABLE IF NOT EXISTS public.curve_write_config (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    horizon                     TEXT NOT NULL UNIQUE,
    store_every_n_ticks         INTEGER NOT NULL DEFAULT 4,
    max_points_per_competition  INTEGER NOT NULL DEFAULT 500,
    enable_downsampling         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.curve_write_config (horizon, store_every_n_ticks, max_points_per_competition)
VALUES ('2h', 4, 500), ('7h', 2, 500), ('12h', 1, 500), ('24h', 1, 500)
ON CONFLICT (horizon) DO NOTHING;

ALTER TABLE public.curve_write_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read on curve write config" ON public.curve_write_config FOR SELECT USING (true);
CREATE POLICY "Service role manages curve write config" ON public.curve_write_config FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON public.curve_write_config TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Anti-Chunking Guard v2 (progressive penalties)
CREATE OR REPLACE FUNCTION public.anti_chunk_guard_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_window_secs INTEGER;
    v_last_prediction TIMESTAMPTZ;
    v_seconds_since DECIMAL;
    v_penalty_cooldown INTEGER;
    v_violation_count INTEGER;
BEGIN
    SELECT COALESCE(anti_chunk_window_secs, 10) INTO v_window_secs
    FROM public.leaderboard_score_config WHERE competition_id = NEW.competition_id;
    IF v_window_secs IS NULL THEN v_window_secs := 10; END IF;

    SELECT current_cooldown_secs, violation_count INTO v_penalty_cooldown, v_violation_count
    FROM public.anti_chunk_penalties
    WHERE agent_id = NEW.agent_id AND competition_id = NEW.competition_id;

    IF v_penalty_cooldown IS NOT NULL AND v_penalty_cooldown > v_window_secs THEN
        v_window_secs := v_penalty_cooldown;
    END IF;

    SELECT MAX(timestamp) INTO v_last_prediction
    FROM public.agent_predictions
    WHERE agent_id = NEW.agent_id AND competition_id = NEW.competition_id AND id != NEW.id;

    IF v_last_prediction IS NOT NULL THEN
        v_seconds_since := EXTRACT(EPOCH FROM (NEW.timestamp - v_last_prediction));
        IF v_seconds_since < v_window_secs THEN
            INSERT INTO public.anti_chunk_penalties (agent_id, competition_id, violation_count, current_cooldown_secs, last_violation_at)
            VALUES (NEW.agent_id, NEW.competition_id, 1, v_window_secs * 2, NOW())
            ON CONFLICT (agent_id, competition_id) DO UPDATE SET
                violation_count = anti_chunk_penalties.violation_count + 1,
                current_cooldown_secs = LEAST(anti_chunk_penalties.current_cooldown_secs * 2, 3600),
                last_violation_at = NOW(),
                penalty_expires_at = NOW() + INTERVAL '1 hour';

            RAISE EXCEPTION 'Anti-chunking: must wait % seconds. Last was %.1f seconds ago.',
                v_window_secs, v_seconds_since USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_anti_chunk ON public.agent_predictions;
CREATE TRIGGER enforce_anti_chunk BEFORE INSERT ON public.agent_predictions
    FOR EACH ROW EXECUTE FUNCTION public.anti_chunk_guard_v2();

-- Score Velocity Guard
CREATE OR REPLACE FUNCTION public.enforce_score_velocity()
RETURNS TRIGGER AS $$
DECLARE v_max_velocity DECIMAL; v_delta DECIMAL;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.weighted_score IS NOT NULL AND NEW.weighted_score IS NOT NULL THEN
        SELECT COALESCE(max_score_velocity, 0.2000) INTO v_max_velocity
        FROM public.leaderboard_score_config WHERE competition_id = NEW.competition_id;
        IF v_max_velocity IS NULL THEN v_max_velocity := 0.2000; END IF;

        v_delta := ABS(NEW.weighted_score - OLD.weighted_score);
        IF v_delta > v_max_velocity THEN
            INSERT INTO public.curve_audit_log (event_type, competition_id, details)
            VALUES ('security_alert', NEW.competition_id, jsonb_build_object(
                'type', 'score_velocity_exceeded', 'agent_id', NEW.agent_id,
                'old_score', OLD.weighted_score, 'new_score', NEW.weighted_score,
                'delta', v_delta, 'max_allowed', v_max_velocity));
            NEW.weighted_score := OLD.weighted_score + SIGN(NEW.weighted_score - OLD.weighted_score) * v_max_velocity;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_score_velocity_check ON public.agent_competition_entries;
CREATE TRIGGER enforce_score_velocity_check BEFORE UPDATE OF weighted_score ON public.agent_competition_entries
    FOR EACH ROW EXECUTE FUNCTION public.enforce_score_velocity();

-- Auto-create leaderboard config on competition insert (with dynamic min_predictions)
CREATE OR REPLACE FUNCTION public.auto_create_lb_config()
RETURNS TRIGGER AS $$
DECLARE v_duration_hours DECIMAL; v_min_predictions INT := 3;
BEGIN
    IF NEW.competition_start IS NOT NULL AND NEW.competition_end IS NOT NULL THEN
        v_duration_hours := EXTRACT(EPOCH FROM (NEW.competition_end - NEW.competition_start)) / 3600.0;
    ELSIF NEW.time_horizon IS NOT NULL THEN
        CASE NEW.time_horizon
            WHEN '2h' THEN v_duration_hours := 2.0;
            WHEN '7h' THEN v_duration_hours := 7.0;
            WHEN '12h' THEN v_duration_hours := 12.0;
            WHEN '24h' THEN v_duration_hours := 24.0;
            ELSE v_duration_hours := 24.0;
        END CASE;
    ELSE v_duration_hours := 24.0;
    END IF;

    IF v_duration_hours <= 2.0 THEN v_min_predictions := 3;
    ELSIF v_duration_hours <= 7.0 THEN v_min_predictions := 7;
    ELSIF v_duration_hours <= 12.0 THEN v_min_predictions := 10;
    ELSIF v_duration_hours <= 24.0 THEN v_min_predictions := 15;
    ELSE v_min_predictions := 20;
    END IF;

    INSERT INTO public.leaderboard_score_config (competition_id, min_predictions)
    VALUES (NEW.id, v_min_predictions)
    ON CONFLICT (competition_id) DO UPDATE SET min_predictions = EXCLUDED.min_predictions;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_lb_config_on_competition ON public.competitions;
CREATE TRIGGER auto_lb_config_on_competition AFTER INSERT ON public.competitions
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_lb_config();

-- Curve Difficulty Weight calculation
CREATE OR REPLACE FUNCTION public.calculate_curve_difficulty_weight(
    p_competition_id UUID, p_at_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS DECIMAL AS $$
DECLARE
    v_volatility DECIMAL; v_time_weight DECIMAL; v_entropy DECIMAL := 0.0;
    v_comp_end TIMESTAMPTZ; v_comp_start TIMESTAMPTZ;
    v_time_ratio DECIMAL; v_total_hours DECIMAL; v_hours_remaining DECIMAL;
    v_probs DECIMAL[]; v_mean DECIMAL; v_variance DECIMAL; v_count INTEGER;
    v_lookback INTEGER; v_min_w DECIMAL; v_max_w DECIMAL; v_raw_weight DECIMAL;
    v_home DECIMAL; v_draw DECIMAL; v_away DECIMAL; v_p DECIMAL;
BEGIN
    SELECT COALESCE(volatility_lookback, 20), COALESCE(min_weight, 0.50), COALESCE(max_weight, 2.00)
    INTO v_lookback, v_min_w, v_max_w
    FROM public.leaderboard_score_config WHERE competition_id = p_competition_id;
    IF v_lookback IS NULL THEN v_lookback := 20; v_min_w := 0.50; v_max_w := 2.00; END IF;

    SELECT competition_start, competition_end INTO v_comp_start, v_comp_end
    FROM public.competitions WHERE id = p_competition_id;
    IF v_comp_end IS NULL THEN RETURN 1.0000; END IF;

    v_total_hours := GREATEST(EXTRACT(EPOCH FROM (v_comp_end - v_comp_start)) / 3600.0, 1.0);
    v_hours_remaining := GREATEST(EXTRACT(EPOCH FROM (v_comp_end - p_at_time)) / 3600.0, 0.0);
    v_time_ratio := 1.0 - (v_hours_remaining / v_total_hours);
    v_time_weight := 0.5 + (v_time_ratio * v_time_ratio * 1.0);

    SELECT array_agg(home ORDER BY created_at DESC) INTO v_probs FROM (
        SELECT home FROM public.probability_history
        WHERE competition_id = p_competition_id AND created_at <= p_at_time
        ORDER BY created_at DESC LIMIT v_lookback
    ) sub;

    v_volatility := 0.0;
    IF v_probs IS NOT NULL AND array_length(v_probs, 1) >= 3 THEN
        v_count := array_length(v_probs, 1); v_mean := 0;
        FOR i IN 1..v_count LOOP v_mean := v_mean + v_probs[i]; END LOOP;
        v_mean := v_mean / v_count; v_variance := 0;
        FOR i IN 1..v_count LOOP v_variance := v_variance + POWER(v_probs[i] - v_mean, 2); END LOOP;
        v_volatility := SQRT(v_variance / v_count);
    END IF;
    v_volatility := LEAST(v_volatility / 15.0, 1.0);

    SELECT home, draw, away INTO v_home, v_draw, v_away FROM public.probability_history
    WHERE competition_id = p_competition_id AND created_at <= p_at_time ORDER BY created_at DESC LIMIT 1;
    IF v_home IS NOT NULL THEN
        FOR v_p IN SELECT unnest(ARRAY[v_home/100.0, v_draw/100.0, v_away/100.0]) LOOP
            IF v_p > 0.001 THEN v_entropy := v_entropy - (v_p * LN(v_p)); END IF;
        END LOOP;
        v_entropy := LEAST(v_entropy / 1.099, 1.0);
    END IF;

    v_raw_weight := (v_time_weight * 0.40) + (v_volatility * 0.35 * 2.0) + (v_entropy * 0.25 * 2.0);
    RETURN GREATEST(v_min_w, LEAST(v_max_w, v_raw_weight));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Get Weighted Leaderboard (server-side sorted + paginated)
CREATE OR REPLACE FUNCTION public.get_weighted_leaderboard(
    p_competition_id UUID, p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
    rank_position INTEGER, agent_id UUID, agent_name VARCHAR, model VARCHAR,
    agent_status agent_status, weighted_score DECIMAL, raw_brier_avg DECIMAL,
    prediction_count INTEGER, last_scored_at TIMESTAMPTZ, rank_trend INTEGER,
    deployed_at TIMESTAMPTZ, has_min_predictions BOOLEAN
) AS $$
DECLARE v_min_preds INTEGER;
BEGIN
    SELECT COALESCE(lsc.min_predictions, 3) INTO v_min_preds
    FROM public.leaderboard_score_config lsc WHERE lsc.competition_id = p_competition_id;
    IF v_min_preds IS NULL THEN v_min_preds := 3; END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT ace.agent_id, a.name AS agent_name, a.model, a.status AS agent_status,
               ace.weighted_score, ace.brier_score AS raw_brier_avg,
               ace.prediction_count, ace.last_scored_at, ace.rank_trend,
               a.created_at AS deployed_at,
               (ace.prediction_count >= v_min_preds) AS has_min_predictions
        FROM public.agent_competition_entries ace
        JOIN public.agents a ON a.id = ace.agent_id
        WHERE ace.competition_id = p_competition_id AND ace.status IN ('active', 'paused')
    )
    SELECT ROW_NUMBER() OVER (
        ORDER BY ranked.has_min_predictions DESC,
                 COALESCE(ranked.weighted_score, 99.9999) ASC,
                 ranked.prediction_count DESC,
                 ranked.deployed_at ASC
    )::INTEGER, ranked.agent_id, ranked.agent_name, ranked.model, ranked.agent_status,
    ranked.weighted_score, ranked.raw_brier_avg, ranked.prediction_count,
    ranked.last_scored_at, ranked.rank_trend, ranked.deployed_at, ranked.has_min_predictions
    FROM ranked
    ORDER BY ranked.has_min_predictions DESC,
             COALESCE(ranked.weighted_score, 99.9999) ASC,
             ranked.prediction_count DESC,
             ranked.deployed_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Cleanup helpers
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits() RETURNS void AS $$
BEGIN DELETE FROM public.curve_rate_limits WHERE window_end < NOW() - INTERVAL '1 hour' AND is_blocked = FALSE; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.cleanup_used_nonces() RETURNS INTEGER AS $$
DECLARE v_deleted INTEGER;
BEGIN DELETE FROM public.used_nonces WHERE used_at < NOW() - INTERVAL '1 hour'; GET DIAGNOSTICS v_deleted = ROW_COUNT; RETURN v_deleted; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
