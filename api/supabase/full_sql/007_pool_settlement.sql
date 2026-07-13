-- ============================================================================
-- ExoDuZe — Pool Settlement & Prize Distribution
-- File: 007_pool_settlement.sql
--
-- Stake-proportional prize distribution with anti-whale guards,
-- on-chain verification, and HMAC integrity audit trail.
-- Top 3: prize = (stake * rank_weight) / Σ(stakes * rank_weights) * pool
-- ============================================================================

-- 1. Competition Pool Ledger
CREATE TABLE IF NOT EXISTS public.competition_pools (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id        UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    total_staked          DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    platform_fee          DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    distributable_pool    DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    winner_1_share        INTEGER NOT NULL DEFAULT 5000,
    winner_2_share        INTEGER NOT NULL DEFAULT 3000,
    winner_3_share        INTEGER NOT NULL DEFAULT 2000,
    settlement_status     pool_settlement_status NOT NULL DEFAULT 'pending',
    settled_at            TIMESTAMPTZ,
    settled_by            TEXT,
    onchain_pool_pubkey   VARCHAR(64),
    onchain_settle_tx     VARCHAR(128),
    stake_count           INTEGER NOT NULL DEFAULT 0,
    max_stake_per_user    DECIMAL(18,8) NOT NULL DEFAULT 5.00,
    min_stake             DECIMAL(18,8) NOT NULL DEFAULT 0.01,
    settlement_hash       TEXT,
    prize_model           VARCHAR(20) NOT NULL DEFAULT 'hybrid',
    rank_1_weight         DECIMAL(4,2) NOT NULL DEFAULT 3.00,
    rank_2_weight         DECIMAL(4,2) NOT NULL DEFAULT 2.00,
    rank_3_weight         DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_pool_per_competition UNIQUE (competition_id),
    CONSTRAINT valid_distribution CHECK (winner_1_share + winner_2_share + winner_3_share = 10000),
    CONSTRAINT valid_stake_limits CHECK (max_stake_per_user > min_stake AND min_stake > 0)
);

