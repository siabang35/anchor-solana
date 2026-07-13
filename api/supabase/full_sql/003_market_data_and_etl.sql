-- ============================================================================
-- ExoDuZe — Full SQL: Market Data & ETL Infrastructure
-- File: 003_market_data_and_etl.sql
--
-- PURPOSE: Unified market data ingestion, ETL source tracking, rate limiting,
--          NLP sentiment caching, and market generation queue.
--
-- CLOUDFLARE R2: market_data_items.image_url and thumbnail_url point to R2.
--                Raw API responses (raw_response JSONB) are kept minimal;
--                full payloads are archived to R2 via backend StorageService.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. MARKETS TABLE (Legacy prediction market infrastructure)              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.markets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Core content
    title             VARCHAR(200) NOT NULL,
    description       TEXT NOT NULL,
    category          VARCHAR(50) NOT NULL
        CHECK (category IN ('crypto','sports','politics','entertainment','science','finance','tech','economy','signals','other')),

    -- Chain
    chain             VARCHAR(20) NOT NULL DEFAULT 'solana'
        CHECK (chain IN ('ethereum','base','arbitrum','optimism','polygon','solana','sui')),
    chain_id          INTEGER NOT NULL DEFAULT 0,
    contract_address  VARCHAR(100),
    collateral_token  VARCHAR(20) NOT NULL DEFAULT 'SOL',

    -- Resolution
    end_time          TIMESTAMPTZ NOT NULL,
    resolution_time   TIMESTAMPTZ NOT NULL,
    resolved          BOOLEAN NOT NULL DEFAULT FALSE,
    outcome           BOOLEAN,

    -- Pricing
    yes_price         DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    no_price          DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    volume            DECIMAL(20,6) NOT NULL DEFAULT 0,
    liquidity         DECIMAL(20,6) NOT NULL DEFAULT 0,

    -- Metadata
    tags              TEXT[] DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_markets_creator ON public.markets(creator_id);
CREATE INDEX IF NOT EXISTS idx_markets_category ON public.markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_chain ON public.markets(chain);
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON public.markets(resolved);
CREATE INDEX IF NOT EXISTS idx_markets_end_time ON public.markets(end_time);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON public.markets(volume DESC);
CREATE INDEX IF NOT EXISTS idx_markets_created ON public.markets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_title_search ON public.markets USING GIN (to_tsvector('english', title));

-- RLS
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Markets are viewable by everyone" ON public.markets
    FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create markets" ON public.markets
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Creators can update their markets" ON public.markets
    FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Service role manages all markets" ON public.markets
    FOR ALL USING (auth.role() = 'service_role');

-- Updated At trigger
DROP TRIGGER IF EXISTS update_markets_updated_at ON public.markets;
CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON public.markets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.markets IS 'Prediction markets with AMM pricing and on-chain settlement';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. DATA SOURCE CONFIGURATION TABLE                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.market_data_sources (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type            market_data_source_type NOT NULL,
    name                   VARCHAR(100) NOT NULL,
    base_url               TEXT NOT NULL,

    -- API config
    api_key_env_var        VARCHAR(100),
    rate_limit_per_minute  INTEGER DEFAULT 60,
    rate_limit_per_day     INTEGER DEFAULT 1000,

    -- Request tracking
    requests_today         INTEGER DEFAULT 0,
    requests_this_minute   INTEGER DEFAULT 0,
    last_request_at        TIMESTAMPTZ,
    last_reset_at          TIMESTAMPTZ DEFAULT NOW(),

    -- Health
    is_enabled             BOOLEAN NOT NULL DEFAULT true,
    is_healthy             BOOLEAN NOT NULL DEFAULT true,
    last_error             TEXT,
    last_success_at        TIMESTAMPTZ,

    -- Supported categories
    supported_categories   market_category_type[] DEFAULT '{}',

    -- Custom config
    config                 JSONB DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(source_type, name)
);

-- RLS: service role only
ALTER TABLE public.market_data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can manage data sources" ON public.market_data_sources
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_market_data_sources_updated_at ON public.market_data_sources;
CREATE TRIGGER update_market_data_sources_updated_at
    BEFORE UPDATE ON public.market_data_sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.market_data_sources IS 'ETL data source configuration with API key references and rate tracking';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. MARKET DATA ITEMS TABLE                                              ║
