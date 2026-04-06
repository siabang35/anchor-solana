-- ============================================================================
-- ExoDuZe - Security Lints Fix (065_fix_security_lints.sql)
-- Fixes function_search_path_mutable warnings and addresses auth leaked password
-- ============================================================================

-- 1. Fix function_search_path_mutable for compute_title_fingerprint
ALTER FUNCTION public.compute_title_fingerprint() SET search_path = public;

-- 2. Leaked Password Protection (auth_leaked_password_protection)
-- NOTE: The "auth_leaked_password_protection" warning requires enabling
-- leaked password protection in Supabase Dashboard because Auth settings are
-- not managed via standard SQL migrations in the Supabase public schema:
-- 
-- To enable:
-- 1. Go to Supabase Project Dashboard
-- 2. Open Authentication > Policies / Settings
-- 3. Scroll to Security
-- 4. Enable "Leaked Password Protection"
--
-- See: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
