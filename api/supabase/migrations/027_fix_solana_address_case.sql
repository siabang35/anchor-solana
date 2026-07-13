-- ============================================================================
-- Migration: 027_fix_solana_address_case.sql
-- Purpose: Preserve case-sensitivity for Solana wallet addresses in DB
-- ============================================================================

-- 1. Update log_wallet_auth_attempt to preserve Solana address case
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
    
    -- Insert attempt record - Keep Solana address case-sensitive
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
        CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
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


-- 2. Update find_or_create_wallet_user to migrate addresses with case preservation for Solana
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
        -- Migrate to connected_wallets table - Keep Solana address case-sensitive
        INSERT INTO connected_wallets (
            user_id, address, chain, wallet_provider, is_verified, verified_at
        ) VALUES (
            v_user_id, 
            CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END, 
            p_chain, 
            p_wallet_provider, 
            true, 
            NOW()
        ) ON CONFLICT (address, chain) DO NOTHING;
        
        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- User not found - signal that new user creation is needed
    RETURN QUERY SELECT NULL::UUID, TRUE, FALSE, NULL::TEXT;
END;
$$;


-- 3. Update link_wallet_to_user to keep Solana address case-sensitive
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
    
    -- Insert or update the wallet connection - Keep Solana address case-sensitive
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
        CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
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
    
    -- Sync user profile wallet_addresses field
    -- Update or insert JSONB array for backward compatibility
    UPDATE profiles
    SET 
        wallet_addresses = COALESCE(
            (
                SELECT jsonb_agg(
                    CASE 
                        WHEN LOWER(elem->>'address') = LOWER(p_wallet_address) AND elem->>'chain' = p_chain THEN
                            jsonb_build_object(
                                'address', CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
                                'chain', p_chain,
                                'isPrimary', p_is_primary
                            )
                        ELSE elem
                    END
                )
                FROM jsonb_array_elements(COALESCE(wallet_addresses, '[]'::jsonb)) AS elem
            ),
            '[]'::jsonb
        )
    WHERE id = p_user_id;
    
    -- If not already present in jsonb, add it
    UPDATE profiles
    SET wallet_addresses = COALESCE(wallet_addresses, '[]'::jsonb) || jsonb_build_object(
        'address', CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
        'chain', p_chain,
        'isPrimary', p_is_primary
    )::jsonb
    WHERE id = p_user_id
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(wallet_addresses, '[]'::jsonb)) AS elem
          WHERE LOWER(elem->>'address') = LOWER(p_wallet_address) AND elem->>'chain' = p_chain
      );
      
    RETURN QUERY SELECT TRUE, 'Wallet linked successfully'::TEXT, v_wallet_id;
END;
$$;
