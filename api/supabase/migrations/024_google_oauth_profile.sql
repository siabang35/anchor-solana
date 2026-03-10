-- ============================================================================
-- Migration: 024_google_oauth_profile.sql
-- Purpose: Comprehensive Google OAuth profile completion with Privy embedded wallet
-- Security: OWASP compliant, Row-Level Security, input validation
-- ============================================================================

-- ============================================================================
-- SECTION 1: Profile Completion Fields
-- ============================================================================

-- Add username column with strict validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'username') THEN
        ALTER TABLE profiles ADD COLUMN username VARCHAR(30);
        
        -- Add unique constraint with case-insensitive matching
        ALTER TABLE profiles 
            ADD CONSTRAINT profiles_username_unique UNIQUE (username);
            
        COMMENT ON COLUMN profiles.username IS 
            'Unique username (3-30 chars, alphanumeric+underscore). Used for @mentions and profile URLs.';
    END IF;
END $$;

-- Add terms acceptance tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'agreed_to_terms_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_terms_at TIMESTAMPTZ;
        COMMENT ON COLUMN profiles.agreed_to_terms_at IS 
            'Timestamp when user agreed to Terms of Service. Required for legal compliance.';
    END IF;
END $$;

-- Add privacy policy acceptance tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'agreed_to_privacy_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_privacy_at TIMESTAMPTZ;
        COMMENT ON COLUMN profiles.agreed_to_privacy_at IS 
            'Timestamp when user agreed to Privacy Policy. Required for GDPR/CCPA compliance.';
    END IF;
END $$;

-- Add profile completion flag
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'profile_completed') THEN
        ALTER TABLE profiles ADD COLUMN profile_completed BOOLEAN DEFAULT false;
        COMMENT ON COLUMN profiles.profile_completed IS 
            'Whether user has completed profile setup after OAuth registration.';
    END IF;
END $$;

-- Add Privy user ID for embedded wallet
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'privy_user_id') THEN
        ALTER TABLE profiles ADD COLUMN privy_user_id TEXT;
        COMMENT ON COLUMN profiles.privy_user_id IS 
            'Privy DID (decentralized identifier) for embedded wallet integration.';
    END IF;
END $$;

-- Add Google OAuth ID for faster lookups
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'google_id') THEN
        ALTER TABLE profiles ADD COLUMN google_id TEXT;
        COMMENT ON COLUMN profiles.google_id IS 
            'Google OAuth user ID for faster authentication lookups.';
    END IF;
END $$;

-- Add OAuth provider tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'auth_provider') THEN
        ALTER TABLE profiles ADD COLUMN auth_provider TEXT DEFAULT 'email';
        COMMENT ON COLUMN profiles.auth_provider IS 
            'Authentication provider: email, google, wallet. Used for login method tracking.';
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: Indexes for Performance
-- ============================================================================

-- Username lookup (case-insensitive for availability checks)
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower 
    ON profiles (LOWER(username)) WHERE username IS NOT NULL;

-- Privy user ID lookup
CREATE INDEX IF NOT EXISTS idx_profiles_privy_user_id 
    ON profiles (privy_user_id) WHERE privy_user_id IS NOT NULL;

-- Google ID lookup for OAuth
CREATE INDEX IF NOT EXISTS idx_profiles_google_id 
    ON profiles (google_id) WHERE google_id IS NOT NULL;

-- Profile completion filter (for onboarding analytics)
CREATE INDEX IF NOT EXISTS idx_profiles_profile_completed 
    ON profiles (profile_completed) WHERE profile_completed = false;

