-- ============================================================================
-- DeJaVu - Secure Email Verification Tokens (035_secure_email_verification.sql)
-- OWASP-Compliant Custom Token System for Email Verification
-- Replaces unreliable Supabase tokens with HMAC-SHA256 signed tokens
-- ============================================================================

-- ============================================================================
-- EMAIL_VERIFICATION_TOKENS TABLE
-- Stores secure, single-use verification tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User reference (can be NULL for pre-verified signup)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Verification details
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,  -- HMAC-SHA256 hash of token (never store raw)
    token_type TEXT NOT NULL DEFAULT 'signup' CHECK (token_type IN ('signup', 'password_reset', 'email_change')),
    
    -- Security metadata for audit
    ip_address INET,
    user_agent TEXT,
    
    -- Timing (OWASP: time-limited tokens)
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Anti-replay protection (OWASP: single-use tokens)
    used_at TIMESTAMPTZ,
    used_ip_address INET,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email 
    ON public.email_verification_tokens(email, token_type) 
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash 
    ON public.email_verification_tokens(token_hash) 
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires 
    ON public.email_verification_tokens(expires_at) 
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user 
    ON public.email_verification_tokens(user_id);

-- Enable RLS
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can manage tokens (strictly backend only)
DROP POLICY IF EXISTS "Service role can manage verification tokens" ON public.email_verification_tokens;
CREATE POLICY "Service role can manage verification tokens" ON public.email_verification_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Store a new verification token
-- Returns the token ID for reference
CREATE OR REPLACE FUNCTION public.store_verification_token(
    p_user_id UUID,
    p_email TEXT,
    p_token_hash TEXT,
    p_token_type TEXT DEFAULT 'signup',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_expires_in_minutes INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
    v_token_id UUID;
BEGIN
    -- Invalidate any existing unused tokens for this email/type
    UPDATE public.email_verification_tokens
    SET used_at = NOW()
    WHERE email = LOWER(p_email)
      AND token_type = p_token_type
      AND used_at IS NULL;
    
    -- Insert new token
    INSERT INTO public.email_verification_tokens (
        user_id,
        email,
        token_hash,
        token_type,
        ip_address,
        user_agent,
        expires_at
    )
    VALUES (
        p_user_id,
        LOWER(p_email),
        p_token_hash,
        p_token_type,
        p_ip_address,
        p_user_agent,
        NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
    )
    RETURNING id INTO v_token_id;
    
    RETURN v_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify and consume a token (timing-safe lookup via hash)
-- Returns user_id if valid, NULL otherwise
CREATE OR REPLACE FUNCTION public.verify_and_consume_token(
    p_email TEXT,
    p_token_hash TEXT,
    p_token_type TEXT DEFAULT 'signup',
    p_ip_address INET DEFAULT NULL
)
RETURNS TABLE (
    is_valid BOOLEAN,
    user_id UUID,
    failure_reason TEXT
) AS $$
DECLARE
    v_token RECORD;
BEGIN
    -- Find matching token
    SELECT * INTO v_token
    FROM public.email_verification_tokens evt
    WHERE evt.email = LOWER(p_email)
      AND evt.token_hash = p_token_hash
      AND evt.token_type = p_token_type
    LIMIT 1;
    
    -- Token not found
    IF v_token IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid verification token'::TEXT;
        RETURN;
    END IF;
    
    -- Token already used (anti-replay)
    IF v_token.used_at IS NOT NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 'This verification link has already been used'::TEXT;
        RETURN;
    END IF;
    
    -- Token expired
    IF v_token.expires_at < NOW() THEN
        -- Mark as used to prevent future attempts
        UPDATE public.email_verification_tokens
        SET used_at = NOW(), used_ip_address = p_ip_address
        WHERE id = v_token.id;
        
        RETURN QUERY SELECT false, NULL::UUID, 'This verification link has expired. Please request a new one.'::TEXT;
        RETURN;
    END IF;
    
    -- Valid token - consume it
    UPDATE public.email_verification_tokens
    SET used_at = NOW(), used_ip_address = p_ip_address
    WHERE id = v_token.id;
    
    -- Return success
    RETURN QUERY SELECT true, v_token.user_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get token info for rate limiting checks
CREATE OR REPLACE FUNCTION public.get_recent_verification_tokens(
    p_email TEXT,
    p_token_type TEXT DEFAULT 'signup',
    p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
    token_count BIGINT,
    last_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT,
        MAX(evt.created_at)
    FROM public.email_verification_tokens evt
    WHERE evt.email = LOWER(p_email)
      AND evt.token_type = p_token_type
      AND evt.created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Cleanup expired tokens (call periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete tokens older than 24 hours (whether used or not)
    DELETE FROM public.email_verification_tokens
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.store_verification_token TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_and_consume_token TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_verification_tokens TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_verification_tokens TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.email_verification_tokens IS 
    'OWASP-compliant secure email verification tokens with HMAC-SHA256 hashing, single-use protection, and 30-min expiry';

COMMENT ON FUNCTION public.store_verification_token IS 
    'Stores a new verification token hash, invalidating any previous unused tokens for the same email/type';

COMMENT ON FUNCTION public.verify_and_consume_token IS 
    'Verifies token hash and consumes it in one atomic operation. Returns user_id on success or failure reason.';
