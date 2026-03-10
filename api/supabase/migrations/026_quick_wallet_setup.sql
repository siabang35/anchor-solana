-- Quick setup for wallet connect authentication
-- Run this in your Supabase SQL Editor

-- Create the wallet_auth_nonces table for storing nonces
CREATE TABLE IF NOT EXISTS wallet_auth_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    message TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'dejavu.app',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    ip_address INET,
    user_agent TEXT,
    used_at TIMESTAMPTZ,
    used_by_user_id UUID,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_nonce ON wallet_auth_nonces(nonce) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_address ON wallet_auth_nonces(LOWER(wallet_address), chain);
CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_expires ON wallet_auth_nonces(expires_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE wallet_auth_nonces ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Service role manages nonces" ON wallet_auth_nonces;
CREATE POLICY "Service role manages nonces" ON wallet_auth_nonces
    FOR ALL USING (auth.role() = 'service_role');

-- Create connected_wallets table
CREATE TABLE IF NOT EXISTS connected_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism')),
    wallet_provider TEXT NOT NULL CHECK (wallet_provider IN ('metamask', 'phantom', 'coinbase', 'slush', 'walletconnect', 'other')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    last_signature_at TIMESTAMPTZ,
    label TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    wallet_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(address, chain)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_connected_wallets_user_id ON connected_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_wallets_address_chain ON connected_wallets(LOWER(address), chain);

-- Enable RLS
ALTER TABLE connected_wallets ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallets
DROP POLICY IF EXISTS "Users can view own connected wallets" ON connected_wallets;
CREATE POLICY "Users can view own connected wallets" ON connected_wallets
    FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role manages all connected wallets" ON connected_wallets;
CREATE POLICY "Service role manages all connected wallets" ON connected_wallets
    FOR ALL USING (auth.role() = 'service_role');

-- Done!
SELECT 'Wallet connect tables created successfully!' as status;
