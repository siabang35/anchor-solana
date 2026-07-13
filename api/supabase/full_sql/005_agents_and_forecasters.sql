-- ============================================================================
-- ExoDuZe — Full SQL: AI Agents & Forecaster System
-- File: 005_agents_and_forecasters.sql
--
-- PURPOSE: AI agent deployment, competition entries, predictions, wagers,
--          quota enforcement, and agent type catalog.
--
-- SECURITY: RLS on every table. Users see own agents only.
--           Service role for system operations (inference, scoring).
--           system_prompt and user_id are NEVER exposed publicly.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. AI AGENT TYPES (Catalog)                                             ║
-- ║    Template definitions for each sector's AI agent archetype.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.ai_agent_types (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(100) NOT NULL,
    slug                 VARCHAR(50) NOT NULL UNIQUE,
    description          TEXT NOT NULL,
    sector               agent_sector NOT NULL,

    -- Strategy template
    default_strategy     TEXT NOT NULL,
    example_prompts      TEXT[] DEFAULT '{}',

    -- Configuration
    supported_outcomes   TEXT[] DEFAULT ARRAY['home', 'draw', 'away'],
    supported_directions TEXT[] DEFAULT ARRAY['long', 'short'],
    min_risk_level       INTEGER DEFAULT 1,
    max_risk_level       INTEGER DEFAULT 5,

    -- Visual
    icon_emoji           VARCHAR(10) DEFAULT '🤖',
    color_hex            VARCHAR(7) DEFAULT '#6366f1',

    -- Status
    is_enabled           BOOLEAN NOT NULL DEFAULT true,
    is_premium           BOOLEAN NOT NULL DEFAULT false,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_types_sector ON public.ai_agent_types(sector);
CREATE INDEX IF NOT EXISTS idx_ai_agent_types_enabled ON public.ai_agent_types(is_enabled) WHERE is_enabled = true;

ALTER TABLE public.ai_agent_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent types are viewable by everyone" ON public.ai_agent_types
    FOR SELECT USING (is_enabled = true);
CREATE POLICY "Service role manages agent types" ON public.ai_agent_types
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_ai_agent_types_updated_at ON public.ai_agent_types;
CREATE TRIGGER update_ai_agent_types_updated_at
    BEFORE UPDATE ON public.ai_agent_types
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ai_agent_types IS 'Catalog of available AI agent types per sector';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. AGENTS TABLE                                                         ║
-- ║    Core Qwen Forecaster agents deployed by users.                      ║
-- ║    system_prompt is SENSITIVE — never exposed via public APIs.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.agents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Identity
    name             VARCHAR(100) NOT NULL,
    system_prompt    TEXT NOT NULL,                   -- SENSITIVE: never exposed publicly
    model            VARCHAR(50) NOT NULL DEFAULT 'Qwen/Qwen2.5-7B-Instruct',

    -- Status
    status           agent_status NOT NULL DEFAULT 'active',

    -- Timestamps
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_user ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON public.agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_user_status ON public.agents(user_id, status);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users see own agents only (system_prompt included for owner)
CREATE POLICY "Users can view their own agents" ON public.agents
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own agents" ON public.agents
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own agents" ON public.agents
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages all agents" ON public.agents
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_agents_updated_at ON public.agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agents IS 'Qwen Forecaster agents. system_prompt is SENSITIVE and must be stripped from public responses.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. AGENT COMPETITION ENTRIES                                            ║
-- ║    Maps agents to competitions with scoring data.                      ║
-- ║    This is the HOT table for leaderboard queries.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.agent_competition_entries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Scoring
    brier_score       DECIMAL(5,4),                  -- Raw Brier (0=perfect, 1=worst)
    weighted_score    DECIMAL(10,6),                  -- Cumulative weighted Brier
    prediction_count  INTEGER NOT NULL DEFAULT 0,
    last_scored_at    TIMESTAMPTZ,

    -- HMAC integrity
    score_hash        TEXT,                           -- HMAC-SHA256 chain hash

    -- Ranking
    rank_trend        INTEGER NOT NULL DEFAULT 0,     -- +1 up, -1 down, 0 stable
    final_rank        INTEGER,                        -- 1/2/3 after settlement

    -- Status
    status            agent_status NOT NULL DEFAULT 'active',

    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(agent_id, competition_id)
);

