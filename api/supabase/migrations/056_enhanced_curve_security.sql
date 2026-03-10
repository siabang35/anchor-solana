-- ============================================================================
-- ExoDuZe — Enhanced Curve Security (056_enhanced_curve_security.sql)
-- Audit logging, HMAC integrity, rate limiting, enhanced probability history
-- ============================================================================

-- ========================
-- 1. Enhance probability_history with multi-source metadata
-- ========================

-- Source fingerprint — SHA256 hash of all data sources used for this curve point
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

-- Number of distinct data sources fused into this point
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 1;

-- Serialized chaos attractor states (Lorenz x/y/z, Hénon x/y) for reproducibility
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS chaos_state JSONB;

-- HMAC-SHA256 signature chaining previous point hash + server secret + timestamp
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS security_nonce TEXT;

-- Which data sources contributed (e.g. ['crypto_assets','crypto_fear_greed','market_signals'])
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS data_sources TEXT[] DEFAULT '{}';

-- Composite signal vector from multi-source fusion (normalized -1 to 1 per dimension)
ALTER TABLE probability_history
    ADD COLUMN IF NOT EXISTS signal_vector JSONB;

-- Index for integrity verification queries
CREATE INDEX IF NOT EXISTS idx_prob_history_nonce
    ON probability_history(security_nonce) WHERE security_nonce IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prob_history_fingerprint
    ON probability_history(source_fingerprint) WHERE source_fingerprint IS NOT NULL;

-- ========================
-- 2. Curve Audit Log — append-only forensics
-- ========================

CREATE TABLE IF NOT EXISTS curve_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- What happened
    event_type TEXT NOT NULL, -- 'curve_start', 'curve_stop', 'entropy_refresh', 'regime_change', 'security_alert', 'param_change'
    competition_id UUID,
    category TEXT,

    -- Details
    details JSONB DEFAULT '{}',

    -- Security context
    ip_address INET,
    user_agent TEXT,
    fingerprint TEXT,  -- SHA256(IP + UA + timestamp salt)

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON curve_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_competition ON curve_audit_log(competition_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON curve_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_security ON curve_audit_log(event_type, created_at DESC)
    WHERE event_type = 'security_alert';

-- RLS: Append-only, service role only
ALTER TABLE curve_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages audit log" ON curve_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- No public read on audit logs (security-sensitive)

-- ========================
-- 3. Curve Rate Limits — per-IP sliding window
-- ========================

CREATE TABLE IF NOT EXISTS curve_rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier TEXT NOT NULL,       -- IP address or user ID
    identifier_type TEXT NOT NULL,  -- 'ip', 'user', 'fingerprint'
    endpoint TEXT NOT NULL,         -- 'curve_history', 'curve_stream', 'ws_subscribe'
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 minute'),
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_rate_window UNIQUE (identifier, identifier_type, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON curve_rate_limits(identifier, identifier_type, endpoint, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked
    ON curve_rate_limits(is_blocked) WHERE is_blocked = TRUE;

-- RLS: Service role only
ALTER TABLE curve_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits" ON curve_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- 4. Auto-cleanup old rate limit entries (older than 1 hour)
-- ========================

-- Create function to prune old rate limit entries
DROP FUNCTION IF EXISTS cleanup_old_rate_limits();

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM curve_rate_limits
    WHERE window_end < NOW() - INTERVAL '1 hour'
    AND is_blocked = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Comments
-- ========================

COMMENT ON TABLE curve_audit_log IS 'Append-only audit trail for curve engine operations and security events';
COMMENT ON TABLE curve_rate_limits IS 'Sliding window rate limiting for curve API access';
COMMENT ON FUNCTION cleanup_old_rate_limits() IS 'Removes expired rate limit windows to prevent table bloat';
