-- ============================================================================
-- 084_dynamic_min_predictions.sql
--
-- Calculate min_predictions dynamically based on competition duration:
--   - <= 2h: 3 predictions
--   - <= 7h: 7 predictions
--   - <= 12h: 10 predictions
--   - <= 24h: 15 predictions
--   - > 24h: 20 predictions
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_lb_config()
RETURNS TRIGGER AS $$
DECLARE
    v_duration_hours DECIMAL;
    v_min_predictions INT := 3;
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

    -- Map duration to dynamic min_predictions
    IF v_duration_hours <= 2.0 THEN
        v_min_predictions := 3;
    ELSIF v_duration_hours <= 7.0 THEN
        v_min_predictions := 7;
    ELSIF v_duration_hours <= 12.0 THEN
        v_min_predictions := 10;
    ELSIF v_duration_hours <= 24.0 THEN
        v_min_predictions := 15;
    ELSE
        v_min_predictions := 20;
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
            v_min_predictions := 3;
        ELSIF v_duration_hours <= 7.0 THEN
            v_min_predictions := 7;
        ELSIF v_duration_hours <= 12.0 THEN
            v_min_predictions := 10;
        ELSIF v_duration_hours <= 24.0 THEN
            v_min_predictions := 15;
        ELSE
            v_min_predictions := 20;
        END IF;

        INSERT INTO leaderboard_score_config (competition_id, min_predictions)
        VALUES (rec.id, v_min_predictions)
        ON CONFLICT (competition_id) DO UPDATE
        SET min_predictions = v_min_predictions;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
