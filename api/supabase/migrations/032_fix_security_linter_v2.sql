-- ============================================================================
-- DeJaVu - Security Linter Fixes V2 (032_fix_security_linter_v2.sql)
-- Addresses Security Definer View and Function Search Path Mutable warnings
-- ============================================================================

-- Fix: Security Definer View
-- View `public.admin_traffic_stats` is defined with SECURITY DEFINER property.
-- This can be insecure if the view accesses sensitive data that the invoker shouldn't see,
-- but typically for views, we want SECURITY INVOKER so RLS policies apply to the caller.
ALTER VIEW public.admin_traffic_stats SET (security_invoker = true);

-- Fix: Function Search Path Mutable
-- Set search_path to 'public' for functions to prevent search path hijacking.

-- From 027_enhanced_traffic_monitoring.sql
ALTER FUNCTION public.cleanup_request_logs(integer) SET search_path = public;

-- From 028_dynamic_security_config.sql
ALTER FUNCTION public.check_rate_limit(text, text, text, integer, integer) SET search_path = public;

-- From 030_advanced_audit.sql
ALTER FUNCTION public.audit_balance_integrity() SET search_path = public;
ALTER FUNCTION public.watch_security_config() SET search_path = public;
ALTER FUNCTION public.watch_profile_changes() SET search_path = public;
