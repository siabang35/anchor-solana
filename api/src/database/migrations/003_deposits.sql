-- Migration: 003_deposits.sql
-- DeJaVu Deposit System Schema
-- Created: 2026-01-06

-- ============================================================================
-- User Balances Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance DECIMAL(18,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    locked_balance DECIMAL(18,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
    currency TEXT NOT NULL DEFAULT 'USDC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one balance record per user per currency
    UNIQUE(user_id, currency),
    
    -- Balance constraint
    CONSTRAINT balance_gte_locked CHECK (balance >= locked_balance)
);

-- Indexes for user_balances
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON public.user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_currency ON public.user_balances(currency);

-- ============================================================================
-- Deposit Transactions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.deposit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USDC',
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana', 'sui', 'base')),
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
    nonce TEXT UNIQUE,
    privy_wallet_address TEXT,
    privy_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    
    -- Metadata for audit
    ip_address INET,
    user_agent TEXT
);

-- Indexes for deposit_transactions
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_user_id ON public.deposit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_status ON public.deposit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_nonce ON public.deposit_transactions(nonce);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_created_at ON public.deposit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_tx_hash ON public.deposit_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- ============================================================================
-- Row Level Security Policies
-- ============================================================================

-- Enable RLS on user_balances
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- Users can only view their own balance
CREATE POLICY "Users can view own balance"
    ON public.user_balances FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all balances
CREATE POLICY "Service role can manage balances"
    ON public.user_balances FOR ALL
    USING (auth.role() = 'service_role');

-- Enable RLS on deposit_transactions
ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
    ON public.deposit_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all transactions
CREATE POLICY "Service role can manage transactions"
    ON public.deposit_transactions FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to credit user balance (atomic operation)
CREATE OR REPLACE FUNCTION public.credit_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(18,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_balances (user_id, balance, currency)
    VALUES (p_user_id, p_amount, p_currency)
    ON CONFLICT (user_id, currency)
    DO UPDATE SET
        balance = user_balances.balance + p_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to debit user balance (with available balance check)
CREATE OR REPLACE FUNCTION public.debit_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(18,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available DECIMAL(18,8);
BEGIN
    SELECT balance - locked_balance INTO v_available
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency
    FOR UPDATE;
    
    IF v_available IS NULL OR v_available < p_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.user_balances
    SET balance = balance - p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock balance (for pending orders)
CREATE OR REPLACE FUNCTION public.lock_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(18,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available DECIMAL(18,8);
BEGIN
    SELECT balance - locked_balance INTO v_available
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency
    FOR UPDATE;
    
    IF v_available IS NULL OR v_available < p_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.user_balances
    SET locked_balance = locked_balance + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock balance
CREATE OR REPLACE FUNCTION public.unlock_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(18,8),
    p_currency TEXT DEFAULT 'USDC'
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_balances
    SET locked_balance = GREATEST(0, locked_balance - p_amount), updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_balances_updated_at
    BEFORE UPDATE ON public.user_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Grants (for service role)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.credit_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_user_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_user_balance TO service_role;
