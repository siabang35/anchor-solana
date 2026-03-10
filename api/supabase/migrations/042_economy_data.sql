-- ============================================================
-- Economy Data Schema for ExoDuZe AI Agent Competition
-- Tables for global economic indicators and country data
-- Migration: 042_economy_data.sql
-- ============================================================

-- ========================
-- Economy Countries Table
-- ========================
CREATE TABLE IF NOT EXISTS economy_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Country info
    iso_code VARCHAR(3) NOT NULL UNIQUE, -- ISO 3166-1 alpha-3
    iso_code_2 VARCHAR(2), -- ISO 3166-1 alpha-2
    name VARCHAR(200) NOT NULL,
    name_official VARCHAR(300),
    
    -- Classification
    region VARCHAR(100), -- 'North America', 'Europe', 'Asia Pacific'
    income_group VARCHAR(100), -- 'High income', 'Upper middle income', 'Lower middle income', 'Low income'
    
    -- Current indicators
    gdp DECIMAL(20,2), -- Current GDP in USD
    gdp_per_capita DECIMAL(20,2),
    gdp_growth DECIMAL(10,4),
    inflation DECIMAL(10,4),
    unemployment DECIMAL(10,4),
    population BIGINT,
    
    -- Currency
    currency_code VARCHAR(10),
    currency_name VARCHAR(100),
    
    -- Trade
    exports DECIMAL(20,2),
    imports DECIMAL(20,2),
    trade_balance DECIMAL(20,2),
    
    -- Debt
    debt_to_gdp DECIMAL(10,4),
    external_debt DECIMAL(20,2),
    
    -- Ratings
    credit_rating VARCHAR(20), -- S&P or Moody's
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_major_economy BOOLEAN DEFAULT false,
    
    -- Last update
    data_year INTEGER,
    last_updated TIMESTAMPTZ,
    
    -- Metadata
    flag_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Economy Indicators Table (World Bank/IMF Data)
-- ========================
CREATE TABLE IF NOT EXISTS economy_global_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type DEFAULT 'worldbank',
    
    -- Indicator info
    indicator_code VARCHAR(100) NOT NULL, -- World Bank indicator code
    indicator_name VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Country
    country_id UUID REFERENCES economy_countries(id) ON DELETE SET NULL,
    country_code VARCHAR(3),
    
    -- Value
    value DECIMAL(30,6),
    unit VARCHAR(100),
    scale VARCHAR(50), -- 'millions', 'billions', 'percent'
    
    -- Temporal
    year INTEGER NOT NULL,
    period VARCHAR(20) DEFAULT 'annual', -- 'annual', 'quarterly', 'monthly'
    
    -- Comparison
    previous_value DECIMAL(30,6),
    change_percent DECIMAL(10,4),
    
    -- Classification
    topic VARCHAR(200), -- 'Economic Growth', 'Trade', 'Poverty'
    subtopic VARCHAR(200),
    
    -- Source info
    source_note TEXT,
    source_organization VARCHAR(200),
    
    -- Status
    is_estimated BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(indicator_code, country_code, year, period)
);

-- ========================
-- Economy Forecasts Table
-- ========================
CREATE TABLE IF NOT EXISTS economy_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source market_data_source_type DEFAULT 'imf',
    
    -- Forecast details
    forecast_type VARCHAR(100) NOT NULL, -- 'gdp_growth', 'inflation', 'unemployment'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Subject
    country_id UUID REFERENCES economy_countries(id) ON DELETE SET NULL,
    country_code VARCHAR(3),
    region VARCHAR(100),
    scope VARCHAR(50) DEFAULT 'country', -- 'country', 'region', 'global'
    
    -- Forecast values
    forecast_value DECIMAL(20,6),
    forecast_low DECIMAL(20,6),
    forecast_high DECIMAL(20,6),
    unit VARCHAR(50),
    
    -- Temporal
    forecast_year INTEGER NOT NULL,
    forecast_quarter INTEGER,
    publication_date DATE,
    
    -- Comparison
    previous_forecast DECIMAL(20,6),
    actual_value DECIMAL(20,6), -- Filled in later if available
    
    -- Source
    source_organization VARCHAR(200),
    report_name VARCHAR(300),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'revised', 'realized'
    
    -- Market
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Economy Trade Data
-- ========================
CREATE TABLE IF NOT EXISTS economy_trade_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source market_data_source_type DEFAULT 'worldbank',
    
    -- Countries
    country_id UUID REFERENCES economy_countries(id) ON DELETE SET NULL,
    country_code VARCHAR(3) NOT NULL,
    partner_country_code VARCHAR(3),
    
    -- Trade data
    trade_type VARCHAR(50) NOT NULL, -- 'export', 'import', 'balance'
    product_category VARCHAR(200),
    
    -- Values
    value DECIMAL(20,2),
    volume DECIMAL(20,2),
    currency VARCHAR(10) DEFAULT 'USD',
    
    -- Temporal
    year INTEGER NOT NULL,
    month INTEGER,
    
    -- Change
    previous_value DECIMAL(20,2),
    change_percent DECIMAL(10,4),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(country_code, partner_country_code, trade_type, year, month)
);

-- ========================
-- Economy News Junction
-- ========================
CREATE TABLE IF NOT EXISTS economy_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    
    -- Related entities
    country_codes TEXT[] DEFAULT '{}',
    indicator_types TEXT[] DEFAULT '{}',
    
    -- Economy-specific
    economic_impact impact_level DEFAULT 'medium',
    global_significance BOOLEAN DEFAULT false,
    
    -- Topics
    topics TEXT[] DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Insert Major Economies
