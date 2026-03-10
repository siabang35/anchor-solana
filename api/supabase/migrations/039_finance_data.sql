-- ============================================================
-- Finance Data Schema for ExoDuZe AI Agent Competition
-- Tables for financial indicators, stocks, and economic data
-- Migration: 039_finance_data.sql
-- ============================================================

-- ========================
-- Finance Indicators Table
-- ========================
CREATE TABLE IF NOT EXISTS finance_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type NOT NULL DEFAULT 'alpha_vantage',
    
    -- Indicator details
    indicator_type VARCHAR(100) NOT NULL, -- 'interest_rate', 'inflation', 'gdp', 'unemployment', 'cpi'
    name VARCHAR(300) NOT NULL,
    symbol VARCHAR(50),
    description TEXT,
    
    -- Location
    country VARCHAR(100) DEFAULT 'US',
    country_code VARCHAR(10) DEFAULT 'USA',
    region VARCHAR(100),
    
    -- Current value
    current_value DECIMAL(20,6),
    previous_value DECIMAL(20,6),
    change_value DECIMAL(20,6),
    change_percent DECIMAL(10,4),
    
    -- Historical
    value_date DATE,
    period VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    
    -- Expectations
    forecast_value DECIMAL(20,6),
    consensus_value DECIMAL(20,6),
    
    -- Impact
    market_impact impact_level DEFAULT 'medium',
    direction VARCHAR(20), -- 'up', 'down', 'unchanged'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    next_release TIMESTAMPTZ,
    
    -- Metadata
    unit VARCHAR(50), -- 'percent', 'billions', 'index'
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(indicator_type, country, value_date)
);

-- ========================
-- Finance Stocks Table
-- ========================
CREATE TABLE IF NOT EXISTS finance_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    source market_data_source_type NOT NULL DEFAULT 'alpha_vantage',
    
    -- Company info
    name VARCHAR(300) NOT NULL,
    exchange VARCHAR(50), -- 'NYSE', 'NASDAQ', 'LSE'
    sector VARCHAR(100),
    industry VARCHAR(200),
    
    -- Current data
    price DECIMAL(20,6),
    open DECIMAL(20,6),
    high DECIMAL(20,6),
    low DECIMAL(20,6),
    close DECIMAL(20,6),
    volume BIGINT,
    
    -- Changes
    change DECIMAL(20,6),
    change_percent DECIMAL(10,4),
    
    -- Valuation
    market_cap DECIMAL(20,2),
    pe_ratio DECIMAL(10,4),
    eps DECIMAL(10,4),
    dividend_yield DECIMAL(10,4),
    
    -- 52-week
    week_52_high DECIMAL(20,6),
    week_52_low DECIMAL(20,6),
    
    -- Timestamps
    last_trade_time TIMESTAMPTZ,
    market_status VARCHAR(20) DEFAULT 'closed', -- 'open', 'closed', 'pre', 'post'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_watchlist BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(symbol, exchange)
);

-- ========================
-- Finance Price History
-- ========================
CREATE TABLE IF NOT EXISTS finance_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID REFERENCES finance_stocks(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    
    -- Price data
    date DATE NOT NULL,
    open DECIMAL(20,6),
    high DECIMAL(20,6),
    low DECIMAL(20,6),
    close DECIMAL(20,6),
    adjusted_close DECIMAL(20,6),
    volume BIGINT,
    
    -- Technical
    sma_20 DECIMAL(20,6),
    sma_50 DECIMAL(20,6),
    sma_200 DECIMAL(20,6),
    rsi DECIMAL(10,4),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(symbol, date)
);

-- ========================
-- Finance Economic Calendar
-- ========================
CREATE TABLE IF NOT EXISTS finance_economic_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type DEFAULT 'alpha_vantage',
    
    -- Event details
    event_name VARCHAR(500) NOT NULL,
    event_type VARCHAR(100), -- 'fomc', 'jobs_report', 'earnings', 'gdp'
    country VARCHAR(100) DEFAULT 'US',
    
    -- Timing
    event_datetime TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT false,
    
    -- Values
    actual_value VARCHAR(100),
    forecast_value VARCHAR(100),
    previous_value VARCHAR(100),
    
    -- Impact
    importance impact_level DEFAULT 'medium',
    
    -- Status
    status VARCHAR(50) DEFAULT 'upcoming', -- 'upcoming', 'released', 'revised'
    
    -- Market
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(event_name, event_datetime, country)
);

