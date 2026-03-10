-- ============================================================
-- Politics Data Schema for ExoDuZe AI Agent Competition
-- Tables specific to political events and news
-- Migration: 038_politics_data.sql
-- ============================================================

-- ========================
-- Politics Events Table
-- ========================
CREATE TABLE IF NOT EXISTS politics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,
    source market_data_source_type NOT NULL DEFAULT 'gdelt',
    
    -- Event details
    event_type VARCHAR(100) NOT NULL, -- 'election', 'legislation', 'summit', 'treaty', 'policy_change'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Location
    country VARCHAR(100),
    country_code VARCHAR(10),
    region VARCHAR(100),
    city VARCHAR(100),
    
    -- Temporal
    event_date DATE,
    event_date_precision VARCHAR(20) DEFAULT 'day', -- 'day', 'week', 'month', 'year'
    announcement_date DATE,
    deadline_date DATE,
    
    -- Participants
    primary_actor VARCHAR(200), -- Main political entity
    secondary_actor VARCHAR(200),
    actor_type VARCHAR(100), -- 'government', 'party', 'politician', 'organization'
    
    -- Classification
    goldstein_scale DECIMAL(5,2), -- GDELT Goldstein scale (-10 to +10)
    quad_class INTEGER, -- GDELT quad class (1-4)
    
    -- Scoring
    importance_score DECIMAL(5,4) DEFAULT 0.5,
    controversy_score DECIMAL(5,4) DEFAULT 0.5,
    global_impact BOOLEAN DEFAULT false,
    
    -- Market potential
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    related_events UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(external_id, source)
);

-- ========================
-- Political Entities Table
-- ========================
CREATE TABLE IF NOT EXISTS politics_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    
    -- Entity details
    entity_type VARCHAR(50) NOT NULL, -- 'politician', 'party', 'government', 'organization', 'country'
    name VARCHAR(300) NOT NULL,
    name_short VARCHAR(100),
    title VARCHAR(200), -- Official title/position
    
    -- Location
    country VARCHAR(100),
    country_code VARCHAR(10),
    
    -- Classification
    political_leaning VARCHAR(50), -- 'left', 'center-left', 'center', 'center-right', 'right'
    ideology TEXT[],
    
    -- Media
    image_url TEXT,
    website_url TEXT,
    twitter_handle VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    
    -- Analytics
    mention_count INTEGER DEFAULT 0,
    sentiment_avg DECIMAL(5,4),
    last_mentioned_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(entity_type, name, country)
);

-- ========================
-- Politics News Junction
-- ========================
CREATE TABLE IF NOT EXISTS politics_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    
    -- Event/Entity relations
    event_id UUID REFERENCES politics_events(id) ON DELETE SET NULL,
    entity_ids UUID[] DEFAULT '{}',
    
    -- Politics-specific scoring
    political_significance impact_level DEFAULT 'medium',
    bias_indicator VARCHAR(50), -- 'left_bias', 'right_bias', 'neutral', 'mixed'
    fact_check_status VARCHAR(50), -- 'verified', 'disputed', 'unverified'
    
    -- Geopolitics
    countries_mentioned TEXT[] DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Elections Table
-- ========================
CREATE TABLE IF NOT EXISTS politics_elections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    
    -- Election details
    election_type VARCHAR(100) NOT NULL, -- 'presidential', 'parliamentary', 'local', 'referendum'
    title VARCHAR(500) NOT NULL,
    country VARCHAR(100) NOT NULL,
    country_code VARCHAR(10),
    region VARCHAR(100),
    
    -- Temporal
    election_date DATE NOT NULL,
    registration_deadline DATE,
    early_voting_start DATE,
    results_expected_date DATE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'upcoming', -- 'upcoming', 'ongoing', 'completed', 'cancelled'
    
    -- Candidates/Options (JSON for flexibility)
    candidates JSONB DEFAULT '[]',
    current_polls JSONB DEFAULT '{}',
    
    -- Results
    winner VARCHAR(300),
    final_results JSONB,
    turnout_percentage DECIMAL(5,2),
    
    -- Market
    market_id UUID,
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(election_type, country, election_date)
);

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_politics_events_type ON politics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_politics_events_country ON politics_events(country);
CREATE INDEX IF NOT EXISTS idx_politics_events_date ON politics_events(event_date);
CREATE INDEX IF NOT EXISTS idx_politics_events_active ON politics_events(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_politics_events_goldstein ON politics_events(goldstein_scale);

CREATE INDEX IF NOT EXISTS idx_politics_entities_type ON politics_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_politics_entities_country ON politics_entities(country);
CREATE INDEX IF NOT EXISTS idx_politics_entities_name ON politics_entities USING GIN(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_politics_news_data_item ON politics_news_items(data_item_id);
CREATE INDEX IF NOT EXISTS idx_politics_news_event ON politics_news_items(event_id);

CREATE INDEX IF NOT EXISTS idx_politics_elections_date ON politics_elections(election_date);
CREATE INDEX IF NOT EXISTS idx_politics_elections_country ON politics_elections(country);
CREATE INDEX IF NOT EXISTS idx_politics_elections_status ON politics_elections(status);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE politics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE politics_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE politics_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE politics_elections ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Politics events viewable by everyone" ON politics_events
    FOR SELECT USING (is_active = true);

CREATE POLICY "Politics entities viewable by everyone" ON politics_entities
    FOR SELECT USING (is_active = true);

CREATE POLICY "Politics news viewable by everyone" ON politics_news_items
    FOR SELECT USING (true);

CREATE POLICY "Politics elections viewable by everyone" ON politics_elections
    FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages politics events" ON politics_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages politics entities" ON politics_entities
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages politics news" ON politics_news_items
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages elections" ON politics_elections
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_politics_events_updated_at
    BEFORE UPDATE ON politics_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_politics_entities_updated_at
    BEFORE UPDATE ON politics_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_politics_elections_updated_at
    BEFORE UPDATE ON politics_elections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get upcoming elections
CREATE OR REPLACE FUNCTION get_upcoming_elections(
    p_country VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    election_type VARCHAR,
    country VARCHAR,
    election_date DATE,
    candidates JSONB,
    current_polls JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pe.id,
        pe.title,
        pe.election_type,
        pe.country,
        pe.election_date,
        pe.candidates,
        pe.current_polls
    FROM politics_elections pe
    WHERE pe.status = 'upcoming'
    AND pe.election_date >= CURRENT_DATE
    AND (p_country IS NULL OR pe.country = p_country)
    ORDER BY pe.election_date ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trending political topics
CREATE OR REPLACE FUNCTION get_trending_politics(
    p_hours INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    entity_name VARCHAR,
    mention_count BIGINT,
    avg_sentiment DECIMAL,
    countries TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pe.name AS entity_name,
        COUNT(pni.id) AS mention_count,
        AVG(mdi.sentiment_score) AS avg_sentiment,
        ARRAY_AGG(DISTINCT unnest(pni.countries_mentioned)) AS countries
    FROM politics_entities pe
    JOIN politics_news_items pni ON pe.id = ANY(pni.entity_ids)
    JOIN market_data_items mdi ON pni.data_item_id = mdi.id
    WHERE mdi.published_at >= NOW() - (p_hours || ' hours')::INTERVAL
    GROUP BY pe.id, pe.name
    ORDER BY mention_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE politics_events IS 'Political events from GDELT and other sources';
COMMENT ON TABLE politics_entities IS 'Politicians, parties, governments, and organizations';
COMMENT ON TABLE politics_news_items IS 'Junction table linking news to political events/entities';
COMMENT ON TABLE politics_elections IS 'Upcoming and past elections worldwide';
