-- ============================================================================
-- ExoDuZe — User Preferences, Socials, API Keys, and Notifications
-- File: 009_user_preferences_and_interactions.sql
--
-- PURPOSE: Unified user settings, UI themes, multi-platform social connections,
--          programmatic API key access, and delivery-optimized notification system.
--
-- CLOUDFLARE R2: Rich notification attachments or raw payloads exceed 10KB
--                are archived to R2; DB stores the R2 URL in notifications.data.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. USER SETTINGS TABLE                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.user_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Custom profile metadata
    display_name                VARCHAR(100),
    username                    VARCHAR(50) UNIQUE CHECK (username ~* '^[a-zA-Z0-9_]{3,30}$'),
    bio                         TEXT,
    location                    VARCHAR(100),
    website_url                 TEXT,

    -- UI Settings
    theme                       VARCHAR(20) NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'system')),
    currency_display            VARCHAR(10) NOT NULL DEFAULT 'USDC' CHECK (currency_display IN ('USD', 'EUR', 'GBP', 'SOL', 'USDC')),
    locale                      VARCHAR(10) NOT NULL DEFAULT 'en',
    timezone                    VARCHAR(50) NOT NULL DEFAULT 'UTC',
    compact_mode                BOOLEAN NOT NULL DEFAULT false,

    -- Sol/Web3 settings
    default_chain               VARCHAR(20) NOT NULL DEFAULT 'solana' CHECK (default_chain IN ('solana','ethereum','base','sui')),
    default_slippage            DECIMAL(5,2) NOT NULL DEFAULT 0.50 CHECK (default_slippage >= 0 AND default_slippage <= 50),
    auto_approve_trades         BOOLEAN NOT NULL DEFAULT false,
    show_testnet                BOOLEAN NOT NULL DEFAULT false,

    -- Privacy Settings
    profile_visibility          VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private', 'connections_only')),
    show_portfolio_value        BOOLEAN NOT NULL DEFAULT true,
    show_trading_activity       BOOLEAN NOT NULL DEFAULT true,
    allow_mentions              BOOLEAN NOT NULL DEFAULT true,

    -- Security preferences
    require_2fa_for_withdrawals BOOLEAN NOT NULL DEFAULT false,
    withdrawal_whitelist_only   BOOLEAN NOT NULL DEFAULT false,
    login_notification_enabled  BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON public.user_settings(username) WHERE username IS NOT NULL;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public user settings are viewable by anyone" ON public.user_settings
    FOR SELECT USING (profile_visibility = 'public');
CREATE POLICY "Service role full access user_settings" ON public.user_settings
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.user_settings IS 'Extended user profile settings, UX configuration, and security options';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SOCIAL CONNECTIONS TABLE                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.user_social_connections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform              VARCHAR(20) NOT NULL CHECK (platform IN ('twitter', 'discord', 'telegram', 'github')),
    platform_user_id      VARCHAR(100) NOT NULL,
    platform_username     VARCHAR(100),
    platform_display_name VARCHAR(150),
    platform_avatar_url   TEXT,              -- Points to Cloudflare R2 cache bucket

    -- Cryptographic encrypted tokens (for backend logic)
    access_token_encrypted  TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at        TIMESTAMPTZ,

    -- Verification states
    is_verified           BOOLEAN NOT NULL DEFAULT false,
    verified_at           TIMESTAMPTZ,
    is_active             BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_conn_user ON public.user_social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_conn_lookup ON public.user_social_connections(platform, platform_user_id);

