-- ============================================================================
-- ExoDuZe — Financial Ledger, Multi-Currency Balances, and Referral Program
-- File: 010_financial_ledger_and_referrals.sql
--
-- PURPOSE: Atomic ledger system for Web3 embedded wallets, deposits, withdrawals,
--          non-custodial whitelists, daily PnL snapshots, and affiliate rewards.
--
-- CLOUDFLARE R2: Large tx receipts, webhook payloads, and referral commission
--                audit trails are archived to R2 to optimize primary database storage.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. USER BALANCES TABLE                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.user_balances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency            VARCHAR(10) NOT NULL DEFAULT 'USDC',
    balance             DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 CHECK (balance >= 0),
    locked_balance      DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 CHECK (locked_balance >= 0),
    pending_deposits    DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 CHECK (pending_deposits >= 0),
    pending_withdrawals DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 CHECK (pending_withdrawals >= 0),
    total_deposited     DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
    total_withdrawn     DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, currency),
    CONSTRAINT balance_gte_locked CHECK (balance >= locked_balance)
);

CREATE INDEX IF NOT EXISTS idx_user_bal_lookup ON public.user_balances(user_id, currency);

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balances" ON public.user_balances
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages balances" ON public.user_balances
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_user_balances_updated_at ON public.user_balances;
CREATE TRIGGER update_user_balances_updated_at
    BEFORE UPDATE ON public.user_balances
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.user_balances IS 'Real-time user balances per currency with atomic updates and locked support';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. PRIVY WALLETS TABLE                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.privy_wallets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    privy_user_id  VARCHAR(100) NOT NULL,
    wallet_address VARCHAR(100) NOT NULL,
    chain          VARCHAR(20) NOT NULL DEFAULT 'solana' CHECK (chain IN ('solana','ethereum','base','sui')),
    wallet_type    VARCHAR(20) NOT NULL DEFAULT 'embedded' CHECK (wallet_type IN ('embedded', 'smart_wallet')),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at   TIMESTAMPTZ,

    UNIQUE (user_id, chain),
    UNIQUE (wallet_address, chain)
);

CREATE INDEX IF NOT EXISTS idx_privy_wallets_user ON public.privy_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_privy_wallets_addr ON public.privy_wallets(wallet_address, chain);

ALTER TABLE public.privy_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own privy wallets" ON public.privy_wallets
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages privy wallets" ON public.privy_wallets
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. DEPOSITS & WITHDRAWALS                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Deposit Transactions
CREATE TABLE IF NOT EXISTS public.deposit_transactions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount                 DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency               VARCHAR(10) NOT NULL DEFAULT 'USDC',
    chain                  VARCHAR(20) NOT NULL CHECK (chain IN ('solana','ethereum','base','sui','polygon','arbitrum','optimism')),
    tx_hash                VARCHAR(128),
    from_address           VARCHAR(100),
    to_address             VARCHAR(100) NOT NULL,

    status                 VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirming', 'confirmed', 'failed', 'expired', 'cancelled')),
    confirmations          INTEGER DEFAULT 0,
    required_confirmations INTEGER DEFAULT 1,

    nonce                  VARCHAR(64) UNIQUE,
    privy_wallet_id        UUID REFERENCES public.privy_wallets(id) ON DELETE SET NULL,
    privy_transaction_id   VARCHAR(100),

    ip_address             INET,
    user_agent             TEXT,
    error_message          TEXT,
    metadata               JSONB DEFAULT '{}'::jsonb, -- Receipts and payload references
    initiated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at           TIMESTAMPTZ,
    expires_at             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON public.deposit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON public.deposit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_deposits_hash ON public.deposit_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deposits" ON public.deposit_transactions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages deposits" ON public.deposit_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Withdrawal Transactions
