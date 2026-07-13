-- ============================================================================
-- ExoDuZe — Full SQL: Competition Infrastructure
-- File: 004_competitions.sql
--
-- PURPOSE: Sector-based AI agent competitions with timing, prize pools,
--          probability history, news clusters, auto-status transitions,
--          and anti-recycling source tracking.
--
-- CLOUDFLARE R2: competition image_url → R2 CDN path.
--                Probability history archives (>7 days) → R2 JSON batches.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. COMPETITIONS TABLE                                                   ║
-- ║    Core competition entity with timing, outcomes, and on-chain refs.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.competitions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Market linkage (optional)
    market_id              UUID REFERENCES public.markets(id) ON DELETE SET NULL,

    -- Core info
    title                  VARCHAR(200) NOT NULL,
    description            TEXT,
    sector                 VARCHAR(20) NOT NULL,
        -- sports, politics, finance, tech, crypto, economy, science, signals

    -- Teams / Outcomes
    team_home              VARCHAR(100),
    team_away              VARCHAR(100),
    outcomes               TEXT[] DEFAULT ARRAY['Yes', 'No'],

    -- Competition timing
    competition_start      TIMESTAMPTZ NOT NULL,
    competition_end        TIMESTAMPTZ NOT NULL,

    -- Horizon tier for cost-optimized scheduling
    time_horizon           TEXT,                  -- '2h', '7h', '12h', '24h'
    base_probability       NUMERIC(5,4) DEFAULT 0.5000,

    -- Status & settlement
    status                 competition_status NOT NULL DEFAULT 'upcoming',
    winning_outcome        INTEGER,               -- Index into outcomes array

    -- Prize pool (synced from competition_pools)
    prize_pool             DECIMAL(18,8) DEFAULT 0.00,
    entry_count            INTEGER DEFAULT 0,
    max_entries            INTEGER DEFAULT 1000,

    -- Probabilities (basis points, sum to 10000)
    probabilities          INTEGER[] DEFAULT ARRAY[5000, 5000],

    -- On-chain references (Solana devnet)
    onchain_market_pubkey  VARCHAR(64),
    onchain_tx_signature   VARCHAR(128),

    -- Bonding curve config
    bonding_k              BIGINT DEFAULT 100000,
    bonding_n              INTEGER DEFAULT 150,

    -- Metadata
    tags                   TEXT[] DEFAULT '{}',
    image_url              TEXT,                   -- Cloudflare R2 URL
    metadata               JSONB DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_competition_timing CHECK (competition_end > competition_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitions_sector ON public.competitions(sector);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_start ON public.competitions(competition_start DESC);
CREATE INDEX IF NOT EXISTS idx_competitions_end ON public.competitions(competition_end);
CREATE INDEX IF NOT EXISTS idx_competitions_market ON public.competitions(market_id);
CREATE INDEX IF NOT EXISTS idx_competitions_sector_status ON public.competitions(sector, status);
CREATE INDEX IF NOT EXISTS idx_competitions_active ON public.competitions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_competitions_upcoming ON public.competitions(status, competition_start)
    WHERE status = 'upcoming';
CREATE INDEX IF NOT EXISTS idx_competitions_end_status ON public.competitions(competition_end, status)
    WHERE status IN ('active', 'upcoming');

-- RLS
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Competitions are viewable by everyone" ON public.competitions
    FOR SELECT USING (status IN ('upcoming', 'active', 'settled'));
CREATE POLICY "Service role manages all competitions" ON public.competitions
    FOR ALL USING (auth.role() = 'service_role');

-- Updated At
DROP TRIGGER IF EXISTS update_competitions_updated_at ON public.competitions;
CREATE TRIGGER update_competitions_updated_at
    BEFORE UPDATE ON public.competitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitions;
ALTER TABLE public.competitions REPLICA IDENTITY FULL;

COMMENT ON TABLE public.competitions IS 'AI agent competitions per sector with 4 horizon tiers (2h/7h/12h/24h)';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. AUTO-STATUS TRANSITION TRIGGER                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.update_competition_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'upcoming'
       AND NOW() >= NEW.competition_start
       AND NOW() < NEW.competition_end
    THEN
        NEW.status := 'active';
    END IF;

    IF NEW.status = 'active'
       AND NOW() >= NEW.competition_end
       AND NEW.winning_outcome IS NOT NULL
    THEN
        NEW.status := 'settled';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS competition_auto_status ON public.competitions;
CREATE TRIGGER competition_auto_status
    BEFORE INSERT OR UPDATE ON public.competitions
    FOR EACH ROW EXECUTE FUNCTION public.update_competition_status();

COMMENT ON FUNCTION public.update_competition_status() IS 'Auto-transitions competition status based on timing';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. PROBABILITY HISTORY TABLE                                            ║
-- ║    Stores curve snapshot history for competitions.                      ║
-- ║    Hot data (<48h): full detail. Cold data (>7d): archived to R2.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.probability_history (
    id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id           UUID NOT NULL,
    time_label               TEXT NOT NULL,

    -- Probability values (0-100)
    home                     NUMERIC(8,4) NOT NULL,
    draw                     NUMERIC(8,4) NOT NULL,
    away                     NUMERIC(8,4) NOT NULL,

    -- Narrative & regime
    narrative                TEXT,
    regime                   TEXT DEFAULT 'neutral',

    -- Entropy & chaos (hot data only; NULL'd for old rows to save space)
    entropy_seed             TEXT,
    source_fingerprint       TEXT,
    source_count             INTEGER DEFAULT 1,
    chaos_state              JSONB,
    security_nonce           TEXT,
    data_sources             TEXT[] DEFAULT '{}',
    signal_vector            JSONB,

    -- Category
    category                 TEXT DEFAULT 'sports',

    created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prob_history_comp_created
    ON public.probability_history(competition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prob_history_category
    ON public.probability_history(category);
-- Partial index: only index rows that still have a nonce (hot data)
CREATE INDEX IF NOT EXISTS idx_prob_history_nonce_partial
    ON public.probability_history(security_nonce)
    WHERE security_nonce IS NOT NULL;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.probability_history;

-- RLS
ALTER TABLE public.probability_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on probability_history"
    ON public.probability_history FOR SELECT USING (true);
CREATE POLICY "Allow service role insert on probability_history"
    ON public.probability_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role manages probability_history"
    ON public.probability_history FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE public.probability_history IS 'Tick-by-tick probability curve history. Hot data is full-detail; old rows have metadata stripped. Cold data archived to R2.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. PROBABILITY HISTORY SUMMARY (Downsampled)                            ║
-- ║    1 data point per minute per competition (10-20x space savings)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.probability_history_summary (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    competition_id    UUID NOT NULL,
    category          TEXT NOT NULL,
    bucket_time       TIMESTAMPTZ NOT NULL,

    -- Averaged values
    home_avg          NUMERIC(8,4) NOT NULL,
    draw_avg          NUMERIC(8,4) NOT NULL,
    away_avg          NUMERIC(8,4) NOT NULL,

    -- Volatility range
    home_min          NUMERIC(8,4),
    home_max          NUMERIC(8,4),
    away_min          NUMERIC(8,4),
    away_max          NUMERIC(8,4),

    -- Metadata
    regime            TEXT,
    tick_count         INTEGER DEFAULT 1,
    narrative         TEXT,

    CONSTRAINT unique_summary_bucket UNIQUE (competition_id, bucket_time)
);

CREATE INDEX IF NOT EXISTS idx_summary_comp_time
    ON public.probability_history_summary(competition_id, bucket_time DESC);
CREATE INDEX IF NOT EXISTS idx_summary_category
    ON public.probability_history_summary(category);

ALTER TABLE public.probability_history_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on probability summary"
    ON public.probability_history_summary FOR SELECT USING (true);
CREATE POLICY "Service role manages probability summary"
    ON public.probability_history_summary FOR ALL
    USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.probability_history_summary;

COMMENT ON TABLE public.probability_history_summary IS 'Downsampled probability history: 1 point/minute. Used for historical charts after hot data compacted.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. PROBABILITY HISTORY LEAN VIEW                                        ║
-- ║    Frontend-optimized view excluding heavy metadata columns.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW public.probability_history_lean AS
SELECT id, competition_id, time_label, home, draw, away,
       narrative, regime, category, created_at
FROM public.probability_history;

GRANT SELECT ON public.probability_history_lean TO anon, authenticated;

COMMENT ON VIEW public.probability_history_lean IS 'Lean view excluding chaos_state, signal_vector, entropy_seed for frontend.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. NEWS CLUSTERS TABLE                                                  ║
-- ║    Real-time AI probability streams from clustered news articles.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.news_clusters (
    id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    cluster_hash      TEXT NOT NULL,
    article_urls      TEXT[] NOT NULL DEFAULT '{}',
    signals           JSONB NOT NULL DEFAULT '[]'::jsonb,
    sentiment         NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_clusters_competition_id
    ON public.news_clusters(competition_id);

ALTER TABLE public.news_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.news_clusters
    FOR SELECT TO public USING (true);
CREATE POLICY "Enable service role access" ON public.news_clusters
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.news_clusters IS 'Clustered news articles per competition for NLP sentiment aggregation';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. USED COMPETITION SOURCES (Anti-Recycling)                            ║
-- ║    Tracks every ETL record consumed by a competition.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.used_competition_sources (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id   UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    source_table     TEXT NOT NULL,           -- e.g., 'market_data_items'
    source_id        TEXT NOT NULL,           -- Original ETL item ID
    source_title     TEXT,                    -- Cached title for debugging
    category         TEXT NOT NULL,
    consumed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_used_sources_category
    ON public.used_competition_sources(category);
CREATE INDEX IF NOT EXISTS idx_used_sources_source
    ON public.used_competition_sources(source_table, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_used_sources_unique
    ON public.used_competition_sources(source_table, source_id, competition_id);

-- RLS
ALTER TABLE public.used_competition_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages used sources" ON public.used_competition_sources
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.used_competition_sources IS 'Anti-recycling: tracks every ETL source consumed per competition';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. HELPER FUNCTIONS                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Get competitions by sector
CREATE OR REPLACE FUNCTION public.get_competitions_by_sector(
    p_sector TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active',
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID, title VARCHAR, description TEXT, sector VARCHAR,
    team_home VARCHAR, team_away VARCHAR, outcomes TEXT[],
    competition_start TIMESTAMPTZ, competition_end TIMESTAMPTZ,
    status competition_status, prize_pool DECIMAL, entry_count INTEGER,
    probabilities INTEGER[], onchain_market_pubkey VARCHAR,
    image_url TEXT, tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id, c.title, c.description, c.sector,
        c.team_home, c.team_away, c.outcomes,
        c.competition_start, c.competition_end, c.status,
        c.prize_pool, c.entry_count, c.probabilities,
        c.onchain_market_pubkey, c.image_url, c.tags
    FROM public.competitions c
    WHERE (p_sector IS NULL OR c.sector = p_sector)
      AND c.status::TEXT = p_status
    ORDER BY c.competition_start ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Get sector competition counts
CREATE OR REPLACE FUNCTION public.get_sector_competition_counts()
RETURNS TABLE (sector VARCHAR, active_count BIGINT, upcoming_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.sector::VARCHAR,
        COUNT(*) FILTER (WHERE c.status = 'active'),
        COUNT(*) FILTER (WHERE c.status = 'upcoming')
    FROM public.competitions c
    WHERE c.status IN ('active', 'upcoming')
    GROUP BY c.sector
    ORDER BY active_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Get consumed source IDs for anti-recycling
CREATE OR REPLACE FUNCTION public.get_used_source_ids(p_category TEXT, p_source_table TEXT)
RETURNS TABLE(source_id TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT ucs.source_id
    FROM public.used_competition_sources ucs
    WHERE ucs.category = p_category
      AND ucs.source_table = p_source_table
    ORDER BY ucs.consumed_at DESC
    LIMIT 1000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Record consumed sources after competition creation
CREATE OR REPLACE FUNCTION public.record_used_sources(
    p_competition_id UUID,
    p_category TEXT,
    p_sources JSONB
)
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER := 0;
    src JSONB;
BEGIN
    FOR src IN SELECT * FROM jsonb_array_elements(p_sources)
    LOOP
        INSERT INTO public.used_competition_sources
            (competition_id, source_table, source_id, source_title, category)
        VALUES (
            p_competition_id,
            src->>'source_table',
            src->>'source_id',
            src->>'source_title',
            p_category
        )
        ON CONFLICT (source_table, source_id, competition_id) DO NOTHING;
        inserted_count := inserted_count + 1;
    END LOOP;
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Cleanup old used sources (30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_used_sources()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.used_competition_sources
    WHERE consumed_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grants
GRANT SELECT, INSERT ON public.used_competition_sources TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.used_competition_sources TO service_role;
GRANT EXECUTE ON FUNCTION public.get_used_source_ids(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_used_sources(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_used_sources() TO service_role;
GRANT SELECT ON public.probability_history_summary TO anon, authenticated;

COMMENT ON FUNCTION public.get_competitions_by_sector(TEXT, TEXT, INTEGER) IS 'Get competitions filtered by sector and status';
COMMENT ON FUNCTION public.get_sector_competition_counts() IS 'Get active/upcoming competition counts per sector';