ALTER TABLE public.user_social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own social connections" ON public.user_social_connections
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages social connections" ON public.user_social_connections
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_social_connections_updated_at ON public.user_social_connections;
CREATE TRIGGER update_social_connections_updated_at
    BEFORE UPDATE ON public.user_social_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.user_social_connections IS 'Social accounts connected to the user profile';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. API KEYS TABLE                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name                  VARCHAR(100) NOT NULL,
    description           TEXT,

    -- Hash properties (plain keys are never saved)
    key_prefix            VARCHAR(10) NOT NULL,
    key_hash              VARCHAR(64) NOT NULL,

    -- Scope controls
    scopes                TEXT[] DEFAULT '{"read"}'::text[],
    rate_limit_per_minute INTEGER DEFAULT 60,
    ip_whitelist          INET[] DEFAULT '{}'::inet[],

    -- Diagnostics
    last_used_at          TIMESTAMPTZ,
    last_used_ip          INET,
    total_requests        BIGINT DEFAULT 0,

    is_active             BOOLEAN NOT NULL DEFAULT true,
    expires_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, key_prefix)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.user_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.user_api_keys(user_id) WHERE is_active = true;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own API keys" ON public.user_api_keys
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full API key access" ON public.user_api_keys
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.user_api_keys IS 'Developer/trader programmatic API keys. Hashes stored only.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. NOTIFICATIONS & PREFERENCES                                           ║
-- ║    R2 Storage: When notification payload payload >10KB, archive it to    ║
-- ║    R2 bucket and store reference URL inside the "data" JSONB.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Notification Channels ENUM
DO $$ BEGIN
    CREATE TYPE public.notification_delivery_channel AS ENUM ('in_app', 'email', 'push', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification Types ENUM
DO $$ BEGIN
    CREATE TYPE public.notification_event_type AS ENUM (
        'deposit_confirmed', 'deposit_pending', 'withdrawal_initiated', 'withdrawal_completed',
        'withdrawal_failed', 'stake_confirmed', 'competition_started', 'competition_settled',
        'pool_won', 'referral_bonus', 'security_alert', 'system_announcement', 'welcome'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type          public.notification_event_type NOT NULL,
    title         VARCHAR(200) NOT NULL,
    message       TEXT NOT NULL,

    -- Related resources
    resource_type VARCHAR(50),      -- 'deposit', 'withdrawal', 'competition', 'stake'
    resource_id   UUID,

    -- JSON payload (Stores URL to R2 if payload exceeds 10KB)
    data          JSONB DEFAULT '{}'::jsonb,
    action_url    TEXT,

    -- States
    is_read       BOOLEAN NOT NULL DEFAULT false,
    is_archived   BOOLEAN NOT NULL DEFAULT false,
    read_at       TIMESTAMPTZ,
    channels_sent public.notification_delivery_channel[] DEFAULT '{}',
    priority      INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),

    -- Timing
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications(user_id, is_read)
    WHERE is_read = false AND is_archived = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_resource
    ON public.notifications(resource_type, resource_id)
    WHERE resource_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications" ON public.notifications
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role handles notifications" ON public.notifications
    FOR ALL USING (auth.role() = 'service_role');

-- Notification Preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type public.notification_event_type NOT NULL,

    -- Channel controls
    in_app_enabled    BOOLEAN NOT NULL DEFAULT true,
    email_enabled     BOOLEAN NOT NULL DEFAULT true,
    push_enabled      BOOLEAN NOT NULL DEFAULT false,
    sms_enabled       BOOLEAN NOT NULL DEFAULT false,

    -- Quiet hours
    quiet_hours_start TIME,
    quiet_hours_end   TIME,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON public.notification_preferences(user_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences" ON public.notification_preferences
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages notification preferences" ON public.notification_preferences
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Push Subscriptions (Web Push / PWA)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL,
    p256dh_key   TEXT NOT NULL,
    auth_key     TEXT NOT NULL,
    device_name  VARCHAR(100),
    user_agent   TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    error_count  INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_lookup ON public.push_subscriptions(user_id) WHERE is_active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages push subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.notifications IS 'Notification logs. Payloads >10KB are archived in R2 with URL refs.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. PROCEDURES & HELPER FUNCTIONS                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Get or Create User Settings profile
CREATE OR REPLACE FUNCTION public.get_or_create_user_settings(p_user_id UUID)
RETURNS public.user_settings AS $$
DECLARE
    v_settings public.user_settings;
BEGIN
    SELECT * INTO v_settings FROM public.user_settings WHERE user_id = p_user_id FOR UPDATE;

    IF v_settings IS NULL THEN
        INSERT INTO public.user_settings (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_settings;
    END IF;

    RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Check Username Availability
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM public.user_settings
        WHERE LOWER(username) = LOWER(p_username)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Validate Key
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE (
    user_id UUID,
    scopes TEXT[],
    rate_limit_per_minute INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT ak.user_id, ak.scopes, ak.rate_limit_per_minute
    FROM public.user_api_keys ak
    WHERE ak.key_hash = p_key_hash
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Increment usage stats
CREATE OR REPLACE FUNCTION public.increment_api_key_usage(p_key_hash TEXT, p_ip INET)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_api_keys SET
        last_used_at = NOW(),
        last_used_ip = p_ip,
        total_requests = total_requests + 1
    WHERE key_hash = p_key_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Notifications Controls
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notifications SET
        is_read = true,
        read_at = NOW()
    WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER AS $$
DECLARE v_affected INTEGER;
BEGIN
    UPDATE public.notifications SET
        is_read = true,
        read_at = NOW()
    WHERE user_id = auth.uid() AND is_read = false;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    RETURN v_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER FROM public.notifications
        WHERE user_id = p_user_id
          AND is_read = false
          AND is_archived = false
          AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Create single notification log (system-triggered)
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_action_url TEXT DEFAULT NULL,
    p_priority INTEGER DEFAULT 2
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_pref_exists BOOLEAN;
    v_in_app BOOLEAN := true;
BEGIN
    -- Check preferences
    SELECT in_app_enabled INTO v_in_app FROM public.notification_preferences
    WHERE user_id = p_user_id AND notification_type = p_type::public.notification_event_type;

    IF v_in_app IS FALSE THEN
        RETURN NULL; -- Suppressed by user
    END IF;

    INSERT INTO public.notifications (
        user_id, type, title, message, resource_type, resource_id, data, action_url, priority
    ) VALUES (
        p_user_id, p_type::public.notification_event_type, p_title, p_message,
        p_resource_type, p_resource_id, p_data, p_action_url, p_priority
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Cron clean function
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE v_deleted INTEGER;
BEGIN
    DELETE FROM public.notifications
    WHERE (is_archived = true AND created_at < NOW() - INTERVAL '30 days')
       OR (is_read = true AND created_at < NOW() - INTERVAL '90 days')
       OR (expires_at IS NOT NULL AND expires_at < NOW());

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_or_create_user_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_api_key_usage(TEXT, INET) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;
