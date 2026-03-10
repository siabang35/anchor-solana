/**
 * Address Validator Utility
 * 
 * Provides chain-specific address validation with checksum verification.
 * OWASP A03:2021 - Injection Prevention
 * 
 * Supported chains:
 * - EVM (Ethereum, Base): EIP-55 checksum validation
 * - Solana: Base58 validation
 * - Sui: Hex format with 66-char length
 */

import { createHash } from 'crypto';

/**
 * Validate an Ethereum/EVM address with EIP-55 checksum
 */
export function isValidEvmAddress(address: string): boolean {
    // Basic format check
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return false;
    }

    // If all lowercase or all uppercase, it's valid (no checksum)
    const addressLower = address.slice(2).toLowerCase();
    const addressUpper = address.slice(2).toUpperCase();

    if (address.slice(2) === addressLower || address.slice(2) === addressUpper) {
        return true;
    }

    // Verify EIP-55 checksum
    return verifyEvmChecksum(address);
}

/**
 * Verify EIP-55 checksum for an Ethereum address
 */
function verifyEvmChecksum(address: string): boolean {
    const addressLower = address.slice(2).toLowerCase();
    const hash = createHash('sha3-256').update(addressLower).digest('hex');

    for (let i = 0; i < 40; i++) {
        const char = addressLower[i];
        const hashChar = parseInt(hash[i], 16);

        if (hashChar >= 8) {
            // Should be uppercase
            if (address[i + 2] !== char.toUpperCase()) {
                return false;
            }
        } else {
            // Should be lowercase
            if (address[i + 2] !== char.toLowerCase()) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Convert an EVM address to checksummed format
 */
export function toChecksumAddress(address: string): string {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Invalid EVM address format');
    }

    const addressLower = address.slice(2).toLowerCase();
    const hash = createHash('sha3-256').update(addressLower).digest('hex');

    let checksumAddress = '0x';
    for (let i = 0; i < 40; i++) {
        const char = addressLower[i];
        const hashChar = parseInt(hash[i], 16);

        if (hashChar >= 8) {
            checksumAddress += char.toUpperCase();
        } else {
            checksumAddress += char;
        }
    }

    return checksumAddress;
}

/**
 * Base58 alphabet for Solana addresses
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Validate a Solana address (Base58 encoded, 32-44 characters)
 */
export function isValidSolanaAddress(address: string): boolean {
    // Length check (typically 32-44 characters)
    if (address.length < 32 || address.length > 44) {
        return false;
    }

    // Check all characters are valid Base58
    for (const char of address) {
        if (!BASE58_ALPHABET.includes(char)) {
            return false;
        }
    }

    return true;
}

/**
 * Validate a Sui address (0x prefix + 64 hex characters = 66 total)
 */
export function isValidSuiAddress(address: string): boolean {
    // Must be exactly 66 characters: 0x + 64 hex chars
    if (address.length !== 66) {
        return false;
    }

    // Must start with 0x
    if (!address.startsWith('0x')) {
        return false;
    }

    // Remaining 64 characters must be hex
    const hexPart = address.slice(2);
    return /^[a-fA-F0-9]{64}$/.test(hexPart);
}

/**
 * Validate address based on chain type
 */
export function isValidAddress(address: string, chain: string): boolean {
    switch (chain.toLowerCase()) {
        case 'ethereum':
        case 'base':
            return isValidEvmAddress(address);
        case 'solana':
            return isValidSolanaAddress(address);
        case 'sui':
            return isValidSuiAddress(address);
        default:
            return false;
    }
}

/**
 * Get expected address length for a chain
 */
export function getExpectedAddressLength(chain: string): { min: number; max: number } {
    switch (chain.toLowerCase()) {
        case 'ethereum':
        case 'base':
            return { min: 42, max: 42 };
        case 'solana':
            return { min: 32, max: 44 };
        case 'sui':
            return { min: 66, max: 66 };
        default:
            return { min: 0, max: 0 };
    }
}

/**
 * Sanitize address input - trim whitespace and validate format
 */
export function sanitizeAddress(address: string, chain: string): string | null {
    if (!address || typeof address !== 'string') {
        return null;
    }

    const trimmed = address.trim();

    if (!isValidAddress(trimmed, chain)) {
        return null;
    }

    // For EVM, return checksummed version
    if (chain.toLowerCase() === 'ethereum' || chain.toLowerCase() === 'base') {
        try {
            return toChecksumAddress(trimmed);
        } catch {
            return null;
        }
    }

    return trimmed;
}

/**
 * Validate transaction hash based on chain
 */
export function isValidTxHash(txHash: string, chain: string): boolean {
    switch (chain.toLowerCase()) {
        case 'ethereum':
        case 'base':
            // EVM tx hash: 0x + 64 hex chars
            return /^0x[a-fA-F0-9]{64}$/.test(txHash);
        case 'solana':
            // Solana signature: Base58, 87-88 chars
            return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(txHash);
        case 'sui':
            // Sui digest: Base58 or hex format
            return /^[a-fA-F0-9]{64}$/.test(txHash) || /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash);
        default:
            return false;
    }
}
