-- ============================================================================
-- DeJaVu - Admin Dashboard Schema (009_admin_dashboard.sql)
-- Comprehensive admin monitoring, analytics, and management features
-- ============================================================================

-- ============================================================================
-- ADMIN_ROLES TABLE
-- Role-based access control for admin users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    
    -- Permissions (JSON object with permission keys)
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Role hierarchy (higher = more permissions)
    hierarchy_level INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default roles
INSERT INTO public.admin_roles (name, description, permissions, hierarchy_level) VALUES
    ('super_admin', 'Full system access', '{
        "users": {"view": true, "edit": true, "delete": true, "suspend": true},
        "transactions": {"view": true, "approve": true, "reverse": true},
        "markets": {"view": true, "create": true, "edit": true, "resolve": true, "delete": true},
        "withdrawals": {"view": true, "approve": true, "reject": true},
        "settings": {"view": true, "edit": true},
        "analytics": {"view": true, "export": true},
        "security": {"view": true, "manage": true},
        "admin": {"view": true, "create": true, "edit": true, "delete": true}
    }'::jsonb, 100),
    ('admin', 'Standard admin access', '{
        "users": {"view": true, "edit": true, "suspend": true},
        "transactions": {"view": true, "approve": true},
        "markets": {"view": true, "create": true, "edit": true, "resolve": true},
        "withdrawals": {"view": true, "approve": true, "reject": true},
        "settings": {"view": true},
        "analytics": {"view": true, "export": true},
        "security": {"view": true}
    }'::jsonb, 50),
    ('moderator', 'Content moderation', '{
        "users": {"view": true},
        "markets": {"view": true, "edit": true},
        "analytics": {"view": true}
    }'::jsonb, 20),
    ('support', 'Customer support', '{
        "users": {"view": true},
        "transactions": {"view": true},
        "withdrawals": {"view": true},
        "analytics": {"view": true}
    }'::jsonb, 10),
    ('analyst', 'Read-only analytics', '{
        "analytics": {"view": true, "export": true}
    }'::jsonb, 5)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Only service role can manage admin roles
