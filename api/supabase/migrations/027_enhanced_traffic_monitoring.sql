-- ============================================================================
-- DeJaVu - Enhanced Traffic Monitoring (027_enhanced_traffic_monitoring.sql)
-- Comprehensive HTTP request logging and traffic analysis
-- ============================================================================

-- ============================================================================
-- HTTP_REQUEST_LOGS TABLE
-- High-volume logging for all incoming requests
-- Note: In a production scale, this might move to a separate timeseries DB or 
-- log drain, but for this architecture, we keep it here with aggressive cleanup.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.http_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request details
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    
    -- Client details
    ip_address INET,
    user_agent TEXT,
    referer TEXT,
    origin TEXT,
    
    -- Authenticated user (if any)
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Security context
    is_suspicious BOOLEAN DEFAULT false,
    risk_score INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analysis
-- Partitioning by time would be ideal for very high volume, but standard indexing 
-- plus cleanup is sufficient for typical admin monitoring requirements.
CREATE INDEX IF NOT EXISTS idx_http_logs_created ON public.http_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_http_logs_ip ON public.http_request_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_http_logs_user ON public.http_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_http_logs_path ON public.http_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_http_logs_status ON public.http_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_http_logs_suspicious ON public.http_request_logs(is_suspicious) WHERE is_suspicious = true;

-- Enable RLS
ALTER TABLE public.http_request_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can access logs (Admin UI will access via views/RPC or service role client)
DROP POLICY IF EXISTS "Service role can manage request logs" ON public.http_request_logs;
CREATE POLICY "Service role can manage request logs" ON public.http_request_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRAFFIC ANALYTICS VIEW
-- Real-time traffic statistics for the admin dashboard
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_traffic_stats AS
SELECT
    -- Time bucket (last 5 minutes)
    NOW() AS sample_time,
    
    -- Valid requests
    COUNT(*) FILTER (WHERE status_code < 400) AS success_count,
    
    -- Errors
    COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500) AS client_error_count,
    COUNT(*) FILTER (WHERE status_code >= 500) AS server_error_count,
    
    -- Performance
    ROUND(AVG(latency_ms), 2) AS avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
    
    -- Volume
    COUNT(*) AS total_requests,
    COUNT(DISTINCT ip_address) AS unique_ips,
    
    -- Throughput (approx requests per second over the viewed window)
    -- Assuming this view is queried for a specific window, but here we just show "current state"
    ROUND(COUNT(*)::NUMERIC / 60.0, 2) AS requests_per_second_1min
    
FROM public.http_request_logs
WHERE created_at >= NOW() - INTERVAL '1 minute';

-- Grant access
GRANT SELECT ON public.admin_traffic_stats TO service_role;

-- ============================================================================
-- CLEANUP FUNCTION
-- Auto-delete logs older than retention period to prevent bloat
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_request_logs(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.http_request_logs
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    return deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution
GRANT EXECUTE ON FUNCTION public.cleanup_request_logs TO service_role;

-- Scheduled maintenance (via pg_cron if available, or just callable via cron job/edge function)
COMMENT ON FUNCTION public.cleanup_request_logs IS 'Run this daily to maintain table size';
