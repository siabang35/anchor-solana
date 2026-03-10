import * as crypto from 'crypto';

/**
 * Security Utilities
 * 
 * Collection of security-focused utility functions implementing
 * best practices for authentication and authorization.
 * 
 * OWASP: Cryptographic Failures Prevention
 */

/**
 * Timing-safe string comparison
 * 
 * Prevents timing attacks by ensuring comparison takes
 * constant time regardless of how many characters match.
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }

    const aBuffer = Buffer.from(a, 'utf-8');
    const bBuffer = Buffer.from(b, 'utf-8');

    // If lengths differ, we need to compare anyway to maintain constant time
    if (aBuffer.length !== bBuffer.length) {
        // Compare against self to maintain timing
        crypto.timingSafeEqual(aBuffer, aBuffer);
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Generate cryptographically secure random string
 * 
 * @param length - Desired string length
 * @returns Secure random hex string
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Generate secure random bytes as base64
 * 
 * @param bytes - Number of random bytes
 * @returns Base64 encoded random bytes
 */
export function generateSecureBase64(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Calculate entropy of a string (bits per character)
 * 
 * Higher entropy = harder to guess/crack
 * 
 * @param str - String to measure
 * @returns Entropy in bits per character
 */
export function calculateEntropy(str: string): number {
    if (!str || str.length === 0) return 0;

    const charCounts = new Map<string, number>();
    for (const char of str) {
        charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }

    let entropy = 0;
    const length = str.length;

    for (const count of charCounts.values()) {
        const probability = count / length;
        entropy -= probability * Math.log2(probability);
    }

    return entropy;
}

/**
 * Measure total entropy of a password
 * 
 * @param password - Password to measure
 * @returns Total entropy in bits
 */
export function measurePasswordEntropy(password: string): number {
    if (!password) return 0;

    let charsetSize = 0;

    // Check character classes
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) charsetSize += 32;
    if (/[^\w\s]/.test(password)) charsetSize += 16; // Other special chars

    // Entropy = length * log2(charsetSize)
    return password.length * Math.log2(charsetSize || 1);
}

/**
 * Normalize IP address for consistent storage and comparison
 * 
 * @param ip - Raw IP address
 * @returns Normalized IP address
 */
export function normalizeIpAddress(ip: string | undefined): string {
    if (!ip) return 'unknown';

    // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }

    // Handle localhost variations
    if (ip === '::1' || ip === '127.0.0.1') {
        return 'localhost';
    }

    return ip.trim();
}

/**
 * Generate user agent fingerprint hash
 * 
 * Creates a hash of user agent + relevant headers for
 * session fingerprinting without storing raw data.
 * 
 * @param userAgent - User-Agent header value
 * @param acceptLanguage - Accept-Language header value
 * @returns SHA-256 hash of fingerprint
 */
export function generateFingerprint(
    userAgent: string | undefined,
    acceptLanguage: string | undefined,
    acceptEncoding: string | undefined,
): string {
    const data = [
        userAgent || 'unknown',
        acceptLanguage || 'unknown',
        acceptEncoding || 'unknown',
    ].join('|');

    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Hash sensitive data for logging (doesn't expose actual value)
 * 
 * @param data - Data to hash
 * @returns Short hash for identification
 */
export function hashForLogging(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}

/**
 * Generate a JWT ID (jti) for token uniqueness
 * 
 * @returns Unique JWT ID
 */
export function generateJwtId(): string {
    return crypto.randomUUID();
}

/**
 * Validate that a string looks like a valid JWT
 * 
 * @param token - Token string to validate
 * @returns true if structure is valid
 */
export function isValidJwtStructure(token: string): boolean {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Check each part is valid base64url
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    return parts.every((part) => base64UrlRegex.test(part) && part.length > 0);
}

/**
 * Mask sensitive data for logging
 * 
 * @param data - Data to mask
 * @param visibleChars - Number of visible characters at start/end
 * @returns Masked string
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (!data || data.length <= visibleChars * 2) {
        return '*'.repeat(data?.length || 8);
    }

    const start = data.substring(0, visibleChars);
    const end = data.substring(data.length - visibleChars);
    const masked = '*'.repeat(Math.min(data.length - visibleChars * 2, 10));

    return `${start}${masked}${end}`;
}

/**
 * Check if an email domain is in a blocklist
 * 
 * @param email - Email to check
 * @param blocklist - Array of blocked domains
 * @returns true if domain is blocked
 */
export function isBlockedEmailDomain(
    email: string,
    blocklist: string[] = [],
): boolean {
    if (!email || !email.includes('@')) return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    return blocklist.some(
        (blocked) => domain === blocked.toLowerCase() || domain.endsWith(`.${blocked.toLowerCase()}`),
    );
}

/**
 * Default blocked email domains (disposable email services)
 */
export const DEFAULT_BLOCKED_EMAIL_DOMAINS = [
    'tempmail.com',
    'throwaway.email',
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'trashmail.com',
    'fakeinbox.com',
];
