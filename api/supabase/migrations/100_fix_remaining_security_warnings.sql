-- ============================================================================
-- Migration: 100_fix_remaining_security_warnings.sql
-- Purpose: Complete remediation of remaining database security linter warnings:
--          1. Revoke SELECT on materialized view `global_leaderboard` from anon/authenticated.
--          2. Drop RLS policy "always true" on probability_history (redundant for service_role).
--          3. Set search_path on mutable utility functions to prevent search_path escalation.
--          4. Revoke public EXECUTE on sensitive SECURITY DEFINER functions and grant
--             access explicitly to the correct roles (anon, authenticated, service_role).
-- ============================================================================

-- 1. Fix Materialized View exposed in Data APIs (materialized_view_in_api)
-- Materialized views lack RLS support. Restrict access solely to service_role/postgres.
REVOKE SELECT ON public.global_leaderboard FROM anon, authenticated;

-- 2. Fix RLS Policy Always True (rls_policy_always_true)
-- Drop the redundant INSERT policy checking for 'service_role' on probability_history.
-- Because service_role has bypassrls, it can insert without any RLS policy,
-- while normal users remain blocked by default denial.
DROP POLICY IF EXISTS "Allow service role insert on probability_history" ON public.probability_history;

-- 3. Fix Function Search Path Mutable (function_search_path_mutable)
-- Ensure standard public functions have an explicit search_path set to prevent hijacking.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.generate_content_hash(text, text) SET search_path = public;
ALTER FUNCTION public.update_competition_status() SET search_path = public;
ALTER FUNCTION public.generate_referral_code(integer) SET search_path = public;

-- 4. Fix Security Definer Functions Executable by Public
-- Revoke PUBLIC EXECUTE on sensitive SECURITY DEFINER functions and grant explicitly.

-- Category A: Auth & Nonce functions (executable by anon/authenticated/service_role for login/signup)
REVOKE EXECUTE ON FUNCTION public.find_or_create_wallet_user(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_wallet_user(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_wallet_nonce(TEXT, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_wallet_nonce(TEXT, TEXT, INET, TEXT) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.consume_wallet_nonce(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_wallet_nonce(TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_wallet_auth_rate_limit(TEXT, INET, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_wallet_auth_rate_limit(TEXT, INET, INTEGER, INTEGER) TO anon, authenticated, service_role;

-- Category B: User Wallet management functions (executable by logged-in users and service_role)
REVOKE EXECUTE ON FUNCTION public.link_wallet_to_user(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_wallet_to_user(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- Category C: Ledger, balance locking, and transaction functions (executable strictly by service_role)
REVOKE EXECUTE ON FUNCTION public.lock_user_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_user_balance(UUID, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.unlock_user_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_user_balance(UUID, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.credit_user_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(UUID, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.debit_user_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_user_balance(UUID, NUMERIC, TEXT) TO service_role;

-- Category D: Engine & System operations (executable strictly by service_role / system runner)
REVOKE EXECUTE ON FUNCTION public.auto_resolve_sports_market() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_resolve_sports_market() TO service_role;

REVOKE EXECUTE ON FUNCTION public.settle_competition_pool(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_competition_pool(UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions() TO service_role;

-- Category E: Storage Optimization & R2 Archival functions (executable strictly by service_role / crons)
REVOKE EXECUTE ON FUNCTION public.archive_old_probability_history(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_old_probability_history(INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_probability_history(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_probability_history(INTEGER, INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_predictions(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_predictions(INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.downsample_probability_history(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.downsample_probability_history(INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_auxiliary_tables(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_auxiliary_tables(INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_storage_optimization_v2(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_storage_optimization_v2(INTEGER, INTEGER, INTEGER) TO service_role;

-- 5. Reload PostgREST schema cache to apply changes instantly
NOTIFY pgrst, 'reload schema';
