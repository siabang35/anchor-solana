-- ============================================================================
-- 084_fix_crypto_sentiment_and_dedup.sql
-- 1. Fix Crypto Sentiment showing BULLISH when BEARISH by deriving from real data
-- 2. Prevent duplicate Crypto Competitions based on Coin Name (e.g., BNB)
-- ============================================================================

-- ========================
-- PART 1: DEDUP BY COIN/TOPIC
-- ========================
ALTER TABLE "public"."competitions" ADD COLUMN IF NOT EXISTS "topic_fingerprint" TEXT;

-- Update existing competitions
UPDATE "public"."competitions"
SET "topic_fingerprint" = lower((regexp_match(title, '^([A-Za-z0-9]+)'))[1])
WHERE "topic_fingerprint" IS NULL;

-- Create trigger function to auto-extract the first word (topic) from title
CREATE OR REPLACE FUNCTION compute_title_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  -- Full title fingerprint
  NEW.title_fingerprint := md5(
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(NEW.title, '\s+', ' ', 'g'),
          '—\s*outcome prediction\??', '', 'gi'
        ),
        '[^a-z0-9 ]', '', 'gi'
      )
    )
  );
  
  -- Topic fingerprint (extract first alphanumeric word, e.g. "Solana", "BNB")
  NEW.topic_fingerprint := lower((regexp_match(NEW.title, '^([A-Za-z0-9]+)'))[1]);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is already created in 063, but we updated the function
-- Cancel duplicate coins (keep oldest per topic across ALL time horizons for crypto)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY sector, topic_fingerprint
           ORDER BY created_at ASC
         ) AS rn
  FROM "public"."competitions"
  WHERE status IN ('active', 'upcoming')
    AND sector = 'crypto'
    AND topic_fingerprint IS NOT NULL
)
UPDATE "public"."competitions"
SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Create unique index to strictly prevent same coin across different horizons
DROP INDEX IF EXISTS idx_unique_sector_topic_active;
CREATE UNIQUE INDEX idx_unique_sector_topic_active
  ON "public"."competitions" (sector, topic_fingerprint)
  WHERE status IN ('active', 'upcoming') AND topic_fingerprint IS NOT NULL AND sector = 'crypto';


-- ========================
-- PART 2: REAL SENTIMENT FIX
-- ========================
-- Flat PL/pgSQL structure without nested DECLARE to avoid scoping errors
CREATE OR REPLACE FUNCTION compute_real_crypto_sentiment()
RETURNS TABLE(
    composite_sentiment NUMERIC,
    price_sentiment NUMERIC,
    news_sentiment NUMERIC,
    fear_greed_sentiment NUMERIC,
    data_sources_used INTEGER,
    debug_info JSON
) AS $$
DECLARE
    v_avg_change NUMERIC := 0;
    v_bull_count INTEGER := 0;
    v_bear_count INTEGER := 0;
    v_total_news INTEGER := 0;
    v_fg_value INTEGER := 50;
    v_fg_class VARCHAR := 'Neutral';
    v_price_sent NUMERIC := 0;
    v_news_sent NUMERIC := 0;
    v_fg_sent NUMERIC := 0;
    v_total_weight NUMERIC := 0;
    v_weighted_sum NUMERIC := 0;
    v_sources_used INTEGER := 0;
BEGIN
    -- 1. Price Change Sentiment
    SELECT COALESCE(AVG(price_change_24h), 0)
    INTO v_avg_change
    FROM crypto_assets
    WHERE is_featured = true AND is_active = true;

    IF v_avg_change != 0 THEN
        v_price_sent := GREATEST(-1.0, LEAST(1.0, v_avg_change / 10.0));
        v_weighted_sum := v_weighted_sum + (v_price_sent * 0.4);
        v_total_weight := v_total_weight + 0.4;
        v_sources_used := v_sources_used + 1;
    END IF;

    -- 2. News Sentiment
    SELECT 
        COUNT(*) FILTER (WHERE sentiment = 'bullish'),
        COUNT(*) FILTER (WHERE sentiment = 'bearish'),
        COUNT(*)
    INTO v_bull_count, v_bear_count, v_total_news
    FROM (
        SELECT sentiment FROM crypto_news 
        ORDER BY published_at DESC LIMIT 50
    ) recent_news;

    IF v_total_news > 0 THEN
        v_news_sent := (v_bull_count - v_bear_count)::NUMERIC / v_total_news::NUMERIC;
        v_weighted_sum := v_weighted_sum + (v_news_sent * 0.3);
        v_total_weight := v_total_weight + 0.3;
        v_sources_used := v_sources_used + 1;
    END IF;

    -- 3. Fear & Greed Sentiment
    SELECT value, value_classification 
    INTO v_fg_value, v_fg_class
    FROM crypto_fear_greed 
    ORDER BY timestamp DESC LIMIT 1;

    IF v_fg_value IS NOT NULL THEN
        v_fg_sent := (v_fg_value - 50.0) / 50.0;
        v_weighted_sum := v_weighted_sum + (v_fg_sent * 0.3);
        v_total_weight := v_total_weight + 0.3;
        v_sources_used := v_sources_used + 1;
    END IF;

    -- Composite
    IF v_total_weight > 0 THEN
        composite_sentiment := v_weighted_sum / v_total_weight;
    ELSE
        composite_sentiment := -0.2; -- Fallback bearish if no data
    END IF;

    price_sentiment := v_price_sent;
    news_sentiment := v_news_sent;
    fear_greed_sentiment := v_fg_sent;
    data_sources_used := v_sources_used;
    debug_info := json_build_object(
        'avg_price_change', v_avg_change,
        'news_bull', v_bull_count,
        'news_bear', v_bear_count,
        'fear_greed', v_fg_value
    );

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION compute_real_crypto_sentiment() TO service_role;

-- Apply accurate sentiment to active crypto competitions immediately
DO $$
DECLARE
    v_real_sentiment NUMERIC;
    v_base_prob NUMERIC;
BEGIN
    SELECT composite_sentiment INTO v_real_sentiment FROM compute_real_crypto_sentiment();
    
    -- Safety check if null
    IF v_real_sentiment IS NULL THEN
        v_real_sentiment := -0.2;
    END IF;
    
    -- Map sentiment [-1, 1] to base probability [0.3, 0.7] (avoid extreme 0 or 1)
    v_base_prob := 0.5 + (v_real_sentiment * 0.2);

    -- Update active/upcoming crypto competitions
    UPDATE competitions
    SET base_probability = v_base_prob
    WHERE sector = 'crypto' AND status IN ('active', 'upcoming');

    -- Update the news_clusters for these competitions
    UPDATE news_clusters
    SET sentiment = v_real_sentiment
    WHERE competition_id IN (
        SELECT id FROM competitions WHERE sector = 'crypto' AND status IN ('active', 'upcoming')
    );
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
