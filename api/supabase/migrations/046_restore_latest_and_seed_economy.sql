-- ============================================================
-- Restoration & Seeding for ExoDuZe AI Agent Competition
-- 1. Restores missing 'latest_market_news' view
-- 2. Seeds 'Economy' and 'Crypto' feeds from existing static data
-- Migration: 046_restore_latest_and_seed_economy.sql
-- ============================================================

-- 1. Restore 'latest_market_news' view
-- Using standard permissions (Security Invoker) to avoid previous security warnings
DROP VIEW IF EXISTS latest_market_news;

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

COMMENT ON VIEW latest_market_news IS 'Aggregated view of latest news across categories';

-- 2. Seed Economy Data from Economy Countries
-- Generates "News" items from the static country data so the Economy feed is not empty
INSERT INTO market_data_items (
    external_id,
    source,
    category,
    content_type,
    title,
    description,
    source_name,
    published_at,
    impact,
    sentiment,
    is_active,
    is_market_worthy,
    metadata
)
SELECT DISTINCT ON (iso_code)
    'seed-economy-' || iso_code, -- Unique ID
    'worldbank',
    'economy',
    'news', -- vital for showing up in Latest News
    'Economic Snapshot: ' || name,
    'Current economic indicators for ' || name || '. GDP Growth: ' || COALESCE(gdp_growth::TEXT, 'N/A') || '%, Inflation: ' || COALESCE(inflation::TEXT, 'N/A') || '%, Unemployment: ' || COALESCE(unemployment::TEXT, 'N/A') || '%.',
    'World Bank Data',
    NOW(),
    'high',
    CASE 
        WHEN gdp_growth >= 3 THEN 'bullish'::sentiment_type
        WHEN gdp_growth < 1 THEN 'bearish'::sentiment_type
        ELSE 'neutral'::sentiment_type
    END,
    true,
    true,
    jsonb_build_object('seeded', true)
FROM economy_countries
WHERE is_major_economy = true
ORDER BY iso_code
ON CONFLICT (external_id, source) 
DO UPDATE SET 
    published_at = NOW(),
    description = EXCLUDED.description;

-- 3. Seed Crypto Data from Featured Assets
-- Generates "News" items from static crypto assets so Crypto feed is not empty
INSERT INTO market_data_items (
    external_id,
    source,
    category,
    content_type,
    title,
    description,
    source_name,
    published_at,
    impact,
    sentiment,
    is_active,
    is_market_worthy,
    metadata
)
SELECT DISTINCT ON (symbol)
    'seed-crypto-' || symbol,
    'coingecko',
    'crypto',
    'news',
    'Market Watch: ' || name || ' (' || symbol || ')',
    'Live market tracking active for ' || name || '. Check latest price action and signals.',
    'CoinGecko',
    NOW(),
    'medium',
    'neutral',
    true,
    true,
    jsonb_build_object('seeded', true)
FROM crypto_assets
WHERE is_featured = true
ORDER BY symbol, market_cap DESC
ON CONFLICT (external_id, source) 
DO UPDATE SET 
    published_at = NOW();
