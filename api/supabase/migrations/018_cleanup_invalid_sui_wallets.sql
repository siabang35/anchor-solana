-- ============================================
-- 018: Cleanup Invalid SUI Wallet Addresses
-- ============================================
-- Description: Marks invalid SUI wallet addresses as inactive to force regeneration.
--              SUI addresses must be exactly 66 characters (0x + 64 hex chars).
--              Any SUI wallet with a shorter address (e.g., 42-char EVM address) is invalid.
-- 
-- SECURITY: This cleanup ensures users get valid SUI addresses on their next request.
-- ============================================

BEGIN;

-- Mark invalid SUI wallets as inactive
-- Valid SUI addresses are 66 characters: 0x (2) + 64 hex characters
UPDATE public.privy_wallets
SET 
    is_active = false
WHERE 
    chain = 'sui'
    AND LENGTH(wallet_address) != 66;

-- Log the number of affected rows for audit purposes
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO affected_count
    FROM public.privy_wallets
    WHERE chain = 'sui' AND is_active = false AND LENGTH(wallet_address) != 66;
    
    RAISE NOTICE 'Marked % invalid SUI wallet(s) as inactive', affected_count;
END $$;

COMMIT;
