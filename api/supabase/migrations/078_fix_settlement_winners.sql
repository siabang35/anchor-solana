-- ============================================================================
-- 078_fix_settlement_winners.sql
-- Fix: Settlement must always create 3 winners (if 3+ participants exist)
--
-- Problems fixed:
-- 1. has_min_predictions filter excluded agents with < 3 predictions from prizes
-- 2. get_weighted_leaderboard filtered by status IN ('active','paused'),
--    excluding stopped/terminated agents who still staked and deserve prizes
-- 3. Settlement now uses a direct query that includes ALL participating agents
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_competition_pool(
    p_competition_id UUID,
    p_settled_by TEXT DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
    v_pool competition_pools%ROWTYPE;
    v_winners RECORD;
    v_rank INTEGER := 0;
    v_prize DECIMAL;
    v_share INTEGER;
    v_result JSONB := '[]'::JSONB;
    v_snapshot JSONB;
BEGIN
    -- Lock the pool row for settlement
    SELECT * INTO v_pool
    FROM competition_pools
    WHERE competition_id = p_competition_id
    FOR UPDATE;

    IF v_pool IS NULL THEN
        RAISE EXCEPTION 'No pool found for competition %', p_competition_id;
    END IF;

    IF v_pool.settlement_status != 'pending' THEN
        RAISE EXCEPTION 'Pool already in status: %', v_pool.settlement_status;
    END IF;

    -- Mark as settling (lock)
    UPDATE competition_pools
    SET settlement_status = 'settling', updated_at = NOW()
    WHERE id = v_pool.id;

    -- Get full leaderboard snapshot for audit (use relaxed query)
    SELECT jsonb_agg(row_to_json(lb.*)) INTO v_snapshot
    FROM get_weighted_leaderboard(p_competition_id, 100) lb;

    -- ═══════════════════════════════════════════════════════════════
    -- DETERMINE TOP 3 WINNERS
    -- Key fix: Include ALL agents who participated, regardless of:
    --   - prediction count (has_min_predictions)
    --   - agent status (active/paused/stopped/terminated)
    -- Ranking: agents with min_predictions first, then by weighted_score ASC
    -- ═══════════════════════════════════════════════════════════════
    FOR v_winners IN
        SELECT
            ace.agent_id,
            a.name AS agent_name,
            ace.weighted_score,
            ace.brier_score AS raw_brier_avg,
            ace.prediction_count
        FROM agent_competition_entries ace
        JOIN agents a ON a.id = ace.agent_id
        WHERE ace.competition_id = p_competition_id
          AND ace.prediction_count > 0  -- Must have at least 1 prediction
        ORDER BY
            -- Agents with >= min predictions ranked first
            (ace.prediction_count >= COALESCE(
                (SELECT min_predictions FROM leaderboard_score_config WHERE competition_id = p_competition_id),
                3
            )) DESC,
            -- Then by weighted score (lower = better)
            COALESCE(ace.weighted_score, 99.9999) ASC,
            -- Tiebreaker: more predictions = better
            ace.prediction_count DESC,
            -- Final tiebreaker: earlier deployment
            a.created_at ASC
        LIMIT 3
    LOOP
        v_rank := v_rank + 1;

        -- Calculate prize based on rank
        CASE v_rank
            WHEN 1 THEN v_share := v_pool.winner_1_share;
            WHEN 2 THEN v_share := v_pool.winner_2_share;
            WHEN 3 THEN v_share := v_pool.winner_3_share;
            ELSE CONTINUE;
        END CASE;

        v_prize := v_pool.distributable_pool * v_share / 10000;

        -- Insert winner record
        INSERT INTO pool_winners (
            pool_id, competition_id, rank,
            agent_id, user_id, agent_name,
            final_weighted_score, final_accuracy, prediction_count,
            prize_amount, prize_share_bps, settlement_snapshot
        )
        SELECT
            v_pool.id, p_competition_id, v_rank,
            v_winners.agent_id, a.user_id, v_winners.agent_name,
            v_winners.weighted_score,
            GREATEST(0, LEAST(99.9, 98.0 * EXP(-COALESCE(v_winners.weighted_score, 0) * 6))),
            v_winners.prediction_count,
            v_prize, v_share, v_snapshot
        FROM agents a WHERE a.id = v_winners.agent_id;

        -- Update agent_competition_entries with final rank
        UPDATE agent_competition_entries
        SET final_rank = v_rank
        WHERE agent_id = v_winners.agent_id AND competition_id = p_competition_id;

        v_result := v_result || jsonb_build_object(
            'rank', v_rank,
            'agent_id', v_winners.agent_id,
            'agent_name', v_winners.agent_name,
            'prize', v_prize
        );
    END LOOP;

    -- Finalize settlement
    UPDATE competition_pools
    SET 
        settlement_status = 'settled',
        settled_at = NOW(),
        settled_by = p_settled_by,
        settlement_hash = encode(sha256(convert_to(v_result::TEXT || NOW()::TEXT, 'UTF8')), 'hex'),
        updated_at = NOW()
    WHERE id = v_pool.id;

    -- Update competition status
    UPDATE competitions
    SET status = 'settled', updated_at = NOW()
    WHERE id = p_competition_id;

    -- Audit log
    INSERT INTO pool_settlement_audit (
        pool_id, competition_id, event_type, details, event_hash, previous_hash
    )
    VALUES (
        v_pool.id, p_competition_id, 'settlement_completed',
        jsonb_build_object(
            'winners', v_result,
            'total_pool', v_pool.distributable_pool,
            'winner_count', v_rank,
            'settled_by', p_settled_by
        ),
        encode(sha256(convert_to(v_result::TEXT, 'UTF8')), 'hex'),
        NULL
    );

    RETURN jsonb_build_object(
        'status', 'settled',
        'pool_total', v_pool.total_staked,
        'distributable', v_pool.distributable_pool,
        'platform_fee', v_pool.platform_fee,
        'winner_count', v_rank,
        'winners', v_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION settle_competition_pool(UUID, TEXT) TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
