-- ============================================================================
-- DeJaVu - Email OTP Authentication Schema (033_email_otp_auth.sql)
-- Secure OTP tracking, rate limiting, and anti-abuse infrastructure
-- OWASP Compliant: Rate limiting, lockout, audit logging
-- ============================================================================

-- ============================================================================
-- EMAIL_OTP_REQUESTS TABLE
-- Track OTP request history per email/IP for rate limiting
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request details
    email TEXT NOT NULL,
    ip_address INET NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('signup', 'login', 'resend')),
    
    -- User agent for security analysis
    user_agent TEXT,
    
    -- Status tracking
    otp_sent BOOLEAN NOT NULL DEFAULT true,
    send_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_email_otp_requests_email 
    ON public.email_otp_requests(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_otp_requests_ip 
    ON public.email_otp_requests(ip_address, created_at DESC);
-- Index for cleanup queries (no predicate - NOW() is not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_email_otp_requests_cleanup 
    ON public.email_otp_requests(expires_at);

-- Enable RLS
ALTER TABLE public.email_otp_requests ENABLE ROW LEVEL SECURITY;

-- Only service role can manage OTP requests
DROP POLICY IF EXISTS "Service role can manage OTP requests" ON public.email_otp_requests;
CREATE POLICY "Service role can manage OTP requests" ON public.email_otp_requests
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- EMAIL_OTP_ATTEMPTS TABLE
-- Track verification attempts for lockout mechanism
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_otp_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Attempt details
    email TEXT NOT NULL,
    ip_address INET NOT NULL,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason TEXT,
    
    -- Security metadata
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lockout checks
CREATE INDEX IF NOT EXISTS idx_email_otp_attempts_email 
    ON public.email_otp_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_otp_attempts_ip 
    ON public.email_otp_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_otp_attempts_failed 
    ON public.email_otp_attempts(email, created_at DESC) 
    WHERE success = false;

-- Enable RLS
ALTER TABLE public.email_otp_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can manage OTP attempts
DROP POLICY IF EXISTS "Service role can manage OTP attempts" ON public.email_otp_attempts;
CREATE POLICY "Service role can manage OTP attempts" ON public.email_otp_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- EMAIL_OTP_LOCKOUTS TABLE
-- Track lockout status for repeated failures
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_otp_lockouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lockout target
    email TEXT NOT NULL,
    ip_address INET,
    
    -- Lockout details
    lockout_count INTEGER NOT NULL DEFAULT 1,
    reason TEXT NOT NULL DEFAULT 'Too many failed attempts',
    
    -- Timing
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ NOT NULL,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    unlocked_by TEXT, -- 'system', 'admin', 'timeout'
    unlocked_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_otp_lockouts_email 
    ON public.email_otp_lockouts(email, is_active) 
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_email_otp_lockouts_expires 
    ON public.email_otp_lockouts(locked_until) 
    WHERE is_active = true;

-- Unique constraint on active lockouts per email
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_otp_lockouts_unique_active 
    ON public.email_otp_lockouts(email) 
    WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.email_otp_lockouts ENABLE ROW LEVEL SECURITY;

-- Only service role can manage lockouts
DROP POLICY IF EXISTS "Service role can manage OTP lockouts" ON public.email_otp_lockouts;
CREATE POLICY "Service role can manage OTP lockouts" ON public.email_otp_lockouts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PENDING_OTP_SIGNUPS TABLE
-- Temporarily store signup data until OTP is verified
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pending_otp_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User data (stored temporarily)
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    
    -- OTP tracking
    otp_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_pending_otp_signups_expires 
    ON public.pending_otp_signups(expires_at);

-- Enable RLS
ALTER TABLE public.pending_otp_signups ENABLE ROW LEVEL SECURITY;

-- Only service role can manage pending signups
DROP POLICY IF EXISTS "Service role can manage pending signups" ON public.pending_otp_signups;
CREATE POLICY "Service role can manage pending signups" ON public.pending_otp_signups
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check OTP rate limit for email
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(
    p_email TEXT,
    p_ip INET,
    p_min_interval_seconds INTEGER DEFAULT 60,
    p_max_per_hour_email INTEGER DEFAULT 5,
    p_max_per_hour_ip INTEGER DEFAULT 20
)
RETURNS TABLE (
    allowed BOOLEAN,
    reason TEXT,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_last_request TIMESTAMPTZ;
    v_email_count_hour INTEGER;
    v_ip_count_hour INTEGER;
    v_seconds_since_last INTEGER;
BEGIN
    -- Check last request time for this email
    SELECT created_at INTO v_last_request
    FROM public.email_otp_requests
    WHERE email = LOWER(p_email)
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_last_request IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_request))::INTEGER;
        IF v_seconds_since_last < p_min_interval_seconds THEN
            RETURN QUERY SELECT 
                false, 
                'Please wait before requesting another code'::TEXT, 
                (p_min_interval_seconds - v_seconds_since_last);
            RETURN;
        END IF;
    END IF;
    
    -- Check email rate limit (per hour)
    SELECT COUNT(*) INTO v_email_count_hour
    FROM public.email_otp_requests
    WHERE email = LOWER(p_email)
      AND created_at > NOW() - INTERVAL '1 hour';
    
    IF v_email_count_hour >= p_max_per_hour_email THEN
        RETURN QUERY SELECT 
            false, 
            'Too many requests for this email. Try again later.'::TEXT, 
            3600;
        RETURN;
    END IF;
    
    -- Check IP rate limit (per hour)
    SELECT COUNT(*) INTO v_ip_count_hour
    FROM public.email_otp_requests
    WHERE ip_address = p_ip
      AND created_at > NOW() - INTERVAL '1 hour';
    
    IF v_ip_count_hour >= p_max_per_hour_ip THEN
        RETURN QUERY SELECT 
            false, 
            'Too many requests from this location. Try again later.'::TEXT, 
            3600;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, NULL::TEXT, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if email/IP is locked out
-- Drop first to allow changing return type
DROP FUNCTION IF EXISTS public.check_otp_lockout(TEXT, INET);
CREATE OR REPLACE FUNCTION public.check_otp_lockout(
    p_email TEXT,
    p_ip INET DEFAULT NULL
)
RETURNS TABLE (
    is_locked BOOLEAN,
    lock_expires_at TIMESTAMPTZ,
    lock_reason TEXT
) AS $$
DECLARE
    v_lockout public.email_otp_lockouts;
BEGIN
    -- First, clean up expired lockouts
    UPDATE public.email_otp_lockouts eol
    SET is_active = false, unlocked_by = 'timeout', unlocked_at = NOW()
    WHERE eol.is_active = true AND eol.locked_until <= NOW();
    
    -- Check for active lockout
    SELECT * INTO v_lockout
    FROM public.email_otp_lockouts eol2
    WHERE eol2.email = LOWER(p_email)
      AND eol2.is_active = true
    LIMIT 1;
    
    IF v_lockout IS NOT NULL THEN
        RETURN QUERY SELECT true, v_lockout.locked_until, v_lockout.reason;
        RETURN;
    END IF;
    
    -- No active lockout
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log OTP request
CREATE OR REPLACE FUNCTION public.log_otp_request(
    p_email TEXT,
    p_ip INET,
    p_request_type TEXT,
    p_user_agent TEXT DEFAULT NULL,
    p_otp_sent BOOLEAN DEFAULT true,
    p_send_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_request_id UUID;
BEGIN
    INSERT INTO public.email_otp_requests (
        email, ip_address, request_type, user_agent, otp_sent, send_error
    )
    VALUES (
        LOWER(p_email), p_ip, p_request_type, p_user_agent, p_otp_sent, p_send_error
    )
    RETURNING id INTO v_request_id;
    
    RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log OTP verification attempt
CREATE OR REPLACE FUNCTION public.log_otp_attempt(
    p_email TEXT,
    p_ip INET,
    p_success BOOLEAN,
    p_failure_reason TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_failed_count INTEGER;
    v_lockout_duration INTERVAL;
    v_existing_lockout_count INTEGER;
BEGIN
    -- Log the attempt
    INSERT INTO public.email_otp_attempts (
        email, ip_address, success, failure_reason, user_agent
    )
    VALUES (
        LOWER(p_email), p_ip, p_success, p_failure_reason, p_user_agent
    );
    
    -- If successful, we're done
    IF p_success THEN
        -- Clear any pending lockouts on success
        UPDATE public.email_otp_lockouts
        SET is_active = false, unlocked_by = 'success', unlocked_at = NOW()
        WHERE email = LOWER(p_email) AND is_active = true;
        RETURN;
    END IF;
    
    -- Count recent failed attempts (last 15 minutes)
    SELECT COUNT(*) INTO v_failed_count
    FROM public.email_otp_attempts
    WHERE email = LOWER(p_email)
      AND success = false
      AND created_at > NOW() - INTERVAL '15 minutes';
    
    -- Check if we need to create/update lockout
    IF v_failed_count >= 5 THEN
        -- Get existing lockout count for progressive lockout
        SELECT COALESCE(MAX(lockout_count), 0) INTO v_existing_lockout_count
        FROM public.email_otp_lockouts
        WHERE email = LOWER(p_email)
          AND created_at > NOW() - INTERVAL '24 hours';
        
        -- Progressive lockout duration
        IF v_existing_lockout_count >= 3 THEN
            v_lockout_duration := INTERVAL '1 hour'; -- After 3 lockouts in 24h
        ELSIF v_existing_lockout_count >= 1 THEN
            v_lockout_duration := INTERVAL '30 minutes'; -- After 1 lockout
        ELSE
            v_lockout_duration := INTERVAL '15 minutes'; -- First lockout
        END IF;
        
        -- Create lockout (upsert)
        INSERT INTO public.email_otp_lockouts (
            email, ip_address, lockout_count, locked_until
        )
        VALUES (
            LOWER(p_email), p_ip, v_existing_lockout_count + 1, NOW() + v_lockout_duration
        )
        ON CONFLICT (email) WHERE is_active = true
        DO UPDATE SET
            lockout_count = public.email_otp_lockouts.lockout_count + 1,
            locked_until = NOW() + v_lockout_duration,
            updated_at = NOW();
        
        -- Log suspicious activity
        PERFORM public.log_suspicious_activity(
            NULL,
            p_ip,
            'multiple_failed_logins',
            'Multiple failed OTP verification attempts for email: ' || LOWER(p_email),
            LEAST(90, 50 + (v_failed_count * 8)),
            jsonb_build_object(
                'email', LOWER(p_email),
                'failed_attempts', v_failed_count,
                'lockout_duration', v_lockout_duration::TEXT
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Save pending signup data
CREATE OR REPLACE FUNCTION public.save_pending_otp_signup(
    p_email TEXT,
    p_password_hash TEXT,
    p_full_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_pending_id UUID;
BEGIN
    INSERT INTO public.pending_otp_signups (
        email, password_hash, full_name
    )
    VALUES (
        LOWER(p_email), p_password_hash, p_full_name
    )
    ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        otp_requested_at = NOW(),
        expires_at = NOW() + INTERVAL '10 minutes',
        updated_at = NOW()
    RETURNING id INTO v_pending_id;
    
    RETURN v_pending_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get and clear pending signup
CREATE OR REPLACE FUNCTION public.get_pending_otp_signup(
    p_email TEXT
)
RETURNS TABLE (
    id UUID,
    email TEXT,
    password_hash TEXT,
    full_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pos.id, pos.email, pos.password_hash, pos.full_name
    FROM public.pending_otp_signups pos
    WHERE pos.email = LOWER(p_email)
      AND pos.expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear pending signup (after successful verification)
CREATE OR REPLACE FUNCTION public.clear_pending_otp_signup(
    p_email TEXT
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.pending_otp_signups
    WHERE email = LOWER(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired OTP data
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Cleanup expired pending signups
    DELETE FROM public.pending_otp_signups
    WHERE expires_at < NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Cleanup old OTP requests (older than 24 hours)
    DELETE FROM public.email_otp_requests
    WHERE created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Cleanup old OTP attempts (older than 7 days)
    DELETE FROM public.email_otp_attempts
    WHERE created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Cleanup old inactive lockouts (older than 30 days)
    DELETE FROM public.email_otp_lockouts
    WHERE is_active = false AND created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.check_otp_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.check_otp_lockout TO service_role;
GRANT EXECUTE ON FUNCTION public.log_otp_request TO service_role;
GRANT EXECUTE ON FUNCTION public.log_otp_attempt TO service_role;
GRANT EXECUTE ON FUNCTION public.save_pending_otp_signup TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_otp_signup TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_pending_otp_signup TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otp_data TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for lockouts
CREATE OR REPLACE TRIGGER update_email_otp_lockouts_updated_at
    BEFORE UPDATE ON public.email_otp_lockouts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update timestamp trigger for pending signups
CREATE OR REPLACE TRIGGER update_pending_otp_signups_updated_at
    BEFORE UPDATE ON public.pending_otp_signups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
