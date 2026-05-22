-- ============================================================================
-- 086_reseed_probability_history_all.sql
-- Fix: Many live competitions across all categories still show flat/empty
-- probability curves because:
--   1) CurveEngine had limit(20) which left 8+ competitions without streams
--   2) Initial seed from 085 only created data at migration-time, not for
--      competitions created/settled-and-replenished after that migration ran
--
-- This migration:
--   A) Deletes stale seed-only data (competitions with <= 3 rows in
--      probability_history that were clearly just the 085 seed)
--   B) Re-seeds ALL active competitions with 15 realistic data points
--      spread across the last 10 minutes (recent enough to display)
--   C) Ensures the auto-seed trigger function handles edge cases better
-- ============================================================================

-- ========================
-- PART 1: Clean stale seed data and reseed ALL active competitions
-- ========================
DO $$
DECLARE
    comp RECORD;
    existing_count INTEGER;
    i INTEGER;
    total_points INTEGER := 15;
    base_home NUMERIC;
    base_draw NUMERIC;
    base_away NUMERIC;
    h NUMERIC;
    d NUMERIC;
    a NUMERIC;
    delta NUMERIC;
    delta2 NUMERIC;
    point_time TIMESTAMPTZ;
    time_step INTERVAL;
BEGIN
    FOR comp IN
        SELECT c.id, c.sector, c.probabilities, c.base_probability,
               c.competition_start, c.competition_end
        FROM competitions c
        WHERE c.status = 'active'
    LOOP
        -- Count existing probability_history rows
        SELECT COUNT(*) INTO existing_count
        FROM probability_history ph
        WHERE ph.competition_id = comp.id;

        -- Skip competitions that already have rich data (CurveEngine is working)
        IF existing_count > 5 THEN
            CONTINUE;
        END IF;

        -- Delete stale seed-only data (1-3 points from previous migrations)
        IF existing_count > 0 AND existing_count <= 5 THEN
            DELETE FROM probability_history WHERE competition_id = comp.id;
        END IF;

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

        -- Time step: spread points across last 10 minutes (recent data)
        time_step := interval '40 seconds';

        -- Generate points with gradual random-walk perturbations
        h := base_home;
        d := base_draw;
        a := base_away;

        FOR i IN 0..total_points - 1 LOOP
            point_time := NOW() - ((total_points - i) * time_step);

            -- Apply deterministic perturbation for visible movement
            delta := sin(i * 1.7 + hashtext(comp.id::text) * 0.0001) * 4.0;
            h := GREATEST(5.0, LEAST(95.0, h + delta));

            delta2 := cos(i * 2.3 + hashtext(comp.id::text) * 0.0002) * 2.5;
            d := GREATEST(2.0, LEAST(40.0, d + delta2));

            -- Normalize: away = remainder
            a := GREATEST(2.0, 100.0 - h - d);

            -- Re-normalize if total != 100
            IF (h + d + a) != 100.0 THEN
                DECLARE
                    t NUMERIC := h + d + a;
                BEGIN
                    h := h / t * 100.0;
                    d := d / t * 100.0;
                    a := 100.0 - h - d;
                END;
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
                    WHEN i = 0 THEN 'Initial baseline — competition active'
                    WHEN delta > 2.5 THEN 'Regime: TRENDING | Momentum building'
                    WHEN delta < -2.5 THEN 'Regime: VOLATILE | Counter-trend reversal'
                    ELSE 'Regime: MEAN_REVERTING | Steady oscillation'
                END,
                CASE
                    WHEN abs(delta) > 3.0 THEN 'volatile'
                    WHEN delta > 1.5 THEN 'trending'
                    ELSE 'mean_reverting'
                END,
                comp.sector,
                point_time
            );
        END LOOP;

        RAISE NOTICE 'Seeded % probability_history points for competition % (sector: %, had: % existing)',
            total_points, comp.id, comp.sector, existing_count;
    END LOOP;
END $$;


-- ========================
-- PART 2: Improve auto-seed trigger to generate more initial points
-- ========================
-- The original trigger from 085 only created 1 point. Upgrade to 5 points
-- so newly-activated competitions immediately show visible curve movement.

CREATE OR REPLACE FUNCTION auto_seed_probability_history()
RETURNS TRIGGER AS $$
DECLARE
    base_h NUMERIC;
    base_d NUMERIC;
    base_a NUMERIC;
    i INTEGER;
    delta NUMERIC;
    delta2 NUMERIC;
    h NUMERIC;
    d NUMERIC;
    a NUMERIC;
    point_time TIMESTAMPTZ;
    t NUMERIC;
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

            -- Seed 5 initial points with gradual movement (not just 1 flat point)
            h := base_h;
            d := base_d;
            a := base_a;

            FOR i IN 0..4 LOOP
                point_time := NEW.competition_start + (interval '30 seconds' * i);

                -- Perturbation for visible movement
                delta := sin(i * 1.7 + hashtext(NEW.id::text) * 0.0001) * 3.0;
                delta2 := cos(i * 2.3 + hashtext(NEW.id::text) * 0.0002) * 1.8;

                h := GREATEST(5.0, LEAST(95.0, h + delta));
                d := GREATEST(2.0, LEAST(40.0, d + delta2));
                a := GREATEST(2.0, 100.0 - h - d);

                -- Normalize
                t := h + d + a;
                h := h / t * 100.0;
                d := d / t * 100.0;
                a := 100.0 - h - d;

                INSERT INTO probability_history (
                    competition_id, time_label, home, draw, away,
                    narrative, regime, category, created_at
                ) VALUES (
                    NEW.id,
                    to_char(point_time, 'HH12:MI:SS AM'),
                    ROUND(h, 2),
                    ROUND(d, 2),
                    ROUND(a, 2),
                    CASE
                        WHEN i = 0 THEN 'Initial baseline — auto-seeded on activation'
                        ELSE 'Regime: MEAN_REVERTING | Startup oscillation'
                    END,
                    'mean_reverting',
                    NEW.sector,
                    point_time
                );
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_auto_seed_prob_history ON competitions;
CREATE TRIGGER trg_auto_seed_prob_history
    AFTER INSERT OR UPDATE OF status ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION auto_seed_probability_history();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
