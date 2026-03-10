-- Ensure bio column exists in profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- Verify RLS policies (optional, but good for safety)
-- The existing policies in 000_foundation.sql cover this:
-- CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Grant access just in case (though usually covered by RLS and default grants)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