CREATE TABLE IF NOT EXISTS public.withdrawal_transactions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount             DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    fee                DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (fee >= 0),
    net_amount         DECIMAL(20,8) NOT NULL GENERATED ALWAYS AS (amount - fee) STORED,
    currency           VARCHAR(10) NOT NULL DEFAULT 'USDC',
    chain              VARCHAR(20) NOT NULL CHECK (chain IN ('solana','ethereum','base','sui','polygon','arbitrum','optimism')),
    to_address         VARCHAR(100) NOT NULL,
    tx_hash            VARCHAR(128),

    status             VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),
    requires_approval  BOOLEAN DEFAULT false,
    approved_by        UUID REFERENCES auth.users(id),
    approved_at        TIMESTAMPTZ,

    nonce              VARCHAR(64) UNIQUE,
    ip_address         INET,
    user_agent         TEXT,
    error_message      TEXT,
    metadata           JSONB DEFAULT '{}'::jsonb,
    requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at       TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawal_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawal_transactions(status);

ALTER TABLE public.withdrawal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_transactions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages withdrawals" ON public.withdrawal_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Withdrawal Whitelist (Security Hardening)
CREATE TABLE IF NOT EXISTS public.withdrawal_whitelist (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address                 VARCHAR(100) NOT NULL,
    chain                   VARCHAR(20) NOT NULL CHECK (chain IN ('solana','ethereum','base','sui','polygon','arbitrum','optimism')),
    label                   VARCHAR(100) NOT NULL,
    is_verified             BOOLEAN NOT NULL DEFAULT false,
    verification_token      VARCHAR(64),
    verification_expires_at TIMESTAMPTZ,
    verified_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, address, chain)
);

CREATE INDEX IF NOT EXISTS idx_whitelist_lookup ON public.withdrawal_whitelist(user_id, address);

ALTER TABLE public.withdrawal_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own whitelist" ON public.withdrawal_whitelist
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages whitelist" ON public.withdrawal_whitelist
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. TRANSACTION LEDGER & DAILY BALANCES                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Unified transaction ledger (Double-entry balance logs)
CREATE TABLE IF NOT EXISTS public.transaction_ledger (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_type  VARCHAR(30) NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 'trade_buy', 'trade_sell',
        'fee', 'reward', 'referral', 'adjustment', 'transfer_in', 'transfer_out'
    )),
    amount            DECIMAL(20,8) NOT NULL, -- positive credit, negative debit
    currency          VARCHAR(10) NOT NULL DEFAULT 'USDC',
    balance_after     DECIMAL(20,8) NOT NULL,

    reference_type    VARCHAR(50), -- 'deposit', 'withdrawal', 'order', 'referral'
    reference_id      UUID,

    chain             VARCHAR(20),
    tx_hash           VARCHAR(128),
    block_number      BIGINT,

    counterparty_address VARCHAR(100),
    counterparty_user_id UUID REFERENCES auth.users(id),

    description       TEXT,
    metadata          JSONB DEFAULT '{}'::jsonb,
    status            VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON public.transaction_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON public.transaction_ledger(reference_type, reference_id) WHERE reference_id IS NOT NULL;

ALTER TABLE public.transaction_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions" ON public.transaction_ledger
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages transaction ledger" ON public.transaction_ledger
    FOR ALL USING (auth.role() = 'service_role');

-- Daily snapshots for portfolio analysis
CREATE TABLE IF NOT EXISTS public.daily_balances (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date     DATE NOT NULL,
    balance           DECIMAL(20,8) NOT NULL,
    locked_balance    DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    currency          VARCHAR(10) NOT NULL DEFAULT 'USDC',

    daily_pnl         DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    cumulative_pnl    DECIMAL(20,8) NOT NULL DEFAULT 0.00,

    deposits_today    DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    withdrawals_today DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    trades_today      INTEGER NOT NULL DEFAULT 0,
    volume_today      DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    fees_today        DECIMAL(20,8) NOT NULL DEFAULT 0.00,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, snapshot_date, currency)
);

