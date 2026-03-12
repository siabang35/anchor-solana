import { z } from 'zod';

// ==========================================
// Regex Patterns
// ==========================================

export const PATTERNS = {
    // EVM Address: 0x followed by 40 hex chars
    EVM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,

    // Solana Address: Base58, 32-44 chars
    SOLANA_ADDRESS: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,

    // SUI Address: 0x followed by 64 hex chars
    SUI_ADDRESS: /^0x[a-fA-F0-9]{64}$/,

    // Username: Alphanumeric, underscores, 3-20 chars
    USERNAME: /^[a-zA-Z0-9_]{3,20}$/,

    // Password: Min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special
    PASSWORD_COMPLEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,

    // IP Address (IPv4)
    IPV4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
};

// ==========================================
// Zod Schemas
// ==========================================

export const schemas = {
    // Address Validation
    evmAddress: z.string().regex(PATTERNS.EVM_ADDRESS, 'Invalid EVM address format'),
    solanaAddress: z.string().regex(PATTERNS.SOLANA_ADDRESS, 'Invalid Solana address format'),
    suiAddress: z.string().regex(PATTERNS.SUI_ADDRESS, 'Invalid SUI address format'),

    // Generic Address (checks if it matches any known chain format)
    anyAddress: z.string().refine((val) => {
        return PATTERNS.EVM_ADDRESS.test(val) ||
            PATTERNS.SOLANA_ADDRESS.test(val) ||
            PATTERNS.SUI_ADDRESS.test(val);
    }, 'Invalid wallet address format'),

    // Search Query Sanitization
    searchQuery: z.string()
        .max(100, 'Search query too long')
        .transform(val => val.replace(/[<>]/g, '').trim()), // Basic sanitization

    // Admin Actions
    suspendUser: z.object({
        userId: z.string().uuid('Invalid User ID'),
        reason: z.string().min(5, 'Reason must be at least 5 characters').max(200, 'Reason too long'),
    }),

    approveWithdrawal: z.object({
        withdrawalId: z.string().uuid(),
        notes: z.string().max(500).optional(),
    }),

    rejectWithdrawal: z.object({
        withdrawalId: z.string().uuid(),
        reason: z.string().min(5, 'Rejection reason is required').max(500),
    }),

    blockIp: z.object({
        ipAddress: z.string().regex(PATTERNS.IPV4, 'Invalid IP address'),
        reason: z.string().min(3, 'Reason required'),
    }),
};

// ==========================================
// Helper Functions
// ==========================================

/**
 * Validates a wallet address for a specific chain
 */
export function isValidAddress(address: string, chain: string): boolean {
    const normalizedChain = chain.toLowerCase();

    if (normalizedChain === 'ethereum' || normalizedChain === 'eth' || normalizedChain === 'base' || normalizedChain === 'polygon') {
        return PATTERNS.EVM_ADDRESS.test(address);
    }

    if (normalizedChain === 'solana' || normalizedChain === 'sol') {
        return PATTERNS.SOLANA_ADDRESS.test(address);
    }

    if (normalizedChain === 'sui') {
        return PATTERNS.SUI_ADDRESS.test(address);
    }

    // Fallback if chain is unknown but address looks valid for some chain
    return schemas.anyAddress.safeParse(address).success;
}

/**
 * Mask an email address for privacy (e.g., j***@gmail.com)
 */
export function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}
