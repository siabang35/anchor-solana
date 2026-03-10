-- ============================================================================
-- ExoDuZe — Sector Views (055_sector_views.sql)
-- Optimized views for Top Markets, Latest, Signals, and For You feeds
-- ============================================================================

-- ========================
-- 1. Top Markets View (weighted ranking)
-- Score = Volume(40%) + Liquidity(30%) + SentimentIntensity(20%) + Freshness(10%)
-- ========================
CREATE OR REPLACE VIEW v_top_markets AS
WITH market_rankings AS (
    SELECT 
        m.*,
        -- Volume score (normalized 0-1)
        CASE WHEN MAX(m.volume) OVER () > 0 
            THEN m.volume::DECIMAL / MAX(m.volume) OVER ()
            ELSE 0 
        END AS vol_score,
        -- Liquidity score (normalized 0-1)
        CASE WHEN MAX(m.liquidity) OVER () > 0 
            THEN m.liquidity::DECIMAL / MAX(m.liquidity) OVER ()
            ELSE 0 
        END AS liq_score,
        -- Sentiment intensity (deviation from 0.5)
        ABS(COALESCE(m.yes_price, 0.5) - 0.5) * 2 AS sentiment_score,
        -- Freshness (decay over 7 days)
        GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - m.created_at)) / (7 * 86400)) AS time_score
    FROM markets m
    WHERE m.resolved = false
)
SELECT 
    *,
    (vol_score * 0.4 + liq_score * 0.3 + sentiment_score * 0.2 + time_score * 0.1) AS composite_score
FROM market_rankings
ORDER BY composite_score DESC;

-- ========================
-- 2. Latest Feed View (all market data items, most recent first)
-- ========================
CREATE OR REPLACE VIEW v_latest_feed AS
SELECT 
    mdi.id,
    mdi.title,
    mdi.description,
    mdi.category,
    mdi.content_type,
    mdi.source_name,
    mdi.published_at,
    mdi.impact,
    mdi.sentiment,
    mdi.sentiment_score,
    mdi.relevance_score,
    mdi.confidence_score,
    mdi.image_url,
    mdi.url,
    mdi.tags,
    mdi.is_market_worthy,
    mdi.fetched_at
FROM market_data_items mdi
WHERE mdi.is_active = true
AND mdi.is_duplicate = false
ORDER BY mdi.published_at DESC NULLS LAST;

-- ========================
-- 3. Signals Feed View (market-worthy items with anomaly scoring)
-- ========================
CREATE OR REPLACE VIEW v_signals_feed AS
SELECT 
    mdi.id,
    mdi.title,
    mdi.description,
    mdi.category,
    mdi.content_type,
    mdi.source_name,
    mdi.published_at,
    mdi.impact,
    mdi.sentiment,
    mdi.sentiment_score,
    mdi.relevance_score,
    mdi.confidence_score,
    mdi.image_url,
    mdi.url,
    mdi.tags,
    -- Anomaly score: highly relevant + non-neutral sentiment + high impact
    (
        COALESCE(mdi.relevance_score, 0.5) * 0.4 +
        ABS(COALESCE(mdi.sentiment_score, 0)) * 0.3 +
        CASE mdi.impact 
            WHEN 'critical' THEN 1.0 
            WHEN 'high' THEN 0.75 
            WHEN 'medium' THEN 0.5 
            ELSE 0.25 
        END * 0.3
    ) AS anomaly_score
FROM market_data_items mdi
WHERE mdi.is_active = true
AND mdi.is_duplicate = false
AND (
    mdi.is_market_worthy = true 
    OR mdi.impact IN ('high', 'critical')
    OR ABS(COALESCE(mdi.sentiment_score, 0)) >= 0.6
)
ORDER BY (
    COALESCE(mdi.relevance_score, 0.5) * 0.4 +
    ABS(COALESCE(mdi.sentiment_score, 0)) * 0.3 +
    CASE mdi.impact 
        WHEN 'critical' THEN 1.0 
        WHEN 'high' THEN 0.75 
        WHEN 'medium' THEN 0.5 
        ELSE 0.25 
    END * 0.3
) DESC;

-- ========================
-- 4. Competition Feed View (active competitions with enriched data)
-- ========================
CREATE OR REPLACE VIEW v_active_competitions AS
SELECT 
    c.id,
    c.title,
    c.description,
    c.sector,
    c.team_home,
    c.team_away,
    c.outcomes,
    c.competition_start,
    c.competition_end,
    c.status,
    c.prize_pool,
    c.entry_count,
    c.max_entries,
    c.probabilities,
    c.onchain_market_pubkey,
    c.bonding_k,
    c.bonding_n,
    c.image_url,
    c.tags,
    -- Time remaining
    EXTRACT(EPOCH FROM (c.competition_end - NOW())) AS seconds_remaining,
    -- Progress percentage
    CASE 
        WHEN NOW() < c.competition_start THEN 0
        WHEN NOW() > c.competition_end THEN 100
        ELSE ROUND(
            EXTRACT(EPOCH FROM (NOW() - c.competition_start)) /
            EXTRACT(EPOCH FROM (c.competition_end - c.competition_start)) * 100
        )
    END AS progress_pct,
    -- Entry capacity
    CASE 
        WHEN c.max_entries > 0 
        THEN ROUND(c.entry_count::DECIMAL / c.max_entries * 100)
        ELSE 0 
    END AS capacity_pct
FROM competitions c
WHERE c.status IN ('upcoming', 'active')
ORDER BY 
    CASE c.status 
        WHEN 'active' THEN 0 
        WHEN 'upcoming' THEN 1 
    END,
    c.competition_start ASC;

-- ========================
-- Comments
-- ========================
COMMENT ON VIEW v_top_markets IS 'Ranked markets by composite score (volume, liquidity, sentiment, freshness)';
COMMENT ON VIEW v_latest_feed IS 'All active market data items ordered by publication date';
COMMENT ON VIEW v_signals_feed IS 'High-signal market data items with anomaly scoring';
COMMENT ON VIEW v_active_competitions IS 'Active/upcoming competitions with timing and capacity metadata';
