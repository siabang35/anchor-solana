-- ============================================================================
-- ExoDuZe — Fix Anti-Chunking Delay for Realtime Responsiveness
-- 067_fix_anti_chunking.sql
-- ============================================================================

-- 1. Updates the default value in the table to 10 seconds
ALTER TABLE leaderboard_score_config ALTER COLUMN anti_chunk_window_secs SET DEFAULT 10;

-- 2. Relaxes the constraint so we can have intervals shorter than 10s if we want (down to 5s)
ALTER TABLE leaderboard_score_config DROP CONSTRAINT IF EXISTS valid_chunk_window;
ALTER TABLE leaderboard_score_config ADD CONSTRAINT valid_chunk_window CHECK (anti_chunk_window_secs >= 5);

-- 3. Updates all currently running competitions to use 10 seconds instead of 60 seconds
UPDATE leaderboard_score_config SET anti_chunk_window_secs = 10;

-- 4. Replaces the trigger function to use the new 10 second default fallback
CREATE OR REPLACE FUNCTION anti_chunk_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_window_secs INTEGER;
    v_last_prediction TIMESTAMPTZ;
    v_seconds_since DECIMAL;
BEGIN
    SELECT COALESCE(anti_chunk_window_secs, 10) INTO v_window_secs
    FROM leaderboard_score_config
    WHERE competition_id = NEW.competition_id;
    
    SELECT created_at INTO v_last_prediction
    FROM leaderboard_snapshots
    WHERE agent_id = NEW.agent_id
      AND competition_id = NEW.competition_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF FOUND THEN
        v_seconds_since := EXTRACT(EPOCH FROM (NOW() - v_last_prediction));
        IF v_seconds_since < v_window_secs THEN
            RAISE EXCEPTION 'Anti-chunking: Must wait % seconds between predictions (has been %s)', v_window_secs, TRUNC(v_seconds_since, 2);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
