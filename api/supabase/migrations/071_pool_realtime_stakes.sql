-- ============================================================================
-- ExoDuZe — Pool Realtime Stakes & On-chain Settlement (071)
--
-- Adds:
--   • pool_stakes to Supabase Realtime publication  
--   • Public read RLS for pool_stakes (needed for realtime subscriptions)
--   • On-chain settlement TX tracking columns on pool_winners
-- ============================================================================

-- ========================
-- 1. Add pool_stakes to Realtime
-- ========================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_stakes;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.pool_stakes REPLICA IDENTITY FULL;

-- ========================
-- 2. Public read on pool_stakes (needed for realtime to work with anon key)
-- ========================
DO $$
BEGIN
    CREATE POLICY "Public can view all stakes" ON pool_stakes
        FOR SELECT USING (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- 3. Add on-chain settlement columns to pool_winners
-- ========================
DO $$
BEGIN
    ALTER TABLE pool_winners ADD COLUMN IF NOT EXISTS disburse_tx VARCHAR(128);
    ALTER TABLE pool_winners ADD COLUMN IF NOT EXISTS winner_wallet VARCHAR(64);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- 4. Add on-chain settlement TX to competition_pools
-- ========================
DO $$
BEGIN
    ALTER TABLE competition_pools ADD COLUMN IF NOT EXISTS onchain_disburse_txs JSONB DEFAULT '[]'::JSONB;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- 5. Update get_competition_pool_with_winners to include new columns
-- ========================
CREATE OR REPLACE FUNCTION get_competition_pool_with_winners(p_competition_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_pool JSONB;
    v_winners JSONB;
    v_stakes JSONB;
BEGIN
    SELECT to_jsonb(cp.*) INTO v_pool
    FROM competition_pools cp
    WHERE cp.competition_id = p_competition_id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'rank', pw.rank,
            'agent_id', pw.agent_id,
            'agent_name', pw.agent_name,
            'prize_amount', pw.prize_amount,
            'final_accuracy', pw.final_accuracy,
            'prediction_count', pw.prediction_count,
            'claimed', pw.claimed,
            'claim_tx', pw.claim_tx,
            'disburse_tx', pw.disburse_tx,
            'winner_wallet', pw.winner_wallet,
            'user_id', pw.user_id
        ) ORDER BY pw.rank
    ), '[]'::JSONB) INTO v_winners
    FROM pool_winners pw
    WHERE pw.competition_id = p_competition_id;

    -- Include recent stakes with on-chain tx
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'user_id', ps.user_id,
            'agent_id', ps.agent_id,
            'stake_amount', ps.stake_amount,
            'onchain_tx', ps.onchain_tx,
            'staked_at', ps.staked_at,
            'status', ps.status
        ) ORDER BY ps.staked_at DESC
    ), '[]'::JSONB) INTO v_stakes
    FROM pool_stakes ps
    WHERE ps.competition_id = p_competition_id;

    RETURN jsonb_build_object(
        'pool', COALESCE(v_pool, '{}'::JSONB),
        'winners', v_winners,
        'stakes', v_stakes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
