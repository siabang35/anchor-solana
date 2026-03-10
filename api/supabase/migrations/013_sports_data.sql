-- ============================================================
-- Sports Data Schema for ExoDuZe AI Agent Competition
-- Comprehensive schema for sports scraping and AI agent competitions
-- ============================================================

-- ========================
-- ENUM Types
-- ========================

-- Sport types supported
CREATE TYPE sport_type AS ENUM (
    'afl',
    'baseball',
    'basketball',
    'football',
    'formula1',
    'handball',
    'hockey',
    'mma',
    'nba',
    'nfl',
    'rugby',
    'volleyball'
);

-- Event status
CREATE TYPE event_status AS ENUM (
    'scheduled',
    'live',
    'halftime',
    'finished',
    'postponed',
    'cancelled',
    'suspended'
);

-- Data source
CREATE TYPE data_source AS ENUM (
    'thesportsdb',
    'apifootball',
    'manual'
);

-- Sync status
CREATE TYPE sync_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed'
);

-- Market type for sports
CREATE TYPE sports_market_type AS ENUM (
    'match_winner',
    'over_under',
    'both_teams_score',
    'correct_score',
    'first_scorer',
    'handicap',
    'custom'
);

-- ========================
-- Sports Leagues Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100) NOT NULL,
    source data_source NOT NULL DEFAULT 'thesportsdb',
    sport sport_type NOT NULL,
    name VARCHAR(200) NOT NULL,
    name_alternate VARCHAR(200),
    country VARCHAR(100),
    country_code VARCHAR(10),
    logo_url TEXT,
    banner_url TEXT,
    trophy_url TEXT,
    description TEXT,
    first_event_date DATE,
    website TEXT,
    twitter TEXT,
    facebook TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(external_id, source)
);

-- Indexes for leagues
CREATE INDEX IF NOT EXISTS idx_sports_leagues_sport ON sports_leagues(sport);
CREATE INDEX IF NOT EXISTS idx_sports_leagues_country ON sports_leagues(country);
CREATE INDEX IF NOT EXISTS idx_sports_leagues_active ON sports_leagues(is_active);
CREATE INDEX IF NOT EXISTS idx_sports_leagues_featured ON sports_leagues(is_featured);
CREATE INDEX IF NOT EXISTS idx_sports_leagues_external ON sports_leagues(external_id, source);

-- ========================
-- Sports Teams Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100) NOT NULL,
    source data_source NOT NULL DEFAULT 'thesportsdb',
    league_id UUID REFERENCES sports_leagues(id) ON DELETE SET NULL,
    sport sport_type NOT NULL,
    name VARCHAR(200) NOT NULL,
    name_short VARCHAR(50),
    name_alternate VARCHAR(200),
    country VARCHAR(100),
    city VARCHAR(100),
    stadium VARCHAR(200),
    stadium_capacity INTEGER,
    logo_url TEXT,
    jersey_url TEXT,
    banner_url TEXT,
    primary_color VARCHAR(20),
    secondary_color VARCHAR(20),
    founded_year INTEGER,
    website TEXT,
    twitter TEXT,
    facebook TEXT,
    instagram TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(external_id, source)
);

-- Indexes for teams
CREATE INDEX IF NOT EXISTS idx_sports_teams_league ON sports_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_sports_teams_sport ON sports_teams(sport);
CREATE INDEX IF NOT EXISTS idx_sports_teams_country ON sports_teams(country);
CREATE INDEX IF NOT EXISTS idx_sports_teams_active ON sports_teams(is_active);
CREATE INDEX IF NOT EXISTS idx_sports_teams_external ON sports_teams(external_id, source);
CREATE INDEX IF NOT EXISTS idx_sports_teams_name ON sports_teams USING GIN (to_tsvector('english', name));

