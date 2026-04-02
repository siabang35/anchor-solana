-- ============================================================================
-- ExoDuZe — Enforce Unique Competitions: No Duplicate Titles or Horizon Slots
-- ============================================================================

-- 1. Add title_fingerprint column for fast hash-based dedup
ALTER TABLE "public"."competitions"
  ADD COLUMN IF NOT EXISTS "title_fingerprint" TEXT;

-- 2. Populate fingerprints for existing rows
UPDATE "public"."competitions"
SET "title_fingerprint" = md5(
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(title, '\s+', ' ', 'g'),
        '—\s*outcome prediction\??', '', 'gi'
      ),
      '[^a-z0-9 ]', '', 'gi'
    )
  )
)
WHERE "title_fingerprint" IS NULL;

-- 3. Cancel duplicate competitions (keep oldest per normalized title among active/upcoming)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY title_fingerprint
           ORDER BY created_at ASC
         ) AS rn
  FROM "public"."competitions"
  WHERE status IN ('active', 'upcoming')
    AND title_fingerprint IS NOT NULL
)
UPDATE "public"."competitions"
SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Also cancel duplicates per (sector, time_horizon) — keep oldest
WITH ranked_horizon AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY sector, time_horizon
           ORDER BY created_at ASC
         ) AS rn
  FROM "public"."competitions"
  WHERE status IN ('active', 'upcoming')
    AND time_horizon IS NOT NULL
)
UPDATE "public"."competitions"
SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked_horizon WHERE rn > 1);

-- 5. Create unique partial index: one active/upcoming competition per (sector, time_horizon)
DROP INDEX IF EXISTS idx_unique_sector_horizon_active;
CREATE UNIQUE INDEX idx_unique_sector_horizon_active
  ON "public"."competitions" (sector, time_horizon)
  WHERE status IN ('active', 'upcoming') AND time_horizon IS NOT NULL;

-- 6. Create unique partial index: no duplicate titles among active/upcoming
DROP INDEX IF EXISTS idx_unique_title_fingerprint_active;
CREATE UNIQUE INDEX idx_unique_title_fingerprint_active
  ON "public"."competitions" (title_fingerprint)
  WHERE status IN ('active', 'upcoming') AND title_fingerprint IS NOT NULL;

-- 7. Drop the old 15-limit trigger (we now use unique indexes instead)
DROP TRIGGER IF EXISTS check_competition_limit ON "public"."competitions";
DROP FUNCTION IF EXISTS enforce_competition_category_limit();

-- 8. Create a new trigger function to auto-compute title_fingerprint on insert/update
CREATE OR REPLACE FUNCTION compute_title_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  NEW.title_fingerprint := md5(
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(NEW.title, '\s+', ' ', 'g'),
          '—\s*outcome prediction\??', '', 'gi'
        ),
        '[^a-z0-9 ]', '', 'gi'
      )
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_title_fingerprint ON "public"."competitions";
CREATE TRIGGER auto_title_fingerprint
  BEFORE INSERT OR UPDATE OF title ON "public"."competitions"
  FOR EACH ROW
  EXECUTE FUNCTION compute_title_fingerprint();

-- 9. Index for fast horizon slot lookups
CREATE INDEX IF NOT EXISTS idx_competitions_sector_horizon_status
  ON "public"."competitions" (sector, time_horizon, status);

-- Notify PostgREST to reload
NOTIFY pgrst, 'reload schema';
