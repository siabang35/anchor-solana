-- ============================================================================
-- DeJaVu - Deposits & Balance Schema (002_deposits.sql)
-- User balances, deposit transactions, and Privy wallet integration
-- ============================================================================

-- ============================================================================
-- USER_BALANCES TABLE
-- Multi-currency balance tracking with locked funds support
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'USDC',
    balance DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    locked_balance DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
    pending_deposits DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (pending_deposits >= 0),
    pending_withdrawals DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (pending_withdrawals >= 0),
    total_deposited DECIMAL(20,8) NOT NULL DEFAULT 0,
    total_withdrawn DECIMAL(20,8) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One balance per user per currency
    UNIQUE(user_id, currency),
    
    -- Balance must be >= locked balance
    CONSTRAINT balance_gte_locked CHECK (balance >= locked_balance)
);

-- Indexes for user_balances
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON public.user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_currency ON public.user_balances(currency);
CREATE INDEX IF NOT EXISTS idx_user_balances_balance ON public.user_balances(balance DESC);

-- Enable RLS
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- Users can only view their own balance
CREATE POLICY "Users can view own balance" ON public.user_balances
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all balances
CREATE POLICY "Service role can manage balances" ON public.user_balances
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PRIVY_WALLETS TABLE
-- Privy-generated embedded wallets for deposits
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.privy_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    privy_user_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui')),
    wallet_type TEXT NOT NULL DEFAULT 'embedded' CHECK (wallet_type IN ('embedded', 'smart_wallet')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    
    -- One wallet per user per chain
    UNIQUE(user_id, chain),
    UNIQUE(wallet_address, chain)
);

-- Indexes for privy_wallets
CREATE INDEX IF NOT EXISTS idx_privy_wallets_user ON public.privy_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_privy_wallets_address ON public.privy_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_privy_wallets_chain ON public.privy_wallets(chain);
CREATE INDEX IF NOT EXISTS idx_privy_wallets_privy_user ON public.privy_wallets(privy_user_id);

-- Enable RLS
ALTER TABLE public.privy_wallets ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallets
CREATE POLICY "Users can view own privy wallets" ON public.privy_wallets
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role can manage privy wallets" ON public.privy_wallets
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- DEPOSIT_TRANSACTIONS TABLE
-- Complete deposit history with status tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.deposit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USDC',
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    
    -- Transaction details
    tx_hash TEXT,
    from_address TEXT,
    to_address TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'confirmed', 'failed', 'expired', 'cancelled')),
    confirmations INTEGER DEFAULT 0,
    required_confirmations INTEGER DEFAULT 12,
    
    -- Nonce for anti-replay
    nonce TEXT UNIQUE,
    
    -- Privy integration
    privy_wallet_id UUID REFERENCES public.privy_wallets(id),
    privy_transaction_id TEXT,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for deposit_transactions
CREATE INDEX IF NOT EXISTS idx_deposit_tx_user ON public.deposit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_status ON public.deposit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_nonce ON public.deposit_transactions(nonce);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_hash ON public.deposit_transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposit_tx_created ON public.deposit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_chain ON public.deposit_transactions(chain);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_pending ON public.deposit_transactions(status) WHERE status IN ('pending', 'confirming');

-- Enable RLS
ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own deposits" ON public.deposit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role can manage deposits" ON public.deposit_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- WITHDRAWAL_TRANSACTIONS TABLE
-- Complete withdrawal history with approval workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    fee DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (fee >= 0),
    net_amount DECIMAL(20,8) NOT NULL GENERATED ALWAYS AS (amount - fee) STORED,
    currency TEXT NOT NULL DEFAULT 'USDC',
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    
    -- Destination
    to_address TEXT NOT NULL,
    
    -- Transaction details
    tx_hash TEXT,
    
    -- Status and approval
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    
    -- Nonce for anti-replay
    nonce TEXT UNIQUE,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for withdrawal_transactions
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_user ON public.withdrawal_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_status ON public.withdrawal_transactions(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_nonce ON public.withdrawal_transactions(nonce);
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_hash ON public.withdrawal_transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_created ON public.withdrawal_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_tx_pending ON public.withdrawal_transactions(status) WHERE status IN ('pending', 'approved', 'processing');

-- Enable RLS
ALTER TABLE public.withdrawal_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own withdrawals
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role can manage withdrawals" ON public.withdrawal_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- BALANCE FUNCTIONS (Atomic Operations)
-- ============================================================================

-- Credit user balance
CREATE OR REPLACE FUNCTION public.credit_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(20,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_balances (user_id, balance, total_deposited, currency)
    VALUES (p_user_id, p_amount, p_amount, p_currency)
    ON CONFLICT (user_id, currency)
    DO UPDATE SET
        balance = user_balances.balance + p_amount,
        total_deposited = user_balances.total_deposited + p_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Debit user balance (with available balance check)
CREATE OR REPLACE FUNCTION public.debit_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(20,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available DECIMAL(20,8);
BEGIN
    SELECT balance - locked_balance INTO v_available
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency
    FOR UPDATE;
    
    IF v_available IS NULL OR v_available < p_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.user_balances
    SET balance = balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock balance (for pending orders/withdrawals)
CREATE OR REPLACE FUNCTION public.lock_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(20,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available DECIMAL(20,8);
BEGIN
    SELECT balance - locked_balance INTO v_available
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency
    FOR UPDATE;
    
    IF v_available IS NULL OR v_available < p_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.user_balances
    SET locked_balance = locked_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unlock balance
CREATE OR REPLACE FUNCTION public.unlock_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(20,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_balances
    SET locked_balance = GREATEST(0, locked_balance - p_amount),
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get available balance
CREATE OR REPLACE FUNCTION public.get_available_balance(
    p_user_id UUID,
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS DECIMAL(20,8) AS $$
DECLARE
    v_available DECIMAL(20,8);
BEGIN
    SELECT COALESCE(balance - locked_balance, 0) INTO v_available
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency;
    
    RETURN COALESCE(v_available, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE TRIGGER update_user_balances_updated_at
    BEFORE UPDATE ON public.user_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.credit_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_balance TO service_role;
