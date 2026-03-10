-- ============================================================
-- Tech Data Schema for ExoDuZe AI Agent Competition
-- Tables for technology trends, products, and companies
-- Migration: 040_tech_data.sql
-- ============================================================

-- ========================
-- Tech Companies Table
-- ========================
CREATE TABLE IF NOT EXISTS tech_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type DEFAULT 'hackernews',
    
    -- Company info
    name VARCHAR(300) NOT NULL,
    name_slug VARCHAR(200),
    description TEXT,
    tagline VARCHAR(500),
    
    -- Classification
    category VARCHAR(100), -- 'ai', 'saas', 'fintech', 'gaming', 'hardware'
    subcategory VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    
    -- Links
    website_url TEXT,
    twitter_handle VARCHAR(100),
    github_url TEXT,
    linkedin_url TEXT,
    
    -- Funding
    funding_stage VARCHAR(50), -- 'seed', 'series_a', 'series_b', 'ipo', 'acquired'
    total_funding DECIMAL(20,2),
    valuation DECIMAL(20,2),
    last_funding_date DATE,
    
    -- Location
    headquarters VARCHAR(200),
    country VARCHAR(100),
    
    -- Status
    founded_year INTEGER,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    stock_symbol VARCHAR(20),
    
    -- Analytics
    mention_count INTEGER DEFAULT 0,
    sentiment_avg DECIMAL(5,4),
    trending_score DECIMAL(5,4) DEFAULT 0,
    
    -- Metadata
    logo_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name_slug)
);

-- ========================
-- Tech Products Table
-- ========================
CREATE TABLE IF NOT EXISTS tech_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type DEFAULT 'hackernews',
    
    -- Product info
    name VARCHAR(300) NOT NULL,
    tagline VARCHAR(500),
    description TEXT,
    
    -- Relations
    company_id UUID REFERENCES tech_companies(id) ON DELETE SET NULL,
    
    -- Classification
    product_type VARCHAR(100), -- 'app', 'service', 'hardware', 'ai_model', 'framework'
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    
    -- Launch info
    launch_date DATE,
    launch_status VARCHAR(50) DEFAULT 'launched', -- 'announced', 'beta', 'launched', 'discontinued'
    
    -- Links
    product_url TEXT,
    demo_url TEXT,
    github_url TEXT,
    documentation_url TEXT,
    
    -- Pricing
    pricing_model VARCHAR(50), -- 'free', 'freemium', 'paid', 'enterprise'
    
    -- Traction
    upvotes INTEGER DEFAULT 0,
    reviews_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2),
    
    -- Market potential
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    logo_url TEXT,
    screenshot_urls TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name, company_id)
);

-- ========================
-- Tech Trends Table
-- ========================
CREATE TABLE IF NOT EXISTS tech_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Trend info
    name VARCHAR(300) NOT NULL,
    slug VARCHAR(200),
    description TEXT,
    
    -- Classification
    trend_type VARCHAR(100), -- 'technology', 'framework', 'methodology', 'platform'
    category VARCHAR(100),
    
    -- Metrics
    popularity_score DECIMAL(5,4) DEFAULT 0.5,
    growth_rate DECIMAL(10,4), -- Percentage growth
    momentum sentiment_type DEFAULT 'neutral',
    
    -- Temporal
    first_seen_at DATE,
    peak_date DATE,
    
    -- Related
    related_technologies TEXT[] DEFAULT '{}',
    competing_technologies TEXT[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    trend_status VARCHAR(50) DEFAULT 'emerging', -- 'emerging', 'growing', 'mature', 'declining'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(slug)
);

-- ========================
-- HackerNews Stories Table
-- ========================
CREATE TABLE IF NOT EXISTS tech_hn_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hn_id BIGINT NOT NULL UNIQUE,
    
    -- Story info
    title TEXT NOT NULL,
    url TEXT,
    text TEXT, -- For Ask HN, Show HN
    
    -- Author
    author VARCHAR(100),
    
    -- Metrics
    score INTEGER DEFAULT 0,
    descendants INTEGER DEFAULT 0, -- Comment count
    
    -- Classification
    story_type VARCHAR(50) DEFAULT 'story', -- 'story', 'ask', 'show', 'job', 'poll'
    
    -- Temporal
    hn_time BIGINT, -- Unix timestamp from HN
    published_at TIMESTAMPTZ,
    
    -- Analysis
    sentiment sentiment_type DEFAULT 'neutral',
    is_tech_related BOOLEAN DEFAULT true,
    extracted_topics TEXT[] DEFAULT '{}',
    
    -- Market potential
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- GitHub Trending Table
-- ========================
CREATE TABLE IF NOT EXISTS tech_github_trending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Repo info
    repo_name VARCHAR(200) NOT NULL,
    repo_full_name VARCHAR(400) NOT NULL,
    repo_url TEXT NOT NULL,
    
    -- Description
    description TEXT,
    language VARCHAR(100),
    
    -- Metrics
    stars INTEGER DEFAULT 0,
    stars_today INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    watchers INTEGER DEFAULT 0,
    
    -- Trending
    trending_rank INTEGER,
    trending_since DATE,
    
    -- Classification
    topics TEXT[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(repo_full_name, trending_since)
);

