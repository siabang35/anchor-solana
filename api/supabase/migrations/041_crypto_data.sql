-- ============================================================
-- Crypto Data Schema for ExoDuZe AI Agent Competition
-- Tables for cryptocurrency prices, assets, and news
-- Focus: BTC, ETH, SOL, XRP, HYPE
-- Migration: 041_crypto_data.sql
-- ============================================================

-- ========================
-- Crypto Assets Table
-- ========================
CREATE TABLE IF NOT EXISTS crypto_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type NOT NULL DEFAULT 'coingecko',
    
    -- Asset info
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100),
    
    -- Classification
    asset_type VARCHAR(50) DEFAULT 'cryptocurrency', -- 'cryptocurrency', 'token', 'stablecoin', 'nft'
    platform VARCHAR(100), -- 'ethereum', 'solana', 'arbitrum'
    contract_address TEXT,
    
    -- Current price data
    price_usd DECIMAL(30,10),
    price_btc DECIMAL(20,10),
    price_eth DECIMAL(20,10),
    
    -- Market data
    market_cap DECIMAL(30,2),
    market_cap_rank INTEGER,
    fully_diluted_valuation DECIMAL(30,2),
    
    -- Volume
    volume_24h DECIMAL(30,2),
    volume_change_24h DECIMAL(10,4),
    
    -- Supply
    circulating_supply DECIMAL(30,2),
    total_supply DECIMAL(30,2),
    max_supply DECIMAL(30,2),
    
    -- Changes
    price_change_1h DECIMAL(10,4),
    price_change_24h DECIMAL(10,4),
    price_change_7d DECIMAL(10,4),
    price_change_30d DECIMAL(10,4),
    price_change_1y DECIMAL(10,4),
    
    -- All-time data
    ath DECIMAL(30,10),
    ath_date TIMESTAMPTZ,
    ath_change_percent DECIMAL(10,4),
    atl DECIMAL(30,10),
    atl_date TIMESTAMPTZ,
    atl_change_percent DECIMAL(10,4),
    
    -- Social/Links
    website_url TEXT,
    twitter_handle VARCHAR(100),
    telegram_url TEXT,
    discord_url TEXT,
    github_url TEXT,
    subreddit VARCHAR(100),
    
    -- Media
    image_url TEXT,
    thumb_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false, -- For BTC, ETH, SOL, XRP, HYPE
    
    -- Last update
    last_price_update TIMESTAMPTZ,
    
    -- Metadata
    description TEXT,
    categories TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(symbol, source)
);

-- ========================
-- Crypto Price History Table
-- ========================
CREATE TABLE IF NOT EXISTS crypto_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES crypto_assets(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    
    -- Price data
    timestamp TIMESTAMPTZ NOT NULL,
    price_usd DECIMAL(30,10) NOT NULL,
    price_btc DECIMAL(20,10),
    
    -- OHLCV
    open DECIMAL(30,10),
    high DECIMAL(30,10),
    low DECIMAL(30,10),
    close DECIMAL(30,10),
    volume DECIMAL(30,2),
    
    -- Market cap at time
    market_cap DECIMAL(30,2),
    
    -- Interval
    interval VARCHAR(20) DEFAULT '1h', -- '5m', '15m', '1h', '4h', '1d'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(symbol, timestamp, interval)
);

-- ========================
-- Crypto Fear & Greed Index
-- ========================
CREATE TABLE IF NOT EXISTS crypto_fear_greed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Index data
    value INTEGER NOT NULL CHECK (value >= 0 AND value <= 100),
    value_classification VARCHAR(50) NOT NULL, -- 'Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'
    
    -- Temporal
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Change
    previous_value INTEGER,
    change INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(timestamp)
);

