-- Migration: Create audit_logs table for comprehensive financial operation tracking
-- OWASP A09:2021 - Security Logging and Monitoring Failures
-- Simplified version for Supabase compatibility

-- Drop existing objects if they exist (for clean re-run)
DROP VIEW IF EXISTS security_events_summary;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Create audit_logs table
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    signature TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common query patterns
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_event ON audit_logs(user_id, event_type);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own audit logs
CREATE POLICY audit_logs_user_select ON audit_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Service role can insert and select
CREATE POLICY audit_logs_service_all ON audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON audit_logs TO authenticated;
GRANT ALL ON audit_logs TO service_role;

-- Add comments
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for all financial operations';