-- ║    Unified storage for ALL market-related data from various ETL sources ║
-- ║                                                                         ║
-- ║    R2 STRATEGY: image_url, thumbnail_url → Cloudflare R2               ║
-- ║    raw_response JSONB kept small; full payloads archived to R2          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.market_data_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id       VARCHAR(255) NOT NULL,
    source            market_data_source_type NOT NULL,
    category          market_category_type NOT NULL,
    content_type      market_content_type NOT NULL DEFAULT 'news',

    -- Core content
    title             TEXT NOT NULL,
    description       TEXT,
    content           TEXT,
    summary           TEXT,

    -- Media (URLs point to Cloudflare R2 after backend processing)
    url               TEXT,
    image_url         TEXT,          -- R2: /{category}/{date}/{hash}.webp
    thumbnail_url     TEXT,          -- R2: /{category}/{date}/{hash}_thumb.webp

    -- Attribution
    source_name       VARCHAR(200),
    author            VARCHAR(200),

    -- Temporal
    published_at      TIMESTAMPTZ,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ,

    -- Classification
    tags              TEXT[] DEFAULT '{}',
    keywords          TEXT[] DEFAULT '{}',
    entities          JSONB DEFAULT '[]',

    -- Analysis scores
    impact            impact_level DEFAULT 'medium',
    sentiment         sentiment_type DEFAULT 'neutral',
    sentiment_score   DECIMAL(5,4),       -- -1.0 to 1.0
    relevance_score   DECIMAL(5,4) DEFAULT 0.5,
    confidence_score  DECIMAL(5,4) DEFAULT 0.5,

    -- Market potential
    is_market_worthy  BOOLEAN DEFAULT false,
    market_id         UUID,

    -- Deduplication
    content_hash      VARCHAR(64),        -- SHA256 of normalized content
    is_duplicate      BOOLEAN DEFAULT false,
    duplicate_of      UUID REFERENCES public.market_data_items(id),

    -- Status
    is_processed      BOOLEAN DEFAULT false,
    is_active         BOOLEAN DEFAULT true,
    processing_errors TEXT[],

    -- Metadata (kept minimal; full raw_response archived to R2)
    metadata          JSONB DEFAULT '{}'::jsonb,
    raw_response      JSONB,              -- Truncated; full payload in R2

    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(external_id, source)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mdi_category ON public.market_data_items(category);
