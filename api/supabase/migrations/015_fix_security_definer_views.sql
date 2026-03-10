-- ============================================================================
-- DeJaVu - Security Fix Migration (015_fix_security_definer_views.sql)
-- Fix SECURITY DEFINER views flagged by Supabase linter
-- ============================================================================

-- ============================================================================
-- FIX ADMIN_PLATFORM_STATS VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.admin_platform_stats CASCADE;

CREATE OR REPLACE VIEW public.admin_platform_stats 
WITH (security_invoker = true) AS
SELECT 
    -- User stats
    (SELECT COUNT(*) FROM public.profiles) AS total_users,
    (SELECT COUNT(*) FROM public.profiles WHERE created_at >= CURRENT_DATE) AS new_users_today,
    (SELECT COUNT(*) FROM public.profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS new_users_week,
    
    -- Transaction stats
    (SELECT COALESCE(SUM(balance), 0) FROM public.user_balances WHERE currency = 'USDC') AS total_platform_balance,
    (SELECT COALESCE(SUM(locked_balance), 0) FROM public.user_balances WHERE currency = 'USDC') AS total_locked_balance,
    
    -- Deposit stats
    (SELECT COUNT(*) FROM public.deposit_transactions WHERE status = 'confirmed' AND DATE(created_at) = CURRENT_DATE) AS deposits_today,
    (SELECT COALESCE(SUM(amount), 0) FROM public.deposit_transactions WHERE status = 'confirmed' AND DATE(created_at) = CURRENT_DATE) AS deposit_volume_today,
    
    -- Withdrawal stats
    (SELECT COUNT(*) FROM public.withdrawal_transactions WHERE status = 'pending') AS pending_withdrawals,
    (SELECT COALESCE(SUM(amount), 0) FROM public.withdrawal_transactions WHERE status = 'pending') AS pending_withdrawal_volume,
    (SELECT COUNT(*) FROM public.withdrawal_transactions WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE) AS withdrawals_today,
    
    -- Market stats
    (SELECT COUNT(*) FROM public.markets WHERE resolved = false) AS active_markets,
    (SELECT COALESCE(SUM(volume), 0) FROM public.markets) AS total_market_volume,
    
    -- Security stats
    (SELECT COUNT(*) FROM public.suspicious_activity WHERE status = 'pending') AS pending_security_reviews,
    (SELECT COUNT(*) FROM public.system_alerts WHERE status IN ('open', 'acknowledged')) AS open_alerts,
    
    -- Referral stats
    (SELECT COUNT(*) FROM public.referral_tracking WHERE is_qualified = true) AS total_referrals,
    (SELECT COALESCE(SUM(amount), 0) FROM public.referral_rewards WHERE status = 'completed') AS total_referral_payouts;

-- Grant access only to service_role
GRANT SELECT ON public.admin_platform_stats TO service_role;

-- ============================================================================
-- FIX ADMIN_USER_ACTIVITY VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.admin_user_activity CASCADE;

CREATE OR REPLACE VIEW public.admin_user_activity 
WITH (security_invoker = true) AS
SELECT 
    p.id AS user_id,
    p.email,
    p.full_name,
    p.created_at AS signup_date,
    ub.balance,
    ub.locked_balance,
    (SELECT MAX(created_at) FROM public.user_sessions WHERE user_id = p.id) AS last_active,
    (SELECT COUNT(*) FROM public.deposit_transactions WHERE user_id = p.id AND status = 'confirmed') AS total_deposits,
    (SELECT COALESCE(SUM(amount), 0) FROM public.deposit_transactions WHERE user_id = p.id AND status = 'confirmed') AS total_deposited,
    (SELECT COUNT(*) FROM public.withdrawal_transactions WHERE user_id = p.id AND status = 'completed') AS total_withdrawals,
    (SELECT COALESCE(SUM(amount), 0) FROM public.withdrawal_transactions WHERE user_id = p.id AND status = 'completed') AS total_withdrawn,
    (SELECT COUNT(*) FROM public.positions WHERE user_id = p.id) AS open_positions,
    (SELECT COUNT(*) FROM public.orders WHERE user_id = p.id) AS total_orders,
    (SELECT COUNT(*) FROM public.suspicious_activity WHERE user_id = p.id) AS suspicious_activity_count
FROM public.profiles p
LEFT JOIN public.user_balances ub ON p.id = ub.user_id AND ub.currency = 'USDC';

-- Grant access only to service_role
GRANT SELECT ON public.admin_user_activity TO service_role;

-- ============================================================================
-- FIX ADMIN_PENDING_ACTIONS VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.admin_pending_actions CASCADE;

CREATE OR REPLACE VIEW public.admin_pending_actions 
WITH (security_invoker = true) AS
SELECT 
    'withdrawal_approval' AS action_type,
    wa.id AS item_id,
    wa.user_id,
    p.email AS user_email,
    wa.amount::TEXT || ' ' || wa.currency AS description,
    wa.risk_score,
    CASE 
        WHEN wa.risk_score >= 70 THEN 'critical'
        WHEN wa.risk_score >= 40 THEN 'warning'
        ELSE 'info'
    END AS severity,
    wa.created_at
FROM public.withdrawal_approvals wa
JOIN public.profiles p ON wa.user_id = p.id
WHERE wa.status = 'pending'

UNION ALL

SELECT 
    'suspicious_activity' AS action_type,
    sa.id AS item_id,
    sa.user_id,
    p.email AS user_email,
    sa.activity_type || ': ' || sa.description AS description,
    sa.risk_score,
    CASE 
        WHEN sa.risk_score >= 70 THEN 'critical'
        WHEN sa.risk_score >= 40 THEN 'warning'
        ELSE 'info'
    END AS severity,
    sa.created_at
FROM public.suspicious_activity sa
LEFT JOIN public.profiles p ON sa.user_id = p.id
WHERE sa.status = 'pending'

UNION ALL

SELECT 
    'system_alert' AS action_type,
    sa.id AS item_id,
    sa.user_id,
    NULL AS user_email,
    sa.title || ': ' || sa.description AS description,
    CASE sa.severity
        WHEN 'critical' THEN 100
        WHEN 'error' THEN 70
        WHEN 'warning' THEN 40
        ELSE 10
    END AS risk_score,
    sa.severity,
    sa.created_at
FROM public.system_alerts sa
WHERE sa.status IN ('open', 'acknowledged')

ORDER BY risk_score DESC, created_at DESC;

-- Grant access only to service_role
GRANT SELECT ON public.admin_pending_actions TO service_role;

-- ============================================================================
-- FIX TRANSACTION_SUMMARY VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.transaction_summary CASCADE;

CREATE OR REPLACE VIEW public.transaction_summary 
WITH (security_invoker = true) AS
SELECT 
    user_id,
    DATE_TRUNC('day', created_at) AS transaction_date,
    transaction_type,
    currency,
    COUNT(*) AS transaction_count,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_debits,
    SUM(amount) AS net_amount
FROM public.transaction_ledger
WHERE status = 'confirmed'
GROUP BY user_id, DATE_TRUNC('day', created_at), transaction_type, currency;

-- Grant access to authenticated users
GRANT SELECT ON public.transaction_summary TO authenticated;

-- ============================================================================
-- FIX USER_PORTFOLIO_STATS VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.user_portfolio_stats CASCADE;

CREATE OR REPLACE VIEW public.user_portfolio_stats 
WITH (security_invoker = true) AS
SELECT 
    ub.user_id,
    ub.currency,
    ub.balance AS current_balance,
    ub.locked_balance,
    ub.balance - ub.locked_balance AS available_balance,
    ub.total_deposited,
    ub.total_withdrawn,
    COALESCE(today.daily_pnl, 0) AS today_pnl,
    COALESCE(week.weekly_pnl, 0) AS week_pnl,
    COALESCE(month.monthly_pnl, 0) AS month_pnl,
    COALESCE(all_time.total_pnl, 0) AS total_pnl
FROM public.user_balances ub
LEFT JOIN (
    SELECT user_id, currency, daily_pnl
    FROM public.daily_balances
    WHERE snapshot_date = CURRENT_DATE
) today ON ub.user_id = today.user_id AND ub.currency = today.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS weekly_pnl
    FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY user_id, currency
) week ON ub.user_id = week.user_id AND ub.currency = week.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS monthly_pnl
    FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY user_id, currency
) month ON ub.user_id = month.user_id AND ub.currency = month.currency
LEFT JOIN (
    SELECT user_id, currency, cumulative_pnl AS total_pnl
    FROM public.daily_balances db1
    WHERE snapshot_date = (
        SELECT MAX(snapshot_date) FROM public.daily_balances db2 
        WHERE db2.user_id = db1.user_id AND db2.currency = db1.currency
    )
) all_time ON ub.user_id = all_time.user_id AND ub.currency = all_time.currency;

