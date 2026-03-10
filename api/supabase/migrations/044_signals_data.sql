-- ============================================================
-- Signals Data Schema for ExoDuZe AI Agent Competition
-- Aggregated signals from all data sources
-- Migration: 044_signals_data.sql
-- ============================================================

-- ========================
-- Market Signals Table
-- ========================
CREATE TABLE IF NOT EXISTS market_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Signal info
    signal_type VARCHAR(100) NOT NULL, -- 'trend', 'alert', 'opportunity', 'risk', 'momentum'
    title TEXT NOT NULL,
    description TEXT,
    
    -- Category linking
    category market_category_type NOT NULL,
    subcategory VARCHAR(100),
    
    -- Source tracking
    source_type market_data_source_type,
    source_item_id UUID, -- Reference to original data item
    source_url TEXT,
    
    -- Scoring
    signal_strength DECIMAL(5,4) NOT NULL DEFAULT 0.5 CHECK (signal_strength >= 0 AND signal_strength <= 1),
    confidence_score DECIMAL(5,4) DEFAULT 0.5,
    relevance_score DECIMAL(5,4) DEFAULT 0.5,
    
    -- Impact
    impact impact_level DEFAULT 'medium',
    sentiment sentiment_type DEFAULT 'neutral',
    
    -- Temporal
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    
    -- Geographic/Market scope
    scope VARCHAR(50) DEFAULT 'global', -- 'global', 'regional', 'local'
    regions TEXT[] DEFAULT '{}',
    
    -- Related entities
    related_entities JSONB DEFAULT '[]', -- Can link to any category entities
    tags TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    
    -- Market potential
    is_market_worthy BOOLEAN DEFAULT false,
    market_potential_score DECIMAL(5,4) DEFAULT 0.5,
    suggested_market_title TEXT,
    suggested_market_question TEXT,
    
    -- Generated market
    market_id UUID,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    is_actioned BOOLEAN DEFAULT false, -- User/system acted on this signal
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Signal Aggregations Table
-- For real-time dashboard aggregates
-- ========================
CREATE TABLE IF NOT EXISTS signal_aggregations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Aggregation period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    period_type VARCHAR(20) NOT NULL, -- 'hourly', 'daily', 'weekly'
    
    -- Category
    category market_category_type NOT NULL,
    
    -- Counts
    total_signals INTEGER DEFAULT 0,
    high_impact_signals INTEGER DEFAULT 0,
    bullish_signals INTEGER DEFAULT 0,
    bearish_signals INTEGER DEFAULT 0,
    neutral_signals INTEGER DEFAULT 0,
    
    -- Averages
    avg_signal_strength DECIMAL(5,4),
    avg_confidence DECIMAL(5,4),
    
    -- Top signal of period
    top_signal_id UUID REFERENCES market_signals(id),
    
    -- Trend
    trend_direction VARCHAR(20), -- 'up', 'down', 'stable'
    trend_strength DECIMAL(5,4),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(period_start, period_type, category)
);

-- ========================
-- Signal Impact Scores
-- AI-computed impact scoring
-- ========================
CREATE TABLE IF NOT EXISTS signal_impact_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES market_signals(id) ON DELETE CASCADE,
    
    -- Scoring dimensions
    market_impact DECIMAL(5,4) DEFAULT 0.5, -- How much it affects markets
    temporal_urgency DECIMAL(5,4) DEFAULT 0.5, -- How time-sensitive
    prediction_value DECIMAL(5,4) DEFAULT 0.5, -- How useful for predictions
    novelty_score DECIMAL(5,4) DEFAULT 0.5, -- How new/unique
    
    -- Combined score
    composite_score DECIMAL(5,4) NOT NULL,
    
    -- Scoring method
    scoring_model VARCHAR(100) DEFAULT 'rule_based',
    model_version VARCHAR(50),
    
    -- Metadata
    scoring_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Trending Topics Table
