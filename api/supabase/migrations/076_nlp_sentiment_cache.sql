-- ============================================================================
-- ExoDuZe — Advanced NLP Sentiment Cache
-- ============================================================================
-- 
-- PROBLEM: Real NLP (HuggingFace/FinBERT) is slow and API rate-limited. 
--          We cannot analyze the same headlines repeatedly during ETL syncs.
--
-- SOLUTION:
--   Create a dedicated caching table for NLP sentiment analysis results.
--   This ensures we only call the HuggingFace API once per unique string,
--   making the professional NLP feature fast and scalable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."nlp_sentiment_cache" (
    "content_hash" TEXT PRIMARY KEY, -- SHA256 of normalized text
    "text_content" TEXT NOT NULL,
    "sentiment" sentiment_type NOT NULL,
    "sentiment_score" DECIMAL(5,4) NOT NULL,
    "model_used" TEXT NOT NULL,
    "confidence" DECIMAL(5,4),
    "analyzed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "metadata" JSONB DEFAULT '{}'::jsonb
);

-- Index for analytics and debugging
CREATE INDEX IF NOT EXISTS idx_nlp_sentiment_cache_model ON "public"."nlp_sentiment_cache"("model_used");
CREATE INDEX IF NOT EXISTS idx_nlp_sentiment_cache_sentiment ON "public"."nlp_sentiment_cache"("sentiment");
CREATE INDEX IF NOT EXISTS idx_nlp_sentiment_cache_analyzed ON "public"."nlp_sentiment_cache"("analyzed_at" DESC);

-- Enable RLS
ALTER TABLE "public"."nlp_sentiment_cache" ENABLE ROW LEVEL SECURITY;

-- Only service role can write, authenticated can read
CREATE POLICY "Service role manages NLP cache"
    ON "public"."nlp_sentiment_cache"
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Anyone can read NLP cache"
    ON "public"."nlp_sentiment_cache"
    FOR SELECT
    TO public
    USING (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