CREATE INDEX IF NOT EXISTS idx_daily_balances_lookup ON public.daily_balances(user_id, snapshot_date DESC);

ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily balance history" ON public.daily_balances
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages daily balances" ON public.daily_balances
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. REFERRALS & BUILDER CODES                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Referral codes generated by builders
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code                VARCHAR(20) NOT NULL UNIQUE CHECK (code ~* '^[a-zA-Z0-9]{3,20}$'),
    code_type           VARCHAR(20) NOT NULL DEFAULT 'referral' CHECK (code_type IN ('referral', 'builder', 'affiliate', 'promo')),
    label               VARCHAR(100),
    description         TEXT,

    referrer_commission DECIMAL(5,2) NOT NULL DEFAULT 10.00 CHECK (referrer_commission >= 0 AND referrer_commission <= 100),
    referee_discount    DECIMAL(5,2) NOT NULL DEFAULT 5.00 CHECK (referee_discount >= 0 AND referee_discount <= 100),
    tier_level          INTEGER NOT NULL DEFAULT 1 CHECK (tier_level BETWEEN 1 AND 5),

    max_uses            INTEGER,
    current_uses        INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_val ON public.referral_codes(LOWER(code)) WHERE is_active = true;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own referral codes" ON public.referral_codes
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public validation of referral codes" ON public.referral_codes
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));
CREATE POLICY "Service role manages referral codes" ON public.referral_codes
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER update_referral_codes_updated_at
    BEFORE UPDATE ON public.referral_codes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referral sign-ups tracking
