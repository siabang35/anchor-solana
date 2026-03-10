-- ============================================================================
-- DeJaVu - Realtime Setup (029_realtime_setup.sql)
-- Enable real-time updates for admin dashboard components
-- ============================================================================

-- ============================================================================
-- PUBLICATION CONFIGURATION
-- ============================================================================

-- Ensure the publication exists (Supabase creates this default)
-- DO NOT DROP default publication, just add to it.

-- 1. System Alerts (Low volume, high importance)
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_alerts;

-- 2. Suspicious Activity (Low medium volume, high importance)
ALTER PUBLICATION supabase_realtime ADD TABLE public.suspicious_activity;

-- 3. Platform Metrics (High volume, aggregated)
-- Ideally we only replicate inserts here to save bandwidth
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_metrics;

-- 4. Withdrawal Approvals (Low volume, financial importance)
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_approvals;

-- 5. Admin Audit Log (For "someone is doing something" indicators)
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;

-- 6. Rate Limits (Only for blocked status updates if needed, cautious about volume)
-- Not enabling rate_limits for now as it's too high frequency.

-- ============================================================================
-- REPLICA IDENTITY
-- Ensure tables can broadcast updates correctly
-- ============================================================================

ALTER TABLE public.system_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.suspicious_activity REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawal_approvals REPLICA IDENTITY FULL;
-- platform_metrics usually only needs inserts, so DEFAULT is fine (PK based)

-- ============================================================================
-- SECURITY NOTE
-- Realtime respects RLS. Since our RLS policies restrict these tables to 
-- service_role/admin, regular users won't receive these broadcasts even if 
-- they subscribe, which is correct behavior.
-- ============================================================================