-- ========================
-- Sports Events Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100) NOT NULL,
    source data_source NOT NULL DEFAULT 'thesportsdb',
    league_id UUID REFERENCES sports_leagues(id) ON DELETE SET NULL,
    home_team_id UUID REFERENCES sports_teams(id) ON DELETE SET NULL,
    away_team_id UUID REFERENCES sports_teams(id) ON DELETE SET NULL,
    sport sport_type NOT NULL,
    season VARCHAR(20),
    round VARCHAR(50),
    match_day INTEGER,
    
    -- Event details
    name VARCHAR(300),
    venue VARCHAR(200),
    city VARCHAR(100),
    country VARCHAR(100),
    
    -- Timing
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Status
    status event_status NOT NULL DEFAULT 'scheduled',
    status_detail VARCHAR(100),
    elapsed_time INTEGER, -- minutes elapsed for live events
    
    -- Scores
    home_score INTEGER,
    away_score INTEGER,
    home_score_halftime INTEGER,
    away_score_halftime INTEGER,
    home_score_extra INTEGER,
    away_score_extra INTEGER,
    home_score_penalty INTEGER,
    away_score_penalty INTEGER,
    
    -- Additional data
    referee VARCHAR(100),
    attendance INTEGER,
    thumbnail_url TEXT,
    video_url TEXT,
    banner_url TEXT,
    
    -- Stats (JSON for flexibility)
    stats JSONB DEFAULT '{}',
    
    -- AI agent competition flags
    has_market BOOLEAN NOT NULL DEFAULT false,
    market_created_at TIMESTAMPTZ,
    
    -- Metadata
    is_featured BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(external_id, source)
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_sports_events_league ON sports_events(league_id);
CREATE INDEX IF NOT EXISTS idx_sports_events_home_team ON sports_events(home_team_id);
CREATE INDEX IF NOT EXISTS idx_sports_events_away_team ON sports_events(away_team_id);
CREATE INDEX IF NOT EXISTS idx_sports_events_sport ON sports_events(sport);
CREATE INDEX IF NOT EXISTS idx_sports_events_status ON sports_events(status);
CREATE INDEX IF NOT EXISTS idx_sports_events_start_time ON sports_events(start_time);
CREATE INDEX IF NOT EXISTS idx_sports_events_has_market ON sports_events(has_market);
CREATE INDEX IF NOT EXISTS idx_sports_events_featured ON sports_events(is_featured);
CREATE INDEX IF NOT EXISTS idx_sports_events_external ON sports_events(external_id, source);
CREATE INDEX IF NOT EXISTS idx_sports_events_live ON sports_events(status) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_sports_events_upcoming ON sports_events(start_time) WHERE status = 'scheduled';

-- ========================
-- Sports Players Table (Optional - for detailed stats)
-- ========================
CREATE TABLE IF NOT EXISTS sports_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100) NOT NULL,
    source data_source NOT NULL DEFAULT 'thesportsdb',
    team_id UUID REFERENCES sports_teams(id) ON DELETE SET NULL,
    sport sport_type NOT NULL,
    name VARCHAR(200) NOT NULL,
    name_short VARCHAR(100),
    nationality VARCHAR(100),
    birth_date DATE,
    position VARCHAR(50),
    jersey_number INTEGER,
    height VARCHAR(20),
    weight VARCHAR(20),
    photo_url TEXT,
    thumb_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    stats JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(external_id, source)
);

-- Indexes for players
CREATE INDEX IF NOT EXISTS idx_sports_players_team ON sports_players(team_id);
CREATE INDEX IF NOT EXISTS idx_sports_players_sport ON sports_players(sport);
CREATE INDEX IF NOT EXISTS idx_sports_players_active ON sports_players(is_active);
CREATE INDEX IF NOT EXISTS idx_sports_players_external ON sports_players(external_id, source);

-- ========================
-- Sports Markets Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL, -- Link to main markets table
    market_type sports_market_type NOT NULL DEFAULT 'match_winner',
    
    -- Market definition
    title VARCHAR(300) NOT NULL,
    description TEXT,
    question VARCHAR(500) NOT NULL,
    
    -- Outcomes (JSON array for flexibility)
    outcomes JSONB NOT NULL DEFAULT '["Yes", "No"]',
    outcome_prices JSONB NOT NULL DEFAULT '[0.5, 0.5]',
    
    -- Market state
    yes_price DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    no_price DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    volume DECIMAL(20,6) NOT NULL DEFAULT 0,
    liquidity DECIMAL(20,6) NOT NULL DEFAULT 0,
    
    -- Resolution
    resolved BOOLEAN NOT NULL DEFAULT false,
    outcome BOOLEAN,
    resolution_source VARCHAR(100),
    resolution_proof TEXT,
    resolved_at TIMESTAMPTZ,
    
    -- Trading window
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    
    -- Flags
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    auto_resolve BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sports markets
CREATE INDEX IF NOT EXISTS idx_sports_markets_event ON sports_markets(event_id);
CREATE INDEX IF NOT EXISTS idx_sports_markets_market ON sports_markets(market_id);
CREATE INDEX IF NOT EXISTS idx_sports_markets_type ON sports_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_sports_markets_resolved ON sports_markets(resolved);
CREATE INDEX IF NOT EXISTS idx_sports_markets_active ON sports_markets(is_active);
CREATE INDEX IF NOT EXISTS idx_sports_markets_featured ON sports_markets(is_featured);
CREATE INDEX IF NOT EXISTS idx_sports_markets_closes ON sports_markets(closes_at);

