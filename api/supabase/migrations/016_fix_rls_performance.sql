-- ============================================================================
-- DeJaVu - RLS Performance Optimization Migration (016_fix_rls_performance.sql)
-- Fixes auth_rls_initplan warnings by wrapping auth.uid() and auth.role() 
-- in (select ...) subqueries for better query performance
-- ============================================================================

-- ============================================================================
-- MARKETS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can create markets" ON public.markets;
CREATE POLICY "Authenticated users can create markets" ON public.markets
    FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Creators can update their markets" ON public.markets;
CREATE POLICY "Creators can update their markets" ON public.markets
    FOR UPDATE USING (creator_id = (select auth.uid()));

-- ============================================================================
-- POSITIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their positions" ON public.positions;
CREATE POLICY "Users can view their positions" ON public.positions
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their positions" ON public.positions;
CREATE POLICY "Users can insert their positions" ON public.positions
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their positions" ON public.positions;
CREATE POLICY "Users can update their positions" ON public.positions
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their orders" ON public.orders;
CREATE POLICY "Users can view their orders" ON public.orders
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
CREATE POLICY "Users can insert orders" ON public.orders
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- LIQUIDITY_POSITIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their liquidity" ON public.liquidity_positions;
CREATE POLICY "Users can view their liquidity" ON public.liquidity_positions
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can manage their liquidity" ON public.liquidity_positions;
CREATE POLICY "Users can manage their liquidity" ON public.liquidity_positions
    FOR ALL USING (user_id = (select auth.uid()));

-- ============================================================================
-- SECURITY_EVENTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can access security events" ON public.security_events;
CREATE POLICY "Only service role can access security events" ON public.security_events
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- USER_BALANCES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own balance" ON public.user_balances;
CREATE POLICY "Users can view own balance" ON public.user_balances
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Service role can manage balances" ON public.user_balances;
CREATE POLICY "Service role can manage balances" ON public.user_balances
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- PRIVY_WALLETS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own privy wallets" ON public.privy_wallets;
CREATE POLICY "Users can view own privy wallets" ON public.privy_wallets
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Service role can manage privy wallets" ON public.privy_wallets;
CREATE POLICY "Service role can manage privy wallets" ON public.privy_wallets
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- DEPOSIT_TRANSACTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own deposits" ON public.deposit_transactions;
CREATE POLICY "Users can view own deposits" ON public.deposit_transactions
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage deposits" ON public.deposit_transactions;
-- Removed to avoid multiple_permissive_policies - combined into above policy

-- ============================================================================
-- WITHDRAWAL_TRANSACTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawal_transactions;
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_transactions
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage withdrawals" ON public.withdrawal_transactions;
-- Removed to avoid multiple_permissive_policies - combined into above policy

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;
-- Removed to avoid multiple_permissive_policies - combined into above policies

-- ============================================================================
-- WALLET_ADDRESSES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own wallets" ON public.wallet_addresses;
CREATE POLICY "Users can view own wallets" ON public.wallet_addresses
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users can manage own wallets" ON public.wallet_addresses;
CREATE POLICY "Users can manage own wallets" ON public.wallet_addresses
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all wallets" ON public.wallet_addresses;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- LOGIN_ATTEMPTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage login attempts" ON public.login_attempts;
CREATE POLICY "Service role can manage login attempts" ON public.login_attempts
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- AUDIT_LOGS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_logs;
CREATE POLICY "Service role can manage audit logs" ON public.audit_logs
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- USER_SESSIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;
CREATE POLICY "Service role can manage sessions" ON public.user_sessions
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- NOTIFICATION_PREFERENCES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification preferences" ON public.notification_preferences
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all notification preferences" ON public.notification_preferences;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- PUSH_SUBSCRIPTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all push subscriptions" ON public.push_subscriptions;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- USER_SETTINGS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all user settings" ON public.user_settings;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- USER_SOCIAL_CONNECTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own social connections" ON public.user_social_connections;
CREATE POLICY "Users can manage own social connections" ON public.user_social_connections
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all social connections" ON public.user_social_connections;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- USER_API_KEYS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own API keys" ON public.user_api_keys;
CREATE POLICY "Users can view own API keys" ON public.user_api_keys
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users can delete own API keys" ON public.user_api_keys;
CREATE POLICY "Users can delete own API keys" ON public.user_api_keys
    FOR DELETE USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all API keys" ON public.user_api_keys;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- WITHDRAWAL_WHITELIST TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own withdrawal whitelist" ON public.withdrawal_whitelist;
CREATE POLICY "Users can manage own withdrawal whitelist" ON public.withdrawal_whitelist
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all withdrawal whitelists" ON public.withdrawal_whitelist;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- REFERRAL_CODES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own referral codes" ON public.referral_codes;
CREATE POLICY "Users can view own referral codes" ON public.referral_codes
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all referral codes" ON public.referral_codes;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- DEVICE_FINGERPRINTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own devices" ON public.device_fingerprints;
CREATE POLICY "Users can view own devices" ON public.device_fingerprints
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all devices" ON public.device_fingerprints;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- REFERRAL_TRACKING TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Referrers can view their referrals" ON public.referral_tracking;
DROP POLICY IF EXISTS "Referees can view own referral status" ON public.referral_tracking;
DROP POLICY IF EXISTS "Service role can manage all referrals" ON public.referral_tracking;
CREATE POLICY "Users can view referral tracking" ON public.referral_tracking
    FOR SELECT USING (
        referrer_id = (select auth.uid()) OR 
        referee_id = (select auth.uid()) OR 
        (select auth.role()) = 'service_role'
    );
