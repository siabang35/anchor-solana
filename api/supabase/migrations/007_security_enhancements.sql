-- ============================================================================
-- DeJaVu - Security Enhancements Schema (007_security_enhancements.sql)
-- Rate limiting, fraud detection, and enhanced security infrastructure
-- ============================================================================

-- ============================================================================
-- RATE_LIMITS TABLE
-- Track API request rates per user/endpoint
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identifier (can be user_id, IP, API key, or combination)
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('user', 'ip', 'api_key', 'anonymous')),
    identifier TEXT NOT NULL,
    
    -- Endpoint or action being rate limited
    endpoint TEXT NOT NULL,
    
    -- Window tracking
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_size_seconds INTEGER NOT NULL DEFAULT 60,
    request_count INTEGER NOT NULL DEFAULT 1,
    
    -- Limits
    max_requests INTEGER NOT NULL DEFAULT 100,
    
    -- Block status
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    blocked_until TIMESTAMPTZ,
    block_reason TEXT,
    
    -- Timestamps
    last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per identifier/endpoint/window
    UNIQUE(identifier_type, identifier, endpoint, window_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier 
    ON public.rate_limits(identifier_type, identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint 
    ON public.rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked 
    ON public.rate_limits(is_blocked, blocked_until) 
    WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_rate_limits_window 
    ON public.rate_limits(window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- IP_BLACKLIST TABLE
-- Blocked IP addresses (for persistent blocks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ip_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- IP info (supports CIDR notation for ranges)
    ip_address INET NOT NULL,
    ip_type TEXT NOT NULL DEFAULT 'single' CHECK (ip_type IN ('single', 'range')),
    
    -- Block info
    reason TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Source of block
    blocked_by TEXT, -- 'system', 'admin', 'automated'
    admin_user_id UUID REFERENCES auth.users(id),
    
    -- Duration
    is_permanent BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate IPs
    UNIQUE(ip_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_active 
    ON public.ip_blacklist(ip_address) 
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_expires 
    ON public.ip_blacklist(expires_at) 
    WHERE is_active = true AND expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;

-- Only service role can manage blacklist
DROP POLICY IF EXISTS "Service role can manage IP blacklist" ON public.ip_blacklist;
CREATE POLICY "Service role can manage IP blacklist" ON public.ip_blacklist
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- DEVICE_FINGERPRINTS TABLE
-- Device tracking for fraud detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Fingerprint data
    fingerprint_hash TEXT NOT NULL,
    
    -- Device info
    browser_name TEXT,
    browser_version TEXT,
    os_name TEXT,
    os_version TEXT,
    device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
    screen_resolution TEXT,
    timezone TEXT,
    language TEXT,
    
    -- Trust level
    trust_score INTEGER NOT NULL DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
    is_trusted BOOLEAN NOT NULL DEFAULT false,
    trust_verified_at TIMESTAMPTZ,
    
    -- Risk flags
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    flag_reasons TEXT[],
    
    -- Usage stats
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    login_count INTEGER NOT NULL DEFAULT 0,
    
    -- Location data (approximate, from IP)
    last_country TEXT,
    last_city TEXT,
    last_ip INET,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user 
    ON public.device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash 
    ON public.device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_flagged 
    ON public.device_fingerprints(is_flagged) 
    WHERE is_flagged = true;

-- Enable RLS
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

-- Users can view their own devices
DROP POLICY IF EXISTS "Users can view own devices" ON public.device_fingerprints;
CREATE POLICY "Users can view own devices" ON public.device_fingerprints
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all devices" ON public.device_fingerprints;
CREATE POLICY "Service role can manage all devices" ON public.device_fingerprints
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WITHDRAWAL_LIMITS TABLE
-- User-specific withdrawal limits and cooling periods
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Daily limits
    daily_limit DECIMAL(20,8) NOT NULL DEFAULT 10000.00,
    daily_used DECIMAL(20,8) NOT NULL DEFAULT 0,
    daily_reset_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
    
    -- Monthly limits
    monthly_limit DECIMAL(20,8) NOT NULL DEFAULT 100000.00,
    monthly_used DECIMAL(20,8) NOT NULL DEFAULT 0,
    monthly_reset_at TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()) + INTERVAL '1 month',
    
    -- Per-transaction limits
    min_withdrawal DECIMAL(20,8) NOT NULL DEFAULT 10.00,
    max_withdrawal DECIMAL(20,8) NOT NULL DEFAULT 50000.00,
    
    -- Cooling period after changes
    cooling_period_hours INTEGER NOT NULL DEFAULT 24,
    cooling_period_ends_at TIMESTAMPTZ,
    
    -- Velocity limits (for fraud detection)
    max_withdrawals_per_hour INTEGER NOT NULL DEFAULT 3,
    max_withdrawals_per_day INTEGER NOT NULL DEFAULT 10,
    withdrawals_this_hour INTEGER NOT NULL DEFAULT 0,
    withdrawals_today INTEGER NOT NULL DEFAULT 0,
    last_withdrawal_at TIMESTAMPTZ,
    
    -- Flags
    is_restricted BOOLEAN NOT NULL DEFAULT false,
    restriction_reason TEXT,
    restricted_until TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawal_limits_user ON public.withdrawal_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_limits_restricted 
    ON public.withdrawal_limits(is_restricted) 
    WHERE is_restricted = true;

-- Enable RLS
ALTER TABLE public.withdrawal_limits ENABLE ROW LEVEL SECURITY;

-- Users can view their own limits
DROP POLICY IF EXISTS "Users can view own withdrawal limits" ON public.withdrawal_limits;
CREATE POLICY "Users can view own withdrawal limits" ON public.withdrawal_limits
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all withdrawal limits" ON public.withdrawal_limits;
CREATE POLICY "Service role can manage all withdrawal limits" ON public.withdrawal_limits
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- SUSPICIOUS_ACTIVITY TABLE
-- Log suspicious activities for review
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.suspicious_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor info
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address INET,
    device_fingerprint_id UUID REFERENCES public.device_fingerprints(id),
    
    -- Activity details
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'multiple_failed_logins',
        'unusual_withdrawal_pattern',
        'velocity_exceeded',
        'new_device_high_value',
        'ip_change_with_withdrawal',
        'duplicate_device_different_user',
        'blacklisted_ip_attempt',
        'suspicious_referral_pattern',
        'bot_detected',
        'other'
    )),
    
    -- Context
    description TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    
    -- Risk assessment
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    
    -- Resolution
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'escalated', 'false_positive')),
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    
    -- Actions taken
    actions_taken TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_user 
    ON public.suspicious_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_type 
    ON public.suspicious_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_status 
    ON public.suspicious_activity(status);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_risk 
    ON public.suspicious_activity(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_created 
    ON public.suspicious_activity(created_at DESC);

-- Enable RLS
ALTER TABLE public.suspicious_activity ENABLE ROW LEVEL SECURITY;

-- Only service role can access suspicious activity
DROP POLICY IF EXISTS "Service role can manage suspicious activity" ON public.suspicious_activity;
CREATE POLICY "Service role can manage suspicious activity" ON public.suspicious_activity
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier_type TEXT,
    p_identifier TEXT,
    p_endpoint TEXT,
    p_max_requests INTEGER DEFAULT 100,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
    allowed BOOLEAN,
    remaining INTEGER,
    reset_at TIMESTAMPTZ,
    is_blocked BOOLEAN
) AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_record public.rate_limits;
    v_allowed BOOLEAN := true;
    v_remaining INTEGER;
