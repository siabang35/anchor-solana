-- ============================================================================
-- ExoDuZe — Sports Leagues, Teams, Fixtures, and Scraping Metadata
-- File: 011_sports_metadata_and_scraping.sql
--
-- PURPOSE: Unified sports event pipeline, sports bookmaker odds history,
--          automatic market resolution trigger, and external API sync auditing.
--
-- CLOUDFLARE R2: High-resolution media resources (logos, jerseys, match banners,
--                videos) and heavy raw scraper responses are offloaded directly
--                to Cloudflare R2 storage to optimize DB traffic.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ENUM TYPES FOR SPORTS                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
    CREATE TYPE public.sport_type AS ENUM (
        'afl', 'baseball', 'basketball', 'football', 'formula1', 'handball',
        'hockey', 'mma', 'nba', 'nfl', 'rugby', 'volleyball'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.event_status AS ENUM (
        'scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'suspended'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.sports_market_type AS ENUM (
        'match_winner', 'over_under', 'both_teams_score', 'correct_score',
        'first_scorer', 'handicap', 'custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SPORTS LEAGUES TABLE                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sports_leagues (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id       VARCHAR(100) NOT NULL,
    source            public.market_data_source_type NOT NULL DEFAULT 'manual',
    sport             public.sport_type NOT NULL,
    name              VARCHAR(200) NOT NULL,
    name_alternate    VARCHAR(200),
    country           VARCHAR(100),
    country_code      VARCHAR(10),

    -- R2 Storage assets
    logo_url          TEXT, -- R2 link to cached league logo
    banner_url        TEXT, -- R2 link to league banner
    trophy_url        TEXT, -- R2 link to trophy image

    description       TEXT,
    first_event_date  DATE,
    website           TEXT,
    twitter           TEXT,
    facebook          TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    is_featured       BOOLEAN NOT NULL DEFAULT false,
    display_order     INTEGER DEFAULT 0,
    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_sports_leagues_sport ON public.sports_leagues(sport);
CREATE INDEX IF NOT EXISTS idx_sports_leagues_active ON public.sports_leagues(is_active);

ALTER TABLE public.sports_leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leagues read access for everyone" ON public.sports_leagues
    FOR SELECT USING (true);
CREATE POLICY "Service role manages leagues" ON public.sports_leagues
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_sports_leagues_updated_at ON public.sports_leagues;
CREATE TRIGGER update_sports_leagues_updated_at
    BEFORE UPDATE ON public.sports_leagues
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SPORTS TEAMS TABLE                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sports_teams (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id       VARCHAR(100) NOT NULL,
    source            public.market_data_source_type NOT NULL DEFAULT 'manual',
    league_id         UUID REFERENCES public.sports_leagues(id) ON DELETE SET NULL,
    sport             public.sport_type NOT NULL,
    name              VARCHAR(200) NOT NULL,
    name_short        VARCHAR(50),
    name_alternate    VARCHAR(200),
    country           VARCHAR(100),
    city              VARCHAR(100),
    stadium           VARCHAR(200),
    stadium_capacity  INTEGER,

    -- R2 Storage assets
    logo_url          TEXT, -- R2 URL
    jersey_url        TEXT, -- R2 URL
    banner_url        TEXT, -- R2 URL

    primary_color     VARCHAR(20),
    secondary_color   VARCHAR(20),
    founded_year      INTEGER,
    website           TEXT,
    twitter           TEXT,
    facebook          TEXT,
    instagram         TEXT,
    description       TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_sports_teams_lookup ON public.sports_teams(league_id, sport);
CREATE INDEX IF NOT EXISTS idx_sports_teams_search ON public.sports_teams USING gin (to_tsvector('english', name));

ALTER TABLE public.sports_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams read access for everyone" ON public.sports_teams
    FOR SELECT USING (true);
CREATE POLICY "Service role manages teams" ON public.sports_teams
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_sports_teams_updated_at ON public.sports_teams;
CREATE TRIGGER update_sports_teams_updated_at
    BEFORE UPDATE ON public.sports_teams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. SPORTS EVENTS TABLE                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sports_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id           VARCHAR(100) NOT NULL,
    source                public.market_data_source_type NOT NULL DEFAULT 'manual',
    league_id             UUID REFERENCES public.sports_leagues(id) ON DELETE SET NULL,
    home_team_id          UUID REFERENCES public.sports_teams(id) ON DELETE SET NULL,
    away_team_id          UUID REFERENCES public.sports_teams(id) ON DELETE SET NULL,
    sport                 public.sport_type NOT NULL,
    season                VARCHAR(20),
    round                 VARCHAR(50),
    match_day             INTEGER,

    name                  VARCHAR(300),
    venue                 VARCHAR(200),
    city                  VARCHAR(100),
    country               VARCHAR(100),

    start_time            TIMESTAMPTZ NOT NULL,
    end_time              TIMESTAMPTZ,
    timezone              VARCHAR(50) DEFAULT 'UTC',

    status                public.event_status NOT NULL DEFAULT 'scheduled',
    status_detail         VARCHAR(100),
    elapsed_time          INTEGER, -- minutes elapsed

    home_score            INTEGER,
    away_score            INTEGER,
    home_score_halftime   INTEGER,
    away_score_halftime   INTEGER,
    home_score_extra      INTEGER,
    away_score_extra      INTEGER,
    home_score_penalty    INTEGER,
    away_score_penalty    INTEGER,

    referee               VARCHAR(100),
    attendance            INTEGER,

    -- R2 Storage assets
    thumbnail_url         TEXT, -- R2 URL
    video_url             TEXT, -- R2 URL
    banner_url            TEXT, -- R2 URL

    stats                 JSONB DEFAULT '{}'::jsonb,
    has_market            BOOLEAN NOT NULL DEFAULT false,
    market_created_at     TIMESTAMPTZ,

    is_featured           BOOLEAN NOT NULL DEFAULT false,
    metadata              JSONB DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_sports_events_teams ON public.sports_events(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_sports_events_start ON public.sports_events(start_time) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_sports_events_live ON public.sports_events(status) WHERE status = 'live';

ALTER TABLE public.sports_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events read access for everyone" ON public.sports_events
    FOR SELECT USING (true);
CREATE POLICY "Service role manages events" ON public.sports_events
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_sports_events_updated_at ON public.sports_events;
CREATE TRIGGER update_sports_events_updated_at
    BEFORE UPDATE ON public.sports_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. SPORTS PLAYERS TABLE                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sports_players (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id    VARCHAR(100) NOT NULL,
    source         public.market_data_source_type NOT NULL DEFAULT 'manual',
    team_id        UUID REFERENCES public.sports_teams(id) ON DELETE SET NULL,
    sport          public.sport_type NOT NULL,
    name           VARCHAR(200) NOT NULL,
    name_short     VARCHAR(100),
    nationality    VARCHAR(100),
    birth_date     DATE,
    position       VARCHAR(50),
    jersey_number  INTEGER,
    height         VARCHAR(20),
    weight         VARCHAR(20),

    -- R2 Storage assets
    photo_url      TEXT, -- R2 URL
    thumb_url      TEXT, -- R2 URL

    is_active      BOOLEAN NOT NULL DEFAULT true,
    stats          JSONB DEFAULT '{}'::jsonb,
    metadata       JSONB DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_sports_players_team ON public.sports_players(team_id);

ALTER TABLE public.sports_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read access for everyone" ON public.sports_players
    FOR SELECT USING (true);
CREATE POLICY "Service role manages players" ON public.sports_players
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_sports_players_updated_at ON public.sports_players;
CREATE TRIGGER update_sports_players_updated_at
    BEFORE UPDATE ON public.sports_players
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. SPORTS MARKETS AND ODDS HISTORY                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Link events to ExoDuZe prediction markets
CREATE TABLE IF NOT EXISTS public.sports_markets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE CASCADE,
    market_id         UUID REFERENCES public.markets(id) ON DELETE SET NULL,
    market_type       public.sports_market_type NOT NULL DEFAULT 'match_winner',

    title             VARCHAR(300) NOT NULL,
    description       TEXT,
    question          VARCHAR(500) NOT NULL,

    outcomes          JSONB NOT NULL DEFAULT '["Yes", "No"]'::jsonb,
    outcome_prices    JSONB NOT NULL DEFAULT '[0.50, 0.50]'::jsonb,

    yes_price         DECIMAL(10,6) NOT NULL DEFAULT 0.50,
    no_price          DECIMAL(10,6) NOT NULL DEFAULT 0.50,
    volume            DECIMAL(20,6) NOT NULL DEFAULT 0.00,
    liquidity         DECIMAL(20,6) NOT NULL DEFAULT 0.00,

    resolved          BOOLEAN NOT NULL DEFAULT false,
    outcome           BOOLEAN,
    resolution_source VARCHAR(100),
    resolution_proof  TEXT, -- Stores R2 URL to settled match event sheet or transaction hash
    resolved_at       TIMESTAMPTZ,

    opens_at          TIMESTAMPTZ,
    closes_at         TIMESTAMPTZ,

    is_active         BOOLEAN NOT NULL DEFAULT true,
    is_featured       BOOLEAN NOT NULL DEFAULT false,
    auto_resolve      BOOLEAN NOT NULL DEFAULT true,

    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sports_markets_event ON public.sports_markets(event_id);
CREATE INDEX IF NOT EXISTS idx_sports_markets_resolved ON public.sports_markets(resolved);

ALTER TABLE public.sports_markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sports markets read access" ON public.sports_markets
    FOR SELECT USING (is_active = true);
CREATE POLICY "Service role manages sports markets" ON public.sports_markets
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_sports_markets_updated_at ON public.sports_markets;
CREATE TRIGGER update_sports_markets_updated_at
    BEFORE UPDATE ON public.sports_markets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Odds History
CREATE TABLE IF NOT EXISTS public.sports_odds_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES public.sports_markets(id) ON DELETE CASCADE,
    yes_price   DECIMAL(10,6) NOT NULL,
    no_price    DECIMAL(10,6) NOT NULL,
    volume      DECIMAL(20,6) NOT NULL DEFAULT 0.00,
    source      VARCHAR(50), -- 'user_trade', 'bookmaker', 'algorithm'
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sports_odds_recorded ON public.sports_odds_history(market_id, recorded_at DESC);

ALTER TABLE public.sports_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Odds history read access for everyone" ON public.sports_odds_history
    FOR SELECT USING (true);
CREATE POLICY "Service role manages odds history" ON public.sports_odds_history
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. SYNC AUDIT LOGS                                                       ║
-- ║    R2 Storage: RAW scraper output payloads or heavy JSON bodies          ║
-- ║    are saved to R2; we record the r2_raw_payload_url link in logs.        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sports_sync_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source              public.market_data_source_type NOT NULL,
    sync_type           VARCHAR(50) NOT NULL, -- 'leagues', 'teams', 'events', 'live'
    sport               public.sport_type,
    status              public.sync_status NOT NULL DEFAULT 'pending',

    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    duration_ms         INTEGER,

    records_fetched     INTEGER DEFAULT 0,
    records_created     INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    records_failed      INTEGER DEFAULT 0,

    error_message       TEXT,
    error_details       JSONB,
    retry_count         INTEGER DEFAULT 0,

    request_url         TEXT,
    request_params      JSONB,
    response_status     INTEGER,

    -- URL to RAW response payload saved in Cloudflare R2
    r2_raw_payload_url  TEXT,

    triggered_by        VARCHAR(100), -- 'cron', 'manual', 'webhook'
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sports_sync_lookup ON public.sports_sync_logs(source, status, started_at DESC);

ALTER TABLE public.sports_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role accesses sync logs" ON public.sports_sync_logs
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. HELPER FUNCTIONS                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Get Upcoming Events RPC
CREATE OR REPLACE FUNCTION public.get_upcoming_events(
    p_sport public.sport_type DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID, event_name VARCHAR, home_team VARCHAR, away_team VARCHAR,
    start_time TIMESTAMPTZ, league_name VARCHAR, sport public.sport_type
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.name AS event_name, ht.name AS home_team, at.name AS away_team,
           e.start_time, l.name AS league_name, e.sport
    FROM public.sports_events e
    LEFT JOIN public.sports_teams ht ON e.home_team_id = ht.id
    LEFT JOIN public.sports_teams at ON e.away_team_id = at.id
    LEFT JOIN public.sports_leagues l ON e.league_id = l.id
    WHERE e.status = 'scheduled'
      AND e.start_time > NOW()
      AND (p_sport IS NULL OR e.sport = p_sport)
    ORDER BY e.start_time ASC LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Get Live Events RPC
CREATE OR REPLACE FUNCTION public.get_live_events(
    p_sport public.sport_type DEFAULT NULL
) RETURNS TABLE (
    id UUID, event_name VARCHAR, home_team VARCHAR, away_team VARCHAR,
    home_score INTEGER, away_score INTEGER, elapsed_time INTEGER,
    league_name VARCHAR, sport public.sport_type
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.name AS event_name, ht.name AS home_team, at.name AS away_team,
           e.home_score, e.away_score, e.elapsed_time, l.name AS league_name, e.sport
    FROM public.sports_events e
    LEFT JOIN public.sports_teams ht ON e.home_team_id = ht.id
    LEFT JOIN public.sports_teams at ON e.away_team_id = at.id
    LEFT JOIN public.sports_leagues l ON e.league_id = l.id
    WHERE e.status = 'live'
      AND (p_sport IS NULL OR e.sport = p_sport)
    ORDER BY e.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Auto Resolve Trigger
CREATE OR REPLACE FUNCTION public.auto_resolve_sports_market()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        UPDATE public.sports_markets SET
            resolved = true,
            resolved_at = NOW(),
            resolution_source = 'auto',
            outcome = CASE
                WHEN market_type = 'match_winner' THEN
                    CASE
                        WHEN NEW.home_score > NEW.away_score THEN true  -- Yes outcome (Home team wins)
                        WHEN NEW.away_score > NEW.home_score THEN false -- No outcome (Away team wins)
                        ELSE NULL -- Draw (Requires manual resolution)
                    END
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE event_id = NEW.id
          AND resolved = false
          AND auto_resolve = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_auto_resolve_sports_market ON public.sports_events;
CREATE TRIGGER trigger_auto_resolve_sports_market
    AFTER UPDATE ON public.sports_events
    FOR EACH ROW EXECUTE FUNCTION public.auto_resolve_sports_market();

-- Grants
GRANT EXECUTE ON FUNCTION public.get_upcoming_events(public.sport_type, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_events(public.sport_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_resolve_sports_market() TO service_role;
