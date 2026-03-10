/**
 * Rate Limiter Middleware
 * 
 * Global rate limiting middleware with sliding window algorithm.
 * Provides protection against abuse and DDoS attacks.
 * 
 * Features:
 * - Per-IP rate limiting
 * - Per-user rate limiting (authenticated)
 * - Endpoint-specific limits
 * - Automatic ban for abuse detection
 * - Memory-based storage (can be extended to Redis)
 */

import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface RateLimitEntry {
    count: number;
    windowStart: number;
    violations: number;
    blockedUntil?: number;
}

export interface RateLimitConfig {
    windowMs: number;           // Time window in milliseconds
    maxRequests: number;        // Max requests per window
    skipSuccessful?: boolean;   // Only count failed requests
    blockDurationMs?: number;   // Duration to block after violations
    violationThreshold?: number; // Number of violations before blocking
    keyGenerator?: (req: Request) => string;
    skipIf?: (req: Request) => boolean;
}

// Default configurations for different endpoint types
export const RATE_LIMIT_CONFIGS = {
    default: {
        windowMs: 60 * 1000,        // 1 minute
        maxRequests: 100,           // 100 requests per minute
        blockDurationMs: 5 * 60 * 1000, // 5 minute block
        violationThreshold: 3,
    },
    strict: {
        windowMs: 60 * 1000,
        maxRequests: 30,
        blockDurationMs: 15 * 60 * 1000,
        violationThreshold: 2,
    },
    auth: {
        windowMs: 60 * 1000,
        maxRequests: 10,            // 10 login attempts per minute
        blockDurationMs: 30 * 60 * 1000, // 30 minute block
        violationThreshold: 5,
    },
    sync: {
        windowMs: 5 * 60 * 1000,    // 5 minutes
        maxRequests: 10,            // 10 syncs per 5 minutes
        blockDurationMs: 10 * 60 * 1000,
        violationThreshold: 2,
    },
};

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
    private readonly logger = new Logger(RateLimiterMiddleware.name);
    private readonly store = new Map<string, RateLimitEntry>();
    private readonly config: RateLimitConfig;

    // Clean up old entries periodically
    private readonly cleanupInterval: NodeJS.Timeout;

    constructor(config?: Partial<RateLimitConfig>) {
        this.config = {
            ...RATE_LIMIT_CONFIGS.default,
            ...config,
        };

        // Cleanup every minute
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    }

    /**
     * Generate a unique key for rate limiting
     */
    private getKey(req: Request): string {
        if (this.config.keyGenerator) {
            return this.config.keyGenerator(req);
        }

        // Use IP + user ID if authenticated
        const ip = this.getClientIp(req);
        const userId = (req as any).user?.id;

        return userId ? `user:${userId}` : `ip:${ip}`;
    }

    /**
     * Get client IP address
     */
    private getClientIp(req: Request): string {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
            return ips[0].trim();
        }

        return req.ip || req.socket.remoteAddress || 'unknown';
    }

    /**
     * Check if request should be rate limited
     */
    use(req: Request, res: Response, next: NextFunction): void {
        // Skip if configured to skip
        if (this.config.skipIf && this.config.skipIf(req)) {
            return next();
        }

        const key = this.getKey(req);
        const now = Date.now();

        let entry = this.store.get(key);

        // Check if blocked
        if (entry?.blockedUntil && now < entry.blockedUntil) {
            const remainingMs = entry.blockedUntil - now;
            const remainingMinutes = Math.ceil(remainingMs / 60000);

            this.logger.warn(`Blocked request from ${key}. Remaining: ${remainingMinutes}m`);

            res.setHeader('Retry-After', Math.ceil(remainingMs / 1000));
            res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', entry.blockedUntil);

            throw new HttpException(
                `Too many requests. Please retry after ${remainingMinutes} minute(s).`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // Initialize or reset window if expired
        if (!entry || (now - entry.windowStart) >= this.config.windowMs) {
            entry = {
                count: 0,
                windowStart: now,
                violations: entry?.violations || 0,
            };
        }

        // Increment counter
        entry.count++;

        // Check if limit exceeded
        if (entry.count > this.config.maxRequests) {
            entry.violations++;

            // Block if too many violations
            if (entry.violations >= (this.config.violationThreshold || 3)) {
                entry.blockedUntil = now + (this.config.blockDurationMs || 300000);
                this.logger.warn(
                    `Blocking ${key} for ${(this.config.blockDurationMs || 300000) / 60000}m after ${entry.violations} violations`
                );
            }

            this.store.set(key, entry);

            const retryAfterMs = this.config.windowMs - (now - entry.windowStart);
            res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
            res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', entry.windowStart + this.config.windowMs);

            throw new HttpException(
                'Rate limit exceeded. Please slow down.',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // Update store
        this.store.set(key, entry);

        // Set rate limit headers
        const remaining = Math.max(0, this.config.maxRequests - entry.count);
        const reset = entry.windowStart + this.config.windowMs;

        res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', reset);

        next();
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.store.entries()) {
            // Remove if window expired and not blocked
            if ((now - entry.windowStart) >= this.config.windowMs * 2) {
                if (!entry.blockedUntil || now >= entry.blockedUntil) {
                    this.store.delete(key);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
        }
    }

    /**
     * Get current rate limit status for a key
     */
    getStatus(key: string): RateLimitEntry | undefined {
        return this.store.get(key);
    }

    /**
     * Manually unblock a key
     */
    unblock(key: string): boolean {
        const entry = this.store.get(key);
        if (entry?.blockedUntil) {
            delete entry.blockedUntil;
            entry.violations = 0;
            this.store.set(key, entry);
            this.logger.log(`Manually unblocked: ${key}`);
            return true;
        }
        return false;
    }

    /**
     * Reset all entries for a key
     */
    reset(key: string): void {
        this.store.delete(key);
        this.logger.log(`Reset rate limit for: ${key}`);
    }

    /**
     * Get all blocked entries
     */
    getBlockedEntries(): Array<{ key: string; blockedUntil: number; violations: number }> {
        const blocked: Array<{ key: string; blockedUntil: number; violations: number }> = [];
        const now = Date.now();

        for (const [key, entry] of this.store.entries()) {
            if (entry.blockedUntil && now < entry.blockedUntil) {
                blocked.push({
                    key,
                    blockedUntil: entry.blockedUntil,
                    violations: entry.violations,
                });
            }
        }

        return blocked;
    }

    /**
     * Cleanup on module destroy
     */
    onModuleDestroy(): void {
        clearInterval(this.cleanupInterval);
    }
}

/**
 * Create rate limiter with specific config
 */
export function createRateLimiter(config: keyof typeof RATE_LIMIT_CONFIGS | Partial<RateLimitConfig>): RateLimiterMiddleware {
    if (typeof config === 'string') {
        return new RateLimiterMiddleware(RATE_LIMIT_CONFIGS[config]);
    }
    return new RateLimiterMiddleware(config);
}