BEGIN
    -- Calculate current window start
    v_window_start := DATE_TRUNC('minute', NOW());
    
    -- Check if blocked
    SELECT * INTO v_record
    FROM public.rate_limits rl
    WHERE rl.identifier_type = p_identifier_type
      AND rl.identifier = p_identifier
      AND rl.endpoint = p_endpoint
      AND rl.is_blocked = true
      AND (rl.blocked_until IS NULL OR rl.blocked_until > NOW());
    
    IF v_record IS NOT NULL THEN
        RETURN QUERY SELECT false, 0, v_record.blocked_until, true;
        RETURN;
    END IF;
    
    -- Upsert rate limit record
    INSERT INTO public.rate_limits (
        identifier_type, identifier, endpoint, 
        window_start, window_size_seconds, request_count, max_requests
    )
    VALUES (
        p_identifier_type, p_identifier, p_endpoint,
        v_window_start, p_window_seconds, 1, p_max_requests
    )
    ON CONFLICT (identifier_type, identifier, endpoint, window_start)
    DO UPDATE SET
        request_count = public.rate_limits.request_count + 1,
        last_request_at = NOW()
    RETURNING * INTO v_record;
    
    -- Check if limit exceeded
    v_remaining := GREATEST(0, p_max_requests - v_record.request_count);
    v_allowed := v_record.request_count <= p_max_requests;
    
    RETURN QUERY SELECT 
        v_allowed, 
        v_remaining,
        v_window_start + (p_window_seconds || ' seconds')::INTERVAL,
        false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if IP is blacklisted
