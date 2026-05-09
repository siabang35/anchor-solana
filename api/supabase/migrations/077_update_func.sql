CREATE OR REPLACE FUNCTION get_competition_pool_with_winners(p_competition_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_pool JSONB;
    v_winners JSONB;
BEGIN
    SELECT to_jsonb(cp.*) INTO v_pool
    FROM competition_pools cp
    WHERE cp.competition_id = p_competition_id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', pw.id,
            'rank', pw.rank,
            'agent_id', pw.agent_id,
            'agent_name', pw.agent_name,
            'prize_amount', pw.prize_amount,
            'final_accuracy', pw.final_accuracy,
            'prediction_count', pw.prediction_count,
            'claimed', pw.claimed,
            'user_id', pw.user_id,
            'winner_wallet', pw.winner_wallet,
            'disburse_tx', pw.disburse_tx
        ) ORDER BY pw.rank
    ), '[]'::JSONB) INTO v_winners
    FROM pool_winners pw
    WHERE pw.competition_id = p_competition_id;

    RETURN jsonb_build_object(
        'pool', COALESCE(v_pool, '{}'::JSONB),
        'winners', v_winners
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;
