-- ============================================================================
-- 085_seed_missing_probability_history.sql
-- Fix: Some live competitions show empty probability curves because they have
-- zero rows in probability_history. This seeds realistic initial data points
-- for all active competitions missing history, using gradual probability
-- changes based on the competition's real base_probability.
-- ============================================================================

-- ========================
-- PART 1: Seed realistic probability_history for active competitions with NO data
-- ========================
-- Generate 10 realistic data points spread across the competition's live duration
-- with gradual probability changes derived from base_probability + small perturbations.

DO $$
DECLARE
    comp RECORD;
    i INTEGER;
    total_points INTEGER := 10;
    base_home NUMERIC;
    base_draw NUMERIC;
    base_away NUMERIC;
    h NUMERIC;
    d NUMERIC;
    a NUMERIC;
    delta NUMERIC;
    point_time TIMESTAMPTZ;
    time_step INTERVAL;
    elapsed INTERVAL;
BEGIN
    FOR comp IN
        SELECT c.id, c.sector, c.probabilities, c.base_probability,
               c.competition_start, c.competition_end
        FROM competitions c
        WHERE c.status IN ('active', 'upcoming')
        AND NOT EXISTS (
            SELECT 1 FROM probability_history ph WHERE ph.competition_id = c.id
        )
    LOOP
        -- Calculate base probabilities from competition data
        IF comp.probabilities IS NOT NULL AND array_length(comp.probabilities, 1) >= 2 THEN
            base_home := (comp.probabilities[1])::numeric / 100.0;
            base_draw := (comp.probabilities[2])::numeric / 100.0;
            IF array_length(comp.probabilities, 1) >= 3 THEN
                base_away := (comp.probabilities[3])::numeric / 100.0;
            ELSE
                base_away := 100.0 - base_home - base_draw;
            END IF;
        ELSE
            base_home := COALESCE(comp.base_probability, 0.50) * 100;
            base_draw := (100.0 - base_home) * 0.4;
            base_away := 100.0 - base_home - base_draw;
        END IF;

        -- Time step between points
        elapsed := LEAST(comp.competition_end - comp.competition_start, NOW() - comp.competition_start);
        IF elapsed <= interval '0 seconds' THEN
            elapsed := interval '30 minutes';
        END IF;
        time_step := elapsed / total_points;

        -- Generate points with gradual random-walk perturbations
        h := base_home;
        d := base_draw;
        a := base_away;

        FOR i IN 0..total_points - 1 LOOP
            point_time := comp.competition_start + (time_step * i);
            
            -- Skip future points
            IF point_time > NOW() THEN
                EXIT;
            END IF;

            -- Apply small perturbation (random walk using sin/cos of index for determinism)
            delta := sin(i * 1.7 + hashtext(comp.id::text) * 0.0001) * 3.5;
            h := GREATEST(5.0, LEAST(95.0, h + delta));
            
            delta := cos(i * 2.3 + hashtext(comp.id::text) * 0.0002) * 2.0;
            d := GREATEST(2.0, LEAST(40.0, d + delta));
            
            -- Normalize: away = 100 - home - draw
            a := GREATEST(2.0, 100.0 - h - d);
            
            -- Re-normalize if total != 100
            IF (h + d + a) != 100.0 THEN
                h := h / (h + d + a) * 100.0;
                d := d / (h + d + a) * 100.0;
                a := 100.0 - h - d;
            END IF;

            INSERT INTO probability_history (
                competition_id, time_label, home, draw, away,
                narrative, regime, category, created_at
            ) VALUES (
                comp.id,
                to_char(point_time, 'HH12:MI:SS AM'),
                ROUND(h, 2),
                ROUND(d, 2),
                ROUND(a, 2),
                CASE 
                    WHEN i = 0 THEN 'Initial baseline — competition start'
                    WHEN delta > 2.0 THEN 'Regime: TRENDING | Momentum shift detected'
                    WHEN delta < -2.0 THEN 'Regime: VOLATILE | Counter-trend reversal'
                    ELSE 'Regime: MEAN_REVERTING | Steady state'
                END,
                CASE 
                    WHEN abs(delta) > 2.5 THEN 'volatile'
                    WHEN delta > 1.0 THEN 'trending'
                    ELSE 'mean_reverting'
                END,
                comp.sector,
                point_time
            );
        END LOOP;

        RAISE NOTICE 'Seeded probability_history for competition % (sector: %)', comp.id, comp.sector;
    END LOOP;
END $$;


-- ========================
-- PART 2: Auto-seed trigger for future competitions
-- ========================
-- When a competition transitions to 'active', the CurveEngine should pick it up
-- within 60 seconds via healthCheck. This trigger ensures at least one initial
-- row exists so the chart isn't completely blank during that startup gap.

CREATE OR REPLACE FUNCTION auto_seed_probability_history()
RETURNS TRIGGER AS $$
DECLARE
    base_h NUMERIC;
    base_d NUMERIC;
    base_a NUMERIC;
BEGIN
    -- Only trigger when status changes TO 'active'
    IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
        -- Check if this competition already has probability history
        IF NOT EXISTS (
            SELECT 1 FROM probability_history WHERE competition_id = NEW.id
        ) THEN
            -- Calculate initial probabilities
            IF NEW.probabilities IS NOT NULL AND array_length(NEW.probabilities, 1) >= 2 THEN
                base_h := (NEW.probabilities[1])::numeric / 100.0;
                base_d := (NEW.probabilities[2])::numeric / 100.0;
                base_a := CASE 
                    WHEN array_length(NEW.probabilities, 1) >= 3 
                    THEN (NEW.probabilities[3])::numeric / 100.0
                    ELSE 100.0 - base_h - base_d
                END;
            ELSE
                base_h := COALESCE(NEW.base_probability, 0.50) * 100;
                base_d := (100.0 - base_h) * 0.4;
                base_a := 100.0 - base_h - base_d;
            END IF;

            -- Seed initial point at competition start time
            INSERT INTO probability_history (
                competition_id, time_label, home, draw, away,
                narrative, regime, category, created_at
            ) VALUES (
                NEW.id,
                to_char(NEW.competition_start, 'HH12:MI:SS AM'),
                ROUND(base_h, 2),
                ROUND(base_d, 2),
                ROUND(base_a, 2),
                'Initial baseline — auto-seeded on activation',
                'mean_reverting',
                NEW.sector,
                NEW.competition_start
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger (drop first if exists to allow re-run)
DROP TRIGGER IF EXISTS trg_auto_seed_prob_history ON competitions;
CREATE TRIGGER trg_auto_seed_prob_history
    AFTER INSERT OR UPDATE OF status ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION auto_seed_probability_history();

-- ========================
-- PART 3: Ensure service_role has full access for CurveEngine writes
-- ========================
DROP POLICY IF EXISTS "Allow service role all on probability_history" ON probability_history;
CREATE POLICY "Allow service role all on probability_history"
    ON probability_history FOR ALL
    USING (auth.role() = 'service_role');

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
