-- ============================================================================
-- ExoDuZe — Competition Infrastructure (054_competition_infrastructure.sql)
-- Sector-based competitions with timing, prize pools, and realtime support
-- ============================================================================

-- ========================
-- ENUM Types
-- ========================

DO $$ BEGIN
    CREATE TYPE competition_status AS ENUM (
        'upcoming',
        'active',
        'settled',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- Competitions Table
-- ========================
CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Market linkage
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    
    -- Core info
    title VARCHAR(200) NOT NULL,
    description TEXT,
    sector VARCHAR(20) NOT NULL, -- sports, politics, finance, tech, crypto, economy, science, signals
    
    -- Teams / Outcomes
    team_home VARCHAR(100),
    team_away VARCHAR(100),
    outcomes TEXT[] DEFAULT ARRAY['Yes', 'No'],
    
    -- Competition timing
    competition_start TIMESTAMPTZ NOT NULL,
    competition_end TIMESTAMPTZ NOT NULL,
    
    -- Status
    status competition_status NOT NULL DEFAULT 'upcoming',
    winning_outcome INTEGER, -- Index into outcomes array
    
    -- Prize pool
    prize_pool DECIMAL(18,8) DEFAULT 0.00,
    entry_count INTEGER DEFAULT 0,
    max_entries INTEGER DEFAULT 1000,
    
    -- Probabilities (basis points, sum to 10000)
    probabilities INTEGER[] DEFAULT ARRAY[5000, 5000],
    
    -- On-chain reference
    onchain_market_pubkey VARCHAR(64),
    onchain_tx_signature VARCHAR(128),
    
    -- Bonding curve config
    bonding_k BIGINT DEFAULT 100000,    -- base price multiplier
    bonding_n INTEGER DEFAULT 150,       -- exponent * 100 (1.5)
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    image_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_competition_timing CHECK (competition_end > competition_start)
);

-- ========================
-- Auto-Status Transition Function
-- ========================
CREATE OR REPLACE FUNCTION update_competition_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-transition based on current time
    IF NEW.status = 'upcoming' AND NOW() >= NEW.competition_start AND NOW() < NEW.competition_end THEN
        NEW.status := 'active';
    END IF;
    
    -- Auto-mark as settled if past end time and still active
    IF NEW.status = 'active' AND NOW() >= NEW.competition_end AND NEW.winning_outcome IS NOT NULL THEN
        NEW.status := 'settled';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER competition_auto_status
    BEFORE INSERT OR UPDATE ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION update_competition_status();

-- ========================
-- Indexes
-- ========================
CREATE INDEX IF NOT EXISTS idx_competitions_sector ON competitions(sector);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_start ON competitions(competition_start DESC);
CREATE INDEX IF NOT EXISTS idx_competitions_end ON competitions(competition_end);
CREATE INDEX IF NOT EXISTS idx_competitions_market ON competitions(market_id);
CREATE INDEX IF NOT EXISTS idx_competitions_sector_status ON competitions(sector, status);
CREATE INDEX IF NOT EXISTS idx_competitions_active ON competitions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_competitions_upcoming ON competitions(status, competition_start) WHERE status = 'upcoming';

-- ========================
-- Row Level Security
-- ========================
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Public read for active/upcoming competitions
CREATE POLICY "Competitions are viewable by everyone" ON competitions
    FOR SELECT USING (status IN ('upcoming', 'active', 'settled'));

-- Service role manages all
CREATE POLICY "Service role manages all competitions" ON competitions
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Trigger
-- ========================
CREATE TRIGGER update_competitions_updated_at
    BEFORE UPDATE ON competitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Realtime
-- ========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitions;
ALTER TABLE public.competitions REPLICA IDENTITY FULL;

-- ========================
-- Helper Functions
-- ========================

