-- ============================================================================
-- File: api/supabase/full_sql/015_fix_security_definer_views_linter.sql
-- Purpose: Fix SECURITY DEFINER views flagged by Supabase database linter.
--          Converts views to SECURITY INVOKER using ALTER VIEW to preserve dependencies.
-- Instructions: Copy and paste the entire contents of this file into the Supabase SQL Editor.
-- ============================================================================

-- 1. Fix public.probability_history_lean
ALTER VIEW public.probability_history_lean SET (security_invoker = true);

-- 2. Fix public.user_agent_quota
ALTER VIEW public.user_agent_quota SET (security_invoker = true);

-- 3. Fix public.storage_health_dashboard
ALTER VIEW public.storage_health_dashboard SET (security_invoker = true);

-- 4. Fix public.user_portfolio_stats
ALTER VIEW public.user_portfolio_stats SET (security_invoker = true);

-- 5. Fix public.referral_stats
ALTER VIEW public.referral_stats SET (security_invoker = true);

-- 6. Fix public.transaction_summary
ALTER VIEW public.transaction_summary SET (security_invoker = true);

-- 7. Reload PostgREST schema cache to apply changes
NOTIFY pgrst, 'reload schema';
