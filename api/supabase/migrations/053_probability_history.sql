-- ============================================
-- 053: Probability History Table
-- Stores curve snapshot history for competitions
-- ============================================

CREATE TABLE IF NOT EXISTS probability_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id UUID NOT NULL,
    time_label TEXT NOT NULL,
    home NUMERIC(8,4) NOT NULL,
    draw NUMERIC(8,4) NOT NULL,
    away NUMERIC(8,4) NOT NULL,
    narrative TEXT,
    regime TEXT DEFAULT 'neutral',
    entropy_seed TEXT,
    category TEXT DEFAULT 'sports',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prob_history_comp_created
    ON probability_history(competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prob_history_category
    ON probability_history(category);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE probability_history;

-- RLS Policy (read-only for anon)
ALTER TABLE probability_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on probability_history"
    ON probability_history FOR SELECT
    USING (true);

CREATE POLICY "Allow service role insert on probability_history"
    ON probability_history FOR INSERT
    WITH CHECK (true);
