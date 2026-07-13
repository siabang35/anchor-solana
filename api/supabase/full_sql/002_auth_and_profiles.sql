-- ============================================================================
-- ExoDuZe — Full SQL: Authentication & User Profiles
-- File: 002_auth_and_profiles.sql
--
-- PURPOSE: Core user identity infrastructure — profiles, wallet addresses,
--          login attempts, audit logs, and session management.
--
-- SECURITY: RLS on every table. Users see only own data.
--           Service role for system operations (wallet auto-provisioning).
--
-- CLOUDFLARE R2: User avatar_url points to R2 bucket (uploaded via presigned URL).
--                Profile images are NOT stored in the database.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. PROFILES TABLE                                                       ║
-- ║    Linked to Supabase auth.users. One profile per authenticated user.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.profiles (
    -- Primary key references Supabase Auth
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Identity
    email                TEXT UNIQUE,
    full_name            TEXT,
    avatar_url           TEXT,                          -- Cloudflare R2 URL (not stored in DB)
    bio                  TEXT,

    -- Privy integration (optional)
    privy_user_id        TEXT UNIQUE,
    privy_wallet_address TEXT,

    -- Chain preference
    default_chain        TEXT DEFAULT 'solana',

    -- KYC
    kyc_status           TEXT DEFAULT 'none'
        CHECK (kyc_status IN ('none', 'pending', 'verified', 'rejected')),
    kyc_verified_at      TIMESTAMPTZ,

    -- User preferences (theme, notifications, etc.)
    preferences          JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON public.profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_privy_user ON public.profiles(privy_user_id)
    WHERE privy_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_privy_wallet ON public.profiles(privy_wallet_address)
    WHERE privy_wallet_address IS NOT NULL;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;
CREATE POLICY "Service role can manage all profiles" ON public.profiles
    FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase Auth. avatar_url points to Cloudflare R2.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. WALLET ADDRESSES TABLE                                               ║
-- ║    Normalized multi-chain wallet storage. Solana is the primary chain.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.wallet_addresses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Wallet identity
    address        TEXT NOT NULL,
    chain          TEXT NOT NULL DEFAULT 'solana',
    is_primary     BOOLEAN DEFAULT false,

    -- Classification
    wallet_type    TEXT DEFAULT 'external'
        CHECK (wallet_type IN ('external', 'custodial', 'smart_wallet')),

    -- Verification
    is_verified    BOOLEAN DEFAULT false,
    verified_at    TIMESTAMPTZ,

    -- Display
    label          TEXT,

    -- Timestamps
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(address, chain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address_chain ON public.wallet_addresses(address, chain);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON public.wallet_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_type ON public.wallet_addresses(wallet_type);

-- RLS
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallets" ON public.wallet_addresses;
CREATE POLICY "Users can view own wallets" ON public.wallet_addresses
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own wallets" ON public.wallet_addresses;
CREATE POLICY "Users can manage own wallets" ON public.wallet_addresses
    FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage all wallets" ON public.wallet_addresses;
CREATE POLICY "Service role can manage all wallets" ON public.wallet_addresses
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.wallet_addresses IS 'Multi-chain wallet addresses linked to user profiles. Solana is primary.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. LOGIN ATTEMPTS TABLE                                                 ║
-- ║    Brute force protection and security monitoring.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.login_attempts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT,
    wallet_address   TEXT,
    ip_address       INET NOT NULL,
    user_agent       TEXT,
    auth_method      TEXT,   -- 'wallet', 'email_otp', 'google_oauth'
    success          BOOLEAN NOT NULL DEFAULT false,
    failure_reason   TEXT,
    attempted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lockout queries (time-bounded)
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_wallet_time ON public.login_attempts(wallet_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_success ON public.login_attempts(email, success);

-- RLS: service role only (system writes, no user access)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage login attempts" ON public.login_attempts;
CREATE POLICY "Service role can manage login attempts" ON public.login_attempts
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.login_attempts IS 'Brute force protection: tracks login attempts per email/wallet/IP';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. AUDIT LOGS TABLE                                                     ║
-- ║    Comprehensive compliance and security audit trail.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action           TEXT NOT NULL,          -- 'agent.deploy', 'stake.create', etc.
    resource_type    TEXT NOT NULL,          -- 'agent', 'competition', 'pool_stake'
    resource_id      TEXT,
    old_values       JSONB,
    new_values       JSONB,
    ip_address       INET,
    user_agent       TEXT,
    request_id       TEXT,                   -- Correlation ID
    success          BOOLEAN NOT NULL DEFAULT true,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request ON public.audit_logs(request_id);

-- RLS: service role only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_logs;
CREATE POLICY "Service role can manage audit logs" ON public.audit_logs
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.audit_logs IS 'Comprehensive audit trail for all platform operations';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. USER SESSIONS TABLE                                                  ║
-- ║    Active session tracking for concurrent login management.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.user_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT NOT NULL,
    ip_address          INET,
    user_agent          TEXT,
    device_info         JSONB DEFAULT '{}'::jsonb,
    is_active           BOOLEAN DEFAULT true,
    last_active_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.user_sessions(is_active, expires_at);

-- RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;
CREATE POLICY "Service role can manage sessions" ON public.user_sessions
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.user_sessions IS 'Active user session tracking with token hash and device info';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. CLEANUP CRON FUNCTIONS                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Cleanup login attempts older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
    DELETE FROM public.login_attempts
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.user_sessions
    WHERE expires_at < NOW()
       OR (is_active = false AND last_active_at < NOW() - INTERVAL '7 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION public.cleanup_old_login_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions TO service_role;
