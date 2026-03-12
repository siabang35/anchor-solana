-- ============================================================================
-- 058_add_agents_table.sql
-- Add agents table for Qwen Forecaster and agent_competition_entries mapping
-- ============================================================================

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    system_prompt TEXT NOT NULL,
    model VARCHAR(50) NOT NULL DEFAULT 'Qwen/Qwen3.5-9B',
    status agent_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create entries mapping for Forecasters to competitions
CREATE TABLE IF NOT EXISTS agent_competition_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    brier_score DECIMAL(5,4),
    status agent_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, competition_id)
);

-- Predictions table
CREATE TABLE IF NOT EXISTS agent_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    prediction_data JSONB NOT NULL,
    confidence DECIMAL(5,4),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wagers table
CREATE TABLE IF NOT EXISTS agent_wagers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    wager_amount DECIMAL(18,8) NOT NULL,
    refund_rate DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Indexes
-- ========================
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_competition_entries_comp ON agent_competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_agent_predictions_agent ON agent_predictions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_wagers_agent ON agent_wagers(agent_id);

-- ========================
-- Row Level Security
-- ========================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_competition_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wagers ENABLE ROW LEVEL SECURITY;

-- Agents: Users see own, service_role manages all
CREATE POLICY "Users can view their own agents 2" ON agents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agents 2" ON agents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents 2" ON agents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role manages all agents 2" ON agents
    FOR ALL USING (auth.role() = 'service_role');

-- Entries
CREATE POLICY "Public can view entries" ON agent_competition_entries
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own entries" ON agent_competition_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entries" ON agent_competition_entries
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Service role manages entries" ON agent_competition_entries
    FOR ALL USING (auth.role() = 'service_role');

-- Predictions
CREATE POLICY "Public can view predictions" ON agent_predictions
    FOR SELECT USING (true);
    
CREATE POLICY "Service role manages predictions" ON agent_predictions
    FOR ALL USING (auth.role() = 'service_role');

-- Wagers
CREATE POLICY "Users can view their own wagers" ON agent_wagers
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wagers" ON agent_wagers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages wagers" ON agent_wagers
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Triggers
-- ========================
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_competition_entries_updated_at
    BEFORE UPDATE ON agent_competition_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
