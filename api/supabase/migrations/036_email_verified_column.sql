-- ============================================================================
-- DeJaVu - Email Verification Column (036_email_verified_column.sql)
-- Adds email_verified column to profiles table for wallet users
-- ============================================================================

-- Add email_verified column to profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'email_verified'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN email_verified BOOLEAN DEFAULT false;
        
        -- Set email_verified = true for users who have existing verified emails
        -- (e.g., signed up via email OTP)
        UPDATE public.profiles 
        SET email_verified = true 
        WHERE email IS NOT NULL 
        AND auth_provider IN ('email', 'google');
    END IF;
END
$$;

-- Create index for email_verified queries
CREATE INDEX IF NOT EXISTS idx_profiles_email_verified 
    ON public.profiles(email_verified) 
    WHERE email IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.profiles.email_verified IS 
    'Whether the email address has been verified. Set true after clicking verification link.';
