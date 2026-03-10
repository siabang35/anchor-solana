-- ============================================================================
-- ExoDuZe — Market Data Realtime Broadcasting (052_market_realtime.sql)
-- Enable real-time updates for market data tables so frontend can subscribe
-- ============================================================================

-- ============================================================================
-- 1. ADD MARKET TABLES TO REALTIME PUBLICATION
-- ============================================================================

-- Market data items — the main feed data (politics, finance, tech, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data_items;

-- Markets — the AI agent competition markets
ALTER PUBLICATION supabase_realtime ADD TABLE public.markets;

-- Market generation queue — so admin can see market creation progress
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_generation_queue;

-- ============================================================================
-- 2. REPLICA IDENTITY
-- Full replica identity lets us broadcast the full row on UPDATE/DELETE
-- (default only sends primary key, which is insufficient for frontend renders)
-- ============================================================================

ALTER TABLE public.market_data_items REPLICA IDENTITY FULL;
ALTER TABLE public.markets REPLICA IDENTITY FULL;

-- market_generation_queue mostly does INSERTs, DEFAULT (PK) is fine

-- ============================================================================
-- 3. VERIFY EXISTING RLS ALLOWS SELECT FOR AUTHENTICATED USERS
-- market_data_items already has: "viewable by everyone" WHERE is_active = true
-- markets should also be readable — add if missing
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'markets' 
        AND policyname = 'Markets are viewable by everyone'
    ) THEN
        CREATE POLICY "Markets are viewable by everyone" ON public.markets
            FOR SELECT USING (true);
    END IF;
END $$;

-- ============================================================================
-- SECURITY NOTE
-- Supabase Realtime respects RLS. Users will only receive broadcasts for rows
-- they can SELECT. market_data_items requires is_active=true, markets are 
-- public-read. This is the correct behavior for a trading platform.
-- ============================================================================
