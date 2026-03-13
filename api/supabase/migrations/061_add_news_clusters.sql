-- Create news_clusters table for real-time AI probability streams
CREATE TABLE IF NOT EXISTS "public"."news_clusters" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "competition_id" uuid NOT NULL,
    "cluster_hash" text NOT NULL,
    "article_urls" text[] NOT NULL DEFAULT '{}',
    "signals" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "sentiment" numeric(5,4) NOT NULL DEFAULT 0.0000,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("id"),
    CONSTRAINT "news_clusters_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE
);

-- Index for real-time fetching
CREATE INDEX IF NOT EXISTS "idx_news_clusters_competition_id" ON "public"."news_clusters"("competition_id");

-- Add RLS Policies
ALTER TABLE "public"."news_clusters" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."news_clusters"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Allow service role to insert/update
CREATE POLICY "Enable service role access" ON "public"."news_clusters"
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Notify schema cache
NOTIFY pgrst, 'reload schema';
