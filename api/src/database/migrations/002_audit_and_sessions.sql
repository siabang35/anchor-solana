-- ============================================
-- DeJaVu Database Migrations - Security Enhancement
-- Migration: 002_audit_and_sessions
-- ============================================

-- ============================================
-- 1. Audit Logs Table
-- For security event tracking and compliance
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON public.audit_logs(success);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON public.audit_logs(ip_address);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs
CREATE POLICY "Service role only for audit logs"
    ON public.audit_logs FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 2. User Sessions Table
-- For secure session management and token tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    device_info JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON public.user_sessions(is_active);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can read own sessions"
    ON public.user_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can delete own sessions (logout)
CREATE POLICY "Users can delete own sessions"
    ON public.user_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all sessions
CREATE POLICY "Service role can manage all sessions"
    ON public.user_sessions FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 3. Login Attempts Table
-- For brute force protection
-- ============================================
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    wallet_address TEXT,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for login attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_wallet ON public.login_attempts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON public.login_attempts(attempted_at DESC);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access login attempts
CREATE POLICY "Service role only for login attempts"
    ON public.login_attempts FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 4. User Preferences Table
-- For user settings and notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_email BOOLEAN DEFAULT true,
    notification_push BOOLEAN DEFAULT true,
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_method TEXT CHECK (two_factor_method IN ('email', 'authenticator', null)),
    marketing_emails BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage own preferences
CREATE POLICY "Users can read own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all preferences"
    ON public.user_preferences FOR ALL
    USING (auth.role() = 'service_role');

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_preferences ON public.user_preferences;
CREATE TRIGGER set_updated_at_preferences
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- 5. Cleanup Function for Expired Data
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired sessions (older than 30 days)
    DELETE FROM public.user_sessions
    WHERE expires_at < NOW() - INTERVAL '30 days';
    
    -- Clean up old login attempts (older than 90 days)
    DELETE FROM public.login_attempts
    WHERE attempted_at < NOW() - INTERVAL '90 days';
    
    -- Clean up old audit logs (older than 1 year - adjust based on compliance needs)
    DELETE FROM public.audit_logs
    WHERE created_at < NOW() - INTERVAL '365 days';
    
    -- Revoke expired refresh tokens
    UPDATE public.refresh_tokens
    SET revoked = true
    WHERE expires_at < NOW() AND revoked = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to Check Account Lockout
-- ============================================
CREATE OR REPLACE FUNCTION public.check_account_locked(
    p_email TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_lockout_threshold INTEGER DEFAULT 5,
    p_lockout_duration_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
    failed_attempts INTEGER;
BEGIN
    -- Count failed attempts in the lockout window
    SELECT COUNT(*)
    INTO failed_attempts
    FROM public.login_attempts
    WHERE 
        (p_email IS NULL OR email = p_email)
        AND (p_ip_address IS NULL OR ip_address = p_ip_address)
        AND success = false
        AND attempted_at > NOW() - (p_lockout_duration_minutes || ' minutes')::INTERVAL;
    
    RETURN failed_attempts >= p_lockout_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Additional Indexes for Performance
-- ============================================

-- Profiles - composite index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_gin 
    ON public.profiles USING GIN (wallet_addresses);

-- Wallet addresses - composite index
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address_chain 
    ON public.wallet_addresses(address, chain);

-- Refresh tokens - cleanup index
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires 
    ON public.refresh_tokens(expires_at) 
    WHERE revoked = false;
