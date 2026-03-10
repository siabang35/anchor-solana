-- ============================================================
-- Sports Security Enhancement Migration
-- Adds audit tables, rate limiting, API logging, and validation
-- ============================================================

-- ========================
-- API Rate Limiting Table
-- ========================
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_ip VARCHAR(45) NOT NULL,
    endpoint VARCHAR(200) NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    violation_count INTEGER NOT NULL DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rate limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON api_rate_limits(client_ip, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON api_rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON api_rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON api_rate_limits(window_start);

-- ========================
-- API Request Logging Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(50) NOT NULL,
    source data_source NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    error_message TEXT,
    error_code VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_params JSONB DEFAULT '{}',
    response_summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for API logs
CREATE INDEX IF NOT EXISTS idx_sports_api_logs_request_id ON sports_api_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_sports_api_logs_source ON sports_api_logs(source);
CREATE INDEX IF NOT EXISTS idx_sports_api_logs_status ON sports_api_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_sports_api_logs_created ON sports_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sports_api_logs_errors ON sports_api_logs(created_at DESC) WHERE error_message IS NOT NULL;

-- Partition by month for performance (optional, requires Postgres 11+)
-- ALTER TABLE sports_api_logs SET (autovacuum_vacuum_scale_factor = 0.0);
-- ALTER TABLE sports_api_logs SET (autovacuum_vacuum_threshold = 5000);

-- ========================
-- Sync Lock Table
-- ========================
CREATE TABLE IF NOT EXISTS sports_sync_locks (
    id VARCHAR(100) PRIMARY KEY,
    locked_by VARCHAR(100) NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    lock_reason VARCHAR(200),
    metadata JSONB DEFAULT '{}'
);

-- Index for expired locks cleanup
CREATE INDEX IF NOT EXISTS idx_sync_locks_expires ON sports_sync_locks(expires_at);

-- ========================
-- Security Audit Log
-- ========================
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warning, error, critical
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    target_table VARCHAR(100),
    target_id UUID,
    action VARCHAR(50),
    old_values JSONB,
    new_values JSONB,
    details TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_security_audit_event ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_severity ON security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_target ON security_audit_log(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON security_audit_log(created_at DESC);

-- ========================
-- Data Validation Functions
-- ========================

-- Validate sports event data
CREATE OR REPLACE FUNCTION validate_sports_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate scores are non-negative
    IF NEW.home_score IS NOT NULL AND NEW.home_score < 0 THEN
        RAISE EXCEPTION 'Home score cannot be negative: %', NEW.home_score;
    END IF;
    IF NEW.away_score IS NOT NULL AND NEW.away_score < 0 THEN
        RAISE EXCEPTION 'Away score cannot be negative: %', NEW.away_score;
    END IF;
    
    -- Validate halftime scores don't exceed final scores
    IF NEW.home_score_halftime IS NOT NULL AND NEW.home_score IS NOT NULL 
       AND NEW.home_score_halftime > NEW.home_score THEN
        RAISE WARNING 'Halftime score exceeds final score for home team';
    END IF;
    
    -- Validate start_time is reasonable (not too far in past or future)
    IF NEW.start_time < NOW() - INTERVAL '2 years' THEN
        RAISE EXCEPTION 'Start time cannot be more than 2 years in the past: %', NEW.start_time;
    END IF;
    IF NEW.start_time > NOW() + INTERVAL '1 year' THEN
        RAISE EXCEPTION 'Start time cannot be more than 1 year in the future: %', NEW.start_time;
    END IF;
    
    -- Validate external_id is not empty
    IF NEW.external_id IS NULL OR LENGTH(TRIM(NEW.external_id)) = 0 THEN
        RAISE EXCEPTION 'External ID cannot be empty';
    END IF;
    
    -- Sanitize string fields (basic XSS prevention)
    NEW.name := REGEXP_REPLACE(NEW.name, '<[^>]+>', '', 'gi');
    NEW.venue := REGEXP_REPLACE(NEW.venue, '<[^>]+>', '', 'gi');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to sports_events
DROP TRIGGER IF EXISTS trigger_validate_sports_event ON sports_events;
CREATE TRIGGER trigger_validate_sports_event
    BEFORE INSERT OR UPDATE ON sports_events
    FOR EACH ROW
    EXECUTE FUNCTION validate_sports_event();

-- Validate sports market data
CREATE OR REPLACE FUNCTION validate_sports_market()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate prices are between 0 and 1
    IF NEW.yes_price < 0 OR NEW.yes_price > 1 THEN
        RAISE EXCEPTION 'Yes price must be between 0 and 1: %', NEW.yes_price;
    END IF;
    IF NEW.no_price < 0 OR NEW.no_price > 1 THEN
        RAISE EXCEPTION 'No price must be between 0 and 1: %', NEW.no_price;
    END IF;
    
    -- Validate volume and liquidity are non-negative
    IF NEW.volume < 0 THEN
        RAISE EXCEPTION 'Volume cannot be negative: %', NEW.volume;
    END IF;
    IF NEW.liquidity < 0 THEN
        RAISE EXCEPTION 'Liquidity cannot be negative: %', NEW.liquidity;
    END IF;
    
    -- Validate closes_at is in the future for new markets
    IF TG_OP = 'INSERT' AND NEW.closes_at IS NOT NULL AND NEW.closes_at < NOW() THEN
        RAISE EXCEPTION 'Closes at must be in the future for new markets';
    END IF;
    
    -- Sanitize string fields
    NEW.title := REGEXP_REPLACE(NEW.title, '<[^>]+>', '', 'gi');
    NEW.question := REGEXP_REPLACE(NEW.question, '<[^>]+>', '', 'gi');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to sports_markets
DROP TRIGGER IF EXISTS trigger_validate_sports_market ON sports_markets;
CREATE TRIGGER trigger_validate_sports_market
    BEFORE INSERT OR UPDATE ON sports_markets
    FOR EACH ROW
    EXECUTE FUNCTION validate_sports_market();

-- ========================
-- Rate Limit Helper Functions
-- ========================

-- Check if an IP/endpoint is rate limited (sports-specific)
CREATE OR REPLACE FUNCTION check_sports_rate_limit(
    p_ip VARCHAR(45),
    p_endpoint VARCHAR(200),
    p_window_ms INTEGER DEFAULT 60000,
    p_max_requests INTEGER DEFAULT 100
)
RETURNS TABLE (
    is_limited BOOLEAN,
    current_count INTEGER,
    blocked_until TIMESTAMPTZ,
    remaining INTEGER
) AS $$
DECLARE
    v_entry RECORD;
    v_window_start TIMESTAMPTZ;
BEGIN
    v_window_start := NOW() - (p_window_ms / 1000.0) * INTERVAL '1 second';
    
    -- Get or create rate limit entry
    SELECT * INTO v_entry
    FROM api_rate_limits
    WHERE client_ip = p_ip AND endpoint = p_endpoint
    AND window_start > v_window_start
    ORDER BY window_start DESC
    LIMIT 1;
    
    IF v_entry IS NULL THEN
        -- No active window, create new entry
        INSERT INTO api_rate_limits (client_ip, endpoint, request_count, window_start)
        VALUES (p_ip, p_endpoint, 1, NOW())
        ON CONFLICT DO NOTHING;
        
        RETURN QUERY SELECT FALSE, 1, NULL::TIMESTAMPTZ, p_max_requests - 1;
    ELSE
        -- Check if blocked
        IF v_entry.blocked_until IS NOT NULL AND v_entry.blocked_until > NOW() THEN
            RETURN QUERY SELECT TRUE, v_entry.request_count, v_entry.blocked_until, 0;
        END IF;
        
        -- Increment count
        UPDATE api_rate_limits
        SET request_count = request_count + 1, updated_at = NOW()
        WHERE id = v_entry.id;
        
        -- Check if limit exceeded
        IF v_entry.request_count >= p_max_requests THEN
            RETURN QUERY SELECT TRUE, v_entry.request_count + 1, NULL::TIMESTAMPTZ, 0;
        ELSE
            RETURN QUERY SELECT FALSE, v_entry.request_count + 1, NULL::TIMESTAMPTZ, p_max_requests - v_entry.request_count - 1;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Sync Lock Functions
-- ========================

-- Acquire a sync lock
CREATE OR REPLACE FUNCTION acquire_sync_lock(
    p_lock_id VARCHAR(100),
    p_locked_by VARCHAR(100),
    p_duration_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
    v_existing RECORD;
BEGIN
    -- Check for existing lock
    SELECT * INTO v_existing
    FROM sports_sync_locks
    WHERE id = p_lock_id;
    
    IF v_existing IS NOT NULL THEN
        -- Check if lock expired
        IF v_existing.expires_at < NOW() THEN
            -- Delete expired lock
            DELETE FROM sports_sync_locks WHERE id = p_lock_id;
        ELSE
            -- Lock still valid
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Acquire lock
    INSERT INTO sports_sync_locks (id, locked_by, expires_at)
    VALUES (p_lock_id, p_locked_by, NOW() + (p_duration_seconds || ' seconds')::INTERVAL)
    ON CONFLICT (id) DO NOTHING;
    
    -- Verify we got the lock
    SELECT * INTO v_existing
    FROM sports_sync_locks
    WHERE id = p_lock_id AND locked_by = p_locked_by;
    
    RETURN v_existing IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release a sync lock
CREATE OR REPLACE FUNCTION release_sync_lock(
    p_lock_id VARCHAR(100),
    p_locked_by VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM sports_sync_locks
    WHERE id = p_lock_id AND locked_by = p_locked_by;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Cleanup Functions
-- ========================

-- Clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits(
    p_older_than_hours INTEGER DEFAULT 24
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM api_rate_limits
    WHERE window_start < NOW() - (p_older_than_hours || ' hours')::INTERVAL
    AND (blocked_until IS NULL OR blocked_until < NOW());
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up old API logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_api_logs(
    p_older_than_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM sports_api_logs
    WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up expired sync locks
CREATE OR REPLACE FUNCTION cleanup_sync_locks()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM sports_sync_locks WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Row Level Security
-- ========================

-- Enable RLS on new tables
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_sync_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables
CREATE POLICY "Service role only for rate limits" ON api_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only for API logs" ON sports_api_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only for sync locks" ON sports_sync_locks
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only for audit log" ON security_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Comments
-- ========================

COMMENT ON TABLE api_rate_limits IS 'Tracks API rate limiting per IP/user and endpoint';
COMMENT ON TABLE sports_api_logs IS 'Audit log for all external sports API requests';
COMMENT ON TABLE sports_sync_locks IS 'Distributed locks to prevent concurrent sync operations';
COMMENT ON TABLE security_audit_log IS 'Security events and suspicious activity log';

COMMENT ON FUNCTION validate_sports_event IS 'Validates sports event data before insert/update';
COMMENT ON FUNCTION validate_sports_market IS 'Validates sports market data before insert/update';
COMMENT ON FUNCTION check_sports_rate_limit(VARCHAR(45), VARCHAR(200), INTEGER, INTEGER) IS 'Checks if an IP/endpoint combination is rate limited for sports API';
COMMENT ON FUNCTION acquire_sync_lock IS 'Acquires a distributed lock for sync operations';
COMMENT ON FUNCTION release_sync_lock IS 'Releases a distributed sync lock';
