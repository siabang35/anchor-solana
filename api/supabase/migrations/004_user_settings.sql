-- ============================================================================
-- DeJaVu - User Settings Schema (004_user_settings.sql)
-- Extended user preferences, social connections, and API keys
-- ============================================================================

-- ============================================================================
-- USER_SETTINGS TABLE
-- Extended user preferences and settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Profile fields (extending profiles table)
    bio TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    location TEXT,
    website_url TEXT,
    
    -- Display preferences
    theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    currency_display TEXT NOT NULL DEFAULT 'USD' CHECK (currency_display IN ('USD', 'EUR', 'GBP', 'ETH', 'BTC')),
    locale TEXT NOT NULL DEFAULT 'en',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    compact_mode BOOLEAN NOT NULL DEFAULT false,
    
    -- Trading preferences
    default_chain TEXT NOT NULL DEFAULT 'base' CHECK (default_chain IN ('ethereum', 'base', 'solana', 'sui')),
    default_slippage DECIMAL(5,2) NOT NULL DEFAULT 0.50 CHECK (default_slippage >= 0 AND default_slippage <= 50),
    gas_preference TEXT NOT NULL DEFAULT 'standard' CHECK (gas_preference IN ('slow', 'standard', 'fast', 'instant')),
    auto_approve_trades BOOLEAN NOT NULL DEFAULT false,
    show_testnet BOOLEAN NOT NULL DEFAULT false,
    
    -- Privacy settings
    profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private', 'connections_only')),
    show_portfolio_value BOOLEAN NOT NULL DEFAULT false,
    show_trading_activity BOOLEAN NOT NULL DEFAULT true,
    allow_mentions BOOLEAN NOT NULL DEFAULT true,
    
    -- Security preferences
    require_2fa_for_withdrawals BOOLEAN NOT NULL DEFAULT false,
    withdrawal_whitelist_only BOOLEAN NOT NULL DEFAULT false,
    login_notification_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Feature flags
    beta_features_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON public.user_settings(username) WHERE username IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own settings
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);

-- Public profiles are viewable (for leaderboards, etc.)
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.user_settings;
CREATE POLICY "Public profiles are viewable" ON public.user_settings
    FOR SELECT USING (profile_visibility = 'public');

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all user settings" ON public.user_settings;
CREATE POLICY "Service role can manage all user settings" ON public.user_settings
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- USER_SOCIAL_CONNECTIONS TABLE
-- OAuth connections to social platforms
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Platform info
    platform TEXT NOT NULL CHECK (platform IN ('twitter', 'discord', 'telegram', 'github')),
    platform_user_id TEXT NOT NULL,
    platform_username TEXT,
    platform_display_name TEXT,
    platform_avatar_url TEXT,
    
    -- OAuth tokens (encrypted at rest - use pgcrypto or application-level encryption)
    -- IMPORTANT: In production, these should be encrypted!
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    
    -- Verification status
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One connection per platform per user
    UNIQUE(user_id, platform)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_connections_user ON public.user_social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON public.user_social_connections(platform, platform_user_id);

-- Enable RLS
ALTER TABLE public.user_social_connections ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connections
DROP POLICY IF EXISTS "Users can manage own social connections" ON public.user_social_connections;
CREATE POLICY "Users can manage own social connections" ON public.user_social_connections
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all social connections" ON public.user_social_connections;
CREATE POLICY "Service role can manage all social connections" ON public.user_social_connections
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- USER_API_KEYS TABLE
-- API keys for programmatic access
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Key info
    name TEXT NOT NULL,
    description TEXT,
    
    -- Key hash (never store the actual key!)
    key_prefix TEXT NOT NULL, -- First 8 chars for identification
    key_hash TEXT NOT NULL,   -- SHA-256 hash of the full key
    
    -- Permissions (JSON array of allowed scopes)
    scopes TEXT[] NOT NULL DEFAULT '{read}',
    
    -- Rate limiting
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    
    -- IP whitelist (optional)
    ip_whitelist INET[],
    
    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    total_requests BIGINT NOT NULL DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate key prefixes per user
    UNIQUE(user_id, key_prefix)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.user_api_keys(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.user_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.user_api_keys(key_hash);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own keys (but not the full key - only prefix)
DROP POLICY IF EXISTS "Users can view own API keys" ON public.user_api_keys;
CREATE POLICY "Users can view own API keys" ON public.user_api_keys
    FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own keys
DROP POLICY IF EXISTS "Users can delete own API keys" ON public.user_api_keys;
CREATE POLICY "Users can delete own API keys" ON public.user_api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all API keys" ON public.user_api_keys;
CREATE POLICY "Service role can manage all API keys" ON public.user_api_keys
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WITHDRAWAL_WHITELIST TABLE
-- Whitelisted addresses for withdrawals (optional security feature)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Address info
    address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    label TEXT NOT NULL,
    
    -- Verification (for high security, require confirmation)
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token TEXT,
    verification_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One entry per address per chain per user
    UNIQUE(user_id, address, chain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawal_whitelist_user ON public.withdrawal_whitelist(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_whitelist_address ON public.withdrawal_whitelist(address, chain);

-- Enable RLS
ALTER TABLE public.withdrawal_whitelist ENABLE ROW LEVEL SECURITY;

-- Users can manage their own whitelist
DROP POLICY IF EXISTS "Users can manage own withdrawal whitelist" ON public.withdrawal_whitelist;
CREATE POLICY "Users can manage own withdrawal whitelist" ON public.withdrawal_whitelist
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all withdrawal whitelists" ON public.withdrawal_whitelist;
CREATE POLICY "Service role can manage all withdrawal whitelists" ON public.withdrawal_whitelist
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get or create user settings
CREATE OR REPLACE FUNCTION public.get_or_create_user_settings(p_user_id UUID)
RETURNS public.user_settings AS $$
DECLARE
    v_settings public.user_settings;
BEGIN
    SELECT * INTO v_settings FROM public.user_settings WHERE user_id = p_user_id;
    
    IF v_settings IS NULL THEN
        INSERT INTO public.user_settings (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_settings;
    END IF;
    
    RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if username is available
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM public.user_settings 
        WHERE LOWER(username) = LOWER(p_username)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE (
    user_id UUID,
    scopes TEXT[],
    rate_limit_per_minute INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ak.user_id,
        ak.scopes,
        ak.rate_limit_per_minute
    FROM public.user_api_keys ak
    WHERE ak.key_hash = p_key_hash
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Increment API key usage
CREATE OR REPLACE FUNCTION public.increment_api_key_usage(p_key_hash TEXT, p_ip INET)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_api_keys
    SET 
        last_used_at = NOW(),
        last_used_ip = p_ip,
        total_requests = total_requests + 1
    WHERE key_hash = p_key_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on user_settings
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at on social connections
CREATE TRIGGER update_social_connections_updated_at
    BEFORE UPDATE ON public.user_social_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_or_create_user_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_api_key_usage TO service_role;