CREATE TABLE IF NOT EXISTS public.referral_tracking (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    referral_code_id          UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,

    signup_ip                 INET,
    signup_user_agent         TEXT,
    signup_device_fingerprint TEXT,

    is_qualified              BOOLEAN NOT NULL DEFAULT false,
    qualified_at              TIMESTAMPTZ,
    qualification_reason      VARCHAR(100),

    referee_total_volume      DECIMAL(20,6) NOT NULL DEFAULT 0.00,
    referee_total_fees        DECIMAL(20,6) NOT NULL DEFAULT 0.00,

    status                    VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'qualified', 'rewarded', 'rejected', 'fraudulent')),
    rejection_reason          TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ref_tracking_referrer ON public.referral_tracking(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ref_tracking_referee ON public.referral_tracking(referee_id);

ALTER TABLE public.referral_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrers view referrals" ON public.referral_tracking
    FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Referees view own status" ON public.referral_tracking
    FOR SELECT USING (auth.uid() = referee_id);
CREATE POLICY "Service role manages tracking" ON public.referral_tracking
    FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_referral_tracking_updated_at ON public.referral_tracking;
CREATE TRIGGER update_referral_tracking_updated_at
    BEFORE UPDATE ON public.referral_tracking
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payouts and claim history
CREATE TABLE IF NOT EXISTS public.referral_rewards (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_tracking_id UUID REFERENCES public.referral_tracking(id) ON DELETE SET NULL,

    reward_type          VARCHAR(30) NOT NULL CHECK (reward_type IN ('signup_bonus', 'trading_commission', 'milestone_bonus', 'promo')),
    amount               DECIMAL(20,6) NOT NULL CHECK (amount > 0),
    currency             VARCHAR(10) NOT NULL DEFAULT 'USDC',

    source_transaction_type VARCHAR(30),
    source_transaction_id   UUID,
    source_amount           DECIMAL(20,6),
    commission_rate         DECIMAL(5,2),

    status               VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),

    payout_tx_hash       VARCHAR(128),
    payout_chain         VARCHAR(20),
    payout_address       VARCHAR(100),

    claim_signature      TEXT,
    claim_nonce          VARCHAR(100) UNIQUE,
    claimed_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at         TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON public.referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON public.referral_rewards(status);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rewards" ON public.referral_rewards
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages rewards" ON public.referral_rewards
    FOR ALL USING (auth.role() = 'service_role');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. PORTFOLIO AND REFERRAL VIEWS                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Aggregated Referral Stats view
CREATE OR REPLACE VIEW public.referral_stats AS
SELECT rc.user_id, rc.code, rc.code_type, rc.tier_level, rc.current_uses AS total_signups,
       COALESCE(q.cnt, 0) AS qualified_referrals, COALESCE(rw.completed, 0) AS total_earned,
       COALESCE(rw.pending, 0) AS pending_earnings, COALESCE(vol.volume, 0) AS referral_volume
FROM public.referral_codes rc
LEFT JOIN (
    SELECT referral_code_id, COUNT(*) AS cnt FROM public.referral_tracking
    WHERE is_qualified = true GROUP BY referral_code_id
) q ON rc.id = q.referral_code_id
LEFT JOIN (
    SELECT user_id,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending
    FROM public.referral_rewards GROUP BY user_id
) rw ON rc.user_id = rw.user_id
LEFT JOIN (
    SELECT referrer_id, SUM(referee_total_volume) AS volume FROM public.referral_tracking GROUP BY referrer_id
) vol ON rc.user_id = vol.referrer_id;

-- Transaction Summary View
CREATE OR REPLACE VIEW public.transaction_summary AS
SELECT user_id, date_trunc('day', created_at) AS transaction_date, transaction_type, currency,
       COUNT(*) AS transaction_count, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_credits,
       SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_debits, SUM(amount) AS net_amount
FROM public.transaction_ledger WHERE status = 'confirmed'
GROUP BY user_id, date_trunc('day', created_at), transaction_type, currency;

-- User Portfolio Stats View
CREATE OR REPLACE VIEW public.user_portfolio_stats AS
SELECT ub.user_id, ub.currency, ub.balance AS current_balance, ub.locked_balance,
       (ub.balance - ub.locked_balance) AS available_balance, ub.total_deposited, ub.total_withdrawn,
       COALESCE(t.daily_pnl, 0) AS today_pnl, COALESCE(w.weekly_pnl, 0) AS weekly_pnl,
       COALESCE(m.monthly_pnl, 0) AS monthly_pnl, COALESCE(all_time.total_pnl, 0) AS total_pnl
FROM public.user_balances ub
LEFT JOIN (
    SELECT user_id, currency, daily_pnl FROM public.daily_balances WHERE snapshot_date = CURRENT_DATE
) t ON ub.user_id = t.user_id AND ub.currency = t.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS weekly_pnl FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days' GROUP BY user_id, currency
) w ON ub.user_id = w.user_id AND ub.currency = w.currency
LEFT JOIN (
    SELECT user_id, currency, SUM(daily_pnl) AS monthly_pnl FROM public.daily_balances
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY user_id, currency
) m ON ub.user_id = m.user_id AND ub.currency = m.currency
LEFT JOIN (
    SELECT user_id, currency, cumulative_pnl AS total_pnl FROM public.daily_balances db1
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM public.daily_balances db2 WHERE db2.user_id = db1.user_id AND db2.currency = db1.currency)
) all_time ON ub.user_id = all_time.user_id AND ub.currency = all_time.currency;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. FUNCTIONS                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Credit User Balance
CREATE OR REPLACE FUNCTION public.credit_user_balance(
    p_user_id UUID, p_amount DECIMAL(20,8), p_currency TEXT DEFAULT 'USDC'
) RETURNS void AS $$
BEGIN
    INSERT INTO public.user_balances (user_id, balance, total_deposited, currency)
    VALUES (p_user_id, p_amount, p_amount, p_currency)
    ON CONFLICT (user_id, currency) DO UPDATE SET
        balance = user_balances.balance + p_amount,
        total_deposited = user_balances.total_deposited + p_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Debit User Balance (Atomic)
