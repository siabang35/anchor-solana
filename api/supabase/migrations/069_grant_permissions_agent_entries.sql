-- Fix missing table grants for anon and authenticated users on agent_competition_entries and probability_history
GRANT SELECT ON "public"."agent_competition_entries" TO anon, authenticated;
GRANT SELECT ON "public"."probability_history" TO anon, authenticated;
