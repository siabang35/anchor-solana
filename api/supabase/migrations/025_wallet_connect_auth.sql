-- ============================================================================
-- Migration: 025_wallet_connect_auth.sql
-- Purpose: Comprehensive wallet connect authentication with multi-chain support
-- Security: OWASP compliant, anti-replay, rate limiting, brute force protection
-- Wallets: MetaMask, Phantom, Coinbase, Slush (SUI), WalletConnect
-- ============================================================================

-- Enable pgcrypto extension for gen_random_bytes (cryptographic nonce generation)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SECTION 1: Connected Wallets Table
-- External wallets linked to user accounts (not Privy embedded wallets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS connected_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Wallet identification
    address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    wallet_provider TEXT NOT NULL CHECK (wallet_provider IN ('metamask', 'phantom', 'coinbase', 'slush', 'walletconnect', 'other')),
    
    -- Verification status
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    last_signature_at TIMESTAMPTZ,
    
    -- Display info
    label TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    wallet_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one wallet address per chain
    UNIQUE(address, chain)
);

-- Add comments for documentation
COMMENT ON TABLE connected_wallets IS 
    'External wallet connections for authentication (separate from Privy embedded wallets)';
COMMENT ON COLUMN connected_wallets.wallet_provider IS 
    'Wallet software used: metamask, phantom, coinbase, slush, walletconnect';
COMMENT ON COLUMN connected_wallets.is_verified IS 
    'Whether the wallet ownership has been verified via signature';

-- ============================================================================
-- SECTION 2: Indexes for Connected Wallets
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_connected_wallets_user_id 
    ON connected_wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_connected_wallets_address_chain 
    ON connected_wallets(LOWER(address), chain);

CREATE INDEX IF NOT EXISTS idx_connected_wallets_provider 
    ON connected_wallets(wallet_provider);

CREATE INDEX IF NOT EXISTS idx_connected_wallets_verified 
    ON connected_wallets(is_verified) WHERE is_verified = true;

-- ============================================================================
-- SECTION 3: Wallet Auth Nonces Table
-- Single-use nonces for SIWE (Sign-In with Ethereum) and similar protocols
-- OWASP A04:2021 - Insecure Design Prevention
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_auth_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Nonce data
    nonce TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    
    -- SIWE message components
    message TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'dejavu.app',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    
    -- Request context (for additional security)
    ip_address INET,
    user_agent TEXT,
    
    -- Usage tracking
    used_at TIMESTAMPTZ,
    used_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'rejected')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wallet_auth_nonces IS 
    'Single-use nonces for wallet signature authentication. Prevents replay attacks.';
COMMENT ON COLUMN wallet_auth_nonces.nonce IS 
    'Cryptographically random nonce, must be unique and single-use';
COMMENT ON COLUMN wallet_auth_nonces.expires_at IS 
    'Nonce expires after 5 minutes for security';

-- ============================================================================
-- SECTION 4: Indexes for Nonces
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_nonce 
    ON wallet_auth_nonces(nonce) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_address 
    ON wallet_auth_nonces(LOWER(wallet_address), chain);

CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_expires 
    ON wallet_auth_nonces(expires_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_ip 
    ON wallet_auth_nonces(ip_address);

-- ============================================================================
-- SECTION 5: Wallet Auth Attempts Table
-- Brute force protection and security auditing
-- OWASP A07:2021 - Identification and Authentication Failures
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Attempt details
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    wallet_provider TEXT,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason TEXT,
    
    -- Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_fingerprint TEXT,
    
    -- Linked data
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    nonce_id UUID REFERENCES wallet_auth_nonces(id) ON DELETE SET NULL,
    
    -- Risk assessment
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_factors TEXT[],
    
    -- Timestamps
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wallet_auth_attempts IS 
    'Audit log for wallet authentication attempts. Used for brute force detection.';

-- ============================================================================
-- SECTION 6: Indexes for Auth Attempts
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wallet_auth_attempts_address_time 
    ON wallet_auth_attempts(LOWER(wallet_address), attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_auth_attempts_ip_time 
    ON wallet_auth_attempts(ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_auth_attempts_success 
    ON wallet_auth_attempts(success, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_auth_attempts_user 
    ON wallet_auth_attempts(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- SECTION 7: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE connected_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_auth_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_auth_attempts ENABLE ROW LEVEL SECURITY;

-- Connected Wallets: Users can view their own
DROP POLICY IF EXISTS "Users can view own connected wallets" ON connected_wallets;
CREATE POLICY "Users can view own connected wallets" ON connected_wallets
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own connected wallets" ON connected_wallets;
CREATE POLICY "Users can manage own connected wallets" ON connected_wallets
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all connected wallets" ON connected_wallets;
CREATE POLICY "Service role manages all connected wallets" ON connected_wallets
    FOR ALL USING (auth.role() = 'service_role');

-- Nonces: Service role only (sensitive)
DROP POLICY IF EXISTS "Service role manages nonces" ON wallet_auth_nonces;
CREATE POLICY "Service role manages nonces" ON wallet_auth_nonces
    FOR ALL USING (auth.role() = 'service_role');

-- Auth Attempts: Service role only (sensitive audit data)
DROP POLICY IF EXISTS "Service role manages auth attempts" ON wallet_auth_attempts;
CREATE POLICY "Service role manages auth attempts" ON wallet_auth_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- SECTION 8: Generate Wallet Nonce Function
-- Creates cryptographic nonce and SIWE message
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_wallet_nonce(
    p_wallet_address TEXT,
    p_chain TEXT,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(nonce TEXT, message TEXT, issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nonce TEXT;
    v_message TEXT;
    v_issued_at TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '5 minutes';
    v_domain TEXT := 'dejavu.app';
    v_uri TEXT := 'https://dejavu.app';
    v_chain_id INTEGER;
BEGIN
    -- Generate cryptographic nonce (32 bytes hex)
    v_nonce := encode(gen_random_bytes(32), 'hex');
    
    -- Get chain ID for EVM chains
    v_chain_id := CASE p_chain
        WHEN 'ethereum' THEN 1
        WHEN 'base' THEN 8453
        WHEN 'polygon' THEN 137
        WHEN 'arbitrum' THEN 42161
        WHEN 'optimism' THEN 10
        ELSE 1  -- Default to Ethereum mainnet
    END;
    
    -- Generate SIWE-compatible message
    -- Format follows EIP-4361 (Sign-In with Ethereum)
    IF p_chain IN ('ethereum', 'base', 'polygon', 'arbitrum', 'optimism') THEN
        v_message := format(
            E'%s wants you to sign in with your Ethereum account:\n%s\n\nWelcome to DeJaVu! Sign this message to verify your wallet ownership.\n\nThis request will NOT trigger a blockchain transaction or cost any gas fees.\n\nURI: %s\nVersion: 1\nChain ID: %s\nNonce: %s\nIssued At: %s\nExpiration Time: %s',
            v_domain,
            p_wallet_address,
            v_uri,
            v_chain_id,
            v_nonce,
            to_char(v_issued_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            to_char(v_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        );
    ELSIF p_chain = 'solana' THEN
        -- Solana message format
        v_message := format(
            E'DeJaVu Login Request\n\nWallet: %s\nChain: Solana\nNonce: %s\nIssued: %s\nExpires: %s\n\nSign to verify ownership. No transaction will occur.',
            p_wallet_address,
            v_nonce,
            to_char(v_issued_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            to_char(v_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        );
    ELSIF p_chain = 'sui' THEN
        -- SUI message format
        v_message := format(
            E'DeJaVu Login Request\n\nWallet: %s\nChain: SUI\nNonce: %s\nIssued: %s\nExpires: %s\n\nSign to verify ownership. No transaction will occur.',
            p_wallet_address,
            v_nonce,
            to_char(v_issued_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            to_char(v_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        );
    ELSE
        RAISE EXCEPTION 'Unsupported chain: %', p_chain;
    END IF;
    
    -- Store nonce in database
    INSERT INTO wallet_auth_nonces (
        nonce,
        wallet_address,
        chain,
        message,
        domain,
        issued_at,
        expires_at,
        ip_address,
        user_agent,
        status
    ) VALUES (
        v_nonce,
        LOWER(p_wallet_address),
        p_chain,
        v_message,
        v_domain,
        v_issued_at,
        v_expires_at,
        p_ip_address,
        p_user_agent,
        'pending'
    );
    
    RETURN QUERY SELECT v_nonce, v_message, v_issued_at, v_expires_at;
END;
$$;

COMMENT ON FUNCTION generate_wallet_nonce IS 
    'Generates a cryptographic nonce and SIWE message for wallet authentication';

-- ============================================================================
-- SECTION 9: Consume Wallet Nonce Function
-- Validates and marks nonce as used (single-use enforcement)
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_wallet_nonce(
    p_nonce TEXT,
    p_wallet_address TEXT,
    p_chain TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    valid BOOLEAN, 
    message TEXT, 
    reason TEXT,
    nonce_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nonce_record RECORD;
BEGIN
    -- Find the nonce (with row lock to prevent race conditions)
    SELECT * INTO v_nonce_record
    FROM wallet_auth_nonces
    WHERE nonce = p_nonce
    FOR UPDATE;
    
    -- Nonce not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, 'Invalid or unknown nonce'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Nonce already used (replay attack prevention)
    IF v_nonce_record.status = 'used' THEN
        -- Log potential replay attack
        RAISE WARNING 'Nonce replay attempt detected: % for wallet %', p_nonce, p_wallet_address;
        RETURN QUERY SELECT FALSE, NULL::TEXT, 'Nonce already used (possible replay attack)'::TEXT, v_nonce_record.id;
        RETURN;
    END IF;
    
    -- Nonce expired
    IF v_nonce_record.expires_at < NOW() THEN
        -- Mark as expired
        UPDATE wallet_auth_nonces SET status = 'expired' WHERE id = v_nonce_record.id;
        RETURN QUERY SELECT FALSE, NULL::TEXT, 'Nonce has expired'::TEXT, v_nonce_record.id;
        RETURN;
    END IF;
    
    -- Wallet address mismatch
    IF LOWER(v_nonce_record.wallet_address) != LOWER(p_wallet_address) THEN
        -- Mark as rejected (security violation)
        UPDATE wallet_auth_nonces SET status = 'rejected' WHERE id = v_nonce_record.id;
        RETURN QUERY SELECT FALSE, NULL::TEXT, 'Wallet address mismatch'::TEXT, v_nonce_record.id;
        RETURN;
    END IF;
    
    -- Chain mismatch
    IF v_nonce_record.chain != p_chain THEN
        UPDATE wallet_auth_nonces SET status = 'rejected' WHERE id = v_nonce_record.id;
        RETURN QUERY SELECT FALSE, NULL::TEXT, 'Chain mismatch'::TEXT, v_nonce_record.id;
        RETURN;
    END IF;
    
    -- All checks passed - mark as used
    UPDATE wallet_auth_nonces 
    SET 
        status = 'used',
        used_at = NOW(),
        used_by_user_id = p_user_id
    WHERE id = v_nonce_record.id;
    
    RETURN QUERY SELECT TRUE, v_nonce_record.message, NULL::TEXT, v_nonce_record.id;
END;
$$;

COMMENT ON FUNCTION consume_wallet_nonce IS 
    'Validates and consumes a single-use nonce. Returns false if invalid, expired, or already used.';

-- ============================================================================
-- SECTION 10: Check Wallet Auth Rate Limit Function
-- OWASP A07:2021 - Brute Force Protection
-- ============================================================================

CREATE OR REPLACE FUNCTION check_wallet_auth_rate_limit(
    p_wallet_address TEXT,
    p_ip_address INET,
    p_max_attempts INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(
    allowed BOOLEAN,
    attempts_remaining INTEGER,
    lockout_until TIMESTAMPTZ,
    reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet_attempts INTEGER;
    v_ip_attempts INTEGER;
    v_window_start TIMESTAMPTZ := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    v_lockout_until TIMESTAMPTZ := NOW() + (p_window_minutes || ' minutes')::INTERVAL;
BEGIN
    -- Count failed attempts by wallet address
    SELECT COUNT(*) INTO v_wallet_attempts
    FROM wallet_auth_attempts
    WHERE LOWER(wallet_address) = LOWER(p_wallet_address)
      AND success = false
      AND attempted_at > v_window_start;
    
    -- Count failed attempts by IP address
    SELECT COUNT(*) INTO v_ip_attempts
    FROM wallet_auth_attempts
    WHERE ip_address = p_ip_address
      AND success = false
      AND attempted_at > v_window_start;
    
    -- Check wallet-based lockout
    IF v_wallet_attempts >= p_max_attempts THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_lockout_until,
            format('Too many failed attempts for this wallet. Try again in %s minutes.', p_window_minutes)::TEXT;
        RETURN;
    END IF;
    
    -- Check IP-based lockout (more lenient - 10x limit)
    IF v_ip_attempts >= p_max_attempts * 10 THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_lockout_until,
            format('Too many failed attempts from this IP. Try again in %s minutes.', p_window_minutes)::TEXT;
        RETURN;
    END IF;
    
    -- Calculate remaining attempts (use wallet-based as primary)
    RETURN QUERY SELECT 
        TRUE, 
        GREATEST(0, p_max_attempts - v_wallet_attempts - 1)::INTEGER,
        NULL::TIMESTAMPTZ,
        NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION check_wallet_auth_rate_limit IS 
    'Checks if wallet authentication is rate limited. Returns false if too many failed attempts.';

-- ============================================================================
-- SECTION 11: Log Wallet Auth Attempt Function
-- Security audit logging
-- ============================================================================

CREATE OR REPLACE FUNCTION log_wallet_auth_attempt(
    p_wallet_address TEXT,
    p_chain TEXT,
    p_wallet_provider TEXT,
    p_ip_address INET,
    p_success BOOLEAN,
    p_failure_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_nonce_id UUID DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt_id UUID;
    v_risk_score INTEGER := 0;
    v_risk_factors TEXT[] := '{}';
BEGIN
    -- Calculate risk score
    IF NOT p_success THEN
        v_risk_score := v_risk_score + 20;
        v_risk_factors := array_append(v_risk_factors, 'failed_attempt');
    END IF;
    
    -- Check for rapid attempts (same wallet, last 5 minutes)
    IF EXISTS (
        SELECT 1 FROM wallet_auth_attempts
        WHERE LOWER(wallet_address) = LOWER(p_wallet_address)
          AND attempted_at > NOW() - INTERVAL '1 minute'
    ) THEN
        v_risk_score := v_risk_score + 30;
        v_risk_factors := array_append(v_risk_factors, 'rapid_attempts');
    END IF;
    
    -- Check for multiple wallets from same IP
    IF (
        SELECT COUNT(DISTINCT wallet_address) 
        FROM wallet_auth_attempts
        WHERE ip_address = p_ip_address
          AND attempted_at > NOW() - INTERVAL '15 minutes'
    ) > 3 THEN
        v_risk_score := v_risk_score + 25;
        v_risk_factors := array_append(v_risk_factors, 'multiple_wallets_same_ip');
    END IF;
    
    -- Insert attempt record
    INSERT INTO wallet_auth_attempts (
        wallet_address,
        chain,
        wallet_provider,
        success,
        failure_reason,
        ip_address,
        user_agent,
        device_fingerprint,
        user_id,
        nonce_id,
        risk_score,
        risk_factors
    ) VALUES (
        LOWER(p_wallet_address),
        p_chain,
        p_wallet_provider,
        p_success,
        p_failure_reason,
        p_ip_address,
        p_user_agent,
        p_device_fingerprint,
        p_user_id,
        p_nonce_id,
        v_risk_score,
        v_risk_factors
    )
    RETURNING id INTO v_attempt_id;
    
    -- Log high-risk attempts to suspicious_activity
    IF v_risk_score >= 50 AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'suspicious_activity') THEN
        INSERT INTO suspicious_activity (
            user_id,
            ip_address,
            activity_type,
            description,
            risk_score,
            details
        ) VALUES (
            p_user_id,
            p_ip_address,
            CASE 
                WHEN NOT p_success THEN 'multiple_failed_logins'
                ELSE 'other'
            END,
            format('Wallet auth attempt for %s: %s', p_wallet_address, COALESCE(p_failure_reason, 'success')),
            v_risk_score,
            jsonb_build_object(
                'wallet_address', p_wallet_address,
                'chain', p_chain,
                'provider', p_wallet_provider,
                'risk_factors', v_risk_factors
            )
        );
    END IF;
    
    RETURN v_attempt_id;
END;
$$;

COMMENT ON FUNCTION log_wallet_auth_attempt IS 
    'Logs wallet authentication attempts with risk scoring for security monitoring';

-- ============================================================================
-- SECTION 12: Find or Create Wallet User Function
-- Creates or retrieves user by wallet address
-- ============================================================================

CREATE OR REPLACE FUNCTION find_or_create_wallet_user(
    p_wallet_address TEXT,
    p_chain TEXT,
    p_wallet_provider TEXT
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
    -- First, try to find user by connected wallet
    SELECT cw.user_id, p.profile_completed, p.username
    INTO v_user_id, v_profile_completed, v_username
    FROM connected_wallets cw
    JOIN profiles p ON p.id = cw.user_id
    WHERE LOWER(cw.address) = LOWER(p_wallet_address)
      AND cw.chain = p_chain
      AND cw.is_verified = true;
    
    IF v_user_id IS NOT NULL THEN
        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- Try to find by legacy wallet_addresses JSONB column
    SELECT p.id, p.profile_completed, p.username
    INTO v_user_id, v_profile_completed, v_username
    FROM profiles p
    WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p.wallet_addresses, '[]'::jsonb)) AS wa
        WHERE LOWER(wa->>'address') = LOWER(p_wallet_address)
          AND LOWER(wa->>'chain') = LOWER(p_chain)
    );
    
    IF v_user_id IS NOT NULL THEN
        -- Migrate to connected_wallets table
        INSERT INTO connected_wallets (
            user_id, address, chain, wallet_provider, is_verified, verified_at
        ) VALUES (
            v_user_id, LOWER(p_wallet_address), p_chain, p_wallet_provider, true, NOW()
        ) ON CONFLICT (address, chain) DO NOTHING;
        
        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- User not found - signal that new user creation is needed
    -- Actual user creation happens in the backend via Supabase Auth
    RETURN QUERY SELECT NULL::UUID, TRUE, FALSE, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION find_or_create_wallet_user IS 
    'Finds existing user by wallet address. Returns NULL user_id if new user needs creation.';

-- ============================================================================
-- SECTION 13: Link Wallet to User Function
-- Connects a verified wallet to an existing user
-- ============================================================================

CREATE OR REPLACE FUNCTION link_wallet_to_user(
    p_user_id UUID,
    p_wallet_address TEXT,
    p_chain TEXT,
    p_wallet_provider TEXT,
    p_is_primary BOOLEAN DEFAULT false
)
RETURNS TABLE(success BOOLEAN, message TEXT, wallet_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet_id UUID;
    v_existing_user UUID;
BEGIN
    -- Check if wallet is already linked to another user
    SELECT user_id INTO v_existing_user
    FROM connected_wallets
    WHERE LOWER(address) = LOWER(p_wallet_address) AND chain = p_chain;
    
    IF v_existing_user IS NOT NULL AND v_existing_user != p_user_id THEN
        RETURN QUERY SELECT FALSE, 'Wallet is already linked to another account'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- If setting as primary, unset other primary wallets for this user
    IF p_is_primary THEN
        UPDATE connected_wallets
        SET is_primary = false
        WHERE user_id = p_user_id AND is_primary = true;
    END IF;
    
    -- Insert or update the wallet connection
    INSERT INTO connected_wallets (
        user_id,
        address,
        chain,
        wallet_provider,
        is_verified,
        verified_at,
        is_primary
    ) VALUES (
        p_user_id,
        LOWER(p_wallet_address),
        p_chain,
        p_wallet_provider,
        true,
        NOW(),
        p_is_primary
    )
    ON CONFLICT (address, chain) DO UPDATE SET
        is_verified = true,
        verified_at = NOW(),
        wallet_provider = EXCLUDED.wallet_provider,
        is_primary = EXCLUDED.is_primary,
        updated_at = NOW()
    RETURNING id INTO v_wallet_id;
    
    -- Update connected wallet in connected_wallets
    UPDATE connected_wallets 
    SET last_signature_at = NOW()
    WHERE id = v_wallet_id;
    
    RETURN QUERY SELECT TRUE, 'Wallet linked successfully'::TEXT, v_wallet_id;
END;
$$;

COMMENT ON FUNCTION link_wallet_to_user IS 
    'Links a verified wallet to a user account. Prevents duplicate links.';

-- ============================================================================
-- SECTION 14: Cleanup Expired Nonces Function
-- Should be scheduled as a cron job
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_wallet_nonces()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Mark expired nonces
    UPDATE wallet_auth_nonces
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();
    
    -- Delete old records (older than 24 hours)
    DELETE FROM wallet_auth_nonces
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_wallet_nonces IS 
    'Cleans up expired wallet nonces. Should be scheduled via pg_cron.';

-- ============================================================================
-- SECTION 15: Cleanup Old Auth Attempts Function
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_wallet_auth_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Keep 30 days of auth attempts
    DELETE FROM wallet_auth_attempts
    WHERE attempted_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_wallet_auth_attempts IS 
    'Cleans up old wallet auth attempts. Should be scheduled via pg_cron.';

-- ============================================================================
-- SECTION 16: Triggers
-- ============================================================================

-- Updated at trigger for connected_wallets
DROP TRIGGER IF EXISTS update_connected_wallets_updated_at ON connected_wallets;
CREATE TRIGGER update_connected_wallets_updated_at
    BEFORE UPDATE ON connected_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 17: Grant Permissions
-- ============================================================================

-- Public functions (callable by authenticated users)
GRANT EXECUTE ON FUNCTION find_or_create_wallet_user TO authenticated;

-- Service role only functions (sensitive operations)
GRANT EXECUTE ON FUNCTION generate_wallet_nonce TO service_role;
GRANT EXECUTE ON FUNCTION consume_wallet_nonce TO service_role;
GRANT EXECUTE ON FUNCTION check_wallet_auth_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION log_wallet_auth_attempt TO service_role;
GRANT EXECUTE ON FUNCTION link_wallet_to_user TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_wallet_nonces TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_wallet_auth_attempts TO service_role;

-- ============================================================================
-- SECTION 18: Scheduled Cleanup (if pg_cron is available)
-- ============================================================================

-- Note: Uncomment if pg_cron extension is enabled
-- SELECT cron.schedule(
--     'cleanup-wallet-nonces',
--     '*/10 * * * *', -- Every 10 minutes
--     $$SELECT cleanup_expired_wallet_nonces()$$
-- );

-- SELECT cron.schedule(
--     'cleanup-wallet-auth-attempts',
--     '0 3 * * *', -- Daily at 3 AM
--     $$SELECT cleanup_old_wallet_auth_attempts()$$
-- );
