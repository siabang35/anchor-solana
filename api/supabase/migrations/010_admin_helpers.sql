-- ============================================================================
-- Admin Helpers (010_admin_helpers.sql)
-- Helper functions to manage admin access securely
-- ============================================================================

-- Function to easily promote a user to super admin by email
-- Usage: SELECT public.promote_to_super_admin('user@example.com');
CREATE OR REPLACE FUNCTION public.promote_to_super_admin(p_email TEXT)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
BEGIN
    -- Get User ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN 'Error: User with email ' || p_email || ' not found.';
    END IF;

    -- Get Super Admin Role ID
    SELECT id INTO v_role_id FROM public.admin_roles WHERE name = 'super_admin';
    
    IF v_role_id IS NULL THEN
        RETURN 'Error: Super admin role not defined in admin_roles table.';
    END IF;

    -- Insert or Update admin_users table
    -- Note: mfa_required is set to false for development ease
    INSERT INTO public.admin_users (user_id, role_id, is_active, mfa_required, mfa_verified, notes)
    VALUES (v_user_id, v_role_id, true, false, true, 'Promoted via helper function')
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        role_id = EXCLUDED.role_id,
        is_active = true,
        mfa_required = false,
        mfa_verified = true,
        updated_at = NOW();

    RETURN 'Success: User ' || p_email || ' has been promoted to Super Admin.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to postgres and service_role (for initial setup)
GRANT EXECUTE ON FUNCTION public.promote_to_super_admin TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_to_super_admin TO postgres;