-- ========================
-- Sports Sync Logs Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source data_source NOT NULL,
    sync_type VARCHAR(50) NOT NULL, -- 'leagues', 'teams', 'events', 'live', 'full'
    sport sport_type,
    status sync_status NOT NULL DEFAULT 'pending',
    
    -- Sync details
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Results
    records_fetched INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Request details
    request_url TEXT,
    request_params JSONB,
    response_status INTEGER,
    
    -- Metadata
    triggered_by VARCHAR(100), -- 'cron', 'manual', 'webhook'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sync logs
CREATE INDEX IF NOT EXISTS idx_sports_sync_logs_source ON sports_sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sports_sync_logs_type ON sports_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sports_sync_logs_status ON sports_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sports_sync_logs_sport ON sports_sync_logs(sport);
CREATE INDEX IF NOT EXISTS idx_sports_sync_logs_started ON sports_sync_logs(started_at DESC);

-- ========================
-- Sports Odds History Table (for odds tracking)
-- ========================
CREATE TABLE IF NOT EXISTS sports_odds_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES sports_markets(id) ON DELETE CASCADE,
    yes_price DECIMAL(10,6) NOT NULL,
    no_price DECIMAL(10,6) NOT NULL,
    volume DECIMAL(20,6) NOT NULL DEFAULT 0,
    source VARCHAR(50), -- 'user_trade', 'bookmaker', 'algorithm'
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for odds history
CREATE INDEX IF NOT EXISTS idx_sports_odds_market ON sports_odds_history(market_id);
CREATE INDEX IF NOT EXISTS idx_sports_odds_recorded ON sports_odds_history(recorded_at DESC);

-- ========================
-- Row Level Security (RLS)
-- ========================

-- Enable RLS on all tables
ALTER TABLE sports_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_odds_history ENABLE ROW LEVEL SECURITY;

-- Leagues: Public read
CREATE POLICY "Sports leagues are viewable by everyone" ON sports_leagues
    FOR SELECT USING (true);

CREATE POLICY "Only service role can manage leagues" ON sports_leagues
    FOR ALL USING (auth.role() = 'service_role');

-- Teams: Public read
CREATE POLICY "Sports teams are viewable by everyone" ON sports_teams
    FOR SELECT USING (true);

CREATE POLICY "Only service role can manage teams" ON sports_teams
    FOR ALL USING (auth.role() = 'service_role');

-- Events: Public read
CREATE POLICY "Sports events are viewable by everyone" ON sports_events
    FOR SELECT USING (true);

CREATE POLICY "Only service role can manage events" ON sports_events
    FOR ALL USING (auth.role() = 'service_role');

-- Players: Public read
CREATE POLICY "Sports players are viewable by everyone" ON sports_players
    FOR SELECT USING (true);

CREATE POLICY "Only service role can manage players" ON sports_players
    FOR ALL USING (auth.role() = 'service_role');

-- Markets: Public read for active, authenticated for trading
CREATE POLICY "Active sports markets are viewable by everyone" ON sports_markets
    FOR SELECT USING (is_active = true);

CREATE POLICY "Only service role can manage sports markets" ON sports_markets
    FOR ALL USING (auth.role() = 'service_role');

-- Sync logs: Service role only
CREATE POLICY "Only service role can access sync logs" ON sports_sync_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Odds history: Public read
CREATE POLICY "Odds history is viewable by everyone" ON sports_odds_history
    FOR SELECT USING (true);

CREATE POLICY "Only service role can manage odds history" ON sports_odds_history
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Triggers
-- ========================

