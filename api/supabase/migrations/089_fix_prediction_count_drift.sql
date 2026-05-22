-- ============================================================================
-- 089_fix_prediction_count_drift.sql
-- Fix Production "Preds Stack" — prediction_count drift in agent_competition_entries
--
-- ROOT CAUSE:
--   The scoring pipeline in LeaderboardScoringService.scorePrediction() follows:
--     1. agent_predictions INSERT (always succeeds)
--     2. leaderboard_snapshots INSERT (can fail: constraint, RLS, timeout)
--     3. agent_competition_entries UPDATE (prediction_count++) — ONLY runs if step 2 succeeds
--
--   If step 2 fails, the prediction exists in agent_predictions but
--   prediction_count in agent_competition_entries is NEVER incremented.
--   Over time, actual predictions diverge from the counter → "preds stack" (stuck count).
--
--   Production evidence: Both "danz" and "meong" stuck at 22 predictions
--   while agent_predictions table has MORE rows.
--
-- FIX:
--   1. Recalculate prediction_count from actual agent_predictions rows (source of truth)
--   2. Recalculate weighted_score and brier_score from leaderboard_snapshots
--   3. Create a reusable sync function for manual/cron recovery
--   4. Create a Postgres trigger on agent_predictions INSERT to always
--      increment prediction_count (defense-in-depth, independent of app layer)
-- ============================================================================

-- ========================
-- 1. ONE-TIME FIX: Resync prediction_count from actual agent_predictions
--    This is the source of truth — the actual number of prediction rows
-- ========================

-- Phase 1A: Fix prediction_count for ALL active entries
UPDATE agent_competition_entries ace
SET prediction_count = actual.cnt
FROM (
    SELECT agent_id, competition_id, COUNT(*) AS cnt
    FROM agent_predictions
    GROUP BY agent_id, competition_id
) actual
WHERE ace.agent_id = actual.agent_id
  AND ace.competition_id = actual.competition_id
  AND ace.prediction_count != actual.cnt;

