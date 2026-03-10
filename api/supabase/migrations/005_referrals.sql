-- ============================================================================
-- DeJaVu - Referrals Schema (005_referrals.sql)
-- Referral/affiliate program with builder codes and reward tracking
-- ============================================================================

-- ============================================================================
-- REFERRAL_CODES TABLE
-- Unique referral/builder codes per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Code info
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL DEFAULT 'referral' CHECK (code_type IN ('referral', 'builder', 'affiliate', 'promo')),
    
    -- Display info
    label TEXT,
    description TEXT,
    
    -- Commission rates (percentage)
    referrer_commission DECIMAL(5,2) NOT NULL DEFAULT 10.00 CHECK (referrer_commission >= 0 AND referrer_commission <= 100),
    referee_discount DECIMAL(5,2) NOT NULL DEFAULT 5.00 CHECK (referee_discount >= 0 AND referee_discount <= 100),
    
    -- Tier level (for different commission structures)
    tier_level INTEGER NOT NULL DEFAULT 1 CHECK (tier_level >= 1 AND tier_level <= 5),
    
    -- Limits
    max_uses INTEGER, -- NULL = unlimited
    current_uses INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_referral_codes_type ON public.referral_codes(code_type);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Users can view their own codes
DROP POLICY IF EXISTS "Users can view own referral codes" ON public.referral_codes;
CREATE POLICY "Users can view own referral codes" ON public.referral_codes
    FOR SELECT USING (auth.uid() = user_id);