CREATE INDEX IF NOT EXISTS idx_mdi_source ON public.market_data_items(source);
CREATE INDEX IF NOT EXISTS idx_mdi_content_type ON public.market_data_items(content_type);
CREATE INDEX IF NOT EXISTS idx_mdi_published ON public.market_data_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_mdi_fetched ON public.market_data_items(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_mdi_impact ON public.market_data_items(impact);
CREATE INDEX IF NOT EXISTS idx_mdi_sentiment ON public.market_data_items(sentiment);
CREATE INDEX IF NOT EXISTS idx_mdi_active ON public.market_data_items(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mdi_market_worthy ON public.market_data_items(is_market_worthy) WHERE is_market_worthy = true;
CREATE INDEX IF NOT EXISTS idx_mdi_external ON public.market_data_items(external_id, source);
CREATE INDEX IF NOT EXISTS idx_mdi_hash ON public.market_data_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_mdi_tags ON public.market_data_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mdi_keywords ON public.market_data_items USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_mdi_title_search ON public.market_data_items USING GIN(to_tsvector('english', title));

-- RLS
ALTER TABLE public.market_data_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market data items are viewable by everyone" ON public.market_data_items
    FOR SELECT USING (is_active = true);
CREATE POLICY "Only service role can manage market data items" ON public.market_data_items
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_market_data_items_updated_at ON public.market_data_items;
CREATE TRIGGER update_market_data_items_updated_at
    BEFORE UPDATE ON public.market_data_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.market_data_items IS 'Unified market data from ETL. Images → R2, raw_response truncated; full payload archived to R2.';
COMMENT ON COLUMN public.market_data_items.content_hash IS 'SHA256 hash for deduplication';
COMMENT ON COLUMN public.market_data_items.image_url IS 'Cloudflare R2 URL: /{category}/{date}/{hash}.webp';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. ETL SYNC LOGS                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.market_data_sync_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source            market_data_source_type NOT NULL,
    category          market_category_type,
    sync_type         VARCHAR(50) NOT NULL,     -- 'full', 'incremental', 'live'

    -- Timing
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    duration_ms       INTEGER,

    -- Results
    status            sync_status NOT NULL DEFAULT 'pending',
    records_fetched   INTEGER DEFAULT 0,
    records_created   INTEGER DEFAULT 0,
    records_updated   INTEGER DEFAULT 0,
    records_skipped   INTEGER DEFAULT 0,
    records_failed    INTEGER DEFAULT 0,
    duplicates_found  INTEGER DEFAULT 0,

    -- Error
    error_message     TEXT,
    error_details     JSONB,
    retry_count       INTEGER DEFAULT 0,

    -- Request
    request_url       TEXT,
    request_params    JSONB,
    response_status   INTEGER,

    -- Metadata
    triggered_by      VARCHAR(100) DEFAULT 'cron',
    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON public.market_data_sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_category ON public.market_data_sync_logs(category);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON public.market_data_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON public.market_data_sync_logs(started_at DESC);

ALTER TABLE public.market_data_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access sync logs" ON public.market_data_sync_logs
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.market_data_sync_logs IS 'ETL sync operation audit trail';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. API RATE LIMIT TRACKING                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.market_api_rate_limits (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source               market_data_source_type NOT NULL,
    minute_window        TIMESTAMPTZ NOT NULL,
    day_window           DATE NOT NULL,
    requests_in_minute   INTEGER DEFAULT 0,
    requests_in_day      INTEGER DEFAULT 0,
    minute_limit         INTEGER DEFAULT 60,
    day_limit            INTEGER DEFAULT 1000,
    is_throttled         BOOLEAN DEFAULT false,
    throttled_until      TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(source, minute_window)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_source ON public.market_api_rate_limits(source);
CREATE INDEX IF NOT EXISTS idx_rate_limits_throttled ON public.market_api_rate_limits(is_throttled)
    WHERE is_throttled = true;

ALTER TABLE public.market_api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access rate limits" ON public.market_api_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_market_api_rate_limits_updated_at ON public.market_api_rate_limits;
CREATE TRIGGER update_market_api_rate_limits_updated_at
    BEFORE UPDATE ON public.market_api_rate_limits
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. MARKET GENERATION QUEUE                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.market_generation_queue (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id         UUID NOT NULL REFERENCES public.market_data_items(id) ON DELETE CASCADE,
    category             market_category_type NOT NULL,
    status               VARCHAR(50) DEFAULT 'pending',
    priority             INTEGER DEFAULT 0,
    generated_market_id  UUID,
    generated_title      TEXT,
    generated_question   TEXT,
    processed_at         TIMESTAMPTZ,
    error_message        TEXT,
    retry_count          INTEGER DEFAULT 0,
    metadata             JSONB DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_queue_status ON public.market_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_gen_queue_priority ON public.market_generation_queue(priority DESC, created_at ASC);

ALTER TABLE public.market_generation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access generation queue" ON public.market_generation_queue
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_market_generation_queue_updated_at ON public.market_generation_queue;
CREATE TRIGGER update_market_generation_queue_updated_at
    BEFORE UPDATE ON public.market_generation_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. NLP SENTIMENT CACHE                                                  ║
-- ║    Cache HuggingFace/FinBERT results to avoid re-analysis.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.nlp_sentiment_cache (
    content_hash       TEXT PRIMARY KEY,               -- SHA256 of normalized text
    text_content       TEXT NOT NULL,
    sentiment          sentiment_type NOT NULL,
    sentiment_score    DECIMAL(5,4) NOT NULL,
    model_used         TEXT NOT NULL,                   -- 'finbert', 'distilbert', etc.
    confidence         DECIMAL(5,4),
    analyzed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata           JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nlp_cache_model ON public.nlp_sentiment_cache(model_used);
CREATE INDEX IF NOT EXISTS idx_nlp_cache_sentiment ON public.nlp_sentiment_cache(sentiment);
CREATE INDEX IF NOT EXISTS idx_nlp_cache_analyzed ON public.nlp_sentiment_cache(analyzed_at DESC);

ALTER TABLE public.nlp_sentiment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages NLP cache" ON public.nlp_sentiment_cache
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read NLP cache" ON public.nlp_sentiment_cache
    FOR SELECT TO public USING (true);

COMMENT ON TABLE public.nlp_sentiment_cache IS 'NLP sentiment analysis cache. Ensures each unique text is analyzed only once.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. RATE LIMIT HELPER FUNCTIONS                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Check if a source can proceed with a request
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_source TEXT)
RETURNS TABLE (
    can_proceed BOOLEAN,
    requests_remaining_minute INTEGER,
    requests_remaining_day INTEGER,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_minute_window TIMESTAMPTZ;
    v_day_window DATE;
    v_minute_count INTEGER;
    v_day_count INTEGER;
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
BEGIN
    v_minute_window := date_trunc('minute', NOW());
    v_day_window := CURRENT_DATE;

    SELECT
        COALESCE(SUM(requests_in_minute), 0),
        COALESCE(SUM(requests_in_day), 0),
        COALESCE(MAX(minute_limit), 60),
        COALESCE(MAX(day_limit), 1000)
    INTO v_minute_count, v_day_count, v_minute_limit, v_day_limit
    FROM public.market_api_rate_limits arl
    WHERE arl.source::TEXT = p_source
    AND (arl.minute_window = v_minute_window OR arl.day_window = v_day_window);

    RETURN QUERY SELECT
        (COALESCE(v_minute_count, 0) < v_minute_limit
         AND COALESCE(v_day_count, 0) < v_day_limit),
        GREATEST(0, v_minute_limit - COALESCE(v_minute_count, 0)),
        GREATEST(0, v_day_limit - COALESCE(v_day_count, 0)),
        CASE
            WHEN COALESCE(v_minute_count, 0) >= v_minute_limit THEN 60
            WHEN COALESCE(v_day_count, 0) >= v_day_limit THEN
                EXTRACT(EPOCH FROM (v_day_window + INTERVAL '1 day' - NOW()))::INTEGER
            ELSE 0
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Increment rate limit counter after a request
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_source TEXT)
RETURNS VOID AS $$
DECLARE
    v_minute_window TIMESTAMPTZ;
    v_day_window DATE;
BEGIN
    v_minute_window := date_trunc('minute', NOW());
    v_day_window := CURRENT_DATE;

    INSERT INTO public.market_api_rate_limits (source, minute_window, day_window, requests_in_minute, requests_in_day)
    VALUES (p_source::market_data_source_type, v_minute_window, v_day_window, 1, 1)
    ON CONFLICT (source, minute_window) DO UPDATE SET
        requests_in_minute = market_api_rate_limits.requests_in_minute + 1,
        requests_in_day = CASE
            WHEN market_api_rate_limits.day_window = v_day_window
            THEN market_api_rate_limits.requests_in_day + 1
            ELSE 1
        END,
        day_window = v_day_window,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Get latest market data items by category
CREATE OR REPLACE FUNCTION public.get_market_data_by_category(
    p_category TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID, title TEXT, description TEXT, source_name VARCHAR,
    published_at TIMESTAMPTZ, impact impact_level, sentiment sentiment_type,
    image_url TEXT, url TEXT, tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mdi.id, mdi.title, mdi.description, mdi.source_name,
        mdi.published_at, mdi.impact, mdi.sentiment,
        mdi.image_url, mdi.url, mdi.tags
    FROM public.market_data_items mdi
    WHERE mdi.category::TEXT = p_category
      AND mdi.is_active = true
      AND mdi.is_duplicate = false
      AND (p_content_type IS NULL OR mdi.content_type::TEXT = p_content_type)
    ORDER BY mdi.published_at DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. SEED DEFAULT DATA SOURCES                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.market_data_sources (source_type, name, base_url, api_key_env_var, rate_limit_per_minute, rate_limit_per_day, supported_categories)
VALUES
    ('newsapi', 'NewsAPI', 'https://newsapi.org/v2', 'NEWSAPI_KEY', 100, 1000, ARRAY['politics','finance','tech','latest']::market_category_type[]),
    ('gdelt', 'GDELT Project', 'https://api.gdeltproject.org/api/v2', NULL, 60, 10000, ARRAY['politics','economy','signals']::market_category_type[]),
    ('alpha_vantage', 'Alpha Vantage', 'https://www.alphavantage.co', 'ALPHA_VANTAGE_API_KEY', 5, 500, ARRAY['finance']::market_category_type[]),
    ('coingecko', 'CoinGecko', 'https://api.coingecko.com/api/v3', NULL, 50, 10000, ARRAY['crypto']::market_category_type[]),
    ('coinmarketcap', 'CoinMarketCap', 'https://pro-api.coinmarketcap.com/v1', 'COINMARKETCAP_API_KEY', 30, 10000, ARRAY['crypto']::market_category_type[]),
    ('cryptopanic', 'CryptoPanic', 'https://cryptopanic.com/api/v1', 'CRYPTOPANIC_API_KEY', 60, 1000, ARRAY['crypto']::market_category_type[]),
    ('hackernews', 'HackerNews', 'https://hacker-news.firebaseio.com/v0', NULL, 100, 100000, ARRAY['tech','signals']::market_category_type[]),
    ('worldbank', 'World Bank', 'https://api.worldbank.org/v2', NULL, 60, 10000, ARRAY['economy']::market_category_type[]),
    ('arxiv', 'arXiv', 'http://export.arxiv.org/api', NULL, 60, 10000, ARRAY['science']::market_category_type[]),
    ('pubmed', 'PubMed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils', NULL, 10, 1000, ARRAY['science']::market_category_type[]),
    ('semantic_scholar', 'Semantic Scholar', 'https://api.semanticscholar.org/graph/v1', NULL, 100, 5000, ARRAY['science']::market_category_type[])
ON CONFLICT (source_type, name) DO NOTHING;
