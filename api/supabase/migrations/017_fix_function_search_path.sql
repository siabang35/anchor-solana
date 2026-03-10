-- ============================================================================
-- DeJaVu - Function Search Path Security Fix (017_fix_function_search_path.sql)
-- Fixes function_search_path_mutable warnings by setting search_path for all functions
-- ============================================================================

-- The fix is to alter each function to set a fixed search_path
-- This prevents search path hijacking attacks

-- ============================================================================
-- NOTIFICATION FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.mark_notification_read SET search_path = public;
ALTER FUNCTION public.mark_all_notifications_read SET search_path = public;
ALTER FUNCTION public.create_notification SET search_path = public;
ALTER FUNCTION public.cleanup_old_notifications SET search_path = public;
ALTER FUNCTION public.get_unread_notification_count SET search_path = public;

-- ============================================================================
-- SIGNING/WALLET FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.get_pending_signing_requests SET search_path = public;
ALTER FUNCTION public.cancel_signing_request SET search_path = public;
ALTER FUNCTION public.generate_signing_nonce SET search_path = public;
ALTER FUNCTION public.create_signing_request SET search_path = public;
ALTER FUNCTION public.submit_signature SET search_path = public;
ALTER FUNCTION public.expire_signing_requests SET search_path = public;
ALTER FUNCTION public.add_multisig_signature SET search_path = public;

-- ============================================================================
-- SPORTS FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.get_upcoming_events SET search_path = public;
ALTER FUNCTION public.get_live_events SET search_path = public;
ALTER FUNCTION public.auto_resolve_sports_market SET search_path = public;
ALTER FUNCTION public.validate_sports_event SET search_path = public;
ALTER FUNCTION public.validate_sports_market SET search_path = public;
ALTER FUNCTION public.check_sports_rate_limit SET search_path = public;
ALTER FUNCTION public.acquire_sync_lock SET search_path = public;
ALTER FUNCTION public.release_sync_lock SET search_path = public;
ALTER FUNCTION public.cleanup_sync_locks SET search_path = public;
ALTER FUNCTION public.cleanup_api_logs SET search_path = public;
ALTER FUNCTION public.cleanup_rate_limits SET search_path = public;

-- ============================================================================
-- USER/SETTINGS FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.get_or_create_user_settings SET search_path = public;
ALTER FUNCTION public.is_username_available SET search_path = public;
ALTER FUNCTION public.validate_api_key SET search_path = public;
ALTER FUNCTION public.increment_api_key_usage SET search_path = public;

-- ============================================================================
-- REFERRAL FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.generate_referral_code SET search_path = public;
ALTER FUNCTION public.qualify_referral SET search_path = public;
ALTER FUNCTION public.create_referral_code SET search_path = public;
ALTER FUNCTION public.apply_referral_code SET search_path = public;

-- ============================================================================
-- TRANSACTION/BALANCE FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.create_daily_balance_snapshot SET search_path = public;
ALTER FUNCTION public.record_transaction SET search_path = public;
ALTER FUNCTION public.get_transaction_history SET search_path = public;
ALTER FUNCTION public.calculate_daily_pnl SET search_path = public;
ALTER FUNCTION public.export_transactions SET search_path = public;
ALTER FUNCTION public.debit_user_balance SET search_path = public;
ALTER FUNCTION public.credit_user_balance SET search_path = public;
ALTER FUNCTION public.lock_user_balance SET search_path = public;
ALTER FUNCTION public.unlock_user_balance SET search_path = public;
ALTER FUNCTION public.get_available_balance SET search_path = public;

-- ============================================================================
-- SESSION/LOGIN FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.cleanup_expired_sessions SET search_path = public;
ALTER FUNCTION public.cleanup_old_login_attempts SET search_path = public;

-- ============================================================================
-- RATE LIMIT/SECURITY FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.cleanup_old_rate_limits SET search_path = public;
ALTER FUNCTION public.check_rate_limit SET search_path = public;
ALTER FUNCTION public.is_ip_blacklisted SET search_path = public;
ALTER FUNCTION public.block_ip SET search_path = public;
ALTER FUNCTION public.check_withdrawal_allowed SET search_path = public;
ALTER FUNCTION public.record_withdrawal_usage SET search_path = public;
ALTER FUNCTION public.log_suspicious_activity SET search_path = public;

-- ============================================================================
-- ADMIN FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.is_admin SET search_path = public;
ALTER FUNCTION public.log_admin_action SET search_path = public;
ALTER FUNCTION public.create_system_alert SET search_path = public;
ALTER FUNCTION public.record_metric SET search_path = public;
ALTER FUNCTION public.get_admin_permissions SET search_path = public;
ALTER FUNCTION public.approve_withdrawal SET search_path = public;
ALTER FUNCTION public.reject_withdrawal SET search_path = public;
ALTER FUNCTION public.promote_to_super_admin SET search_path = public;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================
ALTER FUNCTION public.update_updated_at_column SET search_path = public;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, the Supabase linter should no longer show
-- function_search_path_mutable warnings for these functions.
--
-- NOTE: The "auth_leaked_password_protection" warning requires enabling
-- leaked password protection in Supabase Dashboard:
-- Authentication > Settings > Security > Enable Leaked Password Protection
