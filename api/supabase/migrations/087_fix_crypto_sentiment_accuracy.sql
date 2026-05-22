-- ============================================================================
-- 087_fix_crypto_sentiment_accuracy.sql
-- Fix: Crypto sector shows "Bullish" sentiment even when market is bearish.
--
-- Root causes:
--   1) market_data_items.sentiment_score for price updates was normalized
--      with /100 (e.g., -3% → -0.03) which is too weak to register
--   2) Cluster creation fallback for high-impact items was ALWAYS positive
--      (0.4 to 0.75), creating permanent bullish bias
--   3) Existing news_clusters have stale/incorrect sentiment values
--
-- This migration:
--   A) Recalculates sentiment_score in market_data_items for crypto price
--      updates based on actual price_change_24h from crypto_assets
--   B) Recalculates news_clusters sentiment for active crypto competitions
--      using corrected market_data_items sentiment
--   C) Ensures all future cluster refreshes use the corrected logic
-- ============================================================================

-- ========================
-- PART 1: Fix market_data_items sentiment_score for crypto price updates
-- The ETL was storing coin.priceChange24h / 100, producing tiny values.
-- Correct to / 10 so ±5% change → ±0.5 sentiment.
-- ========================
UPDATE market_data_items mdi
SET
    sentiment_score = GREATEST(-1.0, LEAST(1.0,
        CASE
            WHEN mdi.metadata->>'change24h' IS NOT NULL THEN
                (mdi.metadata->>'change24h')::numeric / 10.0
            ELSE
                mdi.sentiment_score
        END
    )),
    sentiment = CASE
        WHEN mdi.metadata->>'change24h' IS NOT NULL THEN
            CASE
                WHEN (mdi.metadata->>'change24h')::numeric > 0 THEN 'bullish'::sentiment_type
                WHEN (mdi.metadata->>'change24h')::numeric < 0 THEN 'bearish'::sentiment_type
                ELSE 'neutral'::sentiment_type
            END
        ELSE mdi.sentiment
    END,
    updated_at = NOW()
WHERE mdi.category = 'crypto'::market_category_type
  AND mdi.content_type = 'price'
  AND mdi.metadata->>'change24h' IS NOT NULL
  AND mdi.is_active = true;


-- ========================
-- PART 2: Recalculate news_clusters sentiment for active crypto competitions
-- Uses corrected market_data_items sentiment values
-- ========================
DO $$
DECLARE
    comp RECORD;
    avg_sentiment NUMERIC;
    signal_count INTEGER;
    item_count INTEGER;
    price_sentiment NUMERIC;
    news_sentiment NUMERIC;
    combined_sentiment NUMERIC;
BEGIN
    FOR comp IN
        SELECT c.id, c.title, c.sector
        FROM competitions c
        WHERE c.status = 'active'
          AND c.sector = 'crypto'
    LOOP
        -- 1. Get average sentiment from market_data_items (crypto category)
        SELECT
            AVG(CASE
                WHEN sentiment = 'bearish'::sentiment_type THEN GREATEST(-1.0, COALESCE(sentiment_score, -0.5))
                WHEN sentiment = 'bullish'::sentiment_type THEN LEAST(1.0, COALESCE(sentiment_score, 0.5))
                ELSE COALESCE(sentiment_score, 0.0)
            END),
            COUNT(*)
        INTO news_sentiment, item_count
        FROM market_data_items
        WHERE category = 'crypto'::market_category_type
          AND is_active = true
          AND published_at > NOW() - INTERVAL '6 hours';

        -- 2. Get price-based sentiment from crypto_assets
        SELECT
            AVG(
                GREATEST(-1.0, LEAST(1.0,
                    price_change_24h / 10.0
                ))
            )
        INTO price_sentiment
        FROM crypto_assets
        WHERE is_featured = true
          AND price_change_24h IS NOT NULL;

        -- 3. Combine: weight price data more heavily for crypto (60% price, 40% news)
        -- Price data is the most reliable indicator for crypto bearish/bullish
        IF price_sentiment IS NOT NULL AND news_sentiment IS NOT NULL THEN
            combined_sentiment = (price_sentiment * 0.6) + (news_sentiment * 0.4);
        ELSIF price_sentiment IS NOT NULL THEN
            combined_sentiment = price_sentiment;
        ELSIF news_sentiment IS NOT NULL THEN
            combined_sentiment = news_sentiment;
        ELSE
            combined_sentiment = 0; -- truly unknown
        END IF;

        -- Clamp to [-1, 1]
        combined_sentiment = GREATEST(-1.0, LEAST(1.0, combined_sentiment));

        -- 4. Update ALL clusters for this competition with corrected sentiment
        UPDATE news_clusters
        SET sentiment = combined_sentiment
        WHERE competition_id = comp.id;

        RAISE NOTICE 'Fixed crypto sentiment for "%": price=%, news=%, combined=%',
            LEFT(comp.title, 50), 
            COALESCE(price_sentiment::text, 'null'),
            COALESCE(news_sentiment::text, 'null'),
            combined_sentiment;
    END LOOP;
END $$;


-- ========================
-- PART 3: Also fix non-crypto sectors where sentiment was biased
-- For all sectors, recalculate cluster sentiment using actual market_data_items
-- ========================
DO $$
DECLARE
    comp RECORD;
    avg_sent NUMERIC;
    cnt INTEGER;
BEGIN
    FOR comp IN
        SELECT c.id, c.title, c.sector
        FROM competitions c
        WHERE c.status = 'active'
          AND c.sector != 'crypto'
    LOOP
        -- Get average sentiment from recent market items in this sector
        SELECT
            AVG(CASE
                WHEN sentiment = 'bearish'::sentiment_type THEN GREATEST(-1.0, COALESCE(sentiment_score, -0.4))
                WHEN sentiment = 'bullish'::sentiment_type THEN LEAST(1.0, COALESCE(sentiment_score, 0.4))
                ELSE COALESCE(sentiment_score, 0.0)
            END),
            COUNT(*)
        INTO avg_sent, cnt
        FROM market_data_items
        WHERE category = comp.sector::market_category_type
          AND is_active = true
          AND published_at > NOW() - INTERVAL '12 hours';

        -- Only update if we have meaningful data
        IF cnt > 0 AND avg_sent IS NOT NULL THEN
            -- Clamp and apply
            avg_sent = GREATEST(-1.0, LEAST(1.0, avg_sent));

            UPDATE news_clusters
            SET sentiment = avg_sent
            WHERE competition_id = comp.id
              AND ABS(sentiment - avg_sent) > 0.15; -- Only fix if significantly different
        END IF;
    END LOOP;
END $$;


-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
