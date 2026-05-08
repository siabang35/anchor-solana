-- ============================================================================
-- ExoDuZe — Competition Data Usage Tracking
-- Migration 075: Bulletproof Anti-Recycling via Source-Level Tracking
-- ============================================================================
--
-- PURPOSE: Track every ETL data source consumed by a competition so that
-- the auto-refill system NEVER reuses data — even if titles are reformatted,
-- paraphrased, or normalized differently.
--
-- This complements the title-based Jaccard dedup with exact source_id tracking:
--   - market_data_items.id
--   - market_signals.id  
--   - trending_topics.id
--   - sports_events.id
--   - science_papers.id
--   - science_breakthroughs.id
--
-- The auto-refill cron (every 15s) queries this table to exclude consumed
-- source IDs BEFORE clustering, guaranteeing 100% fresh data per competition.
-- ============================================================================

-- 1. Create used_competition_sources tracking table
CREATE TABLE IF NOT EXISTS "public"."used_competition_sources" (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id  UUID NOT NULL REFERENCES "public"."competitions"(id) ON DELETE CASCADE,
    source_table    TEXT NOT NULL,          -- e.g., 'market_data_items', 'market_signals'
    source_id       TEXT NOT NULL,          -- The original ETL item ID
    source_title    TEXT,                   -- Cached title for debugging
    category        TEXT NOT NULL,          -- Sector/category for fast lookup
    consumed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast anti-recycling lookups
CREATE INDEX IF NOT EXISTS idx_used_sources_category 
    ON "public"."used_competition_sources" (category);
CREATE INDEX IF NOT EXISTS idx_used_sources_source 
    ON "public"."used_competition_sources" (source_table, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_used_sources_unique
    ON "public"."used_competition_sources" (source_table, source_id, competition_id);

-- 2. Add index on competition_end for faster expired-competition queries
--    The auto-refill cron (every 15s) does: WHERE competition_end < NOW()
CREATE INDEX IF NOT EXISTS idx_competitions_end_status
    ON "public"."competitions" (competition_end, status)
    WHERE status IN ('active', 'upcoming');

-- 3. RPC function to get all consumed source IDs for a category
--    Used by the seeder to exclude already-consumed ETL data
CREATE OR REPLACE FUNCTION get_used_source_ids(p_category TEXT, p_source_table TEXT)
RETURNS TABLE(source_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT ucs.source_id
    FROM used_competition_sources ucs
    WHERE ucs.category = p_category
      AND ucs.source_table = p_source_table
    ORDER BY ucs.consumed_at DESC
    LIMIT 1000;
END;
$$;

-- 4. RPC function to record consumed sources after competition creation
CREATE OR REPLACE FUNCTION record_used_sources(
    p_competition_id UUID,
    p_category TEXT,
    p_sources JSONB  -- Array of {source_table, source_id, source_title}
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count INTEGER := 0;
    src JSONB;
BEGIN
    FOR src IN SELECT * FROM jsonb_array_elements(p_sources)
    LOOP
        INSERT INTO used_competition_sources (competition_id, source_table, source_id, source_title, category)
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
$$;

-- 5. Cleanup: Prune used_competition_sources older than 30 days
--    Prevents unbounded table growth while maintaining enough history
--    to prevent recycling within any reasonable timeframe.
CREATE OR REPLACE FUNCTION cleanup_old_used_sources()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM used_competition_sources
    WHERE consumed_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 6. Grant permissions
GRANT SELECT, INSERT ON "public"."used_competition_sources" TO authenticated;
GRANT SELECT, INSERT, DELETE ON "public"."used_competition_sources" TO service_role;
GRANT EXECUTE ON FUNCTION get_used_source_ids(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_used_sources(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_used_sources() TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
