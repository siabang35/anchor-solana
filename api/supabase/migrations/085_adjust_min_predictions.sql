-- ============================================================================
-- 085_adjust_min_predictions.sql
--
-- Adjust min_predictions dynamically based on realistic frequency for users/agents
-- joining at most 30 minutes before the competition ends:
--   - 2h  horizon (15s interval)   -> min 15 predictions (requires ~3.75 mins)
--   - 7h  horizon (30s interval)   -> min 10 predictions (requires ~5 mins)
--   - 12h horizon (5m interval)    -> min 3 predictions (requires ~15 mins)
--   - 24h horizon (12.5m interval) -> min 2 predictions (requires ~25 mins)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_lb_config()
RETURNS TRIGGER AS $$
DECLARE
    v_duration_hours DECIMAL;
    v_min_predictions INT := 2;
BEGIN
    -- Calculate duration in hours
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
    ELSE
        v_duration_hours := 24.0;
    END IF;

    -- Map duration to dynamic min_predictions based on realistic 30 min late join:
    -- <= 2h: 15 predictions (15 * 15s = 3.75m)
    -- <= 7h: 10 predictions (10 * 30s = 5m)
    -- <= 12h: 3 predictions (3 * 5m = 15m)
    -- <= 24h or more: 2 predictions (2 * 12.5m = 25m)
    IF v_duration_hours <= 2.0 THEN
        v_min_predictions := 15;
    ELSIF v_duration_hours <= 7.0 THEN
        v_min_predictions := 10;
    ELSIF v_duration_hours <= 12.0 THEN
        v_min_predictions := 3;
    ELSE
        v_min_predictions := 2;
    END IF;

    INSERT INTO leaderboard_score_config (competition_id, min_predictions)
    VALUES (NEW.id, v_min_predictions)
    ON CONFLICT (competition_id) DO UPDATE
    SET min_predictions = EXCLUDED.min_predictions;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all existing competition configs to match the new rules
DO $$
DECLARE
    rec RECORD;
    v_duration_hours DECIMAL;
    v_min_predictions INT;
BEGIN
    FOR rec IN SELECT id, competition_start, competition_end, time_horizon FROM competitions LOOP
        IF rec.competition_start IS NOT NULL AND rec.competition_end IS NOT NULL THEN
            v_duration_hours := EXTRACT(EPOCH FROM (rec.competition_end - rec.competition_start)) / 3600.0;
        ELSIF rec.time_horizon IS NOT NULL THEN
            CASE rec.time_horizon
                WHEN '2h' THEN v_duration_hours := 2.0;
                WHEN '7h' THEN v_duration_hours := 7.0;
                WHEN '12h' THEN v_duration_hours := 12.0;
                WHEN '24h' THEN v_duration_hours := 24.0;
                ELSE v_duration_hours := 24.0;
            END CASE;
        ELSE
            v_duration_hours := 24.0;
        END IF;

        IF v_duration_hours <= 2.0 THEN
            v_min_predictions := 15;
        ELSIF v_duration_hours <= 7.0 THEN
            v_min_predictions := 10;
        ELSIF v_duration_hours <= 12.0 THEN
            v_min_predictions := 3;
        ELSE
            v_min_predictions := 2;
        END IF;

        INSERT INTO leaderboard_score_config (competition_id, min_predictions)
        VALUES (rec.id, v_min_predictions)
        ON CONFLICT (competition_id) DO UPDATE
        SET min_predictions = v_min_predictions;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
