
-- Enable RLS on market_data_items if not already
ALTER TABLE IF EXISTS market_data_items ENABLE ROW LEVEL SECURITY;

-- Allow public read access to market_data_items
DROP POLICY IF EXISTS "Public read access" ON market_data_items;
CREATE POLICY "Public read access" 
ON market_data_items FOR SELECT 
USING (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Service role full access" ON market_data_items;
CREATE POLICY "Service role full access" 
ON market_data_items FOR ALL 
USING (auth.role() = 'service_role');

-- Same for market_signals if it exists
ALTER TABLE IF EXISTS market_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON market_signals;
CREATE POLICY "Public read access" 
ON market_signals FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Service role full access" ON market_signals;
CREATE POLICY "Service role full access" 
ON market_signals FOR ALL 
USING (auth.role() = 'service_role');