CREATE POLICY "Service role can manage referral tracking" ON public.referral_tracking
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- REFERRAL_REWARDS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own referral rewards" ON public.referral_rewards;
CREATE POLICY "Users can view own referral rewards" ON public.referral_rewards
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all referral rewards" ON public.referral_rewards;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- TRANSACTION_LEDGER TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transaction_ledger;
CREATE POLICY "Users can view own transactions" ON public.transaction_ledger
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all transactions" ON public.transaction_ledger;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- DAILY_BALANCES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own daily balances" ON public.daily_balances;
CREATE POLICY "Users can view own daily balances" ON public.daily_balances
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all daily balances" ON public.daily_balances;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- RATE_LIMITS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- IP_BLACKLIST TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage IP blacklist" ON public.ip_blacklist;
CREATE POLICY "Service role can manage IP blacklist" ON public.ip_blacklist
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- WITHDRAWAL_LIMITS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own withdrawal limits" ON public.withdrawal_limits;
CREATE POLICY "Users can view own withdrawal limits" ON public.withdrawal_limits
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all withdrawal limits" ON public.withdrawal_limits;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- SUSPICIOUS_ACTIVITY TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage suspicious activity" ON public.suspicious_activity;
CREATE POLICY "Service role can manage suspicious activity" ON public.suspicious_activity
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SIGNING_REQUESTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own signing requests" ON public.signing_requests;
CREATE POLICY "Users can view own signing requests" ON public.signing_requests
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all signing requests" ON public.signing_requests;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- SIGNED_TRANSACTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own signed transactions" ON public.signed_transactions;
CREATE POLICY "Users can view own signed transactions" ON public.signed_transactions
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all signed transactions" ON public.signed_transactions;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- WALLET_RECOVERY_HINTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own recovery hints" ON public.wallet_recovery_hints;
CREATE POLICY "Users can manage own recovery hints" ON public.wallet_recovery_hints
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all recovery hints" ON public.wallet_recovery_hints;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- MULTISIG_CONFIGURATIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own multisig configurations" ON public.multisig_configurations;
CREATE POLICY "Users can manage own multisig configurations" ON public.multisig_configurations
    FOR ALL USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all multisig configurations" ON public.multisig_configurations;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- SPORTS_TEAMS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage teams" ON public.sports_teams;
CREATE POLICY "Only service role can manage teams" ON public.sports_teams
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- MULTISIG_PENDING_TRANSACTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view multisig pending transactions" ON public.multisig_pending_transactions;
CREATE POLICY "Users can view multisig pending transactions" ON public.multisig_pending_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.multisig_configurations mc
            WHERE mc.id = multisig_pending_transactions.multisig_config_id 
            AND mc.user_id = (select auth.uid())
        ) OR (select auth.role()) = 'service_role'
    );

DROP POLICY IF EXISTS "Service role can manage all multisig pending transactions" ON public.multisig_pending_transactions;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- ADMIN_ROLES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage admin roles" ON public.admin_roles;
CREATE POLICY "Service role can manage admin roles" ON public.admin_roles
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- ADMIN_USERS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage admin users" ON public.admin_users;
CREATE POLICY "Service role can manage admin users" ON public.admin_users
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- ADMIN_AUDIT_LOG TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage admin audit log" ON public.admin_audit_log;
CREATE POLICY "Service role can manage admin audit log" ON public.admin_audit_log
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- PLATFORM_METRICS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage platform metrics" ON public.platform_metrics;
CREATE POLICY "Service role can manage platform metrics" ON public.platform_metrics
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SYSTEM_ALERTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage system alerts" ON public.system_alerts;
CREATE POLICY "Service role can manage system alerts" ON public.system_alerts
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- WITHDRAWAL_APPROVALS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own withdrawal approvals" ON public.withdrawal_approvals;
CREATE POLICY "Users can view own withdrawal approvals" ON public.withdrawal_approvals
    FOR SELECT USING (user_id = (select auth.uid()) OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can manage withdrawal approvals" ON public.withdrawal_approvals;
-- Removed to avoid multiple_permissive_policies

-- ============================================================================
-- SPORTS_LEAGUES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage leagues" ON public.sports_leagues;
CREATE POLICY "Only service role can manage leagues" ON public.sports_leagues
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_EVENTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage events" ON public.sports_events;
CREATE POLICY "Only service role can manage events" ON public.sports_events
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_PLAYERS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage players" ON public.sports_players;
CREATE POLICY "Only service role can manage players" ON public.sports_players
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_MARKETS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage sports markets" ON public.sports_markets;
CREATE POLICY "Only service role can manage sports markets" ON public.sports_markets
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_SYNC_LOGS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can access sync logs" ON public.sports_sync_logs;
CREATE POLICY "Only service role can access sync logs" ON public.sports_sync_logs
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_ODDS_HISTORY TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Only service role can manage odds history" ON public.sports_odds_history;
CREATE POLICY "Only service role can manage odds history" ON public.sports_odds_history
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- API_RATE_LIMITS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role only for rate limits" ON public.api_rate_limits;
CREATE POLICY "Service role only for rate limits" ON public.api_rate_limits
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_API_LOGS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role only for API logs" ON public.sports_api_logs;
CREATE POLICY "Service role only for API logs" ON public.sports_api_logs
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SPORTS_SYNC_LOCKS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role only for sync locks" ON public.sports_sync_locks;
CREATE POLICY "Service role only for sync locks" ON public.sports_sync_locks
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- SECURITY_AUDIT_LOG TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Service role only for audit log" ON public.security_audit_log;
CREATE POLICY "Service role only for audit log" ON public.security_audit_log
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- VERIFICATION COMMENT
-- ============================================================================
-- After running this migration, the Supabase linter should no longer show:
-- 1. auth_rls_initplan warnings (wrapped auth functions in select)
-- 2. multiple_permissive_policies warnings (consolidated duplicate policies)