CREATE TRIGGER update_sports_leagues_updated_at
    BEFORE UPDATE ON sports_leagues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sports_teams_updated_at
    BEFORE UPDATE ON sports_teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sports_events_updated_at
    BEFORE UPDATE ON sports_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sports_players_updated_at
    BEFORE UPDATE ON sports_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sports_markets_updated_at
    BEFORE UPDATE ON sports_markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Function to get upcoming events by sport
CREATE OR REPLACE FUNCTION get_upcoming_events(
    p_sport sport_type DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    event_name VARCHAR,
    home_team VARCHAR,
    away_team VARCHAR,
    start_time TIMESTAMPTZ,
    league_name VARCHAR,
    sport sport_type
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name AS event_name,
        ht.name AS home_team,
        at.name AS away_team,
        e.start_time,
        l.name AS league_name,
        e.sport
    FROM sports_events e
    LEFT JOIN sports_teams ht ON e.home_team_id = ht.id
    LEFT JOIN sports_teams at ON e.away_team_id = at.id
    LEFT JOIN sports_leagues l ON e.league_id = l.id
    WHERE e.status = 'scheduled'
    AND e.start_time > NOW()
    AND (p_sport IS NULL OR e.sport = p_sport)
    ORDER BY e.start_time ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get live events
CREATE OR REPLACE FUNCTION get_live_events(
    p_sport sport_type DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    event_name VARCHAR,
    home_team VARCHAR,
    away_team VARCHAR,
    home_score INTEGER,
    away_score INTEGER,
    elapsed_time INTEGER,
    league_name VARCHAR,
    sport sport_type
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name AS event_name,
        ht.name AS home_team,
        at.name AS away_team,
        e.home_score,
        e.away_score,
        e.elapsed_time,
        l.name AS league_name,
        e.sport
    FROM sports_events e
    LEFT JOIN sports_teams ht ON e.home_team_id = ht.id
    LEFT JOIN sports_teams at ON e.away_team_id = at.id
    LEFT JOIN sports_leagues l ON e.league_id = l.id
    WHERE e.status = 'live'
    AND (p_sport IS NULL OR e.sport = p_sport)
    ORDER BY e.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-resolve markets when event finishes
CREATE OR REPLACE FUNCTION auto_resolve_sports_market()
RETURNS TRIGGER AS $$
BEGIN
    -- When event status changes to 'finished', resolve associated markets
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        UPDATE sports_markets
        SET 
            resolved = true,
            resolved_at = NOW(),
            resolution_source = 'auto',
            -- For match_winner type, determine outcome based on scores
            outcome = CASE 
                WHEN market_type = 'match_winner' THEN 
                    CASE 
                        WHEN NEW.home_score > NEW.away_score THEN true  -- Home win
                        WHEN NEW.away_score > NEW.home_score THEN false -- Away win
                        ELSE NULL -- Draw
                    END
                ELSE NULL -- Other market types need manual resolution
            END,
            updated_at = NOW()
        WHERE event_id = NEW.id 
        AND resolved = false
        AND auto_resolve = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-resolution
CREATE TRIGGER trigger_auto_resolve_sports_market
    AFTER UPDATE ON sports_events
    FOR EACH ROW
    EXECUTE FUNCTION auto_resolve_sports_market();

-- ========================
-- Comments for documentation
-- ========================

COMMENT ON TABLE sports_leagues IS 'Stores sports league/competition metadata from external APIs';
COMMENT ON TABLE sports_teams IS 'Stores team information with logos and colors';
COMMENT ON TABLE sports_events IS 'Stores match/fixture data with scores and status';
COMMENT ON TABLE sports_players IS 'Optional table for player statistics';
COMMENT ON TABLE sports_markets IS 'AI agent competitions created from sports events';
COMMENT ON TABLE sports_sync_logs IS 'Audit trail for data synchronization operations';
COMMENT ON TABLE sports_odds_history IS 'Historical odds data for markets';

COMMENT ON COLUMN sports_events.stats IS 'JSON object containing sport-specific statistics';
COMMENT ON COLUMN sports_markets.outcomes IS 'JSON array of possible outcomes (e.g., ["Home Win", "Away Win", "Draw"])';
COMMENT ON COLUMN sports_markets.outcome_prices IS 'JSON array of prices corresponding to outcomes';
