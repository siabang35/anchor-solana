-- Add time_horizon to competitions table if it doesn't exist
ALTER TABLE "public"."competitions" ADD COLUMN IF NOT EXISTS "time_horizon" text;

-- Notify schema cache
NOTIFY pgrst, 'reload schema';
