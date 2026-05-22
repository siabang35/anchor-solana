-- ============================================================================
-- 090_auto_enroll_agents_on_replenish.sql
-- Fix "preds stack" — agents stop predicting when competitions settle
--
-- ROOT CAUSE:
--   When a competition settles (settleAndReplenish), new competitions are
--   created for the same sector/horizon. But active agents from the old
--   competition are NOT enrolled in the new one. Their entries get marked
--   "completed" and the agent runner auto-terminates them (or they sit idle).
--
-- FIX:
--   1. ONE-TIME: Re-enroll all active agents into current active competitions
--      for their sector, restoring predictions immediately
--   2. DB FUNCTION: auto_enroll_agents_into_competition(new_competition_id)
--      called by the seeder after creating a replacement competition
--   3. Prevent agent runner from auto-terminating agents that have
--      historically competed — instead, mark them for re-enrollment
-- ============================================================================

-- ========================
-- 1. ONE-TIME FIX: Re-enroll active agents into active competitions
--    This finds agents that are still 'active' in the agents table but have
--    NO active competition entries (all entries are 'completed'/'terminated')
-- ========================

DO $$
DECLARE
    v_enrolled INTEGER := 0;
    v_agent RECORD;
    v_comp RECORD;
BEGIN
    -- Find all agents that are 'active' but have NO active competition entries
    FOR v_agent IN
        SELECT a.id AS agent_id, a.user_id
        FROM agents a
        WHERE a.status = 'active'
        AND NOT EXISTS (
            SELECT 1 FROM agent_competition_entries ace
            WHERE ace.agent_id = a.id
            AND ace.status = 'active'
        )
    LOOP
        -- Find the sectors this agent previously competed in
        FOR v_comp IN
            SELECT DISTINCT c.id AS competition_id, c.sector
            FROM competitions c
            WHERE c.status IN ('active', 'live')
            AND c.competition_end > NOW()
            AND c.sector IN (
                -- Only enroll in sectors the agent has historical entries for
                SELECT DISTINCT comp.sector
                FROM agent_competition_entries old_ace
                JOIN competitions comp ON comp.id = old_ace.competition_id
                WHERE old_ace.agent_id = v_agent.agent_id
            )
            -- Pick ONE competition per sector (the most recent active one)
            ORDER BY c.competition_start DESC
            LIMIT 1
        LOOP
            -- Insert new entry (skip if somehow already exists)
            INSERT INTO agent_competition_entries (
                agent_id, competition_id, user_id, status,
                prediction_count, weighted_score, brier_score, rank_trend
            ) VALUES (
                v_agent.agent_id, v_comp.competition_id, v_agent.user_id, 'active',
                0, NULL, NULL, 0
            )
            ON CONFLICT DO NOTHING;

            v_enrolled := v_enrolled + 1;
            RAISE NOTICE '🔄 Re-enrolled agent % into competition % [%]',
                v_agent.agent_id, v_comp.competition_id, v_comp.sector;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ Auto-enrollment complete: % new entries created', v_enrolled;
END $$;

-- ========================
-- 2. Also un-terminate agents that were auto-killed by the agent runner
--    (they have terminated status but had active entries that just expired)
-- ========================

UPDATE agents
SET status = 'active'
WHERE status = 'terminated'
AND id IN (
    -- Agents that were auto-terminated (no manual termination log)
    SELECT a.id
    FROM agents a
    WHERE a.status = 'terminated'
    AND a.terminated_at IS NOT NULL
    AND a.terminated_at > NOW() - INTERVAL '24 hours'
    -- Only resurrect if they have historical competition entries
    AND EXISTS (
        SELECT 1 FROM agent_competition_entries ace
        WHERE ace.agent_id = a.id
    )
    -- Don't resurrect if user explicitly terminated
    AND NOT EXISTS (
        SELECT 1 FROM ai_agent_logs aal
        WHERE aal.agent_id = a.id
        AND aal.action = 'terminate'
        AND aal.message ILIKE '%by user%'
    )
);

-- Re-run enrollment for freshly resurrected agents
DO $$
DECLARE
    v_enrolled INTEGER := 0;
    v_agent RECORD;
    v_comp RECORD;