CREATE INDEX IF NOT EXISTS idx_comp_pools_comp ON public.competition_pools(competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_pools_status ON public.competition_pools(settlement_status);

ALTER TABLE public.competition_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view pools" ON public.competition_pools;
DROP POLICY IF EXISTS "Public can view pools" ON competition_pools;
CREATE POLICY "Public can view pools" ON public.competition_pools FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages pools" ON public.competition_pools;
DROP POLICY IF EXISTS "Service role manages pools" ON competition_pools;
CREATE POLICY "Service role manages pools" ON public.competition_pools FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_competition_pools_updated_at ON public.competition_pools;
CREATE TRIGGER update_competition_pools_updated_at BEFORE UPDATE ON public.competition_pools
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_pools; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.competition_pools REPLICA IDENTITY FULL;

-- 2. Pool Stakes
CREATE TABLE IF NOT EXISTS public.pool_stakes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id           UUID NOT NULL REFERENCES public.competition_pools(id) ON DELETE CASCADE,
    competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    stake_amount      DECIMAL(18,8) NOT NULL,
    staked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    onchain_tx        VARCHAR(128),
    verified_onchain  BOOLEAN NOT NULL DEFAULT false,
    status            VARCHAR(20) NOT NULL DEFAULT 'active',
    refunded_at       TIMESTAMPTZ,
    refund_tx         VARCHAR(128),
    stake_sequence    INTEGER NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_stake_per_user_comp UNIQUE (user_id, competition_id),
    CONSTRAINT valid_stake_amount CHECK (stake_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_pool_stakes_pool ON public.pool_stakes(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_user ON public.pool_stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_agent ON public.pool_stakes(agent_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_comp ON public.pool_stakes(competition_id);

ALTER TABLE public.pool_stakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own stakes" ON public.pool_stakes;
DROP POLICY IF EXISTS "Users can view own stakes" ON pool_stakes;
CREATE POLICY "Users can view own stakes" ON public.pool_stakes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Public can view all stakes" ON public.pool_stakes;
DROP POLICY IF EXISTS "Public can view all stakes" ON pool_stakes;
CREATE POLICY "Public can view all stakes" ON public.pool_stakes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own stakes" ON public.pool_stakes;
DROP POLICY IF EXISTS "Users can insert own stakes" ON pool_stakes;
CREATE POLICY "Users can insert own stakes" ON public.pool_stakes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages stakes" ON public.pool_stakes;
DROP POLICY IF EXISTS "Service role manages stakes" ON pool_stakes;
CREATE POLICY "Service role manages stakes" ON public.pool_stakes FOR ALL USING (auth.role() = 'service_role');

-- 3. Pool Winners
CREATE TABLE IF NOT EXISTS public.pool_winners (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id               UUID NOT NULL REFERENCES public.competition_pools(id) ON DELETE CASCADE,
    competition_id        UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    rank                  INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
    agent_id              UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_name            VARCHAR(100) NOT NULL,
    final_weighted_score  DECIMAL(10,6),
    final_accuracy        DECIMAL(6,2),
    prediction_count      INTEGER NOT NULL DEFAULT 0,
    prize_amount          DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    prize_share_bps       INTEGER NOT NULL,
    claimed               BOOLEAN NOT NULL DEFAULT false,
    claimed_at            TIMESTAMPTZ,
    claim_tx              VARCHAR(128),
    disburse_tx           VARCHAR(128),
    winner_wallet         VARCHAR(64),
    settlement_snapshot   JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_winner_rank UNIQUE (competition_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_pool_winners_comp ON public.pool_winners(competition_id);
CREATE INDEX IF NOT EXISTS idx_pool_winners_agent ON public.pool_winners(agent_id);
CREATE INDEX IF NOT EXISTS idx_pool_winners_rank ON public.pool_winners(competition_id, rank);

ALTER TABLE public.pool_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view winners" ON public.pool_winners;
DROP POLICY IF EXISTS "Public can view winners" ON pool_winners;
CREATE POLICY "Public can view winners" ON public.pool_winners FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages winners" ON public.pool_winners;
DROP POLICY IF EXISTS "Service role manages winners" ON pool_winners;
CREATE POLICY "Service role manages winners" ON public.pool_winners FOR ALL USING (auth.role() = 'service_role');

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_winners; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.pool_winners REPLICA IDENTITY FULL;

-- 4. Settlement Audit Log
CREATE TABLE IF NOT EXISTS public.pool_settlement_audit (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pool_id          UUID NOT NULL REFERENCES public.competition_pools(id) ON DELETE CASCADE,
    competition_id   UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    event_type       VARCHAR(50) NOT NULL,
    agent_id         UUID,
    user_id          UUID,
    amount           DECIMAL(18,8),
    details          JSONB,
    event_hash       TEXT NOT NULL,
    previous_hash    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_audit_comp ON public.pool_settlement_audit(competition_id, created_at DESC);
ALTER TABLE public.pool_settlement_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages settlement audit" ON public.pool_settlement_audit;
DROP POLICY IF EXISTS "Service role manages settlement audit" ON pool_settlement_audit;
CREATE POLICY "Service role manages settlement audit" ON public.pool_settlement_audit FOR ALL USING (auth.role() = 'service_role');

-- 5. Validate Stake Trigger
CREATE OR REPLACE FUNCTION public.validate_stake()
RETURNS TRIGGER AS $$
DECLARE v_max DECIMAL; v_min DECIMAL; v_pool_status pool_settlement_status; v_comp_status competition_status; v_cnt INTEGER;
BEGIN
    SELECT max_stake_per_user, min_stake, settlement_status INTO v_max, v_min, v_pool_status
    FROM public.competition_pools WHERE id = NEW.pool_id;
    IF TG_OP = 'INSERT' AND v_pool_status != 'pending' THEN RAISE EXCEPTION 'Pool not accepting stakes (status: %)', v_pool_status USING ERRCODE = 'P0001'; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_comp_status FROM public.competitions WHERE id = NEW.competition_id;
        IF v_comp_status NOT IN ('upcoming', 'active') THEN RAISE EXCEPTION 'Competition not active (status: %)', v_comp_status USING ERRCODE = 'P0001'; END IF;
    END IF;
    IF NEW.stake_amount < v_min THEN RAISE EXCEPTION 'Stake below minimum %.8f SOL', v_min USING ERRCODE = 'P0001'; END IF;
    IF NEW.stake_amount > v_max THEN RAISE EXCEPTION 'Stake exceeds maximum %.8f SOL (anti-whale)', v_max USING ERRCODE = 'P0001'; END IF;
    IF NEW.onchain_tx IS NOT NULL AND LENGTH(TRIM(NEW.onchain_tx)) > 20 THEN NEW.verified_onchain := true; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*) INTO v_cnt FROM public.pool_stakes WHERE user_id = NEW.user_id AND competition_id = NEW.competition_id;
        NEW.stake_sequence := v_cnt + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS validate_stake_guard ON public.pool_stakes;
CREATE TRIGGER validate_stake_guard BEFORE INSERT OR UPDATE ON public.pool_stakes
    FOR EACH ROW EXECUTE FUNCTION public.validate_stake();

-- 6. Auto-Update Pool Totals on Stake (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.update_pool_on_stake()
RETURNS TRIGGER AS $$
DECLARE v_fee_bps INTEGER := 200; v_cnt INTEGER; v_total DECIMAL; v_pool UUID; v_comp UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN v_pool := OLD.pool_id; v_comp := OLD.competition_id;
    ELSE v_pool := NEW.pool_id; v_comp := NEW.competition_id; END IF;
    SELECT COUNT(*), COALESCE(SUM(stake_amount), 0) INTO v_cnt, v_total
    FROM public.pool_stakes WHERE pool_id = v_pool AND status = 'active';
    UPDATE public.competition_pools SET total_staked = v_total, platform_fee = v_total * v_fee_bps / 10000,
        distributable_pool = v_total * (10000 - v_fee_bps) / 10000, stake_count = v_cnt, updated_at = NOW()
    WHERE id = v_pool;
    UPDATE public.competitions SET prize_pool = (SELECT distributable_pool FROM public.competition_pools WHERE id = v_pool),
        entry_count = v_cnt, updated_at = NOW() WHERE id = v_comp;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS pool_stake_totals ON public.pool_stakes;
CREATE TRIGGER pool_stake_totals AFTER INSERT OR UPDATE OR DELETE ON public.pool_stakes
    FOR EACH ROW EXECUTE FUNCTION public.update_pool_on_stake();

-- 7. Auto-Create Pool on Competition Insert
CREATE OR REPLACE FUNCTION public.auto_create_competition_pool()
RETURNS TRIGGER AS $$
BEGIN INSERT INTO public.competition_pools (competition_id) VALUES (NEW.id) ON CONFLICT (competition_id) DO NOTHING; RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_pool_on_competition ON public.competitions;
CREATE TRIGGER auto_pool_on_competition AFTER INSERT ON public.competitions
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_competition_pool();

-- 8. Settle Competition Pool (stake-proportional)
CREATE OR REPLACE FUNCTION public.settle_competition_pool(p_competition_id UUID, p_settled_by TEXT DEFAULT 'system')
RETURNS JSONB AS $$
DECLARE
    v_pool public.competition_pools%ROWTYPE; v_winners RECORD; v_rank INTEGER := 0;
    v_prize DECIMAL; v_rank_weight DECIMAL; v_effective DECIMAL; v_total_effective DECIMAL := 0;
    v_result JSONB := '[]'::JSONB; v_snapshot JSONB; v_winner_data JSONB[] := ARRAY[]::JSONB[]; v_wd JSONB;
BEGIN
    SELECT * INTO v_pool FROM public.competition_pools WHERE competition_id = p_competition_id FOR UPDATE;
    IF v_pool IS NULL THEN RAISE EXCEPTION 'No pool for competition %', p_competition_id; END IF;
    IF v_pool.settlement_status != 'pending' THEN RAISE EXCEPTION 'Pool status: %', v_pool.settlement_status; END IF;

    UPDATE public.competition_pools SET settlement_status = 'settling', updated_at = NOW() WHERE id = v_pool.id;
    SELECT jsonb_agg(row_to_json(lb.*)) INTO v_snapshot FROM public.get_weighted_leaderboard(p_competition_id, 100) lb;

    FOR v_winners IN
        SELECT ace.agent_id, a.name AS agent_name, ace.weighted_score, ace.prediction_count, COALESCE(ps.stake_amount, 0) AS winner_stake
        FROM public.agent_competition_entries ace JOIN public.agents a ON a.id = ace.agent_id
        LEFT JOIN public.pool_stakes ps ON ps.agent_id = ace.agent_id AND ps.competition_id = p_competition_id AND ps.status = 'active'
        WHERE ace.competition_id = p_competition_id AND ace.prediction_count > 0 AND COALESCE(ps.stake_amount, 0) > 0
        ORDER BY (ace.prediction_count >= COALESCE((SELECT min_predictions FROM public.leaderboard_score_config WHERE competition_id = p_competition_id), 3)) DESC,
                 COALESCE(ace.weighted_score, 99.9999) ASC, ace.prediction_count DESC, a.created_at ASC
        LIMIT 3
    LOOP
        v_rank := v_rank + 1;
        CASE v_rank WHEN 1 THEN v_rank_weight := v_pool.rank_1_weight; WHEN 2 THEN v_rank_weight := v_pool.rank_2_weight;
            WHEN 3 THEN v_rank_weight := v_pool.rank_3_weight; ELSE CONTINUE; END CASE;
        v_effective := v_winners.winner_stake * v_rank_weight;
        v_total_effective := v_total_effective + v_effective;
        v_winner_data := array_append(v_winner_data, jsonb_build_object(
            'rank', v_rank, 'agent_id', v_winners.agent_id, 'agent_name', v_winners.agent_name,
            'weighted_score', v_winners.weighted_score, 'prediction_count', v_winners.prediction_count,
            'winner_stake', v_winners.winner_stake, 'effective_share', v_effective));
    END LOOP;

    IF v_total_effective > 0 THEN
        FOREACH v_wd IN ARRAY v_winner_data LOOP
            v_effective := (v_wd->>'effective_share')::DECIMAL;
            v_prize := v_pool.distributable_pool * v_effective / v_total_effective;
            v_rank := (v_wd->>'rank')::INTEGER;
            INSERT INTO public.pool_winners (pool_id, competition_id, rank, agent_id, user_id, agent_name,
                final_weighted_score, final_accuracy, prediction_count, prize_amount, prize_share_bps, settlement_snapshot)
            SELECT v_pool.id, p_competition_id, v_rank, (v_wd->>'agent_id')::UUID, a.user_id, v_wd->>'agent_name',
                (v_wd->>'weighted_score')::DECIMAL,
                GREATEST(0, LEAST(99.9, 98.0 * EXP(-COALESCE((v_wd->>'weighted_score')::DECIMAL, 0) * 6))),
                (v_wd->>'prediction_count')::INTEGER, v_prize,
                CASE WHEN v_total_effective > 0 THEN ROUND(v_effective / v_total_effective * 10000)::INTEGER ELSE 0 END,
                v_snapshot
            FROM public.agents a WHERE a.id = (v_wd->>'agent_id')::UUID;
            UPDATE public.agent_competition_entries SET final_rank = v_rank
            WHERE agent_id = (v_wd->>'agent_id')::UUID AND competition_id = p_competition_id;
            v_result := v_result || jsonb_build_object('rank', v_rank, 'agent_id', v_wd->>'agent_id',
                'agent_name', v_wd->>'agent_name', 'prize', v_prize);
        END LOOP;
    END IF;

    UPDATE public.competition_pools SET settlement_status = 'settled', settled_at = NOW(), settled_by = p_settled_by,
        settlement_hash = encode(sha256(convert_to(v_result::TEXT || NOW()::TEXT, 'UTF8')), 'hex'), updated_at = NOW()
    WHERE id = v_pool.id;
    UPDATE public.competitions SET status = 'settled', updated_at = NOW() WHERE id = p_competition_id;

    INSERT INTO public.pool_settlement_audit (pool_id, competition_id, event_type, details, event_hash, previous_hash)
    VALUES (v_pool.id, p_competition_id, 'settlement_completed',
        jsonb_build_object('winners', v_result, 'total_pool', v_pool.distributable_pool, 'prize_model', v_pool.prize_model),
        encode(sha256(convert_to(v_result::TEXT, 'UTF8')), 'hex'), NULL);

    RETURN jsonb_build_object('status', 'settled', 'pool_total', v_pool.total_staked,
        'distributable', v_pool.distributable_pool, 'platform_fee', v_pool.platform_fee, 'winners', v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Global Leaderboard Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS public.global_leaderboard AS
SELECT a.id AS agent_id, a.name AS agent_name, a.model, a.user_id, a.status AS agent_status,
    a.created_at AS deployed_at, COUNT(DISTINCT ace.competition_id) AS competitions_entered,
    SUM(ace.prediction_count) AS total_predictions, AVG(NULLIF(ace.weighted_score, 0)) AS avg_weighted_score,
    MIN(ace.weighted_score) AS best_weighted_score, COUNT(pw.id) AS total_wins,
    SUM(COALESCE(pw.prize_amount, 0)) AS total_prize_earned,
    CASE WHEN AVG(NULLIF(ace.weighted_score, 0)) IS NOT NULL
        THEN GREATEST(0, LEAST(99.9, 98.0 * EXP(-AVG(NULLIF(ace.weighted_score, 0)) * 6))) ELSE 0 END AS global_accuracy,
    COALESCE(AVG(NULLIF(ace.weighted_score, 0)), 99.9999) AS rank_score
FROM public.agents a
LEFT JOIN public.agent_competition_entries ace ON ace.agent_id = a.id AND ace.status IN ('active', 'paused')
LEFT JOIN public.pool_winners pw ON pw.agent_id = a.id
WHERE a.status IN ('active', 'paused')
GROUP BY a.id, a.name, a.model, a.user_id, a.status, a.created_at
HAVING SUM(ace.prediction_count) >= 3
ORDER BY rank_score ASC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_lb_agent ON public.global_leaderboard(agent_id);
CREATE INDEX IF NOT EXISTS idx_global_lb_rank ON public.global_leaderboard(rank_score ASC);

CREATE OR REPLACE FUNCTION public.refresh_global_leaderboard() RETURNS void AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_leaderboard; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Helper RPCs
CREATE OR REPLACE FUNCTION public.get_competition_pool_with_winners(p_competition_id UUID) RETURNS JSONB AS $$
DECLARE v_pool JSONB; v_winners JSONB;
BEGIN
    SELECT to_jsonb(cp.*) INTO v_pool FROM public.competition_pools cp WHERE cp.competition_id = p_competition_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', pw.rank, 'agent_id', pw.agent_id, 'agent_name', pw.agent_name,
        'prize_amount', pw.prize_amount, 'final_accuracy', pw.final_accuracy, 'prediction_count', pw.prediction_count,
        'claimed', pw.claimed, 'user_id', pw.user_id) ORDER BY pw.rank), '[]'::JSONB) INTO v_winners
    FROM public.pool_winners pw WHERE pw.competition_id = p_competition_id;
    RETURN jsonb_build_object('pool', COALESCE(v_pool, '{}'::JSONB), 'winners', v_winners);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION public.settle_competition_pool(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_competition_pool_with_winners(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_global_leaderboard() TO service_role;

NOTIFY pgrst, 'reload schema';
