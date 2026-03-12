-- ============================================================================
-- 059_fix_security_warnings.sql
-- Fixes security definer views and mutable function search paths
-- ============================================================================

-- 1. Fix Security Definer Views by adding `security_invoker = true`
ALTER VIEW v_top_markets SET (security_invoker = true);
ALTER VIEW v_latest_feed SET (security_invoker = true);
ALTER VIEW v_signals_feed SET (security_invoker = true);
ALTER VIEW user_agent_quota SET (security_invoker = true);
ALTER VIEW v_active_competitions SET (security_invoker = true);

-- 2. Fix Function Search Path Mutable warnings by setting search_path
ALTER FUNCTION check_agent_deploy_quota() SET search_path = public;
ALTER FUNCTION update_competition_status() SET search_path = public;
ALTER FUNCTION get_competitions_by_sector(TEXT, TEXT, INTEGER) SET search_path = public;
ALTER FUNCTION get_sector_competition_counts() SET search_path = public;

-- Assuming cleanup_old_rate_limits and enforce_competition_category_limit exist
DO $$ BEGIN
    ALTER FUNCTION cleanup_old_rate_limits() SET search_path = public;
EXCEPTION
    WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
    ALTER FUNCTION enforce_competition_category_limit() SET search_path = public;
EXCEPTION
    WHEN undefined_function THEN NULL;
END $$;

-- 3. Fix RLS policy "always true" on probability_history
-- We will replace the generic INSERT policy with one strictly for service_role
DROP POLICY IF EXISTS "Allow service role insert on probability_history" ON probability_history;
CREATE POLICY "Allow service role insert on probability_history" 
    ON probability_history
    FOR INSERT 
    WITH CHECK (auth.role() = 'service_role');
