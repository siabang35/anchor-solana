-- ============================================================
-- Market Data Schema for ExoDuZe AI Agent Competition
-- Unified schema for all market categories (non-sports)
-- Migration: 037_market_data_schema.sql
-- ============================================================

-- ========================
-- ENUM Types for Market Categories
-- ========================

-- Market category types
DO $$ BEGIN
    CREATE TYPE market_category_type AS ENUM (
        'politics',
        'finance',
        'tech',
        'crypto',
        'economy',
        'science',
        'signals',
        'latest'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Data source types for market data
DO $$ BEGIN
    CREATE TYPE market_data_source_type AS ENUM (
        'newsapi',
        'gdelt',
        'alpha_vantage',
        'coingecko',
        'coinmarketcap',
        'cryptopanic',
        'hackernews',
        'worldbank',
        'imf',
        'semantic_scholar',
        'arxiv',
        'crossref',
        'pubmed',
        'rss',
        'manual',
        'etl_orchestrator'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Content type enum
DO $$ BEGIN
    CREATE TYPE market_content_type AS ENUM (
        'news',
        'event',
        'indicator',
        'price',
        'research',
        'signal',
        'trend',
        'forecast'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Impact level enum
DO $$ BEGIN
    CREATE TYPE impact_level AS ENUM (
        'low',
        'medium',
        'high',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Sentiment enum
DO $$ BEGIN
    CREATE TYPE sentiment_type AS ENUM (
        'bearish',
        'neutral',
        'bullish'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Sync status enum (may already exist from sports migration)
DO $$ BEGIN
    CREATE TYPE sync_status AS ENUM (
        'pending',
        'running',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================
-- Data Source Configuration Table
-- ========================
CREATE TABLE IF NOT EXISTS market_data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type market_data_source_type NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_url TEXT NOT NULL,
    
    -- API Configuration
    api_key_env_var VARCHAR(100), -- Environment variable name for API key
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 1000,
    
    -- Request tracking
    requests_today INTEGER DEFAULT 0,
    requests_this_minute INTEGER DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_healthy BOOLEAN NOT NULL DEFAULT true,
    last_error TEXT,
    last_success_at TIMESTAMPTZ,
    
    -- Categories this source supports
    supported_categories market_category_type[] DEFAULT '{}',
    
    -- Metadata
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(source_type, name)
);

-- ========================
-- Unified Market Data Items Table
-- ========================
CREATE TABLE IF NOT EXISTS market_data_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,
    source market_data_source_type NOT NULL,
    category market_category_type NOT NULL,
    content_type market_content_type NOT NULL DEFAULT 'news',
    
    -- Core content
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    summary TEXT,
    
    -- URLs and media
    url TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    
    -- Source attribution
    source_name VARCHAR(200),
    author VARCHAR(200),
    
    -- Temporal data
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Classification
    tags TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    entities JSONB DEFAULT '[]', -- Named entities extracted
    
    -- Scoring and analysis
    impact impact_level DEFAULT 'medium',
    sentiment sentiment_type DEFAULT 'neutral',
    sentiment_score DECIMAL(5,4), -- -1.0 to 1.0
    relevance_score DECIMAL(5,4) DEFAULT 0.5,
    confidence_score DECIMAL(5,4) DEFAULT 0.5,
    
    -- Market potential
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID, -- Link to generated market if any
    
    -- Deduplication
    content_hash VARCHAR(64), -- SHA256 of normalized content
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES market_data_items(id),
    
    -- Status
    is_processed BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    processing_errors TEXT[],
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    raw_response JSONB, -- Original API response (for debugging)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(external_id, source)
);

-- ========================
-- Market Data Sync Logs
-- ========================
CREATE TABLE IF NOT EXISTS market_data_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source market_data_source_type NOT NULL,
    category market_category_type,
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'live'
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Results
    status sync_status NOT NULL DEFAULT 'pending',
    records_fetched INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    duplicates_found INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Request details
    request_url TEXT,
    request_params JSONB,
    response_status INTEGER,
    
    -- Metadata
    triggered_by VARCHAR(100) DEFAULT 'cron', -- 'cron', 'manual', 'webhook'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Rate Limit Tracking Table (for market data APIs)
-- ========================
CREATE TABLE IF NOT EXISTS market_api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source market_data_source_type NOT NULL,
    
    -- Time windows
    minute_window TIMESTAMPTZ NOT NULL,
    day_window DATE NOT NULL,
    
    -- Counts
    requests_in_minute INTEGER DEFAULT 0,
    requests_in_day INTEGER DEFAULT 0,
    
    -- Limits
    minute_limit INTEGER DEFAULT 60,
    day_limit INTEGER DEFAULT 1000,
    
    -- Status
    is_throttled BOOLEAN DEFAULT false,
    throttled_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(source, minute_window)
);

-- ========================
-- Market Generation Queue
-- ========================
CREATE TABLE IF NOT EXISTS market_generation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    category market_category_type NOT NULL,
    
    -- Generation status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'skipped'
    priority INTEGER DEFAULT 0,
    
    -- Generated market info
    generated_market_id UUID,
    generated_title TEXT,
    generated_question TEXT,
    
    -- Processing
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Indexes
-- ========================

-- Market data items indexes
CREATE INDEX IF NOT EXISTS idx_market_data_items_category ON market_data_items(category);
CREATE INDEX IF NOT EXISTS idx_market_data_items_source ON market_data_items(source);
CREATE INDEX IF NOT EXISTS idx_market_data_items_content_type ON market_data_items(content_type);
CREATE INDEX IF NOT EXISTS idx_market_data_items_published ON market_data_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_items_fetched ON market_data_items(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_items_impact ON market_data_items(impact);
CREATE INDEX IF NOT EXISTS idx_market_data_items_sentiment ON market_data_items(sentiment);
CREATE INDEX IF NOT EXISTS idx_market_data_items_active ON market_data_items(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_market_data_items_market_worthy ON market_data_items(is_market_worthy) WHERE is_market_worthy = true;
CREATE INDEX IF NOT EXISTS idx_market_data_items_external ON market_data_items(external_id, source);
CREATE INDEX IF NOT EXISTS idx_market_data_items_hash ON market_data_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_market_data_items_tags ON market_data_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_market_data_items_keywords ON market_data_items USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_market_data_items_title_search ON market_data_items USING GIN(to_tsvector('english', title));

-- Sync logs indexes
CREATE INDEX IF NOT EXISTS idx_market_sync_logs_source ON market_data_sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_market_sync_logs_category ON market_data_sync_logs(category);
CREATE INDEX IF NOT EXISTS idx_market_sync_logs_status ON market_data_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_market_sync_logs_started ON market_data_sync_logs(started_at DESC);

-- Rate limits indexes
CREATE INDEX IF NOT EXISTS idx_market_api_rate_limits_source ON market_api_rate_limits(source);
CREATE INDEX IF NOT EXISTS idx_market_api_rate_limits_throttled ON market_api_rate_limits(is_throttled) WHERE is_throttled = true;

-- Generation queue indexes
CREATE INDEX IF NOT EXISTS idx_market_gen_queue_status ON market_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_market_gen_queue_priority ON market_generation_queue(priority DESC, created_at ASC);

-- ========================
-- Row Level Security (RLS)
-- ========================

-- Enable RLS
ALTER TABLE market_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_generation_queue ENABLE ROW LEVEL SECURITY;

-- Data sources: Service role only
CREATE POLICY "Only service role can manage data sources" ON market_data_sources
    FOR ALL USING (auth.role() = 'service_role');

-- Market data items: Public read, service role manage
CREATE POLICY "Market data items are viewable by everyone" ON market_data_items
    FOR SELECT USING (is_active = true);

CREATE POLICY "Only service role can manage market data items" ON market_data_items
    FOR ALL USING (auth.role() = 'service_role');

-- Sync logs: Service role only
CREATE POLICY "Only service role can access sync logs" ON market_data_sync_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Rate limits: Service role only
CREATE POLICY "Only service role can access rate limits" ON market_api_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- Generation queue: Service role only
CREATE POLICY "Only service role can access generation queue" ON market_generation_queue
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Updated At Triggers
-- ========================

CREATE TRIGGER update_market_data_sources_updated_at
    BEFORE UPDATE ON market_data_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_data_items_updated_at
    BEFORE UPDATE ON market_data_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_api_rate_limits_updated_at
    BEFORE UPDATE ON market_api_rate_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_generation_queue_updated_at
    BEFORE UPDATE ON market_generation_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Function to check rate limit for a source
-- Create or replace this function AFTER tables are created
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_source TEXT
)
RETURNS TABLE (
    can_proceed BOOLEAN,
    requests_remaining_minute INTEGER,
    requests_remaining_day INTEGER,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_minute_window TIMESTAMPTZ;
    v_day_window DATE;
    v_minute_count INTEGER;
    v_day_count INTEGER;
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
BEGIN
    v_minute_window := date_trunc('minute', NOW());
    v_day_window := CURRENT_DATE;
    
    -- Get current counts
    SELECT 
        COALESCE(SUM(requests_in_minute), 0),
        COALESCE(SUM(requests_in_day), 0),
        COALESCE(MAX(minute_limit), 60),
        COALESCE(MAX(day_limit), 1000)
    INTO v_minute_count, v_day_count, v_minute_limit, v_day_limit
    FROM market_api_rate_limits arl
    WHERE arl.source::TEXT = p_source
    AND (arl.minute_window = v_minute_window OR arl.day_window = v_day_window);
    
    RETURN QUERY SELECT
        (COALESCE(v_minute_count, 0) < v_minute_limit AND COALESCE(v_day_count, 0) < v_day_limit) AS can_proceed,
        GREATEST(0, v_minute_limit - COALESCE(v_minute_count, 0)) AS requests_remaining_minute,
        GREATEST(0, v_day_limit - COALESCE(v_day_count, 0)) AS requests_remaining_day,
        CASE 
            WHEN COALESCE(v_minute_count, 0) >= v_minute_limit THEN 60
            WHEN COALESCE(v_day_count, 0) >= v_day_limit THEN 
                EXTRACT(EPOCH FROM (v_day_window + INTERVAL '1 day' - NOW()))::INTEGER
            ELSE 0
        END AS retry_after_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment rate limit counter
CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_source TEXT
)
RETURNS VOID AS $$
DECLARE
    v_minute_window TIMESTAMPTZ;
    v_day_window DATE;
BEGIN
    v_minute_window := date_trunc('minute', NOW());
    v_day_window := CURRENT_DATE;
    
    INSERT INTO market_api_rate_limits (source, minute_window, day_window, requests_in_minute, requests_in_day)
    VALUES (p_source::market_data_source_type, v_minute_window, v_day_window, 1, 1)
    ON CONFLICT (source, minute_window) 
    DO UPDATE SET 
        requests_in_minute = market_api_rate_limits.requests_in_minute + 1,
        requests_in_day = CASE 
            WHEN market_api_rate_limits.day_window = v_day_window 
            THEN market_api_rate_limits.requests_in_day + 1
            ELSE 1
        END,
        day_window = v_day_window,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get latest items by category
CREATE OR REPLACE FUNCTION get_market_data_by_category(
    p_category TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    source_name VARCHAR,
    published_at TIMESTAMPTZ,
    impact impact_level,
    sentiment sentiment_type,
    image_url TEXT,
    url TEXT,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mdi.id,
        mdi.title,
        mdi.description,
        mdi.source_name,
        mdi.published_at,
        mdi.impact,
        mdi.sentiment,
        mdi.image_url,
        mdi.url,
        mdi.tags
    FROM market_data_items mdi
    WHERE mdi.category::TEXT = p_category
    AND mdi.is_active = true
    AND mdi.is_duplicate = false
    AND (p_content_type IS NULL OR mdi.content_type::TEXT = p_content_type)
    ORDER BY mdi.published_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate content hash for deduplication (standalone utility)
CREATE OR REPLACE FUNCTION generate_content_hash(
    p_title TEXT,
    p_source TEXT
)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(
        sha256(
            (LOWER(TRIM(REGEXP_REPLACE(p_title, '[^a-zA-Z0-9]', '', 'g'))) || '::' || p_source)::bytea
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Note: Content hash is generated in application code before insert
-- This avoids PostgreSQL trigger validation issues

-- ========================
-- Insert Default Data Sources
-- ========================

INSERT INTO market_data_sources (source_type, name, base_url, api_key_env_var, rate_limit_per_minute, rate_limit_per_day, supported_categories)
VALUES 
    ('newsapi', 'NewsAPI', 'https://newsapi.org/v2', 'NEWSAPI_KEY', 100, 1000, ARRAY['politics', 'finance', 'tech', 'latest']::market_category_type[]),
    ('gdelt', 'GDELT Project', 'https://api.gdeltproject.org/api/v2', NULL, 60, 10000, ARRAY['politics', 'economy', 'signals']::market_category_type[]),
    ('alpha_vantage', 'Alpha Vantage', 'https://www.alphavantage.co', 'ALPHA_VANTAGE_API_KEY', 5, 500, ARRAY['finance']::market_category_type[]),
    ('coingecko', 'CoinGecko', 'https://api.coingecko.com/api/v3', NULL, 50, 10000, ARRAY['crypto']::market_category_type[]),
    ('coinmarketcap', 'CoinMarketCap', 'https://pro-api.coinmarketcap.com/v1', 'COINMARKETCAP_API_KEY', 30, 10000, ARRAY['crypto']::market_category_type[]),
    ('cryptopanic', 'CryptoPanic', 'https://cryptopanic.com/api/v1', 'CRYPTOPANIC_API_KEY', 60, 1000, ARRAY['crypto']::market_category_type[]),
    ('hackernews', 'HackerNews', 'https://hacker-news.firebaseio.com/v0', NULL, 100, 100000, ARRAY['tech', 'signals']::market_category_type[]),
    ('worldbank', 'World Bank', 'https://api.worldbank.org/v2', NULL, 60, 10000, ARRAY['economy']::market_category_type[]),
    ('arxiv', 'arXiv', 'http://export.arxiv.org/api', NULL, 60, 10000, ARRAY['science']::market_category_type[]),
    ('pubmed', 'PubMed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils', NULL, 10, 1000, ARRAY['science']::market_category_type[]),
    ('semantic_scholar', 'Semantic Scholar', 'https://api.semanticscholar.org/graph/v1', NULL, 100, 5000, ARRAY['science']::market_category_type[])
ON CONFLICT (source_type, name) DO NOTHING;

-- ========================
-- Comments
-- ========================

COMMENT ON TABLE market_data_sources IS 'Configuration and tracking for external data sources';
COMMENT ON TABLE market_data_items IS 'Unified storage for all market-related data items from various sources';
COMMENT ON TABLE market_data_sync_logs IS 'Audit trail for ETL sync operations';
COMMENT ON TABLE market_api_rate_limits IS 'Rate limit tracking to prevent API throttling';

-- ========================
-- Indexes for Performance
-- ========================
CREATE INDEX IF NOT EXISTS idx_market_data_items_category ON market_data_items(category);
CREATE INDEX IF NOT EXISTS idx_market_data_items_published ON market_data_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_items_source ON market_data_items(source);
CREATE INDEX IF NOT EXISTS idx_market_data_items_active ON market_data_items(is_active, is_duplicate);
CREATE INDEX IF NOT EXISTS idx_market_data_sync_logs_source ON market_data_sync_logs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_generation_queue_status ON market_generation_queue(status, priority DESC);

COMMENT ON COLUMN market_data_items.content_hash IS 'SHA256 hash for deduplication';
COMMENT ON COLUMN market_data_items.is_market_worthy IS 'Whether this item could generate an AI agent competition';
COMMENT ON COLUMN market_data_items.relevance_score IS 'AI-computed relevance score 0-1';