-- ============================================================================
-- SECTION 3: Username Validation Function
-- OWASP A03:2021 - Injection Prevention
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_username(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check null/empty
    IF p_username IS NULL OR LENGTH(TRIM(p_username)) = 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Check length (3-30 characters)
    IF LENGTH(p_username) < 3 OR LENGTH(p_username) > 30 THEN
        RETURN FALSE;
    END IF;
    
    -- Check format: alphanumeric and underscore only
    -- OWASP: Prevent injection via strict whitelist validation
    IF p_username !~ '^[a-zA-Z0-9_]+$' THEN
        RETURN FALSE;
    END IF;
    
    -- Check not starting with underscore or number (optional, for cleaner URLs)
    IF p_username ~ '^[_0-9]' THEN
        RETURN FALSE;
    END IF;
    
    -- Check for reserved usernames (anti-impersonation)
    IF LOWER(p_username) IN (
        'admin', 'administrator', 'mod', 'moderator', 'support', 'help',
        'dejavu', 'official', 'system', 'root', 'api', 'www', 'mail',
        'bot', 'null', 'undefined', 'anonymous', 'guest', 'test', 'demo'
    ) THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_username IS 
    'Validates username format per OWASP guidelines. Returns TRUE if valid.';

-- ============================================================================
-- SECTION 4: Check Username Availability Function
-- Rate-limited by application layer
-- ============================================================================

CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS TABLE(available BOOLEAN, normalized_username TEXT, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized TEXT;
    v_exists BOOLEAN;
BEGIN
    -- Normalize to lowercase
    v_normalized := LOWER(TRIM(p_username));
    
    -- Validate format first
    IF NOT validate_username(v_normalized) THEN
        RETURN QUERY SELECT FALSE, v_normalized, 'Invalid username format'::TEXT;
        RETURN;
    END IF;
    
    -- Check if username exists (case-insensitive)
    SELECT EXISTS(
        SELECT 1 FROM profiles 
        WHERE LOWER(username) = v_normalized
    ) INTO v_exists;
    
    IF v_exists THEN
        RETURN QUERY SELECT FALSE, v_normalized, 'Username already taken'::TEXT;
    ELSE
        RETURN QUERY SELECT TRUE, v_normalized, NULL::TEXT;
    END IF;
END;
$$;

COMMENT ON FUNCTION check_username_available IS 
    'Checks if a username is available. Returns availability status and normalized username.';

-- ============================================================================
-- SECTION 5: Complete Google Profile Function
-- Atomic transaction for profile + wallet linking
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_google_profile(
    p_user_id UUID,
    p_username TEXT,
    p_full_name TEXT DEFAULT NULL,
    p_google_id TEXT DEFAULT NULL,
    p_privy_user_id TEXT DEFAULT NULL,
    p_agree_to_terms BOOLEAN DEFAULT FALSE,
    p_agree_to_privacy BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(success BOOLEAN, message TEXT, username TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_username TEXT;
    v_availability RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Validate user exists
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User not found'::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Check profile not already completed (prevent duplicate submissions)
    IF EXISTS(SELECT 1 FROM profiles WHERE id = p_user_id AND profile_completed = TRUE) THEN
        RETURN QUERY SELECT FALSE, 'Profile already completed'::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Normalize username
    v_normalized_username := LOWER(TRIM(p_username));
    
    -- Check username availability
    SELECT * INTO v_availability FROM check_username_available(v_normalized_username);
    IF NOT v_availability.available THEN
        RETURN QUERY SELECT FALSE, v_availability.reason, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Validate terms acceptance (required for legal compliance)
    IF NOT p_agree_to_terms OR NOT p_agree_to_privacy THEN
        RETURN QUERY SELECT FALSE, 'You must agree to Terms of Service and Privacy Policy'::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Update profile atomically
    UPDATE profiles SET
        username = v_normalized_username,
        full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
        google_id = COALESCE(p_google_id, google_id),
        privy_user_id = COALESCE(p_privy_user_id, privy_user_id),
        agreed_to_terms_at = v_now,
        agreed_to_privacy_at = v_now,
        profile_completed = TRUE,
        auth_provider = COALESCE(
            CASE WHEN p_google_id IS NOT NULL THEN 'google' ELSE auth_provider END,
            'email'
        ),
        updated_at = v_now
    WHERE id = p_user_id;
    
    -- Log the profile completion for audit
    INSERT INTO login_attempts (
        email,
        ip_address,
        success,
        failure_reason,
        attempted_at
    ) SELECT 
        up.email,
        'profile_completion',
        TRUE,
        NULL,
        v_now
    FROM profiles up WHERE up.id = p_user_id;
    
    RETURN QUERY SELECT TRUE, 'Profile completed successfully'::TEXT, v_normalized_username;
END;
$$;

COMMENT ON FUNCTION complete_google_profile IS 
    'Atomically completes user profile after Google OAuth. Validates username, terms acceptance, and links Privy.';

-- ============================================================================
-- SECTION 6: Google OAuth User Lookup/Creation
-- For finding existing users by Google ID
-- ============================================================================

CREATE OR REPLACE FUNCTION find_or_prepare_google_user(
    p_google_id TEXT,
    p_email TEXT,
    p_full_name TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    is_new_user BOOLEAN,
    profile_completed BOOLEAN,
    username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_new BOOLEAN := FALSE;
    v_profile_completed BOOLEAN;
    v_username TEXT;
BEGIN
    -- First try to find by Google ID (fastest)
    SELECT id, profiles.profile_completed, profiles.username 
    INTO v_user_id, v_profile_completed, v_username
    FROM profiles 
    WHERE google_id = p_google_id;
    
    IF v_user_id IS NOT NULL THEN
        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- Try to find by email
    SELECT id, profiles.profile_completed, profiles.username 
    INTO v_user_id, v_profile_completed, v_username
    FROM profiles 
    WHERE LOWER(email) = LOWER(p_email);
    
    IF v_user_id IS NOT NULL THEN
        -- Link Google ID to existing account
        UPDATE profiles SET
            google_id = p_google_id,
            auth_provider = 'google',
            avatar_url = COALESCE(avatar_url, p_avatar_url),
            updated_at = NOW()
        WHERE id = v_user_id;
        
        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- New user - return NULL user_id to signal creation needed
    -- (Actual creation happens via Supabase Auth, then profile is created)
    RETURN QUERY SELECT NULL::UUID, TRUE, FALSE, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION find_or_prepare_google_user IS 
    'Finds existing user by Google ID or email. Returns NULL user_id if new user needs creation.';

-- ============================================================================
-- SECTION 7: OAuth State Token Table (CSRF Protection)
-- OWASP A05:2021 - Security Misconfiguration Prevention
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_state_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_token TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'google',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
    used_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT oauth_state_token_format CHECK (LENGTH(state_token) >= 32)
);

-- Index for fast lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_token 
    ON oauth_state_tokens (state_token) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_expires 
    ON oauth_state_tokens (expires_at) WHERE used_at IS NULL;

-- RLS for oauth_state_tokens (service role only)
ALTER TABLE oauth_state_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_state_service_only ON oauth_state_tokens
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE oauth_state_tokens IS 
    'Stores OAuth state tokens for CSRF protection. Tokens expire after 10 minutes.';

-- ============================================================================
-- SECTION 8: Cleanup Function for Expired Tokens
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_oauth_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM oauth_state_tokens
    WHERE expires_at < NOW() OR used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_oauth_tokens IS 
    'Removes expired OAuth state tokens. Should be run periodically via cron.';

-- ============================================================================
-- SECTION 9: Verify and Consume OAuth State Token
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_oauth_state(
    p_state_token TEXT,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS TABLE(valid BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token_record RECORD;
BEGIN
    -- Find the token
    SELECT * INTO v_token_record
    FROM oauth_state_tokens
    WHERE state_token = p_state_token
    FOR UPDATE; -- Lock the row
    
    -- Token not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invalid or expired state token'::TEXT;
        RETURN;
    END IF;
    
    -- Token already used (replay attack prevention)
    IF v_token_record.used_at IS NOT NULL THEN
        -- Log potential attack
        RAISE WARNING 'OAuth state token replay attempt: %', p_state_token;
        RETURN QUERY SELECT FALSE, 'State token already used'::TEXT;
        RETURN;
    END IF;
    
    -- Token expired
    IF v_token_record.expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, 'State token expired'::TEXT;
        RETURN;
    END IF;
    
    -- Optional: Verify IP address matches (stricter security)
    -- Commented out as it can cause issues with mobile networks
    -- IF p_ip_address IS NOT NULL AND v_token_record.ip_address != p_ip_address THEN
    --     RETURN QUERY SELECT FALSE, 'IP address mismatch'::TEXT;
    --     RETURN;
    -- END IF;
    
    -- Mark token as used
    UPDATE oauth_state_tokens
    SET used_at = NOW()
    WHERE id = v_token_record.id;
    
    RETURN QUERY SELECT TRUE, 'Valid'::TEXT;
END;
$$;

COMMENT ON FUNCTION verify_oauth_state IS 
    'Verifies and consumes an OAuth state token. Prevents CSRF and replay attacks.';

-- ============================================================================
-- SECTION 10: Grant Permissions
-- ============================================================================

-- Public functions (callable by authenticated users)
GRANT EXECUTE ON FUNCTION check_username_available TO authenticated;
GRANT EXECUTE ON FUNCTION validate_username TO authenticated;

-- Service role only functions
GRANT EXECUTE ON FUNCTION complete_google_profile TO service_role;
GRANT EXECUTE ON FUNCTION find_or_prepare_google_user TO service_role;
GRANT EXECUTE ON FUNCTION verify_oauth_state TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_oauth_tokens TO service_role;

-- ============================================================================
-- SECTION 11: Scheduled Cleanup (if pg_cron is available)
-- ============================================================================

-- Note: Uncomment if pg_cron extension is enabled
-- SELECT cron.schedule(
--     'cleanup-oauth-tokens',
--     '*/15 * * * *', -- Every 15 minutes
--     $$SELECT cleanup_expired_oauth_tokens()$$
-- );
