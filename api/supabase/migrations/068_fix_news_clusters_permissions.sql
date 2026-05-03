-- Fix missing table grants for anon and authenticated users on news_clusters
GRANT SELECT ON "public"."news_clusters" TO anon, authenticated;

-- Also check other newly added tables to ensure they have grants
GRANT SELECT ON "public"."agent_predictions" TO anon, authenticated;
GRANT SELECT ON "public"."competitions" TO anon, authenticated;
GRANT SELECT ON "public"."agents" TO anon, authenticated;

-- Ensure RLS allows the select for agent_predictions if not already
ALTER TABLE "public"."agent_predictions" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'agent_predictions' AND policyname = 'Enable read access for all users'
    ) THEN
        CREATE POLICY "Enable read access for all users" ON "public"."agent_predictions" FOR SELECT TO public USING (true);
    END IF;
END
$$;
