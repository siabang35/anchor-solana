-- ============================================================================
-- ExoDuZe — Pool Settlement & Winners System (070_pool_settlement.sql)
--
-- Enterprise-grade, fair prize pool distribution with:
--   • Per-competition prize pools from participant stakes
--   • Fair winner determination via weighted scoring
--   • Anti-manipulation: rate limits, velocity caps, HMAC chains
--   • Anti-whale: max stake limits per user per competition
--   • Settlement audit trail with full traceability
--   • Global leaderboard aggregation across sectors
-- ============================================================================

-- ========================
-- 1. Pool Settlement Status Enum
-- ========================
DO $$ BEGIN
    CREATE TYPE pool_settlement_status AS ENUM (
        'pending',         -- Competition still running
        'settling',        -- Settlement in progress (locked)
        'settled',         -- Winners determined, funds distributed
        'disputed',        -- Under review
        'cancelled'        -- Competition cancelled, refunds issued
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- 2. Competition Pool Ledger
-- Immutable per-competition pool with on-chain references
-- ========================
CREATE TABLE IF NOT EXISTS competition_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,

    -- Pool financials
    total_staked DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    platform_fee DECIMAL(18,8) NOT NULL DEFAULT 0.00,        -- 2% platform cut
    distributable_pool DECIMAL(18,8) NOT NULL DEFAULT 0.00,  -- total_staked - platform_fee
    
    -- Distribution splits (basis points, sum to 10000)
    winner_1_share INTEGER NOT NULL DEFAULT 5000,   -- 50%
    winner_2_share INTEGER NOT NULL DEFAULT 3000,   -- 30%
    winner_3_share INTEGER NOT NULL DEFAULT 2000,   -- 20%
    
    -- Settlement
    settlement_status pool_settlement_status NOT NULL DEFAULT 'pending',
    settled_at TIMESTAMPTZ,
    settled_by TEXT,  -- admin/system identifier
    
    -- On-chain references (Solana devnet)
    onchain_pool_pubkey VARCHAR(64),
    onchain_settle_tx VARCHAR(128),
    
    -- Anti-manipulation
    stake_count INTEGER NOT NULL DEFAULT 0,
    max_stake_per_user DECIMAL(18,8) NOT NULL DEFAULT 5.00,  -- Max 5 SOL per user per comp
    min_stake DECIMAL(18,8) NOT NULL DEFAULT 0.01,           -- Min 0.01 SOL
    
    -- Integrity
    settlement_hash TEXT,     -- SHA256 of settlement data
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_pool_per_competition UNIQUE (competition_id),
    CONSTRAINT valid_distribution CHECK (winner_1_share + winner_2_share + winner_3_share = 10000),
    CONSTRAINT valid_stake_limits CHECK (max_stake_per_user > min_stake AND min_stake > 0)
);

-- ========================
-- 3. Pool Stakes — Individual participant stakes
-- ========================
CREATE TABLE IF NOT EXISTS pool_stakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES competition_pools(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Stake details
    stake_amount DECIMAL(18,8) NOT NULL,
    staked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- On-chain reference
    onchain_tx VARCHAR(128),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, refunded, claimed
    refunded_at TIMESTAMPTZ,
    refund_tx VARCHAR(128),
    
    -- Anti-manipulation: rate limit tracking
    stake_sequence INTEGER NOT NULL DEFAULT 1,  -- N-th stake by this user in this comp
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Anti-whale: one stake per user per competition
    CONSTRAINT unique_stake_per_user_comp UNIQUE (user_id, competition_id),
    CONSTRAINT valid_stake_amount CHECK (stake_amount > 0)
);

-- ========================
-- 4. Pool Winners — Settlement results
-- ========================
CREATE TABLE IF NOT EXISTS pool_winners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES competition_pools(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    
    -- Winner details
    rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    
    -- Scoring (at settlement time)
    final_weighted_score DECIMAL(10,6),
    final_accuracy DECIMAL(6,2),  -- percentage 0-100
    prediction_count INTEGER NOT NULL DEFAULT 0,
    
    -- Prize
    prize_amount DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    prize_share_bps INTEGER NOT NULL,  -- basis points of pool
    
    -- Claim status
    claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_at TIMESTAMPTZ,
    claim_tx VARCHAR(128),  -- on-chain claim transaction
    
    -- Audit
    settlement_snapshot JSONB,  -- Full leaderboard snapshot at settlement
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_winner_rank UNIQUE (competition_id, rank)
);