DROP POLICY IF EXISTS "Service role can manage admin roles" ON public.admin_roles;
CREATE POLICY "Service role can manage admin roles" ON public.admin_roles
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- ADMIN_USERS TABLE
-- Admin user assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    role_id UUID NOT NULL REFERENCES public.admin_roles(id),
    
    -- Additional info
    department TEXT,
    notes TEXT,
    
    -- Access control
    is_active BOOLEAN NOT NULL DEFAULT true,
    mfa_required BOOLEAN NOT NULL DEFAULT true,
    mfa_verified BOOLEAN NOT NULL DEFAULT false,
    
    -- IP restrictions (optional)
    allowed_ips INET[],
    
    -- Audit
    created_by UUID REFERENCES auth.users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_user ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON public.admin_users(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only service role can manage admin users
DROP POLICY IF EXISTS "Service role can manage admin users" ON public.admin_users;
CREATE POLICY "Service role can manage admin users" ON public.admin_users
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- ADMIN_AUDIT_LOG TABLE
-- Comprehensive audit trail for all admin actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor
    admin_user_id UUID REFERENCES public.admin_users(id),
    actor_user_id UUID REFERENCES auth.users(id),
    actor_email TEXT,
    
    -- Action details
    action TEXT NOT NULL,
    action_category TEXT NOT NULL CHECK (action_category IN (
        'user_management',
        'transaction_management',
        'market_management',
        'withdrawal_management',
        'security_management',
        'settings_management',
        'admin_management',
        'data_export',
        'login',
        'logout'
    )),
    
    -- Target resource
    resource_type TEXT,
    resource_id TEXT,
    resource_name TEXT,
    
    -- Before/After state
    old_values JSONB,
    new_values JSONB,
    
    -- Result
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
    error_message TEXT,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    
    -- Impact assessment
    affected_users INTEGER DEFAULT 0,
    financial_impact DECIMAL(20,8) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON public.admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_category ON public.admin_audit_log(action_category);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON public.admin_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_status ON public.admin_audit_log(status);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access admin audit log
DROP POLICY IF EXISTS "Service role can manage admin audit log" ON public.admin_audit_log;
CREATE POLICY "Service role can manage admin audit log" ON public.admin_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PLATFORM_METRICS TABLE
-- Real-time platform metrics for monitoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Metric identification
    metric_name TEXT NOT NULL,
    metric_category TEXT NOT NULL CHECK (metric_category IN (
        'users', 'transactions', 'markets', 'trading', 
        'deposits', 'withdrawals', 'performance', 'errors'
    )),
    
    -- Value
    value DECIMAL(30,8) NOT NULL,
    unit TEXT,
    
    -- Time period
    period_type TEXT NOT NULL CHECK (period_type IN ('minute', 'hour', 'day', 'week', 'month')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Dimensions (for breaking down metrics)
    dimensions JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per metric/period
    UNIQUE(metric_name, period_type, period_start, dimensions)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_metrics_name ON public.platform_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_category ON public.platform_metrics(metric_category);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_period ON public.platform_metrics(period_type, period_start DESC);

-- Enable RLS
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

-- Only service role can manage metrics
DROP POLICY IF EXISTS "Service role can manage platform metrics" ON public.platform_metrics;
CREATE POLICY "Service role can manage platform metrics" ON public.platform_metrics
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- SYSTEM_ALERTS TABLE
-- System alerts and notifications for admins
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert info
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'high_withdrawal',
        'suspicious_activity',
        'system_error',
        'performance_degradation',
        'security_breach',
        'market_anomaly',
        'low_liquidity',
        'user_complaint',
        'compliance_issue',
        'scheduled_maintenance'
    )),
    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Severity
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    
    -- Related entities
    resource_type TEXT,
    resource_id TEXT,
    user_id UUID REFERENCES auth.users(id),
    
    -- Context
    details JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'dismissed')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Escalation
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalated_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON public.system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON public.system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON public.system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_system_alerts_open ON public.system_alerts(status, severity DESC) 
    WHERE status IN ('open', 'acknowledged', 'investigating');
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON public.system_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Only service role can manage system alerts
DROP POLICY IF EXISTS "Service role can manage system alerts" ON public.system_alerts;
CREATE POLICY "Service role can manage system alerts" ON public.system_alerts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WITHDRAWAL_APPROVALS TABLE
-- Pending withdrawals requiring admin approval
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_id UUID NOT NULL REFERENCES public.withdrawal_transactions(id),
    
    -- User info
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Request details
    amount DECIMAL(20,8) NOT NULL,
    currency TEXT NOT NULL,
    chain TEXT NOT NULL,
    to_address TEXT NOT NULL,
    
    -- Risk assessment
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_factors TEXT[],
    requires_manual_review BOOLEAN NOT NULL DEFAULT false,
    
    -- Approval workflow
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'expired')),
    
    -- Approver details
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    -- Second approval (for high-value)
    requires_second_approval BOOLEAN NOT NULL DEFAULT false,
    second_reviewed_by UUID REFERENCES auth.users(id),
    second_reviewed_at TIMESTAMPTZ,
    second_review_notes TEXT,
    
    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawal_approvals_status ON public.withdrawal_approvals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_approvals_pending ON public.withdrawal_approvals(status, created_at) 
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_withdrawal_approvals_user ON public.withdrawal_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_approvals_risk ON public.withdrawal_approvals(risk_score DESC);

-- Enable RLS
ALTER TABLE public.withdrawal_approvals ENABLE ROW LEVEL SECURITY;

-- Users can view their own approval status
DROP POLICY IF EXISTS "Users can view own withdrawal approvals" ON public.withdrawal_approvals;
CREATE POLICY "Users can view own withdrawal approvals" ON public.withdrawal_approvals
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage withdrawal approvals" ON public.withdrawal_approvals;
CREATE POLICY "Service role can manage withdrawal approvals" ON public.withdrawal_approvals
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- ADMIN DASHBOARD VIEWS
-- ============================================================================