CREATE OR REPLACE FUNCTION public.is_ip_blacklisted(p_ip INET)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.ip_blacklist
        WHERE ip_address >>= p_ip  -- Matches if IP is contained in the range
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Block IP
CREATE OR REPLACE FUNCTION public.block_ip(
    p_ip INET,
    p_reason TEXT,
    p_severity TEXT DEFAULT 'medium',
    p_duration_hours INTEGER DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_block_id UUID;
BEGIN
    INSERT INTO public.ip_blacklist (
        ip_address, reason, severity, 
        is_permanent, expires_at,
        blocked_by, admin_user_id
    )
    VALUES (
        p_ip, p_reason, p_severity,
        p_duration_hours IS NULL,
        CASE WHEN p_duration_hours IS NOT NULL 
             THEN NOW() + (p_duration_hours || ' hours')::INTERVAL 
             ELSE NULL END,
        CASE WHEN p_admin_user_id IS NOT NULL THEN 'admin' ELSE 'system' END,
        p_admin_user_id
    )
    ON CONFLICT (ip_address) DO UPDATE SET
        reason = EXCLUDED.reason,
        severity = EXCLUDED.severity,
        is_permanent = EXCLUDED.is_permanent,
        expires_at = EXCLUDED.expires_at,
        is_active = true,
        updated_at = NOW()
    RETURNING id INTO v_block_id;
    
    RETURN v_block_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check withdrawal limits
CREATE OR REPLACE FUNCTION public.check_withdrawal_allowed(
    p_user_id UUID,
    p_amount DECIMAL(20,8)
)
RETURNS TABLE (
    allowed BOOLEAN,
    reason TEXT,
    daily_remaining DECIMAL(20,8),
    monthly_remaining DECIMAL(20,8)
) AS $$
DECLARE
    v_limits public.withdrawal_limits;
BEGIN
    -- Get or create limits for user
    INSERT INTO public.withdrawal_limits (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT * INTO v_limits
    FROM public.withdrawal_limits
    WHERE user_id = p_user_id;
    
    -- Reset daily/monthly if needed
    IF v_limits.daily_reset_at <= NOW() THEN
        UPDATE public.withdrawal_limits
        SET daily_used = 0, daily_reset_at = CURRENT_DATE + INTERVAL '1 day'
        WHERE user_id = p_user_id;
        v_limits.daily_used := 0;
    END IF;
    
    IF v_limits.monthly_reset_at <= NOW() THEN
        UPDATE public.withdrawal_limits
        SET monthly_used = 0, monthly_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        WHERE user_id = p_user_id;
        v_limits.monthly_used := 0;
    END IF;
    
    -- Check restrictions
    IF v_limits.is_restricted AND (v_limits.restricted_until IS NULL OR v_limits.restricted_until > NOW()) THEN
        RETURN QUERY SELECT false, v_limits.restriction_reason, 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Check cooling period
    IF v_limits.cooling_period_ends_at IS NOT NULL AND v_limits.cooling_period_ends_at > NOW() THEN
        RETURN QUERY SELECT false, 'Withdrawal cooling period active', 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Check minimum
    IF p_amount < v_limits.min_withdrawal THEN
        RETURN QUERY SELECT false, 'Below minimum withdrawal amount', 
            v_limits.daily_limit - v_limits.daily_used,
            v_limits.monthly_limit - v_limits.monthly_used;
        RETURN;
    END IF;
    
    -- Check maximum
    IF p_amount > v_limits.max_withdrawal THEN
        RETURN QUERY SELECT false, 'Exceeds maximum withdrawal amount',
            v_limits.daily_limit - v_limits.daily_used,
            v_limits.monthly_limit - v_limits.monthly_used;
        RETURN;
    END IF;
    
    -- Check daily limit
    IF v_limits.daily_used + p_amount > v_limits.daily_limit THEN
        RETURN QUERY SELECT false, 'Daily withdrawal limit exceeded',
            v_limits.daily_limit - v_limits.daily_used,
            v_limits.monthly_limit - v_limits.monthly_used;
        RETURN;
    END IF;
    
    -- Check monthly limit
    IF v_limits.monthly_used + p_amount > v_limits.monthly_limit THEN
        RETURN QUERY SELECT false, 'Monthly withdrawal limit exceeded',
            v_limits.daily_limit - v_limits.daily_used,
            v_limits.monthly_limit - v_limits.monthly_used;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, NULL::TEXT,
        v_limits.daily_limit - v_limits.daily_used - p_amount,
        v_limits.monthly_limit - v_limits.monthly_used - p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record withdrawal (update limits)
CREATE OR REPLACE FUNCTION public.record_withdrawal_usage(
    p_user_id UUID,
    p_amount DECIMAL(20,8)
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.withdrawal_limits
    SET 
        daily_used = daily_used + p_amount,
        monthly_used = monthly_used + p_amount,
        withdrawals_this_hour = withdrawals_this_hour + 1,
        withdrawals_today = withdrawals_today + 1,
        last_withdrawal_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log suspicious activity
CREATE OR REPLACE FUNCTION public.log_suspicious_activity(
    p_user_id UUID,
    p_ip INET,
    p_activity_type TEXT,
    p_description TEXT,
    p_risk_score INTEGER,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO public.suspicious_activity (
        user_id, ip_address, activity_type, description, risk_score, details
    )
    VALUES (
        p_user_id, p_ip, p_activity_type, p_description, p_risk_score, p_details
    )
    RETURNING id INTO v_activity_id;
    
    -- Auto-escalate high risk scores
    IF p_risk_score >= 80 THEN
        UPDATE public.suspicious_activity
        SET status = 'escalated'
        WHERE id = v_activity_id;
    END IF;
    
    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old rate limit records
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour'
      AND is_blocked = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_withdrawal_limits_updated_at
    BEFORE UPDATE ON public.withdrawal_limits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ip_blacklist_updated_at
    BEFORE UPDATE ON public.ip_blacklist
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.is_ip_blacklisted TO service_role;
GRANT EXECUTE ON FUNCTION public.block_ip TO service_role;
GRANT EXECUTE ON FUNCTION public.check_withdrawal_allowed TO service_role;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.log_suspicious_activity TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits TO service_role;
