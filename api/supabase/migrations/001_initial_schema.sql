-- ExoDuZe AI Agent Competition Schema
-- Run this migration in Supabase SQL Editor

-- ========================
-- Markets Table
-- ========================
CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('crypto', 'sports', 'politics', 'entertainment', 'science', 'other')),
    chain VARCHAR(20) NOT NULL CHECK (chain IN ('ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'solana', 'sui')),
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(100),
    collateral_token VARCHAR(20) NOT NULL DEFAULT 'USDC',
    end_time TIMESTAMPTZ NOT NULL,
    resolution_time TIMESTAMPTZ NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    outcome BOOLEAN,
    yes_price DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    no_price DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    volume DECIMAL(20,6) NOT NULL DEFAULT 0,
    liquidity DECIMAL(20,6) NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for markets
CREATE INDEX IF NOT EXISTS idx_markets_creator ON markets(creator_id);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_chain ON markets(chain);
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets(resolved);
CREATE INDEX IF NOT EXISTS idx_markets_end_time ON markets(end_time);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume DESC);
CREATE INDEX IF NOT EXISTS idx_markets_created ON markets(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_markets_title_search ON markets USING GIN (to_tsvector('english', title));

-- ========================
-- Positions Table
-- ========================
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    yes_shares DECIMAL(20,6) NOT NULL DEFAULT 0,
    no_shares DECIMAL(20,6) NOT NULL DEFAULT 0,
    avg_yes_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
    avg_no_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(20,6) NOT NULL DEFAULT 0,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, market_id)
);

-- Indexes for positions
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_id);
CREATE INDEX IF NOT EXISTS idx_positions_user_market ON positions(user_id, market_id);

-- ========================
-- Orders Table
-- ========================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    side VARCHAR(10) NOT NULL CHECK (side IN ('yes', 'no')),
    shares DECIMAL(20,6) NOT NULL,
    price DECIMAL(10,6) NOT NULL,
    total DECIMAL(20,6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'failed')),
    tx_hash VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ========================
-- Liquidity Positions Table
-- ========================
CREATE TABLE IF NOT EXISTS liquidity_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    lp_tokens DECIMAL(20,6) NOT NULL DEFAULT 0,
    deposited_amount DECIMAL(20,6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, market_id)
);

-- ========================
-- Security Events Table (for security logging)
-- ========================
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for security events
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

-- ========================
-- Row Level Security (RLS)
-- ========================

-- Enable RLS
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Markets: Everyone can read, authenticated users can create
CREATE POLICY "Markets are viewable by everyone" ON markets
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create markets" ON markets
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Creators can update their markets" ON markets
    FOR UPDATE USING (auth.uid() = creator_id);

-- Positions: Users can only see their own
CREATE POLICY "Users can view their positions" ON positions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their positions" ON positions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their positions" ON positions
    FOR UPDATE USING (auth.uid() = user_id);

-- Orders: Users can only see their own
CREATE POLICY "Users can view their orders" ON orders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert orders" ON orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Liquidity: Users can only see their own
CREATE POLICY "Users can view their liquidity" ON liquidity_positions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their liquidity" ON liquidity_positions
    FOR ALL USING (auth.uid() = user_id);

-- Security events: Only service role can access
CREATE POLICY "Only service role can access security events" ON security_events
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Trigger
-- ========================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_liquidity_updated_at
    BEFORE UPDATE ON liquidity_positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