-- Overall platform statistics
CREATE OR REPLACE VIEW public.admin_platform_stats AS
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

-- User activity summary for admin
CREATE OR REPLACE VIEW public.admin_user_activity AS
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

-- Pending actions for admin dashboard
CREATE OR REPLACE VIEW public.admin_pending_actions AS
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

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Log admin action
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_actor_user_id UUID,
    p_action TEXT,
    p_category TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_admin_user public.admin_users;
BEGIN
    -- Get admin user info
    SELECT * INTO v_admin_user
    FROM public.admin_users
    WHERE user_id = p_actor_user_id;
    
    INSERT INTO public.admin_audit_log (
        admin_user_id, actor_user_id, action, action_category,
        resource_type, resource_id, old_values, new_values, ip_address
    )
    VALUES (
        v_admin_user.id, p_actor_user_id, p_action, p_category,
        p_resource_type, p_resource_id, p_old_values, p_new_values, p_ip_address
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create system alert
CREATE OR REPLACE FUNCTION public.create_system_alert(
    p_alert_type TEXT,
    p_title TEXT,
    p_description TEXT,
    p_severity TEXT DEFAULT 'warning',
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_alert_id UUID;
BEGIN
    INSERT INTO public.system_alerts (
        alert_type, title, description, severity,
        resource_type, resource_id, user_id, details
    )
    VALUES (
        p_alert_type, p_title, p_description, p_severity,
        p_resource_type, p_resource_id, p_user_id, p_details
    )
    RETURNING id INTO v_alert_id;
    
    RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record platform metric
CREATE OR REPLACE FUNCTION public.record_metric(
    p_metric_name TEXT,
    p_category TEXT,
    p_value DECIMAL(30,8),
    p_period_type TEXT DEFAULT 'hour',
    p_unit TEXT DEFAULT NULL,
    p_dimensions JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_metric_id UUID;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    -- Calculate period boundaries
    CASE p_period_type
        WHEN 'minute' THEN
            v_period_start := DATE_TRUNC('minute', NOW());
            v_period_end := v_period_start + INTERVAL '1 minute';
        WHEN 'hour' THEN
            v_period_start := DATE_TRUNC('hour', NOW());
            v_period_end := v_period_start + INTERVAL '1 hour';
        WHEN 'day' THEN
            v_period_start := DATE_TRUNC('day', NOW());
            v_period_end := v_period_start + INTERVAL '1 day';
        WHEN 'week' THEN
            v_period_start := DATE_TRUNC('week', NOW());
            v_period_end := v_period_start + INTERVAL '1 week';
        WHEN 'month' THEN
            v_period_start := DATE_TRUNC('month', NOW());
            v_period_end := v_period_start + INTERVAL '1 month';
        ELSE
            v_period_start := DATE_TRUNC('hour', NOW());
            v_period_end := v_period_start + INTERVAL '1 hour';
    END CASE;
    
    INSERT INTO public.platform_metrics (
        metric_name, metric_category, value, unit,
        period_type, period_start, period_end, dimensions
    )
    VALUES (
        p_metric_name, p_category, p_value, p_unit,
        p_period_type, v_period_start, v_period_end, p_dimensions
    )
    ON CONFLICT (metric_name, period_type, period_start, dimensions)
    DO UPDATE SET value = EXCLUDED.value
    RETURNING id INTO v_metric_id;
    
    RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = p_user_id AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get admin permissions
CREATE OR REPLACE FUNCTION public.get_admin_permissions(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_permissions JSONB;
BEGIN
    SELECT ar.permissions INTO v_permissions
    FROM public.admin_users au
    JOIN public.admin_roles ar ON au.role_id = ar.id
    WHERE au.user_id = p_user_id AND au.is_active = true AND ar.is_active = true;
    
    RETURN COALESCE(v_permissions, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Approve withdrawal
CREATE OR REPLACE FUNCTION public.approve_withdrawal(
    p_approval_id UUID,
    p_admin_user_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_approval public.withdrawal_approvals;
BEGIN
    SELECT * INTO v_approval
    FROM public.withdrawal_approvals
    WHERE id = p_approval_id AND status = 'pending'
    FOR UPDATE;
    
    IF v_approval IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if requires second approval
    IF v_approval.requires_second_approval AND v_approval.reviewed_by IS NULL THEN
        -- First approval
        UPDATE public.withdrawal_approvals
        SET reviewed_by = p_admin_user_id,
            reviewed_at = NOW(),
            review_notes = p_notes
        WHERE id = p_approval_id;
    ELSIF v_approval.requires_second_approval AND v_approval.reviewed_by IS NOT NULL THEN
        -- Second approval (must be different admin)
        IF v_approval.reviewed_by = p_admin_user_id THEN
            RAISE EXCEPTION 'Second approval must be by different admin';
        END IF;
        
        UPDATE public.withdrawal_approvals
        SET second_reviewed_by = p_admin_user_id,
            second_reviewed_at = NOW(),
            second_review_notes = p_notes,
            status = 'approved'
        WHERE id = p_approval_id;
        
        -- Update withdrawal transaction
        UPDATE public.withdrawal_transactions
        SET status = 'approved',
            approved_by = p_admin_user_id,
            approved_at = NOW()
        WHERE id = v_approval.withdrawal_id;
    ELSE
        -- Single approval
        UPDATE public.withdrawal_approvals
        SET reviewed_by = p_admin_user_id,
            reviewed_at = NOW(),
            review_notes = p_notes,
            status = 'approved'
        WHERE id = p_approval_id;
        
        -- Update withdrawal transaction
        UPDATE public.withdrawal_transactions
        SET status = 'approved',
            approved_by = p_admin_user_id,
            approved_at = NOW()
        WHERE id = v_approval.withdrawal_id;
    END IF;
    
    -- Log action
    PERFORM public.log_admin_action(
        p_admin_user_id,
        'approve_withdrawal',
        'withdrawal_management',
        'withdrawal_approval',
        p_approval_id::TEXT,
        NULL,
        jsonb_build_object('notes', p_notes)
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reject withdrawal
CREATE OR REPLACE FUNCTION public.reject_withdrawal(
    p_approval_id UUID,
    p_admin_user_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_approval public.withdrawal_approvals;
BEGIN
    SELECT * INTO v_approval
    FROM public.withdrawal_approvals
    WHERE id = p_approval_id AND status = 'pending'
    FOR UPDATE;
    
    IF v_approval IS NULL THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.withdrawal_approvals
    SET reviewed_by = p_admin_user_id,
        reviewed_at = NOW(),
        review_notes = p_reason,
        status = 'rejected'
    WHERE id = p_approval_id;
    
    -- Update withdrawal transaction
    UPDATE public.withdrawal_transactions
    SET status = 'cancelled',
        error_message = p_reason
    WHERE id = v_approval.withdrawal_id;
    
    -- Unlock user balance
    PERFORM public.unlock_user_balance(v_approval.user_id, v_approval.amount, v_approval.currency);
    
    -- Log action
    PERFORM public.log_admin_action(
        p_admin_user_id,
        'reject_withdrawal',
        'withdrawal_management',
        'withdrawal_approval',
        p_approval_id::TEXT,
        NULL,
        jsonb_build_object('reason', p_reason)
    );
    
    -- Create notification for user
    PERFORM public.create_notification(
        v_approval.user_id,
        'withdrawal_failed'::notification_type,
        'Withdrawal Rejected',
        'Your withdrawal request for ' || v_approval.amount || ' ' || v_approval.currency || ' has been rejected. Reason: ' || p_reason,
        'withdrawal_transaction',
        v_approval.withdrawal_id
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_admin_roles_updated_at
    BEFORE UPDATE ON public.admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.log_admin_action TO service_role;
GRANT EXECUTE ON FUNCTION public.create_system_alert TO service_role;
GRANT EXECUTE ON FUNCTION public.record_metric TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_permissions TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal TO service_role;
GRANT SELECT ON public.admin_platform_stats TO service_role;
GRANT SELECT ON public.admin_user_activity TO service_role;
GRANT SELECT ON public.admin_pending_actions TO service_role;