CREATE OR REPLACE FUNCTION public.debit_user_balance(
    p_user_id UUID, p_amount DECIMAL(20,8), p_currency TEXT DEFAULT 'USDC'
) RETURNS boolean AS $$
DECLARE v_avail DECIMAL;
BEGIN
    SELECT (balance - locked_balance) INTO v_avail FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;

    IF v_avail IS NULL OR v_avail < p_amount THEN RETURN false; END IF;

    UPDATE public.user_balances SET
        balance = balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock funds
CREATE OR REPLACE FUNCTION public.lock_user_balance(
    p_user_id UUID, p_amount DECIMAL(20,8), p_currency TEXT DEFAULT 'USDC'
) RETURNS boolean AS $$
DECLARE v_avail DECIMAL;
BEGIN
    SELECT (balance - locked_balance) INTO v_avail FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;

    IF v_avail IS NULL OR v_avail < p_amount THEN RETURN false; END IF;

    UPDATE public.user_balances SET
        locked_balance = locked_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Unlock funds
CREATE OR REPLACE FUNCTION public.unlock_user_balance(
    p_user_id UUID, p_amount DECIMAL(20,8), p_currency TEXT DEFAULT 'USDC'
) RETURNS void AS $$
BEGIN
    UPDATE public.user_balances SET
        locked_balance = GREATEST(0.00, locked_balance - p_amount),
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Available check
CREATE OR REPLACE FUNCTION public.get_available_balance(
    p_user_id UUID, p_currency TEXT DEFAULT 'USDC'
) RETURNS DECIMAL(20,8) AS $$
DECLARE v_avail DECIMAL;
BEGIN
    SELECT (balance - locked_balance) INTO v_avail FROM public.user_balances
    WHERE user_id = p_user_id AND currency = p_currency;
    RETURN COALESCE(v_avail, 0.00);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Record double-entry transaction in ledger
