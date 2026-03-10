import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
    /**
     * Maximum number of requests allowed in the time window
     */
    limit: number;

    /**
     * Time window in seconds
     */
    windowSeconds: number;
}

/**
 * Rate Limit Decorator
 * 
 * Apply to controller methods to enable rate limiting.
 * 
 * @example
 * ```typescript
 * @RateLimit({ limit: 10, windowSeconds: 60 }) // 10 requests per minute
 * @Post('login')
 * async login() { ... }
 * ```
 */
export const RateLimit = (options: RateLimitOptions) =>
    SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Predefined rate limit configurations
 */
export const RateLimits = {
    /** Very strict: 5 requests per minute (login, signup) */
    STRICT: { limit: 5, windowSeconds: 60 },

    /** Standard: 30 requests per minute */
    STANDARD: { limit: 30, windowSeconds: 60 },

    /** Relaxed: 100 requests per minute */
    RELAXED: { limit: 100, windowSeconds: 60 },

    /** High frequency: 300 requests per minute (reads) */
    HIGH: { limit: 300, windowSeconds: 60 },

    /** Admin: 60 requests per minute */
    ADMIN: { limit: 60, windowSeconds: 60 },
};
