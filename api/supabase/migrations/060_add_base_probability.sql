-- Add base_probability to competitions table
ALTER TABLE "public"."competitions" ADD COLUMN IF NOT EXISTS "base_probability" numeric(5,4) DEFAULT 0.5000;

-- Optionally add index if it's queried frequently, though not strictly needed for base_probability
-- CREATE INDEX IF NOT EXISTS idx_competitions_base_prob ON public.competitions(base_probability);

-- Notify schema cache reload
NOTIFY pgrst, 'reload schema';
