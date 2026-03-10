-- ============================================================================
-- DeJaVu - Notifications Schema (003_notifications.sql)
-- Comprehensive notification system with multi-channel support
-- ============================================================================

-- ============================================================================
-- NOTIFICATION_TYPES ENUM
-- Define all supported notification types
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM (
            'deposit_confirmed',
            'deposit_pending',
            'withdrawal_initiated',
            'withdrawal_completed',
            'withdrawal_failed',
            'trade_executed',
            'market_resolved',
            'position_won',
            'position_lost',
            'price_alert',
            'referral_signup',
            'referral_reward',
            'security_alert',
            'system_announcement',
            'welcome'
        );
    END IF;
END
$$;

-- ============================================================================
-- NOTIFICATION_CHANNEL ENUM
-- Delivery channels for notifications
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
        CREATE TYPE notification_channel AS ENUM (
            'in_app',
            'email',
            'push',
            'sms'
        );
    END IF;
END
$$;

-- ============================================================================
-- NOTIFICATIONS TABLE
-- User notifications with read/archived status
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Notification content
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Related entities (optional)
    resource_type TEXT, -- 'deposit', 'withdrawal', 'trade', 'market', etc.
    resource_id UUID,
    
    -- Rich data payload
    data JSONB DEFAULT '{}'::jsonb,
    
    -- Action URL (deep link)
    action_url TEXT,
    
    -- Status tracking
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    
    -- Delivery tracking
    channels_sent notification_channel[] DEFAULT '{}',
    
    -- Priority (1 = low, 5 = critical)
    priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Optional expiration
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON public.notifications(user_id, is_read) 
    WHERE is_read = false AND is_archived = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
    ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type 
    ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_resource 
    ON public.notifications(resource_type, resource_id) 
    WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_priority 
    ON public.notifications(priority DESC, created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update (mark read/archived) their own notifications
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can manage all notifications
DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
CREATE POLICY "Service role can manage all notifications" ON public.notifications
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- NOTIFICATION_PREFERENCES TABLE
-- Per-user settings for each notification type and channel
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Preference settings per type
    notification_type notification_type NOT NULL,
    
    -- Channel preferences
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT false,
    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Quiet hours (user's local timezone)
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One preference row per user per type
    UNIQUE(user_id, notification_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user 
    ON public.notification_preferences(user_id);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification preferences" ON public.notification_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all notification preferences" ON public.notification_preferences;
CREATE POLICY "Service role can manage all notification preferences" ON public.notification_preferences
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PUSH_SUBSCRIPTIONS TABLE
-- Web Push notification subscriptions (for PWA support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Push subscription data (from browser)
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    
    -- Device info
    device_name TEXT,
    user_agent TEXT,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    error_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate subscriptions
    UNIQUE(user_id, endpoint)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
    ON public.push_subscriptions(user_id) 
    WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can manage all push subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- NOTIFICATION FUNCTIONS
-- ============================================================================

-- Mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark all notifications as read for a user
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE user_id = auth.uid() AND is_read = false;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM public.notifications
        WHERE user_id = p_user_id 
          AND is_read = false 
          AND is_archived = false
          AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create notification (service role only)
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type notification_type,
    p_title TEXT,
    p_message TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_action_url TEXT DEFAULT NULL,
    p_priority INTEGER DEFAULT 2
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO public.notifications (
        user_id, type, title, message, 
        resource_type, resource_id, data, action_url, priority
    )
    VALUES (
        p_user_id, p_type, p_title, p_message,
        p_resource_type, p_resource_id, p_data, p_action_url, p_priority
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old notifications (schedule as cron job)
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.notifications
    WHERE (is_archived = true AND created_at < NOW() - INTERVAL '30 days')
       OR (is_read = true AND created_at < NOW() - INTERVAL '90 days')
       OR (expires_at IS NOT NULL AND expires_at < NOW());
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications TO service_role;