-- ========================
INSERT INTO economy_countries (iso_code, iso_code_2, name, region, income_group, is_major_economy, currency_code)
VALUES 
    ('USA', 'US', 'United States', 'North America', 'High income', true, 'USD'),
    ('CHN', 'CN', 'China', 'East Asia & Pacific', 'Upper middle income', true, 'CNY'),
    ('JPN', 'JP', 'Japan', 'East Asia & Pacific', 'High income', true, 'JPY'),
    ('DEU', 'DE', 'Germany', 'Europe & Central Asia', 'High income', true, 'EUR'),
    ('GBR', 'GB', 'United Kingdom', 'Europe & Central Asia', 'High income', true, 'GBP'),
    ('FRA', 'FR', 'France', 'Europe & Central Asia', 'High income', true, 'EUR'),
    ('IND', 'IN', 'India', 'South Asia', 'Lower middle income', true, 'INR'),
    ('BRA', 'BR', 'Brazil', 'Latin America & Caribbean', 'Upper middle income', true, 'BRL'),
    ('CAN', 'CA', 'Canada', 'North America', 'High income', true, 'CAD'),
    ('AUS', 'AU', 'Australia', 'East Asia & Pacific', 'High income', true, 'AUD')
ON CONFLICT (iso_code) DO NOTHING;

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_economy_countries_region ON economy_countries(region);
CREATE INDEX IF NOT EXISTS idx_economy_countries_major ON economy_countries(is_major_economy) WHERE is_major_economy = true;

CREATE INDEX IF NOT EXISTS idx_economy_indicators_code ON economy_global_indicators(indicator_code);
CREATE INDEX IF NOT EXISTS idx_economy_indicators_country ON economy_global_indicators(country_code);
CREATE INDEX IF NOT EXISTS idx_economy_indicators_year ON economy_global_indicators(year DESC);
CREATE INDEX IF NOT EXISTS idx_economy_indicators_topic ON economy_global_indicators(topic);

CREATE INDEX IF NOT EXISTS idx_economy_forecasts_type ON economy_forecasts(forecast_type);
CREATE INDEX IF NOT EXISTS idx_economy_forecasts_country ON economy_forecasts(country_code);
CREATE INDEX IF NOT EXISTS idx_economy_forecasts_year ON economy_forecasts(forecast_year);

CREATE INDEX IF NOT EXISTS idx_economy_trade_country ON economy_trade_data(country_code);
CREATE INDEX IF NOT EXISTS idx_economy_trade_year ON economy_trade_data(year DESC);

CREATE INDEX IF NOT EXISTS idx_economy_news_data_item ON economy_news_items(data_item_id);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE economy_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_global_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_trade_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_news_items ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Economy countries viewable by all" ON economy_countries FOR SELECT USING (is_active = true);
CREATE POLICY "Economy indicators viewable by all" ON economy_global_indicators FOR SELECT USING (true);
CREATE POLICY "Economy forecasts viewable by all" ON economy_forecasts FOR SELECT USING (true);
CREATE POLICY "Economy trade viewable by all" ON economy_trade_data FOR SELECT USING (true);
CREATE POLICY "Economy news viewable by all" ON economy_news_items FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages economy countries" ON economy_countries FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages economy indicators" ON economy_global_indicators FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages economy forecasts" ON economy_forecasts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages economy trade" ON economy_trade_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages economy news" ON economy_news_items FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_economy_countries_updated_at
    BEFORE UPDATE ON economy_countries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_economy_indicators_updated_at
    BEFORE UPDATE ON economy_global_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_economy_forecasts_updated_at
    BEFORE UPDATE ON economy_forecasts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get major economies overview
CREATE OR REPLACE FUNCTION get_major_economies()
RETURNS TABLE (
    iso_code VARCHAR,
    name VARCHAR,
    gdp DECIMAL,
    gdp_growth DECIMAL,
    inflation DECIMAL,
    unemployment DECIMAL,
    region VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ec.iso_code,
        ec.name,
        ec.gdp,
        ec.gdp_growth,
        ec.inflation,
        ec.unemployment,
        ec.region
    FROM economy_countries ec
    WHERE ec.is_major_economy = true
    AND ec.is_active = true
    ORDER BY ec.gdp DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get latest indicator by code
CREATE OR REPLACE FUNCTION get_economy_indicator(
    p_indicator_code VARCHAR,
    p_country_code VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    country_code VARCHAR,
    country_name VARCHAR,
    value DECIMAL,
    year INTEGER,
    change_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (egi.country_code)
        egi.country_code,
        ec.name AS country_name,
        egi.value,
        egi.year,
        egi.change_percent
    FROM economy_global_indicators egi
    LEFT JOIN economy_countries ec ON egi.country_code = ec.iso_code
    WHERE egi.indicator_code = p_indicator_code
    AND (p_country_code IS NULL OR egi.country_code = p_country_code)
    ORDER BY egi.country_code, egi.year DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE economy_countries IS 'Country-level economic data';
COMMENT ON TABLE economy_global_indicators IS 'World Bank and IMF economic indicators';
COMMENT ON TABLE economy_forecasts IS 'Economic forecasts from IMF, World Bank, etc.';
COMMENT ON TABLE economy_trade_data IS 'International trade statistics';
COMMENT ON TABLE economy_news_items IS 'Economy-related news junction table';