-- Get active competitions by sector
CREATE OR REPLACE FUNCTION get_competitions_by_sector(
    p_sector TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active',
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    description TEXT,
    sector VARCHAR,
    team_home VARCHAR,
    team_away VARCHAR,
    outcomes TEXT[],
    competition_start TIMESTAMPTZ,
    competition_end TIMESTAMPTZ,
    status competition_status,
    prize_pool DECIMAL,
    entry_count INTEGER,
    probabilities INTEGER[],
    onchain_market_pubkey VARCHAR,
    image_url TEXT,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, c.title, c.description, c.sector,
        c.team_home, c.team_away, c.outcomes,
        c.competition_start, c.competition_end, c.status,
        c.prize_pool, c.entry_count, c.probabilities,
        c.onchain_market_pubkey, c.image_url, c.tags
    FROM competitions c
    WHERE (p_sector IS NULL OR c.sector = p_sector)
    AND c.status::TEXT = p_status
    ORDER BY c.competition_start ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Count active competitions per sector
CREATE OR REPLACE FUNCTION get_sector_competition_counts()
RETURNS TABLE (
    sector VARCHAR,
    active_count BIGINT,
    upcoming_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.sector::VARCHAR,
        COUNT(*) FILTER (WHERE c.status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE c.status = 'upcoming') AS upcoming_count
    FROM competitions c
    WHERE c.status IN ('active', 'upcoming')
    GROUP BY c.sector
    ORDER BY active_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Seed Sample Competitions
-- ========================
INSERT INTO competitions (title, description, sector, team_home, team_away, outcomes, competition_start, competition_end, probabilities, prize_pool, bonding_k, bonding_n, tags)
VALUES
    -- Sports
    ('Manchester United vs Liverpool', 'Premier League match outcome prediction', 'sports',
     'Manchester United', 'Liverpool', ARRAY['Home Win', 'Draw', 'Away Win'],
     NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
     ARRAY[4500, 2800, 2700], 5.0, 100000, 150,
     ARRAY['football', 'premier-league', 'live']),
    
    -- Politics
    ('US Congressional Balance 2026', 'Predict the outcome of US midterm elections', 'politics',
     NULL, NULL, ARRAY['Republican Majority', 'Split', 'Democrat Majority'],
     NOW(), NOW() + INTERVAL '30 days',
     ARRAY[4200, 2000, 3800], 10.0, 50000, 120,
     ARRAY['election', 'us-politics', 'midterm']),
    
    -- Finance
    ('S&P 500 Weekly Direction', 'Predict S&P 500 closing direction for the week', 'finance',
     NULL, NULL, ARRAY['Bullish Close', 'Flat', 'Bearish Close'],
     NOW(), NOW() + INTERVAL '5 days',
     ARRAY[4000, 2500, 3500], 3.0, 80000, 130,
     ARRAY['sp500', 'equities', 'weekly']),
    
    -- Tech
    ('AI Regulation Outcome', 'Will strict AI regulation pass this quarter?', 'tech',
     NULL, NULL, ARRAY['Strict Regulation', 'Moderate', 'Light Touch'],
     NOW(), NOW() + INTERVAL '90 days',
     ARRAY[3000, 4000, 3000], 8.0, 60000, 140,
     ARRAY['ai', 'regulation', 'policy']),
    
    -- Crypto
    ('BTC Price Direction (7D)', 'Predict Bitcoin price direction over next 7 days', 'crypto',
     NULL, NULL, ARRAY['Bullish', 'Sideways', 'Bearish'],
     NOW(), NOW() + INTERVAL '7 days',
     ARRAY[4500, 2500, 3000], 15.0, 120000, 160,
     ARRAY['bitcoin', 'price-prediction', 'weekly']),
    
    -- Economy
    ('US CPI Month-over-Month', 'Predict US Consumer Price Index change', 'economy',
     NULL, NULL, ARRAY['Above 0.3%', '0.1-0.3%', 'Below 0.1%'],
     NOW(), NOW() + INTERVAL '14 days',
     ARRAY[3500, 4000, 2500], 5.0, 70000, 130,
     ARRAY['inflation', 'cpi', 'macro']),
    
    -- Science
    ('SpaceX Starship Next Launch', 'Predict outcome of next SpaceX Starship test flight', 'science',
     NULL, NULL, ARRAY['Full Success', 'Partial Success', 'Failure'],
     NOW(), NOW() + INTERVAL '60 days',
     ARRAY[3500, 3500, 3000], 4.0, 50000, 120,
     ARRAY['spacex', 'starship', 'space']),
    
    -- Signals
    ('Cross-Sector Anomaly Detection', 'Identify emerging cross-sector correlation breaks', 'signals',
     NULL, NULL, ARRAY['Tech-Crypto Divergence', 'Finance-Economy Shift', 'No Anomaly'],
     NOW(), NOW() + INTERVAL '7 days',
     ARRAY[3000, 3000, 4000], 6.0, 90000, 150,
     ARRAY['signals', 'anomaly', 'cross-sector'])
ON CONFLICT DO NOTHING;

-- ========================
-- Comments
-- ========================
COMMENT ON TABLE competitions IS 'Sector-based AI agent competitions with timing, prize pools, and on-chain linkage';
COMMENT ON FUNCTION update_competition_status() IS 'Auto-transitions competition status based on timing';
COMMENT ON FUNCTION get_competitions_by_sector(TEXT, TEXT, INTEGER) IS 'Get competitions filtered by sector and status';
COMMENT ON FUNCTION get_sector_competition_counts() IS 'Get count of active/upcoming competitions per sector';