-- Active codes are publicly viewable (for validation)
DROP POLICY IF EXISTS "Active codes are publicly viewable" ON public.referral_codes;
CREATE POLICY "Active codes are publicly viewable" ON public.referral_codes
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all referral codes" ON public.referral_codes;
CREATE POLICY "Service role can manage all referral codes" ON public.referral_codes
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- REFERRAL_TRACKING TABLE
-- Who referred whom and signup tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.referral_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referral relationship
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
    
    -- Attribution data (for fraud detection)
    signup_ip INET,
    signup_user_agent TEXT,
    signup_device_fingerprint TEXT,
    
    -- Qualification status
    is_qualified BOOLEAN NOT NULL DEFAULT false, -- True when referee meets requirements
    qualified_at TIMESTAMPTZ,
    qualification_reason TEXT, -- e.g., 'first_deposit', 'first_trade'
    
    -- Referral value tracking
    referee_total_volume DECIMAL(20,6) NOT NULL DEFAULT 0,
    referee_total_fees DECIMAL(20,6) NOT NULL DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'rewarded', 'rejected', 'fraudulent')),
    rejection_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate referrals
    UNIQUE(referee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referrer ON public.referral_tracking(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referee ON public.referral_tracking(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_code ON public.referral_tracking(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_status ON public.referral_tracking(status);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_qualified ON public.referral_tracking(is_qualified, created_at);

-- Enable RLS
ALTER TABLE public.referral_tracking ENABLE ROW LEVEL SECURITY;

-- Referrers can view their referrals
DROP POLICY IF EXISTS "Referrers can view their referrals" ON public.referral_tracking;
CREATE POLICY "Referrers can view their referrals" ON public.referral_tracking
    FOR SELECT USING (auth.uid() = referrer_id);

-- Referees can view their own referral status
DROP POLICY IF EXISTS "Referees can view own referral status" ON public.referral_tracking;
CREATE POLICY "Referees can view own referral status" ON public.referral_tracking
    FOR SELECT USING (auth.uid() = referee_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all referrals" ON public.referral_tracking;
CREATE POLICY "Service role can manage all referrals" ON public.referral_tracking
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- REFERRAL_REWARDS TABLE
-- Reward tracking and payout history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reward info
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_tracking_id UUID REFERENCES public.referral_tracking(id) ON DELETE SET NULL,
    
    -- Reward details
    reward_type TEXT NOT NULL CHECK (reward_type IN ('signup_bonus', 'trading_commission', 'milestone_bonus', 'promo')),
    amount DECIMAL(20,6) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USDC',
    
    -- Source transaction (if commission)
    source_transaction_type TEXT, -- 'trade', 'deposit', etc.
    source_transaction_id UUID,
    source_amount DECIMAL(20,6),
    commission_rate DECIMAL(5,2),
    
    -- Payout status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Payout details
    payout_tx_hash TEXT,
    payout_chain TEXT,
    payout_address TEXT,
    
    -- For non-custodial: require user signature for claim
    claim_signature TEXT,
    claim_nonce TEXT UNIQUE,
    claimed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON public.referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_tracking ON public.referral_rewards(referral_tracking_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON public.referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_created ON public.referral_rewards(created_at DESC);

-- Enable RLS
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Users can view their own rewards
DROP POLICY IF EXISTS "Users can view own referral rewards" ON public.referral_rewards;
CREATE POLICY "Users can view own referral rewards" ON public.referral_rewards
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage all referral rewards" ON public.referral_rewards;
CREATE POLICY "Service role can manage all referral rewards" ON public.referral_rewards
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- REFERRAL_STATS VIEW
-- Aggregated referral statistics per user
-- ============================================================================
CREATE OR REPLACE VIEW public.referral_stats AS
SELECT 
    rc.user_id,
    rc.code,
    rc.code_type,
    rc.tier_level,
    rc.current_uses AS total_signups,
    COALESCE(qualified.count, 0) AS qualified_referrals,
    COALESCE(rewards.total_earned, 0) AS total_earned,
    COALESCE(rewards.pending_amount, 0) AS pending_earnings,
    COALESCE(volume.total_volume, 0) AS referral_volume
FROM public.referral_codes rc
LEFT JOIN (
    SELECT referral_code_id, COUNT(*) as count
    FROM public.referral_tracking
    WHERE is_qualified = true
    GROUP BY referral_code_id
) qualified ON rc.id = qualified.referral_code_id
LEFT JOIN (
    SELECT 
        rr.user_id,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
    FROM public.referral_rewards rr
    GROUP BY rr.user_id
) rewards ON rc.user_id = rewards.user_id
LEFT JOIN (
    SELECT 
        rt.referrer_id,
        SUM(rt.referee_total_volume) as total_volume
    FROM public.referral_tracking rt
    GROUP BY rt.referrer_id
) volume ON rc.user_id = volume.referrer_id;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_length INTEGER DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_code TEXT := '';
    v_i INTEGER;
BEGIN
    FOR v_i IN 1..p_length LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Create referral code for user
CREATE OR REPLACE FUNCTION public.create_referral_code(
    p_user_id UUID,
    p_code_type TEXT DEFAULT 'referral'
)
RETURNS public.referral_codes AS $$
DECLARE
    v_code TEXT;
    v_attempt INTEGER := 0;
    v_result public.referral_codes;
BEGIN
    -- Generate unique code
    LOOP
        v_code := public.generate_referral_code(8);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code);
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN
            RAISE EXCEPTION 'Failed to generate unique referral code';
        END IF;
    END LOOP;
    
    INSERT INTO public.referral_codes (user_id, code, code_type)
    VALUES (p_user_id, v_code, p_code_type)
    RETURNING * INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply referral code during signup
CREATE OR REPLACE FUNCTION public.apply_referral_code(
    p_referee_id UUID,
    p_code TEXT,
    p_ip INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_code_record public.referral_codes;
BEGIN
    -- Find active code
    SELECT * INTO v_code_record
    FROM public.referral_codes
    WHERE LOWER(code) = LOWER(p_code)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses IS NULL OR current_uses < max_uses)
      AND user_id != p_referee_id; -- Can't refer yourself
    
    IF v_code_record IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if referee already has a referrer
    IF EXISTS (SELECT 1 FROM public.referral_tracking WHERE referee_id = p_referee_id) THEN
        RETURN FALSE;
    END IF;
    
    -- Create tracking record
    INSERT INTO public.referral_tracking (
        referrer_id, referee_id, referral_code_id,
        signup_ip, signup_user_agent, signup_device_fingerprint
    )
    VALUES (
        v_code_record.user_id, p_referee_id, v_code_record.id,
        p_ip, p_user_agent, p_device_fingerprint
    );
    
    -- Increment code usage
    UPDATE public.referral_codes
    SET current_uses = current_uses + 1, updated_at = NOW()
    WHERE id = v_code_record.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Qualify referral (called when referee meets requirements)
CREATE OR REPLACE FUNCTION public.qualify_referral(
    p_referee_id UUID,
    p_reason TEXT DEFAULT 'first_deposit'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_tracking public.referral_tracking;
    v_code public.referral_codes;
    v_bonus_amount DECIMAL(20,6);
BEGIN
    -- Get tracking record
    SELECT * INTO v_tracking
    FROM public.referral_tracking
    WHERE referee_id = p_referee_id AND is_qualified = false;
    
    IF v_tracking IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get code for commission rate
    SELECT * INTO v_code
    FROM public.referral_codes
    WHERE id = v_tracking.referral_code_id;
    
    -- Update tracking
    UPDATE public.referral_tracking
    SET 
        is_qualified = true,
        qualified_at = NOW(),
        qualification_reason = p_reason,
        status = 'qualified',
        updated_at = NOW()
    WHERE id = v_tracking.id;
    
    -- Create signup bonus for referrer (fixed amount based on tier)
    v_bonus_amount := CASE v_code.tier_level
        WHEN 1 THEN 5.00
        WHEN 2 THEN 10.00
        WHEN 3 THEN 15.00
        WHEN 4 THEN 25.00
        WHEN 5 THEN 50.00
        ELSE 5.00
    END;
    
    INSERT INTO public.referral_rewards (
        user_id, referral_tracking_id, reward_type, amount, currency, status
    )
    VALUES (
        v_tracking.referrer_id, v_tracking.id, 'signup_bonus', v_bonus_amount, 'USDC', 'pending'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE TRIGGER update_referral_codes_updated_at
    BEFORE UPDATE ON public.referral_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_tracking_updated_at
    BEFORE UPDATE ON public.referral_tracking
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.generate_referral_code TO service_role;
GRANT EXECUTE ON FUNCTION public.create_referral_code TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_referral_code TO service_role;
GRANT EXECUTE ON FUNCTION public.qualify_referral TO service_role;
GRANT SELECT ON public.referral_stats TO authenticated;