-- ========================
-- Finance News Junction
-- ========================
CREATE TABLE IF NOT EXISTS finance_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    
    -- Related entities
    stock_symbols TEXT[] DEFAULT '{}',
    indicator_types TEXT[] DEFAULT '{}',
    
    -- Finance-specific
    financial_impact impact_level DEFAULT 'medium',
    market_sentiment sentiment_type DEFAULT 'neutral',
    price_target DECIMAL(20,6),
    recommendation VARCHAR(50), -- 'buy', 'hold', 'sell'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_finance_indicators_type ON finance_indicators(indicator_type);
CREATE INDEX IF NOT EXISTS idx_finance_indicators_country ON finance_indicators(country);
CREATE INDEX IF NOT EXISTS idx_finance_indicators_date ON finance_indicators(value_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_indicators_active ON finance_indicators(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_finance_stocks_symbol ON finance_stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_finance_stocks_exchange ON finance_stocks(exchange);
CREATE INDEX IF NOT EXISTS idx_finance_stocks_sector ON finance_stocks(sector);
CREATE INDEX IF NOT EXISTS idx_finance_stocks_watchlist ON finance_stocks(is_watchlist) WHERE is_watchlist = true;

CREATE INDEX IF NOT EXISTS idx_finance_history_symbol ON finance_price_history(symbol);
CREATE INDEX IF NOT EXISTS idx_finance_history_date ON finance_price_history(date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_calendar_datetime ON finance_economic_calendar(event_datetime);
CREATE INDEX IF NOT EXISTS idx_finance_calendar_type ON finance_economic_calendar(event_type);
CREATE INDEX IF NOT EXISTS idx_finance_calendar_importance ON finance_economic_calendar(importance);

CREATE INDEX IF NOT EXISTS idx_finance_news_data_item ON finance_news_items(data_item_id);
CREATE INDEX IF NOT EXISTS idx_finance_news_symbols ON finance_news_items USING GIN(stock_symbols);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE finance_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_economic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_news_items ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Finance indicators viewable by all" ON finance_indicators FOR SELECT USING (is_active = true);
CREATE POLICY "Finance stocks viewable by all" ON finance_stocks FOR SELECT USING (is_active = true);
CREATE POLICY "Finance history viewable by all" ON finance_price_history FOR SELECT USING (true);
CREATE POLICY "Finance calendar viewable by all" ON finance_economic_calendar FOR SELECT USING (true);
CREATE POLICY "Finance news viewable by all" ON finance_news_items FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages finance indicators" ON finance_indicators FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages finance stocks" ON finance_stocks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages finance history" ON finance_price_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages finance calendar" ON finance_economic_calendar FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages finance news" ON finance_news_items FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_finance_indicators_updated_at
    BEFORE UPDATE ON finance_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_finance_stocks_updated_at
    BEFORE UPDATE ON finance_stocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_finance_calendar_updated_at
    BEFORE UPDATE ON finance_economic_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get upcoming economic events
CREATE OR REPLACE FUNCTION get_upcoming_economic_events(
    p_importance impact_level DEFAULT NULL,
    p_days INTEGER DEFAULT 7,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    event_name VARCHAR,
    event_type VARCHAR,
    country VARCHAR,
    event_datetime TIMESTAMPTZ,
    importance impact_level,
    forecast_value VARCHAR,
    previous_value VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fec.id,
        fec.event_name,
        fec.event_type,
        fec.country,
        fec.event_datetime,
        fec.importance,
        fec.forecast_value,
        fec.previous_value
    FROM finance_economic_calendar fec
    WHERE fec.event_datetime >= NOW()
    AND fec.event_datetime <= NOW() + (p_days || ' days')::INTERVAL
    AND (p_importance IS NULL OR fec.importance = p_importance)
    ORDER BY fec.event_datetime ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get latest indicator values
CREATE OR REPLACE FUNCTION get_latest_indicators(
    p_country VARCHAR DEFAULT 'US',
    p_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    indicator_type VARCHAR,
    name VARCHAR,
    current_value DECIMAL,
    previous_value DECIMAL,
    change_percent DECIMAL,
    value_date DATE,
    direction VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (fi.indicator_type)
        fi.indicator_type,
        fi.name,
        fi.current_value,
        fi.previous_value,
        fi.change_percent,
        fi.value_date,
        fi.direction
    FROM finance_indicators fi
    WHERE fi.country = p_country
    AND fi.is_active = true
    AND (p_types IS NULL OR fi.indicator_type = ANY(p_types))
    ORDER BY fi.indicator_type, fi.value_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE finance_indicators IS 'Economic indicators like interest rates, inflation, GDP';
COMMENT ON TABLE finance_stocks IS 'Stock prices and company information';
COMMENT ON TABLE finance_price_history IS 'Historical price data for stocks';
COMMENT ON TABLE finance_economic_calendar IS 'Upcoming economic events and releases';
COMMENT ON TABLE finance_news_items IS 'Finance-specific news linking to market data items';
