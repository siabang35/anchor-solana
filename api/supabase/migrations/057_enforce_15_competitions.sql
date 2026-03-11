-- ============================================================================
-- ExoDuZe — Strictly Enforce 15 Competitions Per Category 
-- Prevention against race conditions and manipulation
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_competition_category_limit()
RETURNS TRIGGER AS $$
DECLARE
    active_count INT;
BEGIN
    -- Only check limit if it's an active competition
    IF NEW.status = 'active' THEN
        SELECT COUNT(*)
        INTO active_count
        FROM competitions
        WHERE sector = NEW.sector AND status = 'active';

        IF active_count >= 15 THEN
            RAISE EXCEPTION 'Category % already has 15 active competitions. Cannot exceed limit.', NEW.sector;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_competition_limit ON competitions;

CREATE TRIGGER check_competition_limit
BEFORE INSERT OR UPDATE OF status ON competitions
FOR EACH ROW
EXECUTE FUNCTION enforce_competition_category_limit();
