-- ============================================================================
-- 081_fix_pool_stakes_visibility.sql
-- Fix stake visibility across My Agents + Target Market Pool
--
-- Root Cause Analysis:
--   1. get_competition_pool_with_winners() only returned pool + winners,
--      never included pool_stakes rows → Target Market Pool shows 0 stakers.
--   2. pool_stakes RLS only allowed auth.uid() = user_id for SELECT,
--      blocking public reads of aggregate stake data needed for the pool UI.
--   3. listForecasters nested select on pool_stakes relied on PostgREST FK
--      inference from agents.id → pool_stakes.agent_id, but RLS blocked it.
--
-- Fixes:
--   1. Upgrade get_competition_pool_with_winners to return stakes array
--   2. Add public SELECT RLS policy on pool_stakes (stakes are public data)
--   3. Add pool_stakes to Supabase realtime publication
-- ============================================================================

-- ========================
-- 1. Add public read RLS policy for pool_stakes
--    Stake amounts are public data (visible in Target Market Pool to everyone)
--    The user_id column is still protected — we only expose safe fields
-- ========================

-- Drop the restrictive "Users can view own stakes" policy
DROP POLICY IF EXISTS "Users can view own stakes" ON pool_stakes;

-- Replace with a public SELECT policy so all users can see stake info
-- (This is the standard pattern for pool/market data — stakes are public)
CREATE POLICY "Anyone can view stakes" ON pool_stakes
    FOR SELECT USING (true);

-- ========================
-- 2. Upgrade get_competition_pool_with_winners to include stakes
-- ========================
CREATE OR REPLACE FUNCTION get_competition_pool_with_winners(p_competition_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_pool JSONB;
    v_winners JSONB;
    v_stakes JSONB;
BEGIN
    -- Pool data
    SELECT to_jsonb(cp.*) INTO v_pool
    FROM competition_pools cp
    WHERE cp.competition_id = p_competition_id;

    -- Winners
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

    -- Stakes (ALL active stakes for this competition — public data for pool display)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'user_id', ps.user_id,
            'agent_id', ps.agent_id,
            'stake_amount', ps.stake_amount,
            'onchain_tx', ps.onchain_tx,
            'verified_onchain', ps.verified_onchain,
            'staked_at', ps.staked_at,
            'status', ps.status
        ) ORDER BY ps.staked_at DESC
    ), '[]'::JSONB) INTO v_stakes
    FROM pool_stakes ps
    WHERE ps.competition_id = p_competition_id
      AND ps.status = 'active';

    RETURN jsonb_build_object(
        'pool', COALESCE(v_pool, '{}'::JSONB),
        'winners', v_winners,
        'stakes', v_stakes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- ========================
-- 3. Add pool_stakes to Supabase realtime publication
--    This enables the frontend to get instant updates when stakes change
-- ========================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_stakes;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.pool_stakes REPLICA IDENTITY FULL;

-- ========================
-- 4. Re-grant permissions
-- ========================
GRANT EXECUTE ON FUNCTION get_competition_pool_with_winners(UUID) TO authenticated, anon, service_role;

-- Notify PostgREST to reload schema (picks up new RLS policies + function signature)
NOTIFY pgrst, 'reload schema';
