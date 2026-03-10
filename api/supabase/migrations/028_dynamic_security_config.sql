-- ============================================================================
-- DeJaVu - Dynamic Security Configuration (028_dynamic_security_config.sql)
-- Manageable security settings for admins
-- ============================================================================

-- ============================================================================
-- SECURITY_CONFIG TABLE
-- Key-value store for global security settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    is_editable BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Access control
ALTER TABLE public.security_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages security config" ON public.security_config;
CREATE POLICY "Service role manages security config" ON public.security_config
    FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE TRIGGER update_security_config_updated_at
    BEFORE UPDATE ON public.security_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SEED DEFAULT CONFIGURATION
-- ============================================================================
INSERT INTO public.security_config (key, value, description) VALUES
    ('global_rate_limit', '{"requests": 300, "window_seconds": 60}'::jsonb, 'Default rate limit for all endpoints unless overridden'),
    ('auth_rate_limit', '{"requests": 10, "window_seconds": 60}'::jsonb, 'Strict rate limit for authentication endpoints'),
    ('maintenance_mode', 'false'::jsonb, 'If true, blocks non-admin access to the API'),
    ('ip_whitelist', '[]'::jsonb, 'List of IP CIDRs that bypass rate limits and blocks'),
    ('blocked_countries', '[]'::jsonb, 'List of country codes (ISO 2) to block'),
    ('strict_ip_check', 'true'::jsonb, 'If true, enforces strict device fingerprinting'),
    ('max_daily_withdrawal_global', '500000'::jsonb, 'Global cap for total withdrawals per day')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- UPDATED RATE LIMIT FUNCTION
-- Uses dynamic config instead of hardcoded defaults
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier_type TEXT,
    p_identifier TEXT,
    p_endpoint TEXT,
    p_max_requests INTEGER DEFAULT NULL,
    p_window_seconds INTEGER DEFAULT NULL
)
RETURNS TABLE (
    allowed BOOLEAN,
    remaining INTEGER,
    reset_at TIMESTAMPTZ,
    is_blocked BOOLEAN
) AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_record public.rate_limits;
    v_allowed BOOLEAN := true;
    v_remaining INTEGER;
    v_config_limit INTEGER;
    v_config_window INTEGER;
    v_whitelist JSONB;
BEGIN
    -- 1. Check Maintenance Mode
    IF (SELECT value::boolean FROM public.security_config WHERE key = 'maintenance_mode') THEN
        -- Allow if IP is in whitelist (simplified check, real impl would need CIDR match)
        -- For now, just return false if maintenance mode is on
        RETURN QUERY SELECT false, 0, NOW() + INTERVAL '1 hour', true;
        RETURN;
    END IF;

    -- 2. Fetch Whitelist
    SELECT value INTO v_whitelist FROM public.security_config WHERE key = 'ip_whitelist';
    IF p_identifier_type = 'ip' AND v_whitelist ? p_identifier THEN
         RETURN QUERY SELECT true, 999999, NOW() + INTERVAL '1 minute', false;
         RETURN;
    END IF;

    -- 3. Determine Limits (Priority: Arg > Config > Default)
    IF p_max_requests IS NOT NULL THEN
        v_config_limit := p_max_requests;
        v_config_window := COALESCE(p_window_seconds, 60);
    ELSE
        -- Try to find endpoint specific config (not implemented in this simplified table, fallback to global)
        IF p_endpoint LIKE '/auth/%' THEN
            SELECT (value->>'requests')::int, (value->>'window_seconds')::int 
            INTO v_config_limit, v_config_window 
            FROM public.security_config WHERE key = 'auth_rate_limit';
        ELSE
            SELECT (value->>'requests')::int, (value->>'window_seconds')::int 
            INTO v_config_limit, v_config_window 
            FROM public.security_config WHERE key = 'global_rate_limit';
        END IF;
        
        -- Fallback if config missing
        v_config_limit := COALESCE(v_config_limit, 100);
        v_config_window := COALESCE(v_config_window, 60);
    END IF;

    -- 4. Calculate Window
    v_window_start := DATE_TRUNC('minute', NOW()); -- Simple minute buckets for efficiency

    -- 5. Check Block Status
    SELECT * INTO v_record
    FROM public.rate_limits rl
    WHERE rl.identifier_type = p_identifier_type
      AND rl.identifier = p_identifier
      AND rl.endpoint = p_endpoint
      AND rl.is_blocked = true
      AND (rl.blocked_until IS NULL OR rl.blocked_until > NOW());
    
    IF v_record IS NOT NULL THEN
        RETURN QUERY SELECT false, 0, v_record.blocked_until, true;
        RETURN;
    END IF;
    
    -- 6. Record Request
    INSERT INTO public.rate_limits (
        identifier_type, identifier, endpoint, 
        window_start, window_size_seconds, request_count, max_requests
    )
    VALUES (
        p_identifier_type, p_identifier, p_endpoint,
        v_window_start, v_config_window, 1, v_config_limit
    )
    ON CONFLICT (identifier_type, identifier, endpoint, window_start)
    DO UPDATE SET
        request_count = public.rate_limits.request_count + 1,
        last_request_at = NOW()
    RETURNING * INTO v_record;
    
    -- 7. Check Limit
    v_remaining := GREATEST(0, v_config_limit - v_record.request_count);
    v_allowed := v_record.request_count <= v_config_limit;
    
    RETURN QUERY SELECT 
        v_allowed, 
        v_remaining,
        v_window_start + (v_config_window || ' seconds')::INTERVAL,
        false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
