-- ============================================================================
-- DeJaVu - Fix Withdrawal Approvals Relationship (031_fix_withdrawal_approvals_relation.sql)
-- Add explicit foreign key to profiles to enable PostgREST embedding
-- ============================================================================

-- Add FK from withdrawal_approvals.user_id to profiles.id
-- This allows relations like "user:profiles!user_id" to work in Supabase queries
ALTER TABLE public.withdrawal_approvals
    ADD CONSTRAINT fk_withdrawal_approvals_profiles
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id);

-- Refresh the schema cache is usually automatic, but this defines the relationship
