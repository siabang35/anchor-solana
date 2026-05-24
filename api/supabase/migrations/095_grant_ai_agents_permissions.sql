-- ============================================================================
-- ExoDuZe — Grant AI Agents Schema Permissions (095_grant_ai_agents_permissions.sql)
--
-- Grants missing table-level access privileges to the anon and authenticated
-- roles for tables and views related to AI agents.
-- ============================================================================

-- Grant SELECT privileges to catalog and logs
GRANT SELECT ON public.ai_agent_types TO anon, authenticated;
GRANT SELECT ON public.ai_agent_logs TO anon, authenticated;

-- Grant full operational privileges to user agent deployments
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO anon, authenticated;

-- Grant SELECT on user quota view
GRANT SELECT ON public.user_agent_quota TO anon, authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