-- Phase 1B: Fix entries that have ZERO predictions in agent_predictions
-- but somehow show a non-zero prediction_count (shouldn't happen, safety net)
UPDATE agent_competition_entries ace
SET prediction_count = 0
WHERE NOT EXISTS (
    SELECT 1 FROM agent_predictions ap
    WHERE ap.agent_id = ace.agent_id
      AND ap.competition_id = ace.competition_id
)
AND ace.prediction_count != 0;

-- ========================
-- 2. Resync weighted_score and brier_score from leaderboard_snapshots
--    Use the LATEST snapshot for each agent-competition pair as the
--    authoritative cumulative score (since each snapshot carries the
--    running cumulative at that point in time)
-- ========================

UPDATE agent_competition_entries ace
SET
    weighted_score = snap.cumulative_weighted_score,
    brier_score = snap.raw_brier,
    score_hash = snap.snapshot_hash,
    last_scored_at = snap.created_at
FROM (
    SELECT DISTINCT ON (agent_id, competition_id)
        agent_id,
        competition_id,
        cumulative_weighted_score,
        raw_brier,
        snapshot_hash,
        prediction_count AS snap_pred_count,
        created_at
    FROM leaderboard_snapshots
    ORDER BY agent_id, competition_id, id DESC
) snap
WHERE ace.agent_id = snap.agent_id
  AND ace.competition_id = snap.competition_id;

-- ========================
-- 3. Reusable sync function: resync_prediction_counts()
--    Can be called manually or via cron to fix any future drift
-- ========================

CREATE OR REPLACE FUNCTION resync_prediction_counts(
    p_competition_id UUID DEFAULT NULL
)
RETURNS TABLE (
    agent_id UUID,
    competition_id UUID,
    old_count INTEGER,
    new_count BIGINT,
    delta BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH actual_counts AS (
        SELECT 
            ap.agent_id,
            ap.competition_id,
            COUNT(*)::BIGINT AS actual_count
        FROM agent_predictions ap
        WHERE (p_competition_id IS NULL OR ap.competition_id = p_competition_id)
        GROUP BY ap.agent_id, ap.competition_id
    ),
    drifted AS (
        SELECT
            ace.agent_id,
            ace.competition_id,
            ace.prediction_count AS old_count,
            COALESCE(ac.actual_count, 0) AS new_count,
            COALESCE(ac.actual_count, 0) - ace.prediction_count::BIGINT AS delta
        FROM agent_competition_entries ace
        LEFT JOIN actual_counts ac 
            ON ac.agent_id = ace.agent_id 
            AND ac.competition_id = ace.competition_id
        WHERE (p_competition_id IS NULL OR ace.competition_id = p_competition_id)
          AND ace.prediction_count != COALESCE(ac.actual_count, 0)
    )
    -- Apply the fix and return what changed
    UPDATE agent_competition_entries upd
    SET prediction_count = d.new_count::INTEGER
    FROM drifted d
    WHERE upd.agent_id = d.agent_id
      AND upd.competition_id = d.competition_id
    RETURNING upd.agent_id, upd.competition_id, d.old_count, d.new_count, d.delta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION resync_prediction_counts(UUID) IS 
'Resyncs prediction_count in agent_competition_entries from actual agent_predictions rows. Call with NULL to fix all, or pass a specific competition_id. Returns list of corrections made.';

-- ========================
-- 4. Defense-in-depth trigger: auto-increment prediction_count
--    on agent_predictions INSERT, independent of the app-layer scoring pipeline.
--    This ensures prediction_count ALWAYS stays in sync even if 
--    leaderboard_snapshots insert fails downstream.
-- ========================

CREATE OR REPLACE FUNCTION sync_prediction_count_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Atomically increment prediction_count in agent_competition_entries
    -- when a new prediction is inserted, regardless of scoring pipeline success
    UPDATE agent_competition_entries
    SET prediction_count = prediction_count + 1,
        last_scored_at = COALESCE(last_scored_at, NOW())
    WHERE agent_id = NEW.agent_id
      AND competition_id = NEW.competition_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Apply AFTER INSERT so it doesn't interfere with anti_chunk_guard (BEFORE INSERT)
DROP TRIGGER IF EXISTS sync_pred_count_on_insert ON agent_predictions;
CREATE TRIGGER sync_pred_count_on_insert
    AFTER INSERT ON agent_predictions
    FOR EACH ROW
    EXECUTE FUNCTION sync_prediction_count_on_insert();

COMMENT ON FUNCTION sync_prediction_count_on_insert() IS 
'Defense-in-depth trigger: atomically increments prediction_count in agent_competition_entries when a new prediction row is inserted, preventing count drift if the app-layer scoring pipeline fails downstream.';

-- ========================
-- 5. Fix the scoring service double-increment issue
--    Since the trigger now handles prediction_count increment,
--    the app-layer scorePrediction() will also increment it.
--    To prevent double-counting, the trigger should only fire
--    when the entry's prediction_count is BEHIND the actual count.
-- ========================

-- Replace the trigger function with a smart version that checks for drift
CREATE OR REPLACE FUNCTION sync_prediction_count_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_actual_count BIGINT;
    v_current_count INTEGER;
BEGIN
    -- Get the current prediction_count in the entry
    SELECT prediction_count INTO v_current_count
    FROM agent_competition_entries
    WHERE agent_id = NEW.agent_id
      AND competition_id = NEW.competition_id;

    -- If no entry exists, skip (agent hasn't joined this competition)
    IF v_current_count IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count actual predictions including this new one
    SELECT COUNT(*) INTO v_actual_count
    FROM agent_predictions
    WHERE agent_id = NEW.agent_id
      AND competition_id = NEW.competition_id;

    -- Only update if there's drift (entry count is behind actual count)
    -- This prevents double-counting when the app-layer also increments
    IF v_current_count < v_actual_count THEN
        UPDATE agent_competition_entries
        SET prediction_count = v_actual_count::INTEGER
        WHERE agent_id = NEW.agent_id
          AND competition_id = NEW.competition_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ========================
-- 6. Grant permissions
-- ========================

GRANT EXECUTE ON FUNCTION resync_prediction_counts(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION resync_prediction_counts(UUID) TO authenticated;

-- ========================
-- 7. Verification query (informational — logs the fix results)
-- ========================

DO $$
DECLARE
    v_fixed_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_fixed_count
    FROM agent_competition_entries ace
    JOIN (
        SELECT agent_id, competition_id, COUNT(*) AS cnt
        FROM agent_predictions
        GROUP BY agent_id, competition_id
    ) ap ON ap.agent_id = ace.agent_id AND ap.competition_id = ace.competition_id
    WHERE ace.prediction_count = ap.cnt;

    RAISE NOTICE '✅ Prediction count sync complete. % entries are now in sync.', v_fixed_count;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
