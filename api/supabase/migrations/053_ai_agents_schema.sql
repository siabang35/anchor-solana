-- ============================================================================
-- ExoDuZe — AI Agents Schema (053_ai_agents_schema.sql)
-- Infrastructure for AI agent deployment with free-tier quota (max 10 deploys)
-- ============================================================================

-- ========================
-- ENUM Types
-- ========================

DO $$ BEGIN
    CREATE TYPE agent_status AS ENUM (
        'pending',
        'active',
        'paused',
        'terminated',
        'error'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_sector AS ENUM (
        'sports',
        'politics',
        'finance',
        'tech',
        'crypto',
        'economy',
        'science',
        'signals'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_risk_level AS ENUM (
        'conservative',
        'moderate',
        'aggressive',
        'ultra_aggressive'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- AI Agent Types (Catalog)
-- ========================
CREATE TABLE IF NOT EXISTS ai_agent_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    sector agent_sector NOT NULL,
    
    -- Strategy template
    default_strategy TEXT NOT NULL,
    example_prompts TEXT[] DEFAULT '{}',
    
    -- Configuration
    supported_outcomes TEXT[] DEFAULT ARRAY['home', 'draw', 'away'],
    supported_directions TEXT[] DEFAULT ARRAY['long', 'short'],
    min_risk_level INTEGER DEFAULT 1,
    max_risk_level INTEGER DEFAULT 5,
    
    -- Visual
    icon_emoji VARCHAR(10) DEFAULT '🤖',
    color_hex VARCHAR(7) DEFAULT '#6366f1',
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- AI Agents (User Deployments)
-- ========================
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_type_id UUID NOT NULL REFERENCES ai_agent_types(id),
    market_id UUID REFERENCES markets(id),
    
    -- Strategy
    name VARCHAR(100) NOT NULL,
    strategy_prompt TEXT NOT NULL,
    target_outcome VARCHAR(20) NOT NULL DEFAULT 'home',
    direction VARCHAR(10) NOT NULL DEFAULT 'long',
    risk_level INTEGER NOT NULL DEFAULT 3 CHECK (risk_level BETWEEN 1 AND 5),
    
    -- On-chain reference
    onchain_agent_pubkey VARCHAR(64),
    onchain_registry_pubkey VARCHAR(64),
    onchain_tx_signature VARCHAR(128),
    
    -- Performance
    status agent_status NOT NULL DEFAULT 'pending',
    accuracy_score DECIMAL(5,2) DEFAULT 0.00,
    total_trades INTEGER DEFAULT 0,
    total_pnl DECIMAL(18,8) DEFAULT 0.00,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Quota (denormalized for fast checking)
    deploy_number INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    deployed_at TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- AI Agent Logs
-- ========================
CREATE TABLE IF NOT EXISTS ai_agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    
    -- Log data
    action VARCHAR(50) NOT NULL, -- 'deploy', 'trade', 'rebalance', 'error', 'terminate'
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    
    -- On-chain reference
    tx_signature VARCHAR(128),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Deploy Quota View (materialized for speed)
-- ========================
CREATE OR REPLACE VIEW user_agent_quota AS
SELECT 
    user_id,
    COUNT(*) AS deploys_used,
    10 AS max_deploys,
    10 - COUNT(*) AS deploys_remaining
FROM ai_agents
WHERE status NOT IN ('terminated')
GROUP BY user_id;

-- ========================
-- Quota Enforcement Function
-- ========================
CREATE OR REPLACE FUNCTION check_agent_deploy_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ai_agents
    WHERE user_id = NEW.user_id
    AND status NOT IN ('terminated');
    
    IF v_count >= 10 THEN
        RAISE EXCEPTION 'Agent deploy limit reached (max 10 for free tier). Current: %', v_count;
    END IF;
    
    NEW.deploy_number := v_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_agent_deploy_quota
    BEFORE INSERT ON ai_agents
    FOR EACH ROW
    EXECUTE FUNCTION check_agent_deploy_quota();

-- ========================
-- Indexes
-- ========================
CREATE INDEX IF NOT EXISTS idx_ai_agents_user ON ai_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_status ON ai_agents(status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_market ON ai_agents(market_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_type ON ai_agents(agent_type_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_user_status ON ai_agents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_agent ON ai_agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_created ON ai_agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_types_sector ON ai_agent_types(sector);
CREATE INDEX IF NOT EXISTS idx_ai_agent_types_enabled ON ai_agent_types(is_enabled) WHERE is_enabled = true;

-- ========================
-- Row Level Security
-- ========================
ALTER TABLE ai_agent_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;

-- Agent types: Public read
CREATE POLICY "Agent types are viewable by everyone" ON ai_agent_types
    FOR SELECT USING (is_enabled = true);

CREATE POLICY "Service role manages agent types" ON ai_agent_types
    FOR ALL USING (auth.role() = 'service_role');

-- Agents: Users see own, service_role manages all
CREATE POLICY "Users can view their own agents" ON ai_agents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agents" ON ai_agents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents" ON ai_agents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role manages all agents" ON ai_agents
    FOR ALL USING (auth.role() = 'service_role');

-- Agent logs: Users see own agent logs
CREATE POLICY "Users can view their own agent logs" ON ai_agent_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ai_agents 
            WHERE ai_agents.id = ai_agent_logs.agent_id 
            AND ai_agents.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role manages all agent logs" ON ai_agent_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Triggers
-- ========================
CREATE TRIGGER update_ai_agent_types_updated_at
    BEFORE UPDATE ON ai_agent_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_agents_updated_at
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Realtime for AI Agents
-- ========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
ALTER TABLE public.ai_agents REPLICA IDENTITY FULL;

-- ========================
-- Seed AI Agent Types
-- ========================
INSERT INTO ai_agent_types (name, slug, description, sector, default_strategy, example_prompts, icon_emoji, color_hex)
VALUES
    -- Sports
    ('Sports Analyst', 'sports-analyst', 'AI agent specialized in sports match outcome prediction using team form, head-to-head stats, and injury reports', 'sports',
     'Analyze team form over last 5 matches, consider home/away advantage, check injury reports, evaluate head-to-head history',
     ARRAY['Predict Man City vs Arsenal based on current EPL form', 'Analyze NBA playoff matchup between Lakers and Celtics'],
     '⚽', '#22c55e'),
    
    -- Politics
    ('Political Forecaster', 'political-forecaster', 'AI agent for political event prediction using polling data, sentiment analysis, and historical patterns', 'politics',
     'Track latest polling data, analyze media sentiment, consider historical voting patterns and demographic shifts',
     ARRAY['Forecast US midterm election outcomes', 'Predict EU policy vote on tech regulation'],
     '🏛️', '#ef4444'),
    
    -- Finance
    ('Market Strategist', 'market-strategist', 'AI agent for financial market predictions using technical analysis, macro indicators, and earnings data', 'finance',
     'Monitor key indicators (RSI, MACD, Volume), track earnings calendar, analyze Fed policy signals, evaluate sector rotation',
     ARRAY['Predict S&P 500 direction for next quarter', 'Analyze impact of rate decision on tech stocks'],
     '📈', '#3b82f6'),
    
    -- Tech
    ('Tech Oracle', 'tech-oracle', 'AI agent predicting technology trends, product launches, and industry shifts', 'tech',
     'Track patent filings, monitor developer activity, analyze product roadmaps, evaluate market adoption curves',
     ARRAY['Predict adoption rate of Apple Vision Pro', 'Will GPT-5 launch before Q3 2026?'],
     '💻', '#8b5cf6'),
    
    -- Crypto
    ('Crypto Sentinel', 'crypto-sentinel', 'AI agent for cryptocurrency market predictions using on-chain metrics, DeFi flows, and social sentiment', 'crypto',
     'Monitor on-chain whale movements, track DeFi TVL changes, analyze social sentiment (CT, Reddit), evaluate protocol fundamentals',
     ARRAY['Predict BTC price direction after halving', 'Will ETH flip BTC in market cap by 2027?'],
     '₿', '#f59e0b'),
    
    -- Economy
    ('Macro Economist', 'macro-economist', 'AI agent for macroeconomic predictions using GDP, inflation, employment, and trade data', 'economy',
     'Track GDP growth rates, monitor inflation indicators (CPI, PPI), analyze labor market data, evaluate trade balances',
     ARRAY['Predict US GDP growth for Q2', 'Will inflation drop below 2% this year?'],
     '🌍', '#06b6d4'),
    
    -- Science
    ('Research Analyst', 'research-analyst', 'AI agent for scientific breakthrough predictions using paper citations, funding patterns, and lab progress', 'science',
     'Monitor arXiv/PubMed preprints, track citation velocity, analyze research funding allocations, evaluate clinical trial progress',
     ARRAY['Predict next major AI research breakthrough', 'Will CRISPR therapy get FDA approval this year?'],
     '🔬', '#10b981'),
    
    -- Signals
    ('Signal Hunter', 'signal-hunter', 'Cross-sector AI agent that detects emerging trends and anomalies across all data sources', 'signals',
     'Cross-reference trends across sectors, detect unusual data patterns, identify correlation breaks, monitor black swan indicators',
     ARRAY['Detect emerging geopolitical risk signals', 'Find cross-sector correlation anomalies in tech+crypto'],
     '📡', '#ec4899')
ON CONFLICT (slug) DO NOTHING;

-- ========================
-- Comments
-- ========================
COMMENT ON TABLE ai_agent_types IS 'Catalog of available AI agent types per sector';
COMMENT ON TABLE ai_agents IS 'User-deployed AI agents with strategy and quota tracking';
COMMENT ON TABLE ai_agent_logs IS 'Execution logs for AI agent actions and trades';
COMMENT ON VIEW user_agent_quota IS 'User agent deployment quota (max 10 free tier)';
COMMENT ON FUNCTION check_agent_deploy_quota() IS 'Trigger to enforce max 10 agent deploy quota per user';
