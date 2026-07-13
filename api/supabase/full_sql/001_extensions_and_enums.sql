-- ============================================================================
-- ExoDuZe — Full SQL: Extensions & ENUM Types
-- File: 001_extensions_and_enums.sql
--
-- PURPOSE: Enable required PostgreSQL extensions and create all ENUM types
--          used across the ExoDuZe platform.
--
-- EXECUTION ORDER: Run this file FIRST before any other migration.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. PostgreSQL Extensions                                               ║
-- ║    NOTE: If running in a read-only transaction (e.g. Supabase pooled    ║
-- ║    connection or transaction block), CREATE EXTENSION will fail.        ║
-- ║    Please enable these extensions in the Supabase Dashboard:            ║
-- ║    Database -> Extensions -> Enable "uuid-ossp", "pgcrypto", "pg_trgm"  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT * FROM pg_extension; -- Check existing extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation (uuid_generate_v4)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- SHA256, gen_random_uuid, HMAC
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Trigram similarity for fuzzy search


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. Agent & Competition ENUMs                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Agent lifecycle status
DO $$ BEGIN
    CREATE TYPE agent_status AS ENUM (
        'pending',
        'active',
        'paused',
        'terminated',
        'error',
        'completed',
        'evaluated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent sector classification
DO $$ BEGIN
    CREATE TYPE agent_sector AS ENUM (
        'sports', 'politics', 'finance', 'tech',
        'crypto', 'economy', 'science', 'signals'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent risk level
DO $$ BEGIN
    CREATE TYPE agent_risk_level AS ENUM (
        'conservative', 'moderate', 'aggressive', 'ultra_aggressive'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Competition lifecycle status
DO $$ BEGIN
    CREATE TYPE competition_status AS ENUM (
        'upcoming', 'active', 'settled', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pool settlement lifecycle
DO $$ BEGIN
    CREATE TYPE pool_settlement_status AS ENUM (
        'pending', 'settling', 'settled', 'disputed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Scoring weight mode
DO $$ BEGIN
    CREATE TYPE score_weight_mode AS ENUM (
        'time_decay', 'volatility_weighted', 'hybrid'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. Market Data ENUMs                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
    CREATE TYPE market_category_type AS ENUM (
        'politics', 'finance', 'tech', 'crypto',
        'economy', 'science', 'signals', 'latest'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE market_data_source_type AS ENUM (
        'newsapi', 'gdelt', 'alpha_vantage', 'coingecko', 'coinmarketcap',
        'cryptopanic', 'hackernews', 'worldbank', 'imf', 'semantic_scholar',
        'arxiv', 'crossref', 'pubmed', 'rss', 'manual', 'etl_orchestrator'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE market_content_type AS ENUM (
        'news', 'event', 'indicator', 'price',
        'research', 'signal', 'trend', 'forecast'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE impact_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sentiment_type AS ENUM ('bearish', 'neutral', 'bullish');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sync_status AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. Shared Utility Functions                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Auto-update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Content hash for deduplication (SHA256 normalized title + source)
CREATE OR REPLACE FUNCTION public.generate_content_hash(
    p_title TEXT,
    p_source TEXT
)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(
        sha256(
            (LOWER(TRIM(REGEXP_REPLACE(p_title, '[^a-zA-Z0-9]', '', 'g'))) || '::' || p_source)::bytea
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function: auto-set updated_at to NOW() on row update';
COMMENT ON FUNCTION public.generate_content_hash(TEXT, TEXT) IS 'SHA256 content hash for deduplication: normalize(title) || source';
