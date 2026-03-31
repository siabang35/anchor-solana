-- ============================================================================
-- ExoDuZe — Weighted Live Scoring for Competition Leaderboard
-- 063_weighted_live_scoring.sql
--
-- Fair, skill-based scoring: predictions are weighted by curve difficulty
-- (volatility + entropy + time-remaining) at the moment of prediction.
-- Anti-chunking, anti-manipulation, HMAC integrity, realtime support.
-- ============================================================================

-- ========================
-- 1. ENUM for weight mode
-- ========================
DO $$ BEGIN
    CREATE TYPE score_weight_mode AS ENUM (
        'time_decay',
        'volatility_weighted',
        'hybrid'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- 2. Leaderboard Score Config (per-competition tuning)
-- ========================
CREATE TABLE IF NOT EXISTS leaderboard_score_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,

    -- Weighting mode
    weight_mode score_weight_mode NOT NULL DEFAULT 'hybrid',

    -- Minimum predictions before an agent is ranked
    min_predictions INTEGER NOT NULL DEFAULT 3,

    -- Max allowed score change per scoring tick (anti-exploit)
    max_score_velocity DECIMAL(8,4) NOT NULL DEFAULT 0.2000,

    -- Anti-chunking: minimum seconds between predictions for the same agent
    anti_chunk_window_secs INTEGER NOT NULL DEFAULT 60,

    -- Curve difficulty weight bounds
    min_weight DECIMAL(4,2) NOT NULL DEFAULT 0.50,
    max_weight DECIMAL(4,2) NOT NULL DEFAULT 2.00,

    -- Volatility lookback (how many recent probability_history points)
    volatility_lookback INTEGER NOT NULL DEFAULT 20,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_config_per_competition UNIQUE (competition_id),
    CONSTRAINT valid_weight_bounds CHECK (min_weight > 0 AND max_weight > min_weight),
    CONSTRAINT valid_velocity CHECK (max_score_velocity > 0),
    CONSTRAINT valid_chunk_window CHECK (anti_chunk_window_secs >= 10)
);

-- ========================
-- 3. Leaderboard Snapshots (append-only scoring history)
-- ========================
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Links
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    prediction_id UUID REFERENCES agent_predictions(id) ON DELETE SET NULL,

    -- Raw scoring
    raw_brier DECIMAL(10,6) NOT NULL,

    -- Curve difficulty weight at prediction time (0.50 - 2.00)
    curve_difficulty_weight DECIMAL(6,4) NOT NULL DEFAULT 1.0000,

    -- Weighted brier for this single prediction
    weighted_brier DECIMAL(10,6) NOT NULL,

    -- Cumulative weighted score after this snapshot
    cumulative_weighted_score DECIMAL(10,6) NOT NULL,

    -- Running prediction count at this snapshot
    prediction_count INTEGER NOT NULL DEFAULT 1,

    -- Curve state at time of prediction (for audit/reproducibility)
    curve_probability_at_prediction DECIMAL(8,4),
    curve_volatility_at_prediction DECIMAL(8,4),
    time_remaining_hours DECIMAL(8,2),

    -- HMAC integrity chain: SHA256(previous_hash + score_data + server_nonce)
    snapshot_hash TEXT NOT NULL,
    previous_hash TEXT,
    server_nonce TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- 4. Add weighted scoring columns to agent_competition_entries
-- ========================
ALTER TABLE agent_competition_entries
    ADD COLUMN IF NOT EXISTS weighted_score DECIMAL(10,6),
    ADD COLUMN IF NOT EXISTS prediction_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS score_hash TEXT,
    ADD COLUMN IF NOT EXISTS rank_trend INTEGER NOT NULL DEFAULT 0;
    -- rank_trend: +1 means moved up, -1 moved down, 0 no change

-- ========================
-- 5. Indexes
-- ========================