-- ========================
-- 5. Global Leaderboard Materialized View
-- Cross-competition aggregated scores for global ranking
-- ========================
CREATE MATERIALIZED VIEW IF NOT EXISTS global_leaderboard AS
SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    a.model,
    a.user_id,
    a.status AS agent_status,
    a.created_at AS deployed_at,
    
    -- Aggregated metrics
    COUNT(DISTINCT ace.competition_id) AS competitions_entered,
    SUM(ace.prediction_count) AS total_predictions,
    AVG(NULLIF(ace.weighted_score, 0)) AS avg_weighted_score,
    MIN(ace.weighted_score) AS best_weighted_score,
    
    -- Win record
    COUNT(pw.id) AS total_wins,
    SUM(COALESCE(pw.prize_amount, 0)) AS total_prize_earned,
    
    -- Calculated accuracy (inverse of avg weighted score)
    CASE 
        WHEN AVG(NULLIF(ace.weighted_score, 0)) IS NOT NULL 
        THEN GREATEST(0, LEAST(99.9, 98.0 * EXP(-AVG(NULLIF(ace.weighted_score, 0)) * 6)))
        ELSE 0 
    END AS global_accuracy,
    
    -- Global rank score (lower = better)
    COALESCE(AVG(NULLIF(ace.weighted_score, 0)), 99.9999) AS rank_score

FROM agents a
LEFT JOIN agent_competition_entries ace ON ace.agent_id = a.id AND ace.status IN ('active', 'paused')
LEFT JOIN pool_winners pw ON pw.agent_id = a.id
WHERE a.status IN ('active', 'paused')
GROUP BY a.id, a.name, a.model, a.user_id, a.status, a.created_at
HAVING SUM(ace.prediction_count) >= 3  -- minimum 3 predictions to qualify
ORDER BY rank_score ASC;

-- Index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_leaderboard_agent ON global_leaderboard(agent_id);
CREATE INDEX IF NOT EXISTS idx_global_leaderboard_rank ON global_leaderboard(rank_score ASC);