CREATE OR REPLACE FUNCTION public.record_transaction(
    p_user_id UUID, p_type TEXT, p_amount DECIMAL(20,8), p_currency TEXT DEFAULT 'USDC',
    p_ref_type TEXT DEFAULT NULL, p_ref_id UUID DEFAULT NULL, p_chain TEXT DEFAULT NULL,
    p_tx_hash TEXT DEFAULT NULL, p_desc TEXT DEFAULT NULL, p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE v_bal DECIMAL; v_id UUID;
BEGIN
    SELECT balance INTO v_bal FROM public.user_balances WHERE user_id = p_user_id AND currency = p_currency;
    INSERT INTO public.transaction_ledger (
        user_id, transaction_type, amount, currency, balance_after, reference_type,
        reference_id, chain, tx_hash, description, metadata, status, confirmed_at
    ) VALUES (
        p_user_id, p_type, p_amount, p_currency, COALESCE(v_bal, 0.00), p_ref_type,
        p_ref_id, p_chain, p_tx_hash, p_desc, p_meta, 'confirmed', NOW()
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get history RPC
CREATE OR REPLACE FUNCTION public.get_transaction_history(
    p_user_id UUID, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0,
    p_type TEXT DEFAULT NULL, p_currency TEXT DEFAULT NULL,
    p_start TIMESTAMPTZ DEFAULT NULL, p_end TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    id UUID, transaction_type TEXT, amount DECIMAL(20,8), currency TEXT,
    balance_after DECIMAL(20,8), chain TEXT, tx_hash TEXT,
    description TEXT, status TEXT, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT tl.id, tl.transaction_type::TEXT, tl.amount, tl.currency::TEXT, tl.balance_after,
           tl.chain::TEXT, tl.tx_hash::TEXT, tl.description, tl.status::TEXT, tl.created_at
    FROM public.transaction_ledger tl
    WHERE tl.user_id = p_user_id
      AND (p_type IS NULL OR tl.transaction_type = p_type)
      AND (p_currency IS NULL OR tl.currency = p_currency)
      AND (p_start IS NULL OR tl.created_at >= p_start)
      AND (p_end IS NULL OR tl.created_at <= p_end)
    ORDER BY tl.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Export transactions CSV format
CREATE OR REPLACE FUNCTION public.export_transactions(
    p_user_id UUID, p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL
) RETURNS TABLE (
    date TEXT, type TEXT, description TEXT, amount TEXT, currency TEXT,
    balance_after TEXT, chain TEXT, tx_hash TEXT, status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT TO_CHAR(tl.created_at, 'YYYY-MM-DD HH24:MI:SS'), tl.transaction_type::TEXT,
           COALESCE(tl.description, tl.transaction_type::TEXT), tl.amount::TEXT, tl.currency::TEXT,
           tl.balance_after::TEXT, COALESCE(tl.chain::TEXT, ''), COALESCE(tl.tx_hash::TEXT, ''), tl.status::TEXT
    FROM public.transaction_ledger tl
    WHERE tl.user_id = p_user_id
      AND (p_start IS NULL OR DATE(tl.created_at) >= p_start)
      AND (p_end IS NULL OR DATE(tl.created_at) <= p_end)
    ORDER BY tl.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- PnL & Snapshot Cron Functions
CREATE OR REPLACE FUNCTION public.create_daily_balance_snapshot()
RETURNS INTEGER AS $$
DECLARE v_cnt INTEGER;
BEGIN
    INSERT INTO public.daily_balances (
        user_id, snapshot_date, balance, locked_balance, currency,
        deposits_today, withdrawals_today, trades_today, volume_today, fees_today
    )
    SELECT ub.user_id, CURRENT_DATE, ub.balance, ub.locked_balance, ub.currency,
        COALESCE(deps.total, 0), COALESCE(withs.total, 0), COALESCE(trd.cnt, 0), COALESCE(trd.vol, 0), COALESCE(fees.total, 0)
    FROM public.user_balances ub
    LEFT JOIN (
        SELECT user_id, currency, SUM(amount) AS total FROM public.transaction_ledger
        WHERE transaction_type = 'deposit' AND DATE(created_at) = CURRENT_DATE GROUP BY user_id, currency
    ) deps ON ub.user_id = deps.user_id AND ub.currency = deps.currency
    LEFT JOIN (
        SELECT user_id, currency, SUM(ABS(amount)) AS total FROM public.transaction_ledger
        WHERE transaction_type = 'withdrawal' AND DATE(created_at) = CURRENT_DATE GROUP BY user_id, currency
    ) withs ON ub.user_id = withs.user_id AND ub.currency = withs.currency
    LEFT JOIN (
        SELECT user_id, currency, COUNT(*) AS cnt, SUM(ABS(amount)) AS vol FROM public.transaction_ledger
        WHERE transaction_type IN ('trade_buy', 'trade_sell') AND DATE(created_at) = CURRENT_DATE GROUP BY user_id, currency
    ) trd ON ub.user_id = trd.user_id AND ub.currency = trd.currency
    LEFT JOIN (
        SELECT user_id, currency, SUM(ABS(amount)) AS total FROM public.transaction_ledger
        WHERE transaction_type = 'fee' AND DATE(created_at) = CURRENT_DATE GROUP BY user_id, currency
    ) fees ON ub.user_id = fees.user_id AND ub.currency = fees.currency
    ON CONFLICT (user_id, snapshot_date, currency) DO UPDATE SET
        balance = EXCLUDED.balance, locked_balance = EXCLUDED.locked_balance,
        deposits_today = EXCLUDED.deposits_today, withdrawals_today = EXCLUDED.withdrawals_today,
        trades_today = EXCLUDED.trades_today, volume_today = EXCLUDED.volume_today, fees_today = EXCLUDED.fees_today;

    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RETURN v_cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.calculate_daily_pnl()
RETURNS INTEGER AS $$
DECLARE v_cnt INTEGER;
BEGIN
    UPDATE public.daily_balances db SET
        daily_pnl = db.balance - COALESCE(
            (SELECT balance FROM public.daily_balances prev WHERE prev.user_id = db.user_id AND prev.currency = db.currency AND prev.snapshot_date = db.snapshot_date - INTERVAL '1 day'),
            db.balance - db.deposits_today + db.withdrawals_today
        ) - db.deposits_today + db.withdrawals_today,
        cumulative_pnl = (
            SELECT COALESCE(SUM(prev.daily_pnl), 0) FROM public.daily_balances prev
            WHERE prev.user_id = db.user_id AND prev.currency = db.currency AND prev.snapshot_date <= db.snapshot_date
        )
    WHERE db.snapshot_date = CURRENT_DATE;

    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RETURN v_cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Referrals logic
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_len INTEGER DEFAULT 8)
RETURNS TEXT AS $$
DECLARE v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code TEXT := '';
BEGIN
    FOR i IN 1..p_len LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.create_referral_code(p_user_id UUID, p_type TEXT DEFAULT 'referral')
RETURNS public.referral_codes AS $$
DECLARE v_code TEXT; v_att INT := 0; v_res public.referral_codes;
BEGIN
    LOOP
        v_code := public.generate_referral_code(8);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code);
        v_att := v_att + 1;
        IF v_att > 10 THEN RAISE EXCEPTION 'Generation failure'; END IF;
    END LOOP;
    INSERT INTO public.referral_codes (user_id, code, code_type)
    VALUES (p_user_id, v_code, p_type) RETURNING * INTO v_res;
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.apply_referral_code(
    p_referee UUID, p_code TEXT, p_ip INET DEFAULT NULL, p_ua TEXT DEFAULT NULL, p_fingerprint TEXT DEFAULT NULL
) RETURNS boolean AS $$
DECLARE v_rc public.referral_codes;
BEGIN
    SELECT * INTO v_rc FROM public.referral_codes WHERE LOWER(code) = LOWER(p_code) AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND user_id != p_referee;
    IF v_rc IS NULL THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.referral_tracking WHERE referee_id = p_referee) THEN RETURN false; END IF;

    INSERT INTO public.referral_tracking (referrer_id, referee_id, referral_code_id, signup_ip, signup_user_agent, signup_device_fingerprint)
    VALUES (v_rc.user_id, p_referee, v_rc.id, p_ip, p_ua, p_fingerprint);

    UPDATE public.referral_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = v_rc.id;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.qualify_referral(p_referee UUID, p_reason TEXT DEFAULT 'first_deposit')
RETURNS boolean AS $$
DECLARE v_rt public.referral_tracking; v_rc public.referral_codes; v_bonus DECIMAL;
BEGIN
    SELECT * INTO v_rt FROM public.referral_tracking WHERE referee_id = p_referee AND is_qualified = false;
    IF v_rt IS NULL THEN RETURN false; END IF;

    SELECT * INTO v_rc FROM public.referral_codes WHERE id = v_rt.referral_code_id;
    UPDATE public.referral_tracking SET is_qualified = true, qualified_at = NOW(), qualification_reason = p_reason, status = 'qualified', updated_at = NOW()
    WHERE id = v_rt.id;

    v_bonus := CASE v_rc.tier_level WHEN 1 THEN 5.00 WHEN 2 THEN 10.00 WHEN 3 THEN 15.00 WHEN 4 THEN 25.00 WHEN 5 THEN 50.00 ELSE 5.00 END;
    INSERT INTO public.referral_rewards (user_id, referral_tracking_id, reward_type, amount, currency, status)
    VALUES (v_rt.referrer_id, v_rt.id, 'signup_bonus', v_bonus, 'USDC', 'pending');
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_transaction_history(UUID, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_transactions(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_referral_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(UUID, TEXT, INET, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.qualify_referral(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_user_balance(UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_user_balance(UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_user_balance(UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_balance(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transaction(UUID, TEXT, DECIMAL, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_daily_balance_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_daily_pnl() TO service_role;

GRANT SELECT ON public.referral_stats TO authenticated;
GRANT SELECT ON public.transaction_summary TO authenticated;
GRANT SELECT ON public.user_portfolio_stats TO authenticated;