-- Leaderboard snapshots
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_agent_comp
    ON leaderboard_snapshots(agent_id, competition_id);

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_comp_created
    ON leaderboard_snapshots(competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_hash
    ON leaderboard_snapshots(snapshot_hash) WHERE snapshot_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_integrity
    ON leaderboard_snapshots(competition_id, id ASC);

-- Agent_competition_entries weighted scoring lookups
CREATE INDEX IF NOT EXISTS idx_ace_weighted_score
    ON agent_competition_entries(competition_id, weighted_score ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ace_prediction_count
    ON agent_competition_entries(competition_id, prediction_count DESC);

-- Config
CREATE INDEX IF NOT EXISTS idx_lb_config_comp
    ON leaderboard_score_config(competition_id);

-- ========================
-- 6. Anti-Chunking Guard Function
-- ========================
CREATE OR REPLACE FUNCTION anti_chunk_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_window_secs INTEGER;
    v_last_prediction TIMESTAMPTZ;
    v_seconds_since DECIMAL;
BEGIN
    -- Get anti-chunk window for this competition
    SELECT COALESCE(anti_chunk_window_secs, 60) INTO v_window_secs
    FROM leaderboard_score_config
    WHERE competition_id = NEW.competition_id;

    -- If no config, use default 60s
    IF v_window_secs IS NULL THEN
        v_window_secs := 60;
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
            RAISE EXCEPTION
                'Anti-chunking: prediction rejected. Must wait % seconds between predictions. Last prediction was %.1f seconds ago.',
                v_window_secs, v_seconds_since
            USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Apply to agent_predictions
DROP TRIGGER IF EXISTS enforce_anti_chunk ON agent_predictions;
CREATE TRIGGER enforce_anti_chunk
    BEFORE INSERT ON agent_predictions
    FOR EACH ROW
    EXECUTE FUNCTION anti_chunk_guard();

-- ========================
-- 7. Score Velocity Guard Function
-- ========================
CREATE OR REPLACE FUNCTION enforce_score_velocity()
RETURNS TRIGGER AS $$
DECLARE
    v_max_velocity DECIMAL;
    v_old_score DECIMAL;
    v_delta DECIMAL;
BEGIN
    -- Only check on UPDATE when weighted_score changes
    IF TG_OP = 'UPDATE' AND OLD.weighted_score IS NOT NULL AND NEW.weighted_score IS NOT NULL THEN
        -- Get max velocity config
        SELECT COALESCE(max_score_velocity, 0.2000) INTO v_max_velocity
        FROM leaderboard_score_config
        WHERE competition_id = NEW.competition_id;

        IF v_max_velocity IS NULL THEN
            v_max_velocity := 0.2000;
        END IF;

        v_delta := ABS(NEW.weighted_score - OLD.weighted_score);

        IF v_delta > v_max_velocity THEN
            -- Log the security alert instead of blocking (to avoid false positives)
            INSERT INTO curve_audit_log (event_type, competition_id, details)
            VALUES (
                'security_alert',
                NEW.competition_id,
                jsonb_build_object(
                    'type', 'score_velocity_exceeded',
                    'agent_id', NEW.agent_id,
                    'old_score', OLD.weighted_score,
                    'new_score', NEW.weighted_score,
                    'delta', v_delta,
                    'max_allowed', v_max_velocity
                )
            );

            -- Clamp the score change to max velocity
            NEW.weighted_score := OLD.weighted_score +
                SIGN(NEW.weighted_score - OLD.weighted_score) * v_max_velocity;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS enforce_score_velocity_check ON agent_competition_entries;
CREATE TRIGGER enforce_score_velocity_check
    BEFORE UPDATE OF weighted_score ON agent_competition_entries
    FOR EACH ROW
    EXECUTE FUNCTION enforce_score_velocity();

-- ========================
-- 8. Calculate Curve Difficulty Weight (DB helper)
-- ========================
CREATE OR REPLACE FUNCTION calculate_curve_difficulty_weight(
    p_competition_id UUID,
    p_at_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS DECIMAL AS $$
DECLARE
    v_volatility DECIMAL;
    v_time_weight DECIMAL;
    v_entropy_weight DECIMAL;
    v_comp_end TIMESTAMPTZ;
    v_comp_start TIMESTAMPTZ;
    v_hours_remaining DECIMAL;
    v_total_hours DECIMAL;
    v_time_ratio DECIMAL;
    v_probs DECIMAL[];
    v_mean DECIMAL;
    v_variance DECIMAL;
    v_count INTEGER;
    v_lookback INTEGER;
    v_min_w DECIMAL;
    v_max_w DECIMAL;
    v_raw_weight DECIMAL;
    v_home DECIMAL;
    v_draw DECIMAL;
    v_away DECIMAL;
    v_p DECIMAL;
    v_entropy DECIMAL;
    rec RECORD;
BEGIN
    -- Get config
    SELECT COALESCE(volatility_lookback, 20), COALESCE(min_weight, 0.50), COALESCE(max_weight, 2.00)
    INTO v_lookback, v_min_w, v_max_w
    FROM leaderboard_score_config
    WHERE competition_id = p_competition_id;

    IF v_lookback IS NULL THEN
        v_lookback := 20; v_min_w := 0.50; v_max_w := 2.00;
    END IF;

    -- Get competition timing
    SELECT competition_start, competition_end INTO v_comp_start, v_comp_end
    FROM competitions WHERE id = p_competition_id;

    IF v_comp_end IS NULL THEN
        RETURN 1.0000;
    END IF;

    -- 1. Time remaining weight (closer to end = higher weight)
    v_total_hours := GREATEST(EXTRACT(EPOCH FROM (v_comp_end - v_comp_start)) / 3600.0, 1.0);
    v_hours_remaining := GREATEST(EXTRACT(EPOCH FROM (v_comp_end - p_at_time)) / 3600.0, 0.0);
    v_time_ratio := 1.0 - (v_hours_remaining / v_total_hours);
    -- Exponential curve: predictions near the end are worth much more
    v_time_weight := 0.5 + (v_time_ratio * v_time_ratio * 1.0);

    -- 2. Volatility weight (high volatility = curve is unpredictable = higher weight)
    SELECT array_agg(home ORDER BY created_at DESC)
    INTO v_probs
    FROM (
        SELECT home FROM probability_history
        WHERE competition_id = p_competition_id
        AND created_at <= p_at_time
        ORDER BY created_at DESC
        LIMIT v_lookback
    ) sub;

    v_volatility := 0.0;
    IF v_probs IS NOT NULL AND array_length(v_probs, 1) >= 3 THEN
        -- Calculate standard deviation
        v_count := array_length(v_probs, 1);
        v_mean := 0;
        FOR i IN 1..v_count LOOP
            v_mean := v_mean + v_probs[i];
        END LOOP;
        v_mean := v_mean / v_count;

        v_variance := 0;
        FOR i IN 1..v_count LOOP
            v_variance := v_variance + POWER(v_probs[i] - v_mean, 2);
        END LOOP;
        v_variance := v_variance / v_count;
        v_volatility := SQRT(v_variance);
    END IF;

    -- Normalize volatility to 0-1 range (assuming max reasonable std dev ~ 15 percentage points)
    v_volatility := LEAST(v_volatility / 15.0, 1.0);

    -- 3. Entropy weight (closer to 50/50 = harder to predict = higher weight)
    SELECT home, draw, away INTO v_home, v_draw, v_away
    FROM probability_history
    WHERE competition_id = p_competition_id
    AND created_at <= p_at_time
    ORDER BY created_at DESC
    LIMIT 1;

    v_entropy := 0.0;
    IF v_home IS NOT NULL THEN
        -- Shannon entropy normalized
        v_entropy := 0;
        FOR v_p IN SELECT unnest(ARRAY[v_home/100.0, v_draw/100.0, v_away/100.0]) LOOP
            IF v_p > 0.001 THEN
                v_entropy := v_entropy - (v_p * LN(v_p));
            END IF;
        END LOOP;
        -- Normalize: max entropy for 3 outcomes = ln(3) ≈ 1.099
        v_entropy := LEAST(v_entropy / 1.099, 1.0);
    END IF;

    -- Combine: 40% time, 35% volatility, 25% entropy
    v_raw_weight := (v_time_weight * 0.40) + (v_volatility * 0.35 * 2.0) + (v_entropy * 0.25 * 2.0);

    -- Clamp to configured bounds
    RETURN GREATEST(v_min_w, LEAST(v_max_w, v_raw_weight));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- ========================
-- 9. Get Weighted Leaderboard (DB function for performance)
-- ========================
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
        AND ace.status IN ('active', 'paused')
    )
    SELECT
        -- Agents with minimum predictions are ranked first (by weighted score ASC = lower is better)
        -- Agents below minimum are ranked after, also by weighted score
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

-- ========================
-- 10. Row Level Security
-- ========================

-- leaderboard_snapshots: public read, service-role write
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view leaderboard snapshots"
    ON leaderboard_snapshots FOR SELECT
    USING (true);

CREATE POLICY "Service role manages leaderboard snapshots"
    ON leaderboard_snapshots FOR ALL
    USING (auth.role() = 'service_role');

-- leaderboard_score_config: service-role only
ALTER TABLE leaderboard_score_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages score config"
    ON leaderboard_score_config FOR ALL
    USING (auth.role() = 'service_role');

-- Public read on config (non-sensitive tuning params)
CREATE POLICY "Public can view score config"
    ON leaderboard_score_config FOR SELECT
    USING (true);

-- ========================
-- 11. Realtime
-- ========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_snapshots;
ALTER TABLE public.leaderboard_snapshots REPLICA IDENTITY FULL;

-- agent_competition_entries already exists, enable realtime for live score updates
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_competition_entries;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.agent_competition_entries REPLICA IDENTITY FULL;

-- ========================
-- 12. Updated At Triggers
-- ========================
CREATE TRIGGER update_lb_config_updated_at
    BEFORE UPDATE ON leaderboard_score_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- 13. Auto-create default config for new competitions
-- ========================
CREATE OR REPLACE FUNCTION auto_create_lb_config()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO leaderboard_score_config (competition_id)
    VALUES (NEW.id)
    ON CONFLICT (competition_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS auto_lb_config_on_competition ON competitions;
CREATE TRIGGER auto_lb_config_on_competition
    AFTER INSERT ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_lb_config();

-- ========================
-- 14. Insert default configs for existing competitions
-- ========================
INSERT INTO leaderboard_score_config (competition_id)
SELECT id FROM competitions
WHERE id NOT IN (SELECT competition_id FROM leaderboard_score_config)
ON CONFLICT (competition_id) DO NOTHING;

-- ========================
-- 15. Comments
-- ========================
COMMENT ON TABLE leaderboard_snapshots IS 'Append-only scoring history with HMAC integrity chain for competition leaderboard';
COMMENT ON TABLE leaderboard_score_config IS 'Per-competition scoring configuration (weight mode, anti-chunking, velocity limits)';
COMMENT ON FUNCTION anti_chunk_guard() IS 'Trigger preventing rapid-fire prediction submissions (anti-chunking)';
COMMENT ON FUNCTION enforce_score_velocity() IS 'Trigger clamping score changes to max velocity and logging alerts';
COMMENT ON FUNCTION calculate_curve_difficulty_weight(UUID, TIMESTAMPTZ) IS 'Calculates a 0.5-2.0 weight based on curve volatility, time remaining, and entropy';
COMMENT ON FUNCTION get_weighted_leaderboard(UUID, INTEGER) IS 'Returns competition leaderboard ranked by weighted score with fairness controls';
COMMENT ON FUNCTION auto_create_lb_config() IS 'Auto-creates default leaderboard config when a new competition is created';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