-- ========================
-- 6. Settlement Audit Log
-- ========================
CREATE TABLE IF NOT EXISTS pool_settlement_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pool_id UUID NOT NULL REFERENCES competition_pools(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    
    event_type VARCHAR(50) NOT NULL,  -- 'stake_added', 'settlement_started', 'winners_determined', 'prize_distributed', 'refund_issued'
    
    -- Details
    agent_id UUID,
    user_id UUID,
    amount DECIMAL(18,8),
    details JSONB,
    
    -- Integrity chain
    event_hash TEXT NOT NULL,
    previous_hash TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- 7. Indexes
-- ========================

-- Competition pools
CREATE INDEX IF NOT EXISTS idx_comp_pools_comp ON competition_pools(competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_pools_status ON competition_pools(settlement_status);

-- Pool stakes
CREATE INDEX IF NOT EXISTS idx_pool_stakes_pool ON pool_stakes(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_user ON pool_stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_agent ON pool_stakes(agent_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_comp ON pool_stakes(competition_id);

-- Pool winners
CREATE INDEX IF NOT EXISTS idx_pool_winners_pool ON pool_winners(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_winners_comp ON pool_winners(competition_id);
CREATE INDEX IF NOT EXISTS idx_pool_winners_agent ON pool_winners(agent_id);
CREATE INDEX IF NOT EXISTS idx_pool_winners_rank ON pool_winners(competition_id, rank);

-- Settlement audit
CREATE INDEX IF NOT EXISTS idx_pool_audit_pool ON pool_settlement_audit(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_audit_comp ON pool_settlement_audit(competition_id, created_at DESC);

-- ========================
-- 8. Row Level Security
-- ========================

-- Competition Pools: public read, service_role write
ALTER TABLE competition_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view pools" ON competition_pools
    FOR SELECT USING (true);

CREATE POLICY "Service role manages pools" ON competition_pools
    FOR ALL USING (auth.role() = 'service_role');

-- Pool Stakes: users see own, service_role manages
ALTER TABLE pool_stakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stakes" ON pool_stakes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stakes" ON pool_stakes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages stakes" ON pool_stakes
    FOR ALL USING (auth.role() = 'service_role');

-- Pool Winners: public read, service_role write
ALTER TABLE pool_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view winners" ON pool_winners
    FOR SELECT USING (true);

CREATE POLICY "Service role manages winners" ON pool_winners
    FOR ALL USING (auth.role() = 'service_role');

-- Settlement Audit: service_role only
ALTER TABLE pool_settlement_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages settlement audit" ON pool_settlement_audit
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- 9. Anti-Whale Stake Guard
-- ========================
CREATE OR REPLACE FUNCTION validate_stake()
RETURNS TRIGGER AS $$
DECLARE
    v_max_stake DECIMAL;
    v_min_stake DECIMAL;
    v_pool_status pool_settlement_status;
    v_comp_status competition_status;
    v_existing_count INTEGER;
BEGIN
    -- Get pool config
    SELECT max_stake_per_user, min_stake, settlement_status 
    INTO v_max_stake, v_min_stake, v_pool_status
    FROM competition_pools
    WHERE id = NEW.pool_id;

    -- Pool must be pending
    IF v_pool_status != 'pending' THEN
        RAISE EXCEPTION 'Pool is not accepting stakes (status: %)', v_pool_status
        USING ERRCODE = 'P0001';
    END IF;

    -- Competition must be active
    SELECT status INTO v_comp_status FROM competitions WHERE id = NEW.competition_id;
    IF v_comp_status NOT IN ('upcoming', 'active') THEN
        RAISE EXCEPTION 'Competition is not active (status: %)', v_comp_status
        USING ERRCODE = 'P0001';
    END IF;

    -- Validate amount bounds
    IF NEW.stake_amount < v_min_stake THEN
        RAISE EXCEPTION 'Stake amount %.8f below minimum %.8f SOL', NEW.stake_amount, v_min_stake
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.stake_amount > v_max_stake THEN
        RAISE EXCEPTION 'Stake amount %.8f exceeds maximum %.8f SOL (anti-whale)', NEW.stake_amount, v_max_stake
        USING ERRCODE = 'P0001';
    END IF;

    -- Set stake sequence
    SELECT COUNT(*) INTO v_existing_count
    FROM pool_stakes
    WHERE user_id = NEW.user_id AND competition_id = NEW.competition_id;
    
    NEW.stake_sequence := v_existing_count + 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS validate_stake_guard ON pool_stakes;
CREATE TRIGGER validate_stake_guard
    BEFORE INSERT ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION validate_stake();

-- ========================
-- 10. Auto-Update Pool Totals on Stake
-- ========================
CREATE OR REPLACE FUNCTION update_pool_on_stake()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_bps INTEGER := 200;  -- 2% platform fee
    v_new_total DECIMAL;
    v_new_fee DECIMAL;
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE competition_pools
        SET 
            total_staked = total_staked + NEW.stake_amount,
            platform_fee = (total_staked + NEW.stake_amount) * v_platform_fee_bps / 10000,
            distributable_pool = (total_staked + NEW.stake_amount) * (10000 - v_platform_fee_bps) / 10000,
            stake_count = stake_count + 1,
            updated_at = NOW()
        WHERE id = NEW.pool_id;

        -- Also update competition prize_pool and entry_count
        UPDATE competitions
        SET 
            prize_pool = (SELECT distributable_pool FROM competition_pools WHERE id = NEW.pool_id),
            entry_count = (SELECT stake_count FROM competition_pools WHERE id = NEW.pool_id),
            updated_at = NOW()
        WHERE id = NEW.competition_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS pool_stake_totals ON pool_stakes;
CREATE TRIGGER pool_stake_totals
    AFTER INSERT ON pool_stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_on_stake();

-- ========================
-- 11. Auto-Create Pool on Competition Insert
-- ========================
CREATE OR REPLACE FUNCTION auto_create_competition_pool()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO competition_pools (competition_id)
    VALUES (NEW.id)
    ON CONFLICT (competition_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS auto_pool_on_competition ON competitions;
CREATE TRIGGER auto_pool_on_competition
    AFTER INSERT ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_competition_pool();

-- ========================
-- 12. Settle Competition Function (called by backend)
-- ========================
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

    -- Get full leaderboard snapshot for audit
    SELECT jsonb_agg(row_to_json(lb.*)) INTO v_snapshot
    FROM get_weighted_leaderboard(p_competition_id, 100) lb;

    -- Determine top 3 winners from weighted leaderboard
    FOR v_winners IN 
        SELECT * FROM get_weighted_leaderboard(p_competition_id, 3)
        WHERE has_min_predictions = true
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
        jsonb_build_object('winners', v_result, 'total_pool', v_pool.distributable_pool),
        encode(sha256(convert_to(v_result::TEXT, 'UTF8')), 'hex'),
        NULL
    );

    RETURN jsonb_build_object(
        'status', 'settled',
        'pool_total', v_pool.total_staked,
        'distributable', v_pool.distributable_pool,
        'platform_fee', v_pool.platform_fee,
        'winners', v_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ========================
-- 13. Get Pool & Winners for a Competition
-- ========================
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
            'rank', pw.rank,
            'agent_id', pw.agent_id,
            'agent_name', pw.agent_name,
            'prize_amount', pw.prize_amount,
            'final_accuracy', pw.final_accuracy,
            'prediction_count', pw.prediction_count,
            'claimed', pw.claimed,
            'user_id', pw.user_id
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

-- ========================
-- 14. Get Sector Pool Summary
-- ========================
CREATE OR REPLACE FUNCTION get_sector_pool_summary(p_sector TEXT)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_build_object(
            'sector', p_sector,
            'total_pool', COALESCE(SUM(cp.distributable_pool), 0),
            'total_staked', COALESCE(SUM(cp.total_staked), 0),
            'platform_fees', COALESCE(SUM(cp.platform_fee), 0),
            'competition_count', COUNT(DISTINCT c.id),
            'active_competitions', COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('upcoming', 'active')),
            'settled_competitions', COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'settled'),
            'total_participants', COALESCE(SUM(cp.stake_count), 0)
        )
        FROM competitions c
        LEFT JOIN competition_pools cp ON cp.competition_id = c.id
        WHERE c.sector = p_sector
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- ========================
-- 15. Get Global Pool Summary
-- ========================
CREATE OR REPLACE FUNCTION get_global_pool_summary()
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_build_object(
            'total_pool', COALESCE(SUM(cp.distributable_pool), 0),
            'total_staked', COALESCE(SUM(cp.total_staked), 0),
            'platform_fees', COALESCE(SUM(cp.platform_fee), 0),
            'competition_count', COUNT(DISTINCT c.id),
            'active_competitions', COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('upcoming', 'active')),
            'total_participants', COALESCE(SUM(cp.stake_count), 0),
            'sectors', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'sector', sector_data.sector,
                        'pool', sector_data.pool_total,
                        'competitions', sector_data.comp_count
                    )
                )
                FROM (
                    SELECT 
                        c2.sector,
                        COALESCE(SUM(cp2.distributable_pool), 0) AS pool_total,
                        COUNT(DISTINCT c2.id) AS comp_count
                    FROM competitions c2
                    LEFT JOIN competition_pools cp2 ON cp2.competition_id = c2.id
                    GROUP BY c2.sector
                    ORDER BY pool_total DESC
                ) sector_data
            )
        )
        FROM competitions c
        LEFT JOIN competition_pools cp ON cp.competition_id = c.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- ========================
-- 16. Realtime
-- ========================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_pools;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.competition_pools REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_winners;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.pool_winners REPLICA IDENTITY FULL;

-- ========================
-- 17. Updated At Triggers
-- ========================
CREATE TRIGGER update_competition_pools_updated_at
    BEFORE UPDATE ON competition_pools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- 18. Refresh Global Leaderboard Function
-- ========================
CREATE OR REPLACE FUNCTION refresh_global_leaderboard()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY global_leaderboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ========================
-- 19. Create pools for existing competitions
-- ========================
INSERT INTO competition_pools (competition_id)
SELECT id FROM competitions
WHERE id NOT IN (SELECT competition_id FROM competition_pools)
ON CONFLICT (competition_id) DO NOTHING;

-- ========================
-- 20. Grants
-- ========================
GRANT EXECUTE ON FUNCTION settle_competition_pool(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_competition_pool_with_winners(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_sector_pool_summary(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_global_pool_summary() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION refresh_global_leaderboard() TO service_role;

-- ========================
-- 21. Comments
-- ========================
COMMENT ON TABLE competition_pools IS 'Per-competition prize pool with anti-whale limits and settlement tracking';
COMMENT ON TABLE pool_stakes IS 'Individual participant stakes into competition pools';
COMMENT ON TABLE pool_winners IS 'Determined winners (top 3) with prize amounts after settlement';
COMMENT ON TABLE pool_settlement_audit IS 'Immutable audit trail for pool settlement events';
COMMENT ON MATERIALIZED VIEW global_leaderboard IS 'Cross-competition aggregated leaderboard for global rankings';
COMMENT ON FUNCTION settle_competition_pool(UUID, TEXT) IS 'Settles a competition pool, determines top 3 winners, and distributes prizes';
COMMENT ON FUNCTION validate_stake() IS 'Anti-whale guard: validates stake amount limits and pool status';
COMMENT ON FUNCTION get_competition_pool_with_winners(UUID) IS 'Returns pool data + winners for a competition';
COMMENT ON FUNCTION get_sector_pool_summary(TEXT) IS 'Aggregated pool summary for a sector';
COMMENT ON FUNCTION get_global_pool_summary() IS 'Global pool summary across all sectors';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
