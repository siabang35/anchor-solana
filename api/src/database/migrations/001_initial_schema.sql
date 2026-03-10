-- ============================================
-- DeJaVu Database Migrations
-- Supabase/PostgreSQL Schema Setup
-- ============================================

-- ============================================
-- 1. User Profiles Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  wallet_addresses JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 2. Wallet Addresses Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.wallet_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana', 'sui', 'base')),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(address, chain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON public.wallet_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address ON public.wallet_addresses(address);

-- Enable RLS
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own wallets"
  ON public.wallet_addresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wallets"
  ON public.wallet_addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wallets"
  ON public.wallet_addresses FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all wallets"
  ON public.wallet_addresses FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 3. Refresh Tokens Table (for custom JWT)
-- ============================================
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens(token_hash);

-- Enable RLS
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access refresh tokens
CREATE POLICY "Service role only for refresh tokens"
  ON public.refresh_tokens FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 4. Updated At Trigger Function
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to profiles
DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- 5. Profile Creation Trigger
-- Automatically creates profile on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
