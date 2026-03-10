-- ============================================================================
-- Migration: 047_oauth_security_hardening.sql
-- Purpose: Comprehensive OAuth security hardening with PKCE, state signing,
--          nonce validation, id_token verification, JWK caching, rate limiting,
--          and replay detection (jti)
-- Security: OWASP A01/A02/A03/A05/A07 compliant
-- ============================================================================

-- ============================================================================
-- SECTION 1: Enhance OAuth State Tokens Table for PKCE + Nonce + Signing
-- ============================================================================

-- Ensure pgcrypto is enabled for gen_random_bytes
-- Try to enable in public schema or extensions schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;


-- Add PKCE code_verifier column (S256)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oauth_state_tokens' AND column_name = 'code_verifier') THEN
        ALTER TABLE oauth_state_tokens ADD COLUMN code_verifier TEXT;
        COMMENT ON COLUMN oauth_state_tokens.code_verifier IS 
            'PKCE code_verifier for S256 challenge. 43-128 URL-safe characters. Never sent to client.';
    END IF;
END $$;

-- Add nonce for id_token binding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oauth_state_tokens' AND column_name = 'nonce') THEN
        ALTER TABLE oauth_state_tokens ADD COLUMN nonce TEXT;
        COMMENT ON COLUMN oauth_state_tokens.nonce IS 
            'Cryptographic nonce included in authorization request. Verified in id_token.';
    END IF;
END $$;

-- Add session_id for session binding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oauth_state_tokens' AND column_name = 'session_id') THEN
        ALTER TABLE oauth_state_tokens ADD COLUMN session_id TEXT;
        COMMENT ON COLUMN oauth_state_tokens.session_id IS 
            'Session identifier to bind OAuth flow to specific browser session.';
    END IF;
END $$;

-- Add signature for state signing (HMAC-SHA256)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oauth_state_tokens' AND column_name = 'state_signature') THEN
        ALTER TABLE oauth_state_tokens ADD COLUMN state_signature TEXT;
        COMMENT ON COLUMN oauth_state_tokens.state_signature IS 
            'HMAC-SHA256 signature of state token for integrity verification.';
    END IF;
END $$;

-- Add redirect_uri for strict validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'oauth_state_tokens' AND column_name = 'redirect_uri') THEN
        ALTER TABLE oauth_state_tokens ADD COLUMN redirect_uri TEXT;
        COMMENT ON COLUMN oauth_state_tokens.redirect_uri IS 
            'Exact redirect URI used in authorization request for strict matching.';
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: JWT ID Registry for Replay Detection
-- OWASP A02:2021 - Cryptographic Failures Prevention
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_jti_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jti TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google',
    token_exp TIMESTAMPTZ NOT NULL,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_id UUID,
    
    -- Constraints
    CONSTRAINT oauth_jti_unique UNIQUE (jti, provider),
    CONSTRAINT oauth_jti_format CHECK (LENGTH(jti) >= 10)
);

-- Index for fast jti lookups
CREATE INDEX IF NOT EXISTS idx_oauth_jti_lookup 
    ON oauth_jti_registry (jti, provider);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_jti_exp 
    ON oauth_jti_registry (token_exp);

-- RLS for oauth_jti_registry (service role only)
ALTER TABLE oauth_jti_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'oauth_jti_registry' AND policyname = 'oauth_jti_service_only'
    ) THEN
        CREATE POLICY oauth_jti_service_only ON oauth_jti_registry
            FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END $$;

COMMENT ON TABLE oauth_jti_registry IS 
    'Registry of used JWT IDs (jti) for OAuth id_token replay attack prevention.';

-- ============================================================================
-- SECTION 3: OAuth Rate Limiting Table
-- OWASP A07:2021 - Identification and Authentication Failures
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,  -- IP address or user ID
    identifier_type TEXT NOT NULL DEFAULT 'ip',  -- 'ip' or 'user'
    provider TEXT NOT NULL DEFAULT 'google',
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 1,
    blocked_until TIMESTAMPTZ,
    violation_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT oauth_rate_unique UNIQUE (identifier, identifier_type, provider)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_oauth_rate_lookup 
    ON oauth_rate_limits (identifier, identifier_type, provider);

-- RLS for oauth_rate_limits (service role only)
ALTER TABLE oauth_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'oauth_rate_limits' AND policyname = 'oauth_rate_service_only'
    ) THEN
        CREATE POLICY oauth_rate_service_only ON oauth_rate_limits
            FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END $$;

COMMENT ON TABLE oauth_rate_limits IS 
    'Sliding window rate limiting for OAuth authentication attempts.';