-- Grant access to authenticated users
GRANT SELECT ON public.user_portfolio_stats TO authenticated;

-- ============================================================================
-- FIX REFERRAL_STATS VIEW
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================================================
DROP VIEW IF EXISTS public.referral_stats CASCADE;

CREATE OR REPLACE VIEW public.referral_stats 
WITH (security_invoker = true) AS
SELECT 
    rc.user_id,
    rc.code,
    rc.code_type,
    rc.tier_level,
    rc.current_uses AS total_signups,
    COALESCE(qualified.count, 0) AS qualified_referrals,
    COALESCE(rewards.total_earned, 0) AS total_earned,
    COALESCE(rewards.pending_amount, 0) AS pending_earnings,
    COALESCE(volume.total_volume, 0) AS referral_volume
FROM public.referral_codes rc
LEFT JOIN (
    SELECT referral_code_id, COUNT(*) as count
    FROM public.referral_tracking
    WHERE is_qualified = true
    GROUP BY referral_code_id
) qualified ON rc.id = qualified.referral_code_id
LEFT JOIN (
    SELECT 
        rr.user_id,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
    FROM public.referral_rewards rr
    GROUP BY rr.user_id
) rewards ON rc.user_id = rewards.user_id
LEFT JOIN (
    SELECT 
        rt.referrer_id,
        SUM(rt.referee_total_volume) as total_volume
    FROM public.referral_tracking rt
    GROUP BY rt.referrer_id
) volume ON rc.user_id = volume.referrer_id;

-- Grant access to authenticated users
GRANT SELECT ON public.referral_stats TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, run the Supabase linter again to verify
-- all SECURITY DEFINER view warnings are resolved.