-- ========================
-- Tech News Junction
-- ========================
CREATE TABLE IF NOT EXISTS tech_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    
    -- Related entities
    company_ids UUID[] DEFAULT '{}',
    product_ids UUID[] DEFAULT '{}',
    trend_ids UUID[] DEFAULT '{}',
    
    -- Tech-specific
    tech_categories TEXT[] DEFAULT '{}',
    programming_languages TEXT[] DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_tech_companies_category ON tech_companies(category);
CREATE INDEX IF NOT EXISTS idx_tech_companies_name ON tech_companies USING GIN(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_tech_companies_trending ON tech_companies(trending_score DESC);

CREATE INDEX IF NOT EXISTS idx_tech_products_company ON tech_products(company_id);
CREATE INDEX IF NOT EXISTS idx_tech_products_category ON tech_products(category);
CREATE INDEX IF NOT EXISTS idx_tech_products_launch_date ON tech_products(launch_date DESC);

CREATE INDEX IF NOT EXISTS idx_tech_trends_popularity ON tech_trends(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_tech_trends_status ON tech_trends(trend_status);

CREATE INDEX IF NOT EXISTS idx_tech_hn_score ON tech_hn_stories(score DESC);
CREATE INDEX IF NOT EXISTS idx_tech_hn_published ON tech_hn_stories(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_hn_type ON tech_hn_stories(story_type);

CREATE INDEX IF NOT EXISTS idx_tech_github_stars ON tech_github_trending(stars_today DESC);
CREATE INDEX IF NOT EXISTS idx_tech_github_language ON tech_github_trending(language);

CREATE INDEX IF NOT EXISTS idx_tech_news_data_item ON tech_news_items(data_item_id);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE tech_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_hn_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_github_trending ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_news_items ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Tech companies viewable by all" ON tech_companies FOR SELECT USING (is_active = true);
CREATE POLICY "Tech products viewable by all" ON tech_products FOR SELECT USING (is_active = true);
CREATE POLICY "Tech trends viewable by all" ON tech_trends FOR SELECT USING (is_active = true);
CREATE POLICY "Tech HN stories viewable by all" ON tech_hn_stories FOR SELECT USING (true);
CREATE POLICY "Tech GitHub trending viewable by all" ON tech_github_trending FOR SELECT USING (is_active = true);
CREATE POLICY "Tech news viewable by all" ON tech_news_items FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages tech companies" ON tech_companies FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages tech products" ON tech_products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages tech trends" ON tech_trends FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages tech HN" ON tech_hn_stories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages tech GitHub" ON tech_github_trending FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages tech news" ON tech_news_items FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_tech_companies_updated_at
    BEFORE UPDATE ON tech_companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tech_products_updated_at
    BEFORE UPDATE ON tech_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tech_trends_updated_at
    BEFORE UPDATE ON tech_trends FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tech_hn_updated_at
    BEFORE UPDATE ON tech_hn_stories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tech_github_updated_at
    BEFORE UPDATE ON tech_github_trending FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get top HackerNews stories
CREATE OR REPLACE FUNCTION get_top_hn_stories(
    p_story_type VARCHAR DEFAULT NULL,
    p_hours INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
    id UUID,
    hn_id BIGINT,
    title TEXT,
    url TEXT,
    score INTEGER,
    descendants INTEGER,
    author VARCHAR,
    published_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ths.id,
        ths.hn_id,
        ths.title,
        ths.url,
        ths.score,
        ths.descendants,
        ths.author,
        ths.published_at
    FROM tech_hn_stories ths
    WHERE (p_story_type IS NULL OR ths.story_type = p_story_type)
    AND ths.published_at >= NOW() - (p_hours || ' hours')::INTERVAL
    ORDER BY ths.score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trending technologies
CREATE OR REPLACE FUNCTION get_trending_tech(
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    name VARCHAR,
    trend_type VARCHAR,
    popularity_score DECIMAL,
    momentum sentiment_type,
    trend_status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tt.name,
        tt.trend_type,
        tt.popularity_score,
        tt.momentum,
        tt.trend_status
    FROM tech_trends tt
    WHERE tt.is_active = true
    ORDER BY tt.popularity_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE tech_companies IS 'Technology companies and startups';
COMMENT ON TABLE tech_products IS 'Tech products and services';
COMMENT ON TABLE tech_trends IS 'Technology trends and emerging technologies';
COMMENT ON TABLE tech_hn_stories IS 'HackerNews top stories';
COMMENT ON TABLE tech_github_trending IS 'GitHub trending repositories';
COMMENT ON TABLE tech_news_items IS 'Tech-specific news junction table';
