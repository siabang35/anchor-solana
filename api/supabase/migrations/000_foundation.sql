-- ============================================================================
-- DeJaVu - Foundation Schema (000_foundation.sql)
-- Core user and authentication infrastructure
-- Run this FIRST before any other migrations
-- ============================================================================

-- ============================================================================
-- PROFILES TABLE
-- User profiles linked to Supabase Auth
-- ============================================================================

-- First check if profiles table exists and add missing columns
DO $$
BEGIN
    -- Create table if not exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        CREATE TABLE public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            email TEXT UNIQUE,
            full_name TEXT,
            avatar_url TEXT,
            wallet_addresses JSONB DEFAULT '[]'::jsonb,
            bio TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;

    -- Add new columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'privy_user_id') THEN
        ALTER TABLE public.profiles ADD COLUMN privy_user_id TEXT UNIQUE;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'privy_wallet_address') THEN
        ALTER TABLE public.profiles ADD COLUMN privy_wallet_address TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'default_chain') THEN
        ALTER TABLE public.profiles ADD COLUMN default_chain TEXT DEFAULT 'base';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'kyc_status') THEN
        ALTER TABLE public.profiles ADD COLUMN kyc_status TEXT DEFAULT 'none';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'kyc_verified_at') THEN
        ALTER TABLE public.profiles ADD COLUMN kyc_verified_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferences') THEN
        ALTER TABLE public.profiles ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;
    END IF;
END
$$;

-- Create indexes safely
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON public.profiles(created_at DESC);

-- Create privy indexes only if columns exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'privy_user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_profiles_privy_user ON public.profiles(privy_user_id);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'privy_wallet_address') THEN
        CREATE INDEX IF NOT EXISTS idx_profiles_privy_wallet ON public.profiles(privy_wallet_address);
    END IF;
END
$$;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles" ON public.profiles
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WALLET_ADDRESSES TABLE
-- Normalized table for user wallet addresses with chain support
-- ============================================================================
DO $$
BEGIN
    -- Create table if not exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_addresses') THEN
        CREATE TABLE public.wallet_addresses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            address TEXT NOT NULL,
            chain TEXT NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(address, chain)
        );
    END IF;

    -- Add new columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_addresses' AND column_name = 'wallet_type') THEN
        ALTER TABLE public.wallet_addresses ADD COLUMN wallet_type TEXT DEFAULT 'external';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_addresses' AND column_name = 'is_verified') THEN
        ALTER TABLE public.wallet_addresses ADD COLUMN is_verified BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_addresses' AND column_name = 'verified_at') THEN
        ALTER TABLE public.wallet_addresses ADD COLUMN verified_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_addresses' AND column_name = 'label') THEN
        ALTER TABLE public.wallet_addresses ADD COLUMN label TEXT;
    END IF;
END
$$;

-- Indexes for wallet lookups
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address_chain ON public.wallet_addresses(address, chain);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON public.wallet_addresses(user_id);

-- Create wallet_type index only if column exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_addresses' AND column_name = 'wallet_type') THEN
        CREATE INDEX IF NOT EXISTS idx_wallet_addresses_type ON public.wallet_addresses(wallet_type);
    END IF;
END
$$;

-- Enable RLS on wallet_addresses
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;

-- Drop and recreate wallet policies
DROP POLICY IF EXISTS "Users can view own wallets" ON public.wallet_addresses;
DROP POLICY IF EXISTS "Users can manage own wallets" ON public.wallet_addresses;
DROP POLICY IF EXISTS "Service role can manage all wallets" ON public.wallet_addresses;

CREATE POLICY "Users can view own wallets" ON public.wallet_addresses
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own wallets" ON public.wallet_addresses
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all wallets" ON public.wallet_addresses
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- LOGIN_ATTEMPTS TABLE
-- For brute force protection and security monitoring
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'login_attempts') THEN
        CREATE TABLE public.login_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT,
            wallet_address TEXT,
            ip_address INET NOT NULL,
            user_agent TEXT,
            success BOOLEAN NOT NULL DEFAULT false,
            failure_reason TEXT,
            attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;
    
    -- Add auth_method if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'auth_method') THEN
        ALTER TABLE public.login_attempts ADD COLUMN auth_method TEXT;
    END IF;
END
$$;

-- Indexes for lockout queries
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_wallet_time ON public.login_attempts(wallet_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_success ON public.login_attempts(email, success);

-- Enable RLS on login_attempts
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policy
DROP POLICY IF EXISTS "Service role can manage login attempts" ON public.login_attempts;
CREATE POLICY "Service role can manage login attempts" ON public.login_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- AUDIT_LOGS TABLE
-- Comprehensive audit trail for compliance and security
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request ON public.audit_logs(request_id);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policy
DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_logs;
CREATE POLICY "Service role can manage audit logs" ON public.audit_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- SESSIONS TABLE
-- Active user sessions tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.user_sessions(is_active, expires_at);

-- Enable RLS on user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policy
DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;
CREATE POLICY "Service role can manage sessions" ON public.user_sessions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on profiles
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Cleanup old login attempts (schedule as cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
    DELETE FROM public.login_attempts
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired sessions (schedule as cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.user_sessions
    WHERE expires_at < NOW() OR (is_active = false AND last_active_at < NOW() - INTERVAL '7 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.cleanup_old_login_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions TO service_role;
