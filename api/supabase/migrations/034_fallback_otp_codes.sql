-- ============================================================================
-- DeJaVu - Fallback OTP Codes (034_fallback_otp_codes.sql)
-- Stores hashed OTP codes for custom fallback authentication
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.otp_fallback_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL, -- Secured hash of the 6-digit code
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_otp_fallback_codes_email 
    ON public.otp_fallback_codes(email, expires_at) 
    WHERE used_at IS NULL;

-- Enable RLS
ALTER TABLE public.otp_fallback_codes ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (strictly backend only)
DROP POLICY IF EXISTS "Service role can manage fallback codes" ON public.otp_fallback_codes;
CREATE POLICY "Service role can manage fallback codes" ON public.otp_fallback_codes
    FOR ALL USING (auth.role() = 'service_role');

-- Cleanup function update
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
    
    -- Cleanup old OTP requests
    DELETE FROM public.email_otp_requests
    WHERE created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Cleanup old OTP attempts
    DELETE FROM public.email_otp_attempts
    WHERE created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Cleanup old lockouts
    DELETE FROM public.email_otp_lockouts
    WHERE is_active = false AND created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;

    -- Cleanup expired fallback codes
    DELETE FROM public.otp_fallback_codes
    WHERE expires_at < NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