-- Cross-category trending topics
-- ========================
CREATE TABLE IF NOT EXISTS trending_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Topic info
    topic TEXT NOT NULL,
    normalized_topic VARCHAR(200), -- Lowercase, cleaned
    
    -- Categories where trending
    categories market_category_type[] DEFAULT '{}',
    primary_category market_category_type,
    
    -- Trending metrics
    mention_count INTEGER DEFAULT 0,
    signal_count INTEGER DEFAULT 0,
    trend_score DECIMAL(5,4) DEFAULT 0.5,
    velocity DECIMAL(10,4), -- Growth rate
    
    -- Time window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    window_type VARCHAR(20) DEFAULT '24h', -- '1h', '24h', '7d'
    
    -- Sentiment
    avg_sentiment DECIMAL(5,4),
    sentiment_breakdown JSONB DEFAULT '{}', -- {"bullish": 0.4, "bearish": 0.3, "neutral": 0.3}
    
    -- Related signals
    top_signal_ids UUID[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    peak_position INTEGER, -- Highest rank achieved
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(normalized_topic, window_start, window_type)
);

-- ========================
-- Latest News View (Aggregated)
-- ========================
CREATE OR REPLACE VIEW latest_market_news AS
SELECT 
    mdi.id,
    mdi.category,
    mdi.title,
    mdi.description,
    mdi.source_name,
    mdi.url,
    mdi.image_url,
    mdi.published_at,
    mdi.impact,
    mdi.sentiment,
    mdi.tags
