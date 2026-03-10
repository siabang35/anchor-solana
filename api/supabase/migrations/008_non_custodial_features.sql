-- ============================================================================
-- DeJaVu - Non-Custodial Features Schema (008_non_custodial_features.sql)
-- Smart wallet signing queues and semi non-custodial architecture
-- ============================================================================

-- ============================================================================
-- SIGNING_REQUESTS TABLE
-- Queue of transactions awaiting user wallet signature (for critical operations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.signing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Request type
    request_type TEXT NOT NULL CHECK (request_type IN (
        'withdrawal',
        'high_value_trade',
        'settings_change',
        'wallet_link',
        'multisig_approval',
        'referral_claim',
        'emergency_recovery'
    )),
    
    -- Transaction details
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    transaction_data JSONB NOT NULL, -- ABI-encoded or serialized transaction
    
    -- Human-readable intent (for UI display)
    intent_summary TEXT NOT NULL,
    intent_details JSONB DEFAULT '{}'::jsonb,
    
    -- Value information
    value_usd DECIMAL(20,8),
    gas_estimate DECIMAL(20,8),
    
    -- Signing info
    message_to_sign TEXT, -- The actual message/hash that needs signature
    signature TEXT,       -- User's signature once signed
    signer_address TEXT NOT NULL,
    
    -- Nonce for replay protection
    nonce TEXT NOT NULL UNIQUE,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',       -- Awaiting user signature
        'signed',        -- User signed, ready for broadcast
        'broadcasting',  -- Being broadcast to chain
        'confirmed',     -- Confirmed on chain
        'failed',        -- Failed (broadcast or confirmation)
        'expired',       -- User didn't sign in time
        'cancelled'      -- User cancelled
    )),
    
    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    
    -- Result tracking
    tx_hash TEXT,
    block_number BIGINT,
    gas_used DECIMAL(20,8),
    error_message TEXT,
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    device_fingerprint_id UUID REFERENCES public.device_fingerprints(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signed_at TIMESTAMPTZ,
    broadcast_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signing_requests_user_status 
    ON public.signing_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_signing_requests_pending 
    ON public.signing_requests(status, expires_at) 
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_signing_requests_nonce 
    ON public.signing_requests(nonce);
CREATE INDEX IF NOT EXISTS idx_signing_requests_tx_hash 
    ON public.signing_requests(tx_hash) 
    WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signing_requests_created 
    ON public.signing_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.signing_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own signing requests
DROP POLICY IF EXISTS "Users can view own signing requests" ON public.signing_requests;
CREATE POLICY "Users can view own signing requests" ON public.signing_requests
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all signing requests" ON public.signing_requests;
CREATE POLICY "Service role can manage all signing requests" ON public.signing_requests
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- SIGNED_TRANSACTIONS TABLE
-- Historical record of all signed and executed transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.signed_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    signing_request_id UUID REFERENCES public.signing_requests(id),
    
    -- Transaction details
    chain TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,
    
    -- Transaction type
    tx_type TEXT NOT NULL CHECK (tx_type IN (
        'erc20_transfer',
        'native_transfer',
        'contract_call',
        'swap',
        'bridge',
        'nft_transfer',
        'other'
    )),
    
    -- Addresses
    from_address TEXT NOT NULL,
    to_address TEXT,
    contract_address TEXT,
    
    -- Values
    value DECIMAL(30,18),
    gas_used DECIMAL(20,8),
    gas_price DECIMAL(20,18),
    gas_cost_usd DECIMAL(20,8),
    
    -- Token transfers (if applicable)
    token_symbol TEXT,
    token_amount DECIMAL(30,18),
    token_value_usd DECIMAL(20,8),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed', 'reverted')),
    confirmations INTEGER NOT NULL DEFAULT 0,
    
    -- Raw data
    input_data TEXT,
    logs JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate tx hashes per chain
    UNIQUE(chain, tx_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signed_transactions_user 
    ON public.signed_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signed_transactions_chain 
    ON public.signed_transactions(chain, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_signed_transactions_type 
    ON public.signed_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_signed_transactions_hash 
    ON public.signed_transactions(tx_hash);

-- Enable RLS
ALTER TABLE public.signed_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own signed transactions" ON public.signed_transactions;
CREATE POLICY "Users can view own signed transactions" ON public.signed_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all signed transactions" ON public.signed_transactions;
CREATE POLICY "Service role can manage all signed transactions" ON public.signed_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WALLET_RECOVERY_HINTS TABLE
-- Encrypted hints for wallet recovery (NOT actual seed phrases!)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_recovery_hints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Wallet identification
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    
    -- Recovery hint (encrypted by user's password, only they can decrypt)
    -- This should be a hint like "First word: mom's maiden name, Last word: pet's name"
    -- NEVER store actual seed phrases!
    hint_encrypted TEXT NOT NULL,
    hint_salt TEXT NOT NULL, -- Salt for encryption
    
    -- Security questions (optional additional verification)
    security_questions JSONB, -- [{question: "...", answer_hash: "..."}]
    
    -- Backup verification
    backup_verified BOOLEAN NOT NULL DEFAULT false,
    backup_verified_at TIMESTAMPTZ,
    
    -- Last accessed
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_recovery_user 
    ON public.wallet_recovery_hints(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recovery_address 
    ON public.wallet_recovery_hints(wallet_address, chain);

-- Enable RLS
ALTER TABLE public.wallet_recovery_hints ENABLE ROW LEVEL SECURITY;

-- Users can manage their own recovery hints
DROP POLICY IF EXISTS "Users can manage own recovery hints" ON public.wallet_recovery_hints;
CREATE POLICY "Users can manage own recovery hints" ON public.wallet_recovery_hints
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all recovery hints" ON public.wallet_recovery_hints;
CREATE POLICY "Service role can manage all recovery hints" ON public.wallet_recovery_hints
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- MULTISIG_CONFIGURATIONS TABLE
-- Multi-signature wallet configurations for high-value accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.multisig_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Multisig wallet info
    multisig_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    
    -- Configuration
    threshold INTEGER NOT NULL CHECK (threshold >= 1),
    owners TEXT[] NOT NULL,
    owner_labels JSONB DEFAULT '{}'::jsonb, -- {address: label}
    
    -- Factory info (if contract deployed via factory)
    factory_address TEXT,
    salt TEXT,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    deployment_tx_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique per user/address/chain
    UNIQUE(user_id, multisig_address, chain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_multisig_user 
    ON public.multisig_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_multisig_address 
    ON public.multisig_configurations(multisig_address, chain);

-- Enable RLS
ALTER TABLE public.multisig_configurations ENABLE ROW LEVEL SECURITY;

-- Users can view/manage their own multisig configs
DROP POLICY IF EXISTS "Users can manage own multisig configurations" ON public.multisig_configurations;
CREATE POLICY "Users can manage own multisig configurations" ON public.multisig_configurations
    FOR ALL USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all multisig configurations" ON public.multisig_configurations;
CREATE POLICY "Service role can manage all multisig configurations" ON public.multisig_configurations
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- MULTISIG_PENDING_TRANSACTIONS TABLE
-- Pending transactions requiring multiple signatures
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.multisig_pending_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    multisig_config_id UUID NOT NULL REFERENCES public.multisig_configurations(id) ON DELETE CASCADE,
    
    -- Transaction details
    to_address TEXT NOT NULL,
    value DECIMAL(30,18) NOT NULL DEFAULT 0,
    data TEXT,
    operation INTEGER NOT NULL DEFAULT 0, -- 0 = Call, 1 = DelegateCall
    
    -- Safe transaction fields
    safe_tx_gas DECIMAL(20,8) NOT NULL DEFAULT 0,
    base_gas DECIMAL(20,8) NOT NULL DEFAULT 0,
    gas_price DECIMAL(20,18) NOT NULL DEFAULT 0,
    gas_token TEXT,
    refund_receiver TEXT,
    nonce INTEGER NOT NULL,
    
    -- Hash to sign
    safe_tx_hash TEXT NOT NULL UNIQUE,
    
    -- Signatures collected
    signatures JSONB DEFAULT '[]'::jsonb, -- [{owner: address, signature: "0x..."}]
    confirmations_count INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',    -- Collecting signatures
        'ready',      -- Has enough signatures, ready to execute
        'executing',  -- Being executed
        'executed',   -- Successfully executed
        'failed',     -- Execution failed
        'cancelled'   -- Cancelled by owner
    )),
    
    -- Execution details
    executor_address TEXT,
    execution_tx_hash TEXT,
    execution_date TIMESTAMPTZ,
    
    -- Metadata
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_multisig_pending_config 
    ON public.multisig_pending_transactions(multisig_config_id);
CREATE INDEX IF NOT EXISTS idx_multisig_pending_status 
    ON public.multisig_pending_transactions(status);
CREATE INDEX IF NOT EXISTS idx_multisig_pending_hash 
    ON public.multisig_pending_transactions(safe_tx_hash);

-- Enable RLS
ALTER TABLE public.multisig_pending_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view pending transactions for their multisigs
DROP POLICY IF EXISTS "Users can view multisig pending transactions" ON public.multisig_pending_transactions;
CREATE POLICY "Users can view multisig pending transactions" ON public.multisig_pending_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.multisig_configurations mc
            WHERE mc.id = multisig_config_id 
              AND mc.user_id = auth.uid()
        )
    );

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all multisig pending transactions" ON public.multisig_pending_transactions;
CREATE POLICY "Service role can manage all multisig pending transactions" ON public.multisig_pending_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate signing request nonce
CREATE OR REPLACE FUNCTION public.generate_signing_nonce()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Create signing request
CREATE OR REPLACE FUNCTION public.create_signing_request(
    p_user_id UUID,
    p_request_type TEXT,
    p_chain TEXT,
    p_transaction_data JSONB,
    p_intent_summary TEXT,
    p_signer_address TEXT,
    p_value_usd DECIMAL DEFAULT NULL,
    p_expires_minutes INTEGER DEFAULT 15
)
RETURNS public.signing_requests AS $$
DECLARE
    v_nonce TEXT;
    v_result public.signing_requests;
BEGIN
    v_nonce := public.generate_signing_nonce();
    
    INSERT INTO public.signing_requests (
        user_id, request_type, chain, transaction_data,
        intent_summary, signer_address, value_usd, nonce,
        expires_at
    )
    VALUES (
        p_user_id, p_request_type, p_chain, p_transaction_data,
        p_intent_summary, p_signer_address, p_value_usd, v_nonce,
        NOW() + (p_expires_minutes || ' minutes')::INTERVAL
    )
    RETURNING * INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit signature for signing request
CREATE OR REPLACE FUNCTION public.submit_signature(
    p_nonce TEXT,
    p_signature TEXT,
    p_user_id UUID
)
RETURNS public.signing_requests AS $$
DECLARE
    v_request public.signing_requests;
BEGIN
    -- Get and lock the request
    SELECT * INTO v_request
    FROM public.signing_requests
    WHERE nonce = p_nonce
      AND user_id = p_user_id
      AND status = 'pending'
      AND expires_at > NOW()
    FOR UPDATE;
    
    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Signing request not found, expired, or already processed';
    END IF;
    
    -- Update with signature
    UPDATE public.signing_requests
    SET 
        signature = p_signature,
        status = 'signed',
        signed_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
    
    RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending signing requests for user
CREATE OR REPLACE FUNCTION public.get_pending_signing_requests(p_user_id UUID)
RETURNS SETOF public.signing_requests AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.signing_requests
    WHERE user_id = p_user_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Cancel signing request
CREATE OR REPLACE FUNCTION public.cancel_signing_request(
    p_nonce TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    UPDATE public.signing_requests
    SET status = 'cancelled'
    WHERE nonce = p_nonce
      AND user_id = p_user_id
      AND status = 'pending';
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire old signing requests (run as scheduled job)
CREATE OR REPLACE FUNCTION public.expire_signing_requests()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE public.signing_requests
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add signature to multisig transaction
CREATE OR REPLACE FUNCTION public.add_multisig_signature(
    p_safe_tx_hash TEXT,
    p_owner_address TEXT,
    p_signature TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_tx public.multisig_pending_transactions;
    v_config public.multisig_configurations;
BEGIN
    -- Get the transaction
    SELECT * INTO v_tx
    FROM public.multisig_pending_transactions
    WHERE safe_tx_hash = p_safe_tx_hash
      AND status = 'pending'
    FOR UPDATE;
    
    IF v_tx IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get the config to verify owner
    SELECT * INTO v_config
    FROM public.multisig_configurations
    WHERE id = v_tx.multisig_config_id;
    
    IF NOT (p_owner_address = ANY(v_config.owners)) THEN
        RAISE EXCEPTION 'Signer is not an owner of this multisig';
    END IF;
    
    -- Add signature
    UPDATE public.multisig_pending_transactions
    SET 
        signatures = signatures || jsonb_build_object('owner', p_owner_address, 'signature', p_signature),
        confirmations_count = confirmations_count + 1,
        status = CASE 
            WHEN confirmations_count + 1 >= v_config.threshold THEN 'ready'
            ELSE 'pending'
        END,
        updated_at = NOW()
    WHERE id = v_tx.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_wallet_recovery_hints_updated_at
    BEFORE UPDATE ON public.wallet_recovery_hints
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_multisig_configurations_updated_at
    BEFORE UPDATE ON public.multisig_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_multisig_pending_transactions_updated_at
    BEFORE UPDATE ON public.multisig_pending_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.generate_signing_nonce TO service_role;
GRANT EXECUTE ON FUNCTION public.create_signing_request TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_signature TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_signing_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_signing_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_signing_requests TO service_role;
GRANT EXECUTE ON FUNCTION public.add_multisig_signature TO service_role;
