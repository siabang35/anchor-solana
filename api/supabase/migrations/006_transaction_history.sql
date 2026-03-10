-- ============================================================================
-- DeJaVu - Transaction History Schema (006_transaction_history.sql)
-- Unified transaction ledger and history views for Portfolio
-- ============================================================================

-- ============================================================================
-- TRANSACTION_LEDGER TABLE
-- Unified ledger of all balance-affecting transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transaction_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Transaction type
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 
        'trade_buy', 'trade_sell',
        'fee', 'reward', 'referral',
        'adjustment', 'transfer_in', 'transfer_out'
    )),
    
    -- Amount (positive = credit, negative = debit)
    amount DECIMAL(20,8) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDC',
    
    -- Running balance after transaction
    balance_after DECIMAL(20,8) NOT NULL,
    
    -- Reference to source transaction
    reference_type TEXT, -- 'deposit_transaction', 'withdrawal_transaction', 'order', 'referral_reward'
    reference_id UUID,
    
    -- Chain info (for on-chain transactions)
    chain TEXT,
    tx_hash TEXT,
    block_number BIGINT,
    
    -- Counterparty (for transfers)
    counterparty_address TEXT,
    counterparty_user_id UUID REFERENCES auth.users(id),
    
    -- Additional metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_user_created 
    ON public.transaction_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_type 
    ON public.transaction_ledger(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_reference 
    ON public.transaction_ledger(reference_type, reference_id) 
    WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_tx_hash 
    ON public.transaction_ledger(tx_hash) 
    WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_status 
    ON public.transaction_ledger(status);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_currency 
    ON public.transaction_ledger(currency);

-- Enable RLS
ALTER TABLE public.transaction_ledger ENABLE ROW LEVEL SECURITY;

-- Users can only see their own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transaction_ledger;
CREATE POLICY "Users can view own transactions" ON public.transaction_ledger
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all transactions" ON public.transaction_ledger;
CREATE POLICY "Service role can manage all transactions" ON public.transaction_ledger
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- DAILY_BALANCES TABLE
-- Snapshot of daily balances for PnL calculations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Snapshot date (UTC)
    snapshot_date DATE NOT NULL,
    
    -- Balances
    balance DECIMAL(20,8) NOT NULL,
    locked_balance DECIMAL(20,8) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USDC',
    
    -- PnL metrics
    daily_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    cumulative_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Activity metrics
    deposits_today DECIMAL(20,8) NOT NULL DEFAULT 0,
    withdrawals_today DECIMAL(20,8) NOT NULL DEFAULT 0,
    trades_today INTEGER NOT NULL DEFAULT 0,
    volume_today DECIMAL(20,8) NOT NULL DEFAULT 0,
    fees_today DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One snapshot per user per day per currency
    UNIQUE(user_id, snapshot_date, currency)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_balances_user_date 
    ON public.daily_balances(user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_balances_date 
    ON public.daily_balances(snapshot_date);

-- Enable RLS
ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;

-- Users can view their own daily balances
DROP POLICY IF EXISTS "Users can view own daily balances" ON public.daily_balances;
CREATE POLICY "Users can view own daily balances" ON public.daily_balances
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all daily balances" ON public.daily_balances;
CREATE POLICY "Service role can manage all daily balances" ON public.daily_balances
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRANSACTION_SUMMARY VIEW
-- Summarized view for portfolio display
-- ============================================================================
CREATE OR REPLACE VIEW public.transaction_summary AS
SELECT 
    user_id,
    DATE_TRUNC('day', created_at) AS transaction_date,
    transaction_type,
    currency,
    COUNT(*) AS transaction_count,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_debits,
    SUM(amount) AS net_amount
FROM public.transaction_ledger
WHERE status = 'confirmed'
GROUP BY user_id, DATE_TRUNC('day', created_at), transaction_type, currency;

-- ============================================================================
-- USER_PORTFOLIO_STATS VIEW
-- Portfolio statistics for dashboard
-- ============================================================================
CREATE OR REPLACE VIEW public.user_portfolio_stats AS
SELECT 
    ub.user_id,
    ub.currency,
    ub.balance AS current_balance,
    ub.locked_balance,
    ub.balance - ub.locked_balance AS available_balance,
    ub.total_deposited,
    ub.total_withdrawn,
    COALESCE(today.daily_pnl, 0) AS today_pnl,
    COALESCE(week.weekly_pnl, 0) AS week_pnl,
    COALESCE(month.monthly_pnl, 0) AS month_pnl,
    COALESCE(all_time.total_pnl, 0) AS total_pnl
FROM public.user_balances ub
LEFT JOIN (
    SELECT user_id, currency, daily_pnl
    FROM public.daily_balances
    WHERE snapshot_date = CURRENT_DATE
) today ON ub.user_id = today.user_id AND ub.currency = today.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS weekly_pnl
    FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY user_id, currency
) week ON ub.user_id = week.user_id AND ub.currency = week.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS monthly_pnl
    FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY user_id, currency
) month ON ub.user_id = month.user_id AND ub.currency = month.currency
LEFT JOIN (
    SELECT user_id, currency, cumulative_pnl AS total_pnl
    FROM public.daily_balances db1
    WHERE snapshot_date = (
        SELECT MAX(snapshot_date) FROM public.daily_balances db2 
        WHERE db2.user_id = db1.user_id AND db2.currency = db1.currency
    )
) all_time ON ub.user_id = all_time.user_id AND ub.currency = all_time.currency;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Record transaction in ledger
CREATE OR REPLACE FUNCTION public.record_transaction(
    p_user_id UUID,
    p_type TEXT,
    p_amount DECIMAL(20,8),
    p_currency TEXT DEFAULT 'USDC',
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_chain TEXT DEFAULT NULL,
    p_tx_hash TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_balance_after DECIMAL(20,8);
    v_transaction_id UUID;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_balance_after
    FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency;
    
    -- Calculate new balance
    v_balance_after := v_balance_after + p_amount;
    
    -- Insert ledger entry
    INSERT INTO public.transaction_ledger (
        user_id, transaction_type, amount, currency, balance_after,
        reference_type, reference_id, chain, tx_hash, description, metadata,
        status, confirmed_at
    )
    VALUES (
        p_user_id, p_type, p_amount, p_currency, v_balance_after,
        p_reference_type, p_reference_id, p_chain, p_tx_hash, p_description, p_metadata,
        'confirmed', NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get transaction history with pagination
CREATE OR REPLACE FUNCTION public.get_transaction_history(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_type TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    transaction_type TEXT,
    amount DECIMAL(20,8),
    currency TEXT,
    balance_after DECIMAL(20,8),
    chain TEXT,
    tx_hash TEXT,
    description TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tl.id,
        tl.transaction_type,
        tl.amount,
        tl.currency,
        tl.balance_after,
        tl.chain,
        tl.tx_hash,
        tl.description,
        tl.status,
        tl.created_at
    FROM public.transaction_ledger tl
    WHERE tl.user_id = p_user_id
      AND (p_type IS NULL OR tl.transaction_type = p_type)
      AND (p_currency IS NULL OR tl.currency = p_currency)
      AND (p_start_date IS NULL OR tl.created_at >= p_start_date)
      AND (p_end_date IS NULL OR tl.created_at <= p_end_date)
    ORDER BY tl.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create daily balance snapshot (run as scheduled job)
CREATE OR REPLACE FUNCTION public.create_daily_balance_snapshot()
RETURNS INTEGER AS $$
DECLARE
    snapshot_count INTEGER := 0;
BEGIN
    -- Insert today's snapshot for all users with balances
    INSERT INTO public.daily_balances (
        user_id, snapshot_date, balance, locked_balance, currency,
        deposits_today, withdrawals_today, trades_today, volume_today, fees_today
    )
    SELECT 
        ub.user_id,
        CURRENT_DATE,
        ub.balance,
        ub.locked_balance,
        ub.currency,
        COALESCE(deps.total, 0),
        COALESCE(withs.total, 0),
        COALESCE(trades.count, 0),
        COALESCE(trades.volume, 0),
        COALESCE(fees.total, 0)
    FROM public.user_balances ub
    LEFT JOIN (
        SELECT user_id, currency, SUM(amount) AS total
        FROM public.transaction_ledger
        WHERE transaction_type = 'deposit' 
          AND DATE(created_at) = CURRENT_DATE
        GROUP BY user_id, currency
    ) deps ON ub.user_id = deps.user_id AND ub.currency = deps.currency
    LEFT JOIN (
        SELECT user_id, currency, SUM(ABS(amount)) AS total
        FROM public.transaction_ledger
        WHERE transaction_type = 'withdrawal'
          AND DATE(created_at) = CURRENT_DATE
        GROUP BY user_id, currency
    ) withs ON ub.user_id = withs.user_id AND ub.currency = withs.currency
    LEFT JOIN (
        SELECT user_id, currency, COUNT(*) AS count, SUM(ABS(amount)) AS volume
        FROM public.transaction_ledger
        WHERE transaction_type IN ('trade_buy', 'trade_sell')
          AND DATE(created_at) = CURRENT_DATE
        GROUP BY user_id, currency
    ) trades ON ub.user_id = trades.user_id AND ub.currency = trades.currency
    LEFT JOIN (
        SELECT user_id, currency, SUM(ABS(amount)) AS total
        FROM public.transaction_ledger
        WHERE transaction_type = 'fee'
          AND DATE(created_at) = CURRENT_DATE
        GROUP BY user_id, currency
    ) fees ON ub.user_id = fees.user_id AND ub.currency = fees.currency
    ON CONFLICT (user_id, snapshot_date, currency)
    DO UPDATE SET
        balance = EXCLUDED.balance,
        locked_balance = EXCLUDED.locked_balance,
        deposits_today = EXCLUDED.deposits_today,
        withdrawals_today = EXCLUDED.withdrawals_today,
        trades_today = EXCLUDED.trades_today,
        volume_today = EXCLUDED.volume_today,
        fees_today = EXCLUDED.fees_today;
    
    GET DIAGNOSTICS snapshot_count = ROW_COUNT;
    RETURN snapshot_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate and update daily PnL
CREATE OR REPLACE FUNCTION public.calculate_daily_pnl()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    UPDATE public.daily_balances db
    SET 
        daily_pnl = db.balance - COALESCE(
            (SELECT balance FROM public.daily_balances prev 
             WHERE prev.user_id = db.user_id 
               AND prev.currency = db.currency
               AND prev.snapshot_date = db.snapshot_date - INTERVAL '1 day'),
            db.balance - db.deposits_today + db.withdrawals_today
        ) - db.deposits_today + db.withdrawals_today,
        cumulative_pnl = (
            SELECT COALESCE(SUM(daily_pnl), 0)
            FROM public.daily_balances prev
            WHERE prev.user_id = db.user_id
              AND prev.currency = db.currency
              AND prev.snapshot_date <= db.snapshot_date
        )
    WHERE db.snapshot_date = CURRENT_DATE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Export transactions as CSV-ready format
CREATE OR REPLACE FUNCTION public.export_transactions(
    p_user_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    date TEXT,
    type TEXT,
    description TEXT,
    amount TEXT,
    currency TEXT,
    balance_after TEXT,
    chain TEXT,
    tx_hash TEXT,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TO_CHAR(tl.created_at, 'YYYY-MM-DD HH24:MI:SS'),
        tl.transaction_type,
        COALESCE(tl.description, tl.transaction_type),
        tl.amount::TEXT,
        tl.currency,
        tl.balance_after::TEXT,
        COALESCE(tl.chain, ''),
        COALESCE(tl.tx_hash, ''),
        tl.status
    FROM public.transaction_ledger tl
    WHERE tl.user_id = p_user_id
      AND (p_start_date IS NULL OR DATE(tl.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR DATE(tl.created_at) <= p_end_date)
    ORDER BY tl.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.record_transaction TO service_role;
GRANT EXECUTE ON FUNCTION public.get_transaction_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_balance_snapshot TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_daily_pnl TO service_role;
GRANT EXECUTE ON FUNCTION public.export_transactions TO authenticated;
GRANT SELECT ON public.transaction_summary TO authenticated;
GRANT SELECT ON public.user_portfolio_stats TO authenticated;
