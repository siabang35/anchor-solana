-- ============================================================================
-- Migration: 027_add_profiles_missing_columns.sql
-- Purpose: Add missing columns to profiles table for wallet & Google authentication
-- ============================================================================

-- Add username column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'username') THEN
        ALTER TABLE profiles ADD COLUMN username VARCHAR(30);
        ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
        COMMENT ON COLUMN profiles.username IS 'Unique username for user profile';
    END IF;
END $$;

-- Add agreed_to_terms_at column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'agreed_to_terms_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_terms_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add agreed_to_privacy_at column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'agreed_to_privacy_at') THEN
        ALTER TABLE profiles ADD COLUMN agreed_to_privacy_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add profile_completed column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'profile_completed') THEN
        ALTER TABLE profiles ADD COLUMN profile_completed BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add auth_provider column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'auth_provider') THEN
        ALTER TABLE profiles ADD COLUMN auth_provider TEXT DEFAULT 'email';
    END IF;
END $$;

-- Add google_id column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'google_id') THEN
        ALTER TABLE profiles ADD COLUMN google_id TEXT;
    END IF;
END $$;
