-- ============================================================================
-- Migration: 029_robust_wallet_sync.sql
-- Purpose: Sync profiles table columns, connect wallet_addresses & connected_wallets tables
--          and ensure case-preservation for Solana wallets.
-- ============================================================================

-- 1. Ensure profiles table has all necessary columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'username') THEN
        ALTER TABLE profiles ADD COLUMN username VARCHAR(30);
        ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
        COMMENT ON COLUMN profiles.username IS 'Unique username for user profile';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'agreed_to_terms_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_terms_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'agreed_to_privacy_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_privacy_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'profile_completed') THEN
        ALTER TABLE profiles ADD COLUMN profile_completed BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'auth_provider') THEN
        ALTER TABLE profiles ADD COLUMN auth_provider TEXT DEFAULT 'email';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'google_id') THEN
        ALTER TABLE profiles ADD COLUMN google_id TEXT;
    END IF;
END $$;

-- 2. Update find_or_create_wallet_user to check BOTH connected_wallets and wallet_addresses tables
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
    v_profile_completed BOOLEAN;
    v_username TEXT;
BEGIN
    -- Step A: First try to find in connected_wallets (verified connection)
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
    
    -- Step B: Try to find in new wallet_addresses table (dynamically provisioned during deployment)
    SELECT wa.user_id, p.profile_completed, p.username
    INTO v_user_id, v_profile_completed, v_username
    FROM wallet_addresses wa
    JOIN profiles p ON p.id = wa.user_id
    WHERE LOWER(wa.address) = LOWER(p_wallet_address)
      AND wa.chain = p_chain;

    IF v_user_id IS NOT NULL THEN
        -- Migrate/link to connected_wallets table as verified
        INSERT INTO connected_wallets (
            user_id, address, chain, wallet_provider, is_verified, verified_at
        ) VALUES (
            v_user_id, 
            CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END, 
            p_chain, 
            p_wallet_provider, 
            true, 
            NOW()
        ) ON CONFLICT (address, chain) DO UPDATE SET
            is_verified = true,
            verified_at = NOW(),
            wallet_provider = EXCLUDED.wallet_provider;

        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;

    -- Step C: Try to find by legacy profiles.wallet_addresses JSONB column
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
            v_user_id, 
            CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END, 
            p_chain, 
            p_wallet_provider, 
            true, 
            NOW()
        ) ON CONFLICT (address, chain) DO NOTHING;
        
        -- Migrate to separate wallet_addresses table
        INSERT INTO wallet_addresses (
            user_id, address, chain, is_primary, wallet_type, is_verified, verified_at
        ) VALUES (
            v_user_id,
            CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
            p_chain,
            true,
            'external',
            true,
            NOW()
        ) ON CONFLICT (address, chain) DO NOTHING;

        RETURN QUERY SELECT v_user_id, FALSE, v_profile_completed, v_username;
        RETURN;
    END IF;
    
    -- Step D: User not found - return NULL to signal backend to provision auth user
    RETURN QUERY SELECT NULL::UUID, TRUE, FALSE, NULL::TEXT;
END;
$$;

-- 3. Update link_wallet_to_user to keep connected_wallets and wallet_addresses in sync
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
    -- Check if wallet is already linked to another user in connected_wallets
    SELECT user_id INTO v_existing_user
    FROM connected_wallets
    WHERE LOWER(address) = LOWER(p_wallet_address) AND chain = p_chain;
    
    IF v_existing_user IS NOT NULL AND v_existing_user != p_user_id THEN
        RETURN QUERY SELECT FALSE, 'Wallet is already linked to another account'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Check if wallet is already linked to another user in wallet_addresses table
    SELECT user_id INTO v_existing_user
    FROM wallet_addresses
    WHERE LOWER(address) = LOWER(p_wallet_address) AND chain = p_chain;

    IF v_existing_user IS NOT NULL AND v_existing_user != p_user_id THEN
        RETURN QUERY SELECT FALSE, 'Wallet is already linked to another account in address records'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- If setting as primary, unset other primary wallets for this user in connected_wallets
    IF p_is_primary THEN
        UPDATE connected_wallets
        SET is_primary = false
        WHERE user_id = p_user_id AND is_primary = true;
        
        UPDATE wallet_addresses
        SET is_primary = false
        WHERE user_id = p_user_id AND is_primary = true;
    END IF;
    
    -- Insert or update the wallet connection in connected_wallets table
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

    -- Insert or update in separate wallet_addresses table to keep it in sync
    INSERT INTO wallet_addresses (
        user_id,
        address,
        chain,
        is_primary,
        wallet_type,
        is_verified,
        verified_at
    ) VALUES (
        p_user_id,
        CASE WHEN p_chain = 'solana' THEN p_wallet_address ELSE LOWER(p_wallet_address) END,
        p_chain,
        p_is_primary,
        'external',
        true,
        NOW()
    )
    ON CONFLICT (address, chain) DO UPDATE SET
        is_verified = true,
        verified_at = NOW(),
        is_primary = EXCLUDED.is_primary;
    
    -- Update last signature timestamp in connected_wallets
    UPDATE connected_wallets 
    SET last_signature_at = NOW()
    WHERE id = v_wallet_id;
    
    -- Sync user profile wallet_addresses field for backward compatibility
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

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