BEGIN
    FOR v_agent IN
        SELECT a.id AS agent_id, a.user_id
        FROM agents a
        WHERE a.status = 'active'
        AND NOT EXISTS (
            SELECT 1 FROM agent_competition_entries ace
            WHERE ace.agent_id = a.id
            AND ace.status = 'active'
        )
    LOOP
        FOR v_comp IN
            SELECT DISTINCT c.id AS competition_id, c.sector
            FROM competitions c
            WHERE c.status IN ('active', 'live')
            AND c.competition_end > NOW()
            AND c.sector IN (
                SELECT DISTINCT comp.sector
                FROM agent_competition_entries old_ace
                JOIN competitions comp ON comp.id = old_ace.competition_id
                WHERE old_ace.agent_id = v_agent.agent_id
            )
            ORDER BY c.competition_start DESC
            LIMIT 1
        LOOP
            INSERT INTO agent_competition_entries (
                agent_id, competition_id, user_id, status,
                prediction_count, weighted_score, brier_score, rank_trend
            ) VALUES (
                v_agent.agent_id, v_comp.competition_id, v_agent.user_id, 'active',
                0, NULL, NULL, 0
            )
            ON CONFLICT DO NOTHING;

            v_enrolled := v_enrolled + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ Post-resurrection enrollment: % entries created', v_enrolled;
END $$;

-- ========================
-- 3. DB FUNCTION: auto_enroll_agents_into_competition()
--    Called by the app layer after creating a replacement competition
--    Enrolls all active agents that competed in the same sector
-- ========================

CREATE OR REPLACE FUNCTION auto_enroll_agents_into_competition(
    p_new_competition_id UUID,
    p_sector TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_sector TEXT;
    v_enrolled INTEGER := 0;
    v_agent RECORD;
BEGIN
    -- Resolve sector from the competition if not provided
    IF p_sector IS NULL THEN
        SELECT sector INTO v_sector
        FROM competitions
        WHERE id = p_new_competition_id;
    ELSE
        v_sector := p_sector;
    END IF;

    IF v_sector IS NULL THEN
        RAISE NOTICE 'Cannot auto-enroll: competition % not found or no sector', p_new_competition_id;
        RETURN 0;
    END IF;

    -- Find active agents that have competed in this sector before
    FOR v_agent IN
        SELECT DISTINCT a.id AS agent_id, a.user_id
        FROM agents a
        JOIN agent_competition_entries ace ON ace.agent_id = a.id
        JOIN competitions c ON c.id = ace.competition_id
        WHERE a.status = 'active'
        AND c.sector = v_sector
        -- Don't enroll if they already have an entry in this competition
        AND NOT EXISTS (
            SELECT 1 FROM agent_competition_entries existing
            WHERE existing.agent_id = a.id
            AND existing.competition_id = p_new_competition_id
        )
    LOOP
        INSERT INTO agent_competition_entries (
            agent_id, competition_id, user_id, status,
            prediction_count, weighted_score, brier_score, rank_trend
        ) VALUES (
            v_agent.agent_id, p_new_competition_id, v_agent.user_id, 'active',
            0, NULL, NULL, 0
        )
        ON CONFLICT DO NOTHING;

        v_enrolled := v_enrolled + 1;
    END LOOP;

    RETURN v_enrolled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION auto_enroll_agents_into_competition(UUID, TEXT) IS
'Auto-enrolls active agents into a new competition for the same sector. Called after settleAndReplenish creates a replacement competition.';

-- ========================
-- 4. Permissions
-- ========================

GRANT EXECUTE ON FUNCTION auto_enroll_agents_into_competition(UUID, TEXT) TO service_role;

-- ========================
-- 5. Verification
-- ========================

DO $$
DECLARE
    v_active_agents INTEGER;
    v_active_entries INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_active_agents FROM agents WHERE status = 'active';
    SELECT COUNT(*) INTO v_active_entries
    FROM agent_competition_entries
    WHERE status = 'active'
    AND competition_id IN (
        SELECT id FROM competitions WHERE status IN ('active', 'live') AND competition_end > NOW()
    );

    RAISE NOTICE '✅ Post-fix: % active agents, % active competition entries', v_active_agents, v_active_entries;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