-- ========================
-- Crypto News Table (CryptoPanic)
-- ========================
CREATE TABLE IF NOT EXISTS crypto_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,
    source market_data_source_type DEFAULT 'cryptopanic',
    
    -- News info
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    
    -- Source
    source_domain VARCHAR(200),
    source_title VARCHAR(200),
    
    -- Classification
    kind VARCHAR(50) DEFAULT 'news', -- 'news', 'media'
    
    -- Voting/Sentiment
    votes_positive INTEGER DEFAULT 0,
    votes_negative INTEGER DEFAULT 0,
    votes_important INTEGER DEFAULT 0,
    votes_liked INTEGER DEFAULT 0,
    votes_disliked INTEGER DEFAULT 0,
    votes_lol INTEGER DEFAULT 0,
    votes_toxic INTEGER DEFAULT 0,
    votes_saved INTEGER DEFAULT 0,
    votes_comments INTEGER DEFAULT 0,
    
    -- Sentiment
    sentiment sentiment_type DEFAULT 'neutral',
    
    -- Related currencies
    currencies TEXT[] DEFAULT '{}', -- ['BTC', 'ETH']
    
    -- Temporal
    published_at TIMESTAMPTZ,
    
    -- Filter
    is_hot BOOLEAN DEFAULT false,
    is_important BOOLEAN DEFAULT false,
    filter_type VARCHAR(50) DEFAULT 'all', -- 'rising', 'hot', 'bullish', 'bearish', 'lol', 'saved'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(external_id, source)
);