FROM market_data_items mdi
WHERE mdi.is_active = true
AND mdi.is_duplicate = false
AND mdi.content_type = 'news'
AND mdi.published_at >= NOW() - INTERVAL '48 hours'
ORDER BY mdi.published_at DESC;

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_signals_category ON market_signals(category);
CREATE INDEX IF NOT EXISTS idx_signals_type ON market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_strength ON market_signals(signal_strength DESC);
CREATE INDEX IF NOT EXISTS idx_signals_impact ON market_signals(impact);
CREATE INDEX IF NOT EXISTS idx_signals_detected ON market_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_active ON market_signals(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_signals_market_worthy ON market_signals(is_market_worthy) WHERE is_market_worthy = true;
CREATE INDEX IF NOT EXISTS idx_signals_tags ON market_signals USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_signal_agg_period ON signal_aggregations(period_start, period_type);
CREATE INDEX IF NOT EXISTS idx_signal_agg_category ON signal_aggregations(category);

CREATE INDEX IF NOT EXISTS idx_impact_scores_signal ON signal_impact_scores(signal_id);
CREATE INDEX IF NOT EXISTS idx_impact_scores_composite ON signal_impact_scores(composite_score DESC);

CREATE INDEX IF NOT EXISTS idx_trending_topics_score ON trending_topics(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_window ON trending_topics(window_start, window_type);
CREATE INDEX IF NOT EXISTS idx_trending_topics_categories ON trending_topics USING GIN(categories);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_impact_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Signals viewable by all" ON market_signals FOR SELECT USING (is_active = true);
CREATE POLICY "Signal aggregations viewable by all" ON signal_aggregations FOR SELECT USING (true);
CREATE POLICY "Impact scores viewable by all" ON signal_impact_scores FOR SELECT USING (true);
CREATE POLICY "Trending topics viewable by all" ON trending_topics FOR SELECT USING (is_active = true);

-- Service role management
CREATE POLICY "Service role manages signals" ON market_signals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages aggregations" ON signal_aggregations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages impact scores" ON signal_impact_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages trending topics" ON trending_topics FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_market_signals_updated_at
    BEFORE UPDATE ON market_signals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trending_topics_updated_at
    BEFORE UPDATE ON trending_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get top signals by category
CREATE OR REPLACE FUNCTION get_top_signals(
    p_category market_category_type DEFAULT NULL,
    p_hours INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    signal_type VARCHAR,
    title TEXT,
    category market_category_type,
    signal_strength DECIMAL,
    impact impact_level,
    sentiment sentiment_type,
    detected_at TIMESTAMPTZ,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ms.id,
        ms.signal_type,
        ms.title,
        ms.category,
        ms.signal_strength,
        ms.impact,
        ms.sentiment,
        ms.detected_at,
        ms.tags
    FROM market_signals ms
    WHERE ms.is_active = true
    AND ms.detected_at >= NOW() - (p_hours || ' hours')::INTERVAL
    AND (p_category IS NULL OR ms.category = p_category)
    ORDER BY ms.signal_strength DESC, ms.detected_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trending topics
CREATE OR REPLACE FUNCTION get_trending_now(
    p_window_type VARCHAR DEFAULT '24h',
    p_category market_category_type DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    topic TEXT,
    categories market_category_type[],
    trend_score DECIMAL,
    mention_count INTEGER,
    avg_sentiment DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tt.topic,
        tt.categories,
        tt.trend_score,
        tt.mention_count,
        tt.avg_sentiment
    FROM trending_topics tt
    WHERE tt.is_active = true
    AND tt.window_type = p_window_type
    AND tt.window_end >= NOW()
    AND (p_category IS NULL OR p_category = ANY(tt.categories))
    ORDER BY tt.trend_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get signal summary by category
CREATE OR REPLACE FUNCTION get_signal_summary()
RETURNS TABLE (
    category market_category_type,
    total_signals BIGINT,
    high_impact_signals BIGINT,
    avg_strength DECIMAL,
    bullish_percent DECIMAL,
    bearish_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ms.category,
        COUNT(*) AS total_signals,
        COUNT(*) FILTER (WHERE ms.impact = 'high' OR ms.impact = 'critical') AS high_impact_signals,
        AVG(ms.signal_strength) AS avg_strength,
        (COUNT(*) FILTER (WHERE ms.sentiment = 'bullish')::DECIMAL / NULLIF(COUNT(*), 0) * 100) AS bullish_percent,
        (COUNT(*) FILTER (WHERE ms.sentiment = 'bearish')::DECIMAL / NULLIF(COUNT(*), 0) * 100) AS bearish_percent
    FROM market_signals ms
    WHERE ms.is_active = true
    AND ms.detected_at >= NOW() - INTERVAL '24 hours'
    GROUP BY ms.category
    ORDER BY total_signals DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate signal from data item
CREATE OR REPLACE FUNCTION generate_signal_from_item(
    p_item_id UUID,
    p_signal_type VARCHAR DEFAULT 'trend'
)
RETURNS UUID AS $$
DECLARE
    v_signal_id UUID;
    v_item RECORD;
BEGIN
    -- Get data item
    SELECT * INTO v_item FROM market_data_items WHERE id = p_item_id;
    
    IF v_item IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Create signal
    INSERT INTO market_signals (
        signal_type,
        title,
        description,
        category,
        source_type,
        source_item_id,
        source_url,
        signal_strength,
        confidence_score,
        impact,
        sentiment,
        tags,
        keywords
    ) VALUES (
        p_signal_type,
        v_item.title,
        v_item.description,
        v_item.category,
        v_item.source,
        v_item.id,
        v_item.url,
        v_item.relevance_score,
        v_item.confidence_score,
        v_item.impact,
        v_item.sentiment,
        v_item.tags,
        v_item.keywords
    )
    RETURNING id INTO v_signal_id;
    
    RETURN v_signal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE market_signals IS 'Aggregated signals from all market categories';
COMMENT ON TABLE signal_aggregations IS 'Periodic aggregations for dashboard metrics';
COMMENT ON TABLE signal_impact_scores IS 'AI-computed impact scoring for signals';
COMMENT ON TABLE trending_topics IS 'Cross-category trending topics';
COMMENT ON VIEW latest_market_news IS 'Aggregated view of latest news across categories';