-- Performance-critical indexes for leaderboard
CREATE INDEX IF NOT EXISTS idx_ace_comp ON public.agent_competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_ace_weighted_score
    ON public.agent_competition_entries(competition_id, weighted_score ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ace_prediction_count
    ON public.agent_competition_entries(competition_id, prediction_count DESC);
CREATE INDEX IF NOT EXISTS idx_ace_agent ON public.agent_competition_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_ace_user ON public.agent_competition_entries(user_id);

ALTER TABLE public.agent_competition_entries ENABLE ROW LEVEL SECURITY;

-- Public read (leaderboard is public)
CREATE POLICY "Public can view entries" ON public.agent_competition_entries
    FOR SELECT USING (true);
CREATE POLICY "Users can insert their own entries" ON public.agent_competition_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own entries" ON public.agent_competition_entries
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages entries" ON public.agent_competition_entries
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_agent_competition_entries_updated_at ON public.agent_competition_entries;
CREATE TRIGGER update_agent_competition_entries_updated_at
    BEFORE UPDATE ON public.agent_competition_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime for live leaderboard
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_competition_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.agent_competition_entries REPLICA IDENTITY FULL;

COMMENT ON TABLE public.agent_competition_entries IS 'Agent-competition mapping with weighted Brier scores. HOT table for leaderboard queries.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. AGENT PREDICTIONS TABLE                                              ║
-- ║    Individual AI predictions with probability, reasoning, and curve.    ║
-- ║    reasoning and projected_curve are stripped after 7 days to save DB.  ║
-- ║    Full data archived to Cloudflare R2.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.agent_predictions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,

    -- Core prediction
    probability       DECIMAL(5,4),                  -- 0.0000 - 1.0000
    reasoning         TEXT,                           -- AI inference reasoning (stripped after 7d)
    projected_curve   JSONB,                          -- Time-series curve (stripped after 7d)

    -- Legacy
    prediction_data   JSONB DEFAULT '{}'::jsonb,     -- Deprecated; kept for compatibility
    confidence        DECIMAL(5,4),

    -- Timestamp
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predictions_agent ON public.agent_predictions(agent_id);
CREATE INDEX IF NOT EXISTS idx_predictions_comp_agent
    ON public.agent_predictions(competition_id, agent_id, timestamp DESC);

-- Realtime for live prediction tracking
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_predictions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.agent_predictions REPLICA IDENTITY FULL;

ALTER TABLE public.agent_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view predictions" ON public.agent_predictions
    FOR SELECT USING (true);
CREATE POLICY "Service role manages predictions" ON public.agent_predictions
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_predictions IS 'Individual AI predictions. reasoning/projected_curve stripped after 7d and archived to R2.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. AGENT WAGERS TABLE                                                   ║
-- ║    Stake records for agent deployments.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.agent_wagers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    wager_amount      DECIMAL(18,8) NOT NULL,
    refund_rate       DECIMAL(3,2) NOT NULL DEFAULT 0.00,  -- 100% risk policy: no refunds
    status            VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wagers_agent ON public.agent_wagers(agent_id);
CREATE INDEX IF NOT EXISTS idx_wagers_user ON public.agent_wagers(user_id);

ALTER TABLE public.agent_wagers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wagers" ON public.agent_wagers
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wagers" ON public.agent_wagers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role manages wagers" ON public.agent_wagers
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_wagers IS 'SOL stake records for agent deployments. 100% risk policy.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. AI AGENTS (legacy detailed deployments)                              ║
-- ║    Must be created BEFORE ai_agent_logs due to FK dependency.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.ai_agents (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_type_id            UUID NOT NULL REFERENCES public.ai_agent_types(id),
    market_id                UUID REFERENCES public.markets(id),

    -- Strategy
    name                     VARCHAR(100) NOT NULL,
    strategy_prompt          TEXT NOT NULL,
    target_outcome           VARCHAR(20) NOT NULL DEFAULT 'home',
    direction                VARCHAR(10) NOT NULL DEFAULT 'long',
    risk_level               INTEGER NOT NULL DEFAULT 3 CHECK (risk_level BETWEEN 1 AND 5),

    -- On-chain
    onchain_agent_pubkey     VARCHAR(64),
    onchain_registry_pubkey  VARCHAR(64),
    onchain_tx_signature     VARCHAR(128),

    -- Performance
    status                   agent_status NOT NULL DEFAULT 'pending',
    accuracy_score           DECIMAL(5,2) DEFAULT 0.00,
    total_trades             INTEGER DEFAULT 0,
    total_pnl                DECIMAL(18,8) DEFAULT 0.00,
    win_rate                 DECIMAL(5,2) DEFAULT 0.00,

    -- Quota
    deploy_number            INTEGER NOT NULL DEFAULT 1,

    -- Timestamps
    deployed_at              TIMESTAMPTZ,
    last_trade_at            TIMESTAMPTZ,
    terminated_at            TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_user ON public.ai_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_status ON public.ai_agents(status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_market ON public.ai_agents(market_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_type ON public.ai_agents(agent_type_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_user_status ON public.ai_agents(user_id, status);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ai_agents" ON public.ai_agents
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ai_agents" ON public.ai_agents
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ai_agents" ON public.ai_agents
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages all ai_agents" ON public.ai_agents
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_ai_agents_updated_at ON public.ai_agents;
CREATE TRIGGER update_ai_agents_updated_at
    BEFORE UPDATE ON public.ai_agents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.ai_agents REPLICA IDENTITY FULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. AI AGENT LOGS (legacy)                                               ║
-- ║    Created AFTER ai_agents to satisfy FK dependency.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.ai_agent_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
    action            VARCHAR(50) NOT NULL,
    message           TEXT NOT NULL,
    details           JSONB DEFAULT '{}',
    tx_signature      VARCHAR(128),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_agent ON public.ai_agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_created ON public.ai_agent_logs(created_at DESC);

ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent logs" ON public.ai_agent_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ai_agents
            WHERE ai_agents.id = ai_agent_logs.agent_id
              AND ai_agents.user_id = auth.uid()
        )
    );
CREATE POLICY "Service role manages all agent logs" ON public.ai_agent_logs
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. QUOTA ENFORCEMENT                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Deploy quota view
CREATE OR REPLACE VIEW public.user_agent_quota AS
SELECT
    user_id,
    COUNT(*) AS deploys_used,
    10 AS max_deploys,
    10 - COUNT(*) AS deploys_remaining
FROM public.ai_agents
WHERE status NOT IN ('terminated')
GROUP BY user_id;

-- Quota enforcement trigger (for ai_agents legacy table)
CREATE OR REPLACE FUNCTION public.check_agent_deploy_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.ai_agents
    WHERE user_id = NEW.user_id
      AND status NOT IN ('terminated');

    IF v_count >= 10 THEN
        RAISE EXCEPTION 'Agent deploy limit reached (max 10 for free tier). Current: %', v_count;
    END IF;

    NEW.deploy_number := v_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS enforce_agent_deploy_quota ON public.ai_agents;
CREATE TRIGGER enforce_agent_deploy_quota
    BEFORE INSERT ON public.ai_agents
    FOR EACH ROW EXECUTE FUNCTION public.check_agent_deploy_quota();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. SEED AI AGENT TYPES                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.ai_agent_types (name, slug, description, sector, default_strategy, example_prompts, icon_emoji, color_hex)
VALUES
    ('Sports Analyst', 'sports-analyst', 'AI agent specialized in sports match outcome prediction using team form, head-to-head stats, and injury reports', 'sports',
     'Analyze team form over last 5 matches, consider home/away advantage, check injury reports, evaluate head-to-head history',
     ARRAY['Predict Man City vs Arsenal based on current EPL form'], '⚽', '#22c55e'),

    ('Political Forecaster', 'political-forecaster', 'AI agent for political event prediction using polling data, sentiment analysis, and historical patterns', 'politics',
     'Track latest polling data, analyze media sentiment, consider historical voting patterns and demographic shifts',
     ARRAY['Forecast US midterm election outcomes'], '🏛️', '#ef4444'),

    ('Market Strategist', 'market-strategist', 'AI agent for financial market predictions using technical analysis, macro indicators, and earnings data', 'finance',
     'Monitor key indicators (RSI, MACD, Volume), track earnings calendar, analyze Fed policy signals',
     ARRAY['Predict S&P 500 direction for next quarter'], '📈', '#3b82f6'),

    ('Tech Oracle', 'tech-oracle', 'AI agent predicting technology trends, product launches, and industry shifts', 'tech',
     'Track patent filings, monitor developer activity, analyze product roadmaps',
     ARRAY['Predict adoption rate of Apple Vision Pro'], '💻', '#8b5cf6'),

    ('Crypto Sentinel', 'crypto-sentinel', 'AI agent for cryptocurrency market predictions using on-chain metrics, DeFi flows, and social sentiment', 'crypto',
     'Monitor on-chain whale movements, track DeFi TVL changes, analyze social sentiment',
     ARRAY['Predict BTC price direction after halving'], '₿', '#f59e0b'),

    ('Macro Economist', 'macro-economist', 'AI agent for macroeconomic predictions using GDP, inflation, employment, and trade data', 'economy',
     'Track GDP growth rates, monitor inflation indicators (CPI, PPI), analyze labor market data',
     ARRAY['Predict US GDP growth for Q2'], '🌍', '#06b6d4'),

    ('Research Analyst', 'research-analyst', 'AI agent for scientific breakthrough predictions using paper citations, funding patterns, and lab progress', 'science',
     'Monitor arXiv/PubMed preprints, track citation velocity, analyze research funding allocations',
     ARRAY['Predict next major AI research breakthrough'], '🔬', '#10b981'),

    ('Signal Hunter', 'signal-hunter', 'Cross-sector AI agent that detects emerging trends and anomalies across all data sources', 'signals',
     'Cross-reference trends across sectors, detect unusual data patterns, identify correlation breaks',
     ARRAY['Detect emerging geopolitical risk signals'], '📡', '#ec4899')
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.ai_agents IS 'User-deployed AI agents with strategy and quota tracking';
COMMENT ON VIEW public.user_agent_quota IS 'User agent deployment quota (max 10 free tier)';
COMMENT ON FUNCTION public.check_agent_deploy_quota() IS 'Trigger to enforce max 10 agent deploys per user';