-- ========================
-- Crypto Market Predictions
-- ========================
CREATE TABLE IF NOT EXISTS crypto_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES crypto_assets(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    
    -- Prediction details
    prediction_type VARCHAR(100) NOT NULL, -- 'price_target', 'breakout', 'support_break', 'ath'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Target values
    target_value DECIMAL(30,10),
    target_date DATE,
    timeframe VARCHAR(50), -- '1d', '1w', '1m', '3m', '1y'
    
    -- Current baseline
    baseline_value DECIMAL(30,10),
    baseline_date TIMESTAMPTZ,
    
    -- Confidence
    confidence_score DECIMAL(5,4) DEFAULT 0.5,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'hit', 'missed', 'expired'
    outcome_date TIMESTAMPTZ,
    
    -- Market
    market_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Crypto Watchlist (Featured Assets)
-- ========================
-- Insert featured assets for the user's requested cryptos
INSERT INTO crypto_assets (symbol, name, slug, is_featured, source, is_active)
VALUES 
    ('BTC', 'Bitcoin', 'bitcoin', true, 'coingecko', true),
    ('ETH', 'Ethereum', 'ethereum', true, 'coingecko', true),
    ('SOL', 'Solana', 'solana', true, 'coingecko', true),
    ('XRP', 'XRP', 'ripple', true, 'coingecko', true),
    ('HYPE', 'Hyperliquid', 'hyperliquid', true, 'coingecko', true)
ON CONFLICT (symbol, source) DO UPDATE SET is_featured = true;

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_crypto_assets_symbol ON crypto_assets(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_assets_rank ON crypto_assets(market_cap_rank);
CREATE INDEX IF NOT EXISTS idx_crypto_assets_featured ON crypto_assets(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_crypto_assets_active ON crypto_assets(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crypto_prices_symbol ON crypto_prices(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_prices_timestamp ON crypto_prices(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_prices_interval ON crypto_prices(interval);
CREATE INDEX IF NOT EXISTS idx_crypto_prices_asset ON crypto_prices(asset_id);

CREATE INDEX IF NOT EXISTS idx_crypto_fear_greed_timestamp ON crypto_fear_greed(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_crypto_news_published ON crypto_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_news_currencies ON crypto_news USING GIN(currencies);
CREATE INDEX IF NOT EXISTS idx_crypto_news_sentiment ON crypto_news(sentiment);
CREATE INDEX IF NOT EXISTS idx_crypto_news_hot ON crypto_news(is_hot) WHERE is_hot = true;

CREATE INDEX IF NOT EXISTS idx_crypto_predictions_symbol ON crypto_predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_predictions_status ON crypto_predictions(status);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE crypto_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_fear_greed ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_predictions ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Crypto assets viewable by all" ON crypto_assets FOR SELECT USING (is_active = true);
CREATE POLICY "Crypto prices viewable by all" ON crypto_prices FOR SELECT USING (true);
CREATE POLICY "Crypto fear greed viewable by all" ON crypto_fear_greed FOR SELECT USING (true);
CREATE POLICY "Crypto news viewable by all" ON crypto_news FOR SELECT USING (true);
CREATE POLICY "Crypto predictions viewable by all" ON crypto_predictions FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages crypto assets" ON crypto_assets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages crypto prices" ON crypto_prices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages crypto fear greed" ON crypto_fear_greed FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages crypto news" ON crypto_news FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages crypto predictions" ON crypto_predictions FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_crypto_assets_updated_at
    BEFORE UPDATE ON crypto_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crypto_news_updated_at
    BEFORE UPDATE ON crypto_news FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crypto_predictions_updated_at
    BEFORE UPDATE ON crypto_predictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get featured crypto assets
CREATE OR REPLACE FUNCTION get_featured_crypto()
RETURNS TABLE (
    id UUID,
    symbol VARCHAR,
    name VARCHAR,
    price_usd DECIMAL,
    price_change_24h DECIMAL,
    price_change_7d DECIMAL,
    market_cap DECIMAL,
    volume_24h DECIMAL,
    image_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ca.id,
        ca.symbol,
        ca.name,
        ca.price_usd,
        ca.price_change_24h,
        ca.price_change_7d,
        ca.market_cap,
        ca.volume_24h,
        ca.image_url
    FROM crypto_assets ca
    WHERE ca.is_featured = true
    AND ca.is_active = true
    ORDER BY ca.market_cap_rank ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get latest crypto news for symbol
CREATE OR REPLACE FUNCTION get_crypto_news_by_symbol(
    p_symbol VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    url TEXT,
    source_title VARCHAR,
    published_at TIMESTAMPTZ,
    sentiment sentiment_type,
    is_hot BOOLEAN,
    currencies TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cn.id,
        cn.title,
        cn.url,
        cn.source_title,
        cn.published_at,
        cn.sentiment,
        cn.is_hot,
        cn.currencies
    FROM crypto_news cn
    WHERE (p_symbol IS NULL OR p_symbol = ANY(cn.currencies))
    ORDER BY cn.published_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get latest fear & greed index
CREATE OR REPLACE FUNCTION get_crypto_fear_greed_latest()
RETURNS TABLE (
    value INTEGER,
    classification VARCHAR,
    recorded_at TIMESTAMPTZ,
    previous_value INTEGER,
    change INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cfg.value,
        cfg.value_classification AS classification,
        cfg.timestamp AS recorded_at,
        cfg.previous_value,
        cfg.change
    FROM crypto_fear_greed cfg
    ORDER BY cfg.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get price history for chart
CREATE OR REPLACE FUNCTION get_crypto_price_history(
    p_symbol VARCHAR,
    p_interval VARCHAR DEFAULT '1h',
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    recorded_at TIMESTAMPTZ,
    price_open DECIMAL,
    price_high DECIMAL,
    price_low DECIMAL,
    price_close DECIMAL,
    trade_volume DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.timestamp AS recorded_at,
        cp.open AS price_open,
        cp.high AS price_high,
        cp.low AS price_low,
        cp.close AS price_close,
        cp.volume AS trade_volume
    FROM crypto_prices cp
    WHERE cp.symbol = p_symbol
    AND cp.interval = p_interval
    ORDER BY cp.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE crypto_assets IS 'Cryptocurrency assets with focus on BTC, ETH, SOL, XRP, HYPE';
COMMENT ON TABLE crypto_prices IS 'Historical price data for cryptocurrencies';
COMMENT ON TABLE crypto_fear_greed IS 'Crypto Fear & Greed Index history';
COMMENT ON TABLE crypto_news IS 'Crypto news from CryptoPanic and other sources';
COMMENT ON TABLE crypto_predictions IS 'Price predictions and targets for crypto assets';