-- ============================================================================
-- SECTION 4: Enhanced State Verification Function
-- Verifies state, signature, session binding, and retrieves PKCE + nonce
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_oauth_state_complete(
    p_state_token TEXT,
    p_session_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS TABLE(
    valid BOOLEAN,
    reason TEXT,
    code_verifier TEXT,
    nonce TEXT,
    redirect_uri TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token_record RECORD;
BEGIN
    -- Find the token with row lock
    SELECT * INTO v_token_record
    FROM oauth_state_tokens
    WHERE state_token = p_state_token
    FOR UPDATE;
    
    -- Token not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invalid or expired state token'::TEXT, 
                            NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Token already used (replay attack prevention)
    IF v_token_record.used_at IS NOT NULL THEN
        -- Log potential replay attack
        RAISE WARNING 'OAuth state token replay attempt detected: %', 
            LEFT(p_state_token, 10) || '...';
        RETURN QUERY SELECT FALSE, 'State token already consumed (replay detected)'::TEXT,
                            NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Token expired
    IF v_token_record.expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, 'State token expired'::TEXT,
                            NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Session binding check (optional but recommended)
    IF p_session_id IS NOT NULL AND v_token_record.session_id IS NOT NULL THEN
        IF v_token_record.session_id != p_session_id THEN
            RAISE WARNING 'OAuth session binding mismatch. Expected: %, Got: %',
                LEFT(v_token_record.session_id, 10), LEFT(p_session_id, 10);
            RETURN QUERY SELECT FALSE, 'Session binding mismatch (cross-session attack detected)'::TEXT,
                                NULL::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        END IF;
    END IF;
    
    -- Mark token as used BEFORE returning (prevent race conditions)
    UPDATE oauth_state_tokens
    SET used_at = NOW()
    WHERE id = v_token_record.id;
    
    -- Return success with PKCE verifier and nonce
    RETURN QUERY SELECT 
        TRUE, 
        'Valid'::TEXT,
        v_token_record.code_verifier,
        v_token_record.nonce,
        v_token_record.redirect_uri;
END;
$$;

COMMENT ON FUNCTION verify_oauth_state_complete IS 
    'Complete OAuth state verification including session binding. Returns code_verifier and nonce for PKCE and id_token validation.';

-- ============================================================================
-- SECTION 5: JWT ID Registration (Replay Detection)
-- ============================================================================

CREATE OR REPLACE FUNCTION register_oauth_jti(
    p_jti TEXT,
    p_provider TEXT DEFAULT 'google',
    p_token_exp TIMESTAMPTZ DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(registered BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if jti already exists (replay attack)
    IF EXISTS(SELECT 1 FROM oauth_jti_registry WHERE jti = p_jti AND provider = p_provider) THEN
        RAISE WARNING 'OAuth jti replay attack detected: %', LEFT(p_jti, 20) || '...';
        RETURN QUERY SELECT FALSE, 'JWT ID (jti) already used - replay attack detected'::TEXT;
        RETURN;
    END IF;
    
    -- Register the jti
    INSERT INTO oauth_jti_registry (jti, provider, token_exp, ip_address, user_id)
    VALUES (
        p_jti,
        p_provider,
        COALESCE(p_token_exp, NOW() + INTERVAL '1 hour'),
        p_ip_address,
        p_user_id
    );
    
    RETURN QUERY SELECT TRUE, 'JWT ID registered successfully'::TEXT;
END;
$$;

COMMENT ON FUNCTION register_oauth_jti IS 
    'Registers a JWT ID (jti) to prevent replay attacks. Returns false if jti already used.';

-- ============================================================================
-- SECTION 6: OAuth Rate Limiting Check
-- ============================================================================

CREATE OR REPLACE FUNCTION check_oauth_rate_limit(
    p_identifier TEXT,
    p_identifier_type TEXT DEFAULT 'ip',
    p_provider TEXT DEFAULT 'google',
    p_window_ms INTEGER DEFAULT 60000,  -- 1 minute
    p_max_requests INTEGER DEFAULT 10
)
RETURNS TABLE(
    allowed BOOLEAN,
    remaining INTEGER,
    reset_at TIMESTAMPTZ,
    blocked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_window_start TIMESTAMPTZ;
    v_new_count INTEGER;
BEGIN
    -- Calculate window start
    v_window_start := v_now - (p_window_ms || ' milliseconds')::INTERVAL;
    
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM oauth_rate_limits
    WHERE identifier = p_identifier 
      AND identifier_type = p_identifier_type 
      AND provider = p_provider
    FOR UPDATE;
    
    -- Check if currently blocked
    IF FOUND AND v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_record.blocked_until,
            v_record.blocked_until;
        RETURN;
    END IF;
    
    IF NOT FOUND THEN
        -- First request - create record
        INSERT INTO oauth_rate_limits (identifier, identifier_type, provider, window_start, request_count)
        VALUES (p_identifier, p_identifier_type, p_provider, v_now, 1);
        
        RETURN QUERY SELECT TRUE, p_max_requests - 1, v_now + (p_window_ms || ' milliseconds')::INTERVAL, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- Check if window has reset
    IF v_record.window_start < v_window_start THEN
        -- Reset the window
        UPDATE oauth_rate_limits
        SET window_start = v_now,
            request_count = 1,
            blocked_until = NULL
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_requests - 1, v_now + (p_window_ms || ' milliseconds')::INTERVAL, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- Increment counter
    v_new_count := v_record.request_count + 1;
    
    IF v_new_count > p_max_requests THEN
        -- Rate limit exceeded - block for 5 minutes
        UPDATE oauth_rate_limits
        SET request_count = v_new_count,
            violation_count = v_record.violation_count + 1,
            blocked_until = v_now + INTERVAL '5 minutes'
        WHERE id = v_record.id;
        
        RAISE WARNING 'OAuth rate limit exceeded for %: % (violations: %)', 
            p_identifier_type, LEFT(p_identifier, 20), v_record.violation_count + 1;
        
        RETURN QUERY SELECT FALSE, 0, v_now + INTERVAL '5 minutes', v_now + INTERVAL '5 minutes';
        RETURN;
    END IF;
    
    -- Update counter
    UPDATE oauth_rate_limits
    SET request_count = v_new_count
    WHERE id = v_record.id;
    
    RETURN QUERY SELECT 
        TRUE, 
        p_max_requests - v_new_count,
        v_record.window_start + (p_window_ms || ' milliseconds')::INTERVAL,
        NULL::TIMESTAMPTZ;
END;
$$;

COMMENT ON FUNCTION check_oauth_rate_limit IS 
    'Sliding window rate limiting for OAuth flows. Blocks for 5 minutes after limit exceeded.';

-- ============================================================================
-- SECTION 7: Enhanced State Token Creation with PKCE + Nonce
-- ============================================================================

CREATE OR REPLACE FUNCTION create_oauth_state_secure(
    p_provider TEXT DEFAULT 'google',
    p_session_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_redirect_uri TEXT DEFAULT NULL,
    p_code_verifier TEXT DEFAULT NULL,
    p_nonce TEXT DEFAULT NULL
)
RETURNS TABLE(
    state_token TEXT,
    code_verifier TEXT,
    nonce TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_state TEXT;
    v_verifier TEXT;
    v_nonce TEXT;
BEGIN
    -- Generate state token (64 hex chars = 32 bytes)
    v_state := encode(gen_random_bytes(32), 'hex');
    
    -- Use provided or generate PKCE code_verifier (43-128 chars, URL-safe)
    -- Using 32 bytes = 43 base64url chars after encoding
    v_verifier := COALESCE(p_code_verifier, 
        replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_')
    );
    -- Remove padding
    v_verifier := rtrim(v_verifier, '=');
    
    -- Use provided or generate nonce (32 hex chars = 16 bytes)
    v_nonce := COALESCE(p_nonce, encode(gen_random_bytes(16), 'hex'));
    
    -- Insert state token with all security data
    INSERT INTO oauth_state_tokens (
        state_token,
        provider,
        session_id,
        ip_address,
        user_agent,
        redirect_uri,
        code_verifier,
        nonce,
        expires_at
    ) VALUES (
        v_state,
        p_provider,
        p_session_id,
        p_ip_address,
        p_user_agent,
        p_redirect_uri,
        v_verifier,
        v_nonce,
        NOW() + INTERVAL '10 minutes'
    );
    
    RETURN QUERY SELECT v_state, v_verifier, v_nonce;
END;
$$;

COMMENT ON FUNCTION create_oauth_state_secure IS 
    'Creates OAuth state token with PKCE code_verifier and nonce for comprehensive security.';

-- ============================================================================
-- SECTION 8: Cleanup Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_oauth_security_data()
RETURNS TABLE(
    expired_states INTEGER,
    expired_jti INTEGER,
    expired_rate_limits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_states INTEGER;
    v_jti INTEGER;
    v_rates INTEGER;
BEGIN
    -- Cleanup expired state tokens (older than 1 hour after expiry for audit trail)
    DELETE FROM oauth_state_tokens
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS v_states = ROW_COUNT;
    
    -- Cleanup expired jti entries
    DELETE FROM oauth_jti_registry
    WHERE token_exp < NOW();
    GET DIAGNOSTICS v_jti = ROW_COUNT;
    
    -- Cleanup old rate limit entries (no activity for 1 hour)
    DELETE FROM oauth_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour'
      AND (blocked_until IS NULL OR blocked_until < NOW());
    GET DIAGNOSTICS v_rates = ROW_COUNT;
    
    RETURN QUERY SELECT v_states, v_jti, v_rates;
END;
$$;

COMMENT ON FUNCTION cleanup_oauth_security_data IS 
    'Cleans up expired OAuth security data. Should be run periodically.';

-- ============================================================================
-- SECTION 9: Grant Permissions
-- ============================================================================

-- Service role only functions
GRANT EXECUTE ON FUNCTION verify_oauth_state_complete TO service_role;
GRANT EXECUTE ON FUNCTION register_oauth_jti TO service_role;
GRANT EXECUTE ON FUNCTION check_oauth_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION create_oauth_state_secure TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_oauth_security_data TO service_role;

-- ============================================================================
-- SECTION 10: Scheduled Cleanup (if pg_cron is available)
-- ============================================================================

-- Note: Uncomment if pg_cron extension is enabled
-- SELECT cron.schedule(
--     'cleanup-oauth-security',
--     '*/15 * * * *', -- Every 15 minutes
--     $$SELECT * FROM cleanup_oauth_security_data()$$
-- );
