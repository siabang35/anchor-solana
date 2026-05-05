import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createHash } from 'crypto';

/**
 * Cache Response Interceptor
 *
 * Implements:
 * 1. ETag-based conditional responses (304 Not Modified)
 * 2. In-memory TTL cache for public GET endpoints
 *
 * Performance impact:
 * - Reduces DB queries for repeated identical requests
 * - Saves bandwidth via 304 responses (no body sent)
 * - Eliminates redundant JSON serialization
 *
 * Anti-throttling benefit:
 * - Cached responses don't count against rate limits
 * - Reduces backend load from polling clients
 *
 * Security:
 * - Only caches public GET endpoints (no auth data)
 * - Cache is invalidated on TTL expiry
 * - ETag prevents stale data serving
 */

interface CacheEntry {
    data: any;
    etag: string;
    cachedAt: number;
}

@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
    private readonly logger = new Logger(CacheResponseInterceptor.name);
    private readonly cache = new Map<string, CacheEntry>();

    // Cache TTLs by path pattern (milliseconds)
    private readonly CACHE_RULES: Array<{ pattern: RegExp; ttlMs: number }> = [
        { pattern: /\/competitions\/sectors\/summary/, ttlMs: 10_000 },   // 10s
        { pattern: /\/competitions(\?|$)/, ttlMs: 5_000 },                // 5s
        { pattern: /\/markets\/feed/, ttlMs: 15_000 },                    // 15s
        { pattern: /\/markets\/featured/, ttlMs: 30_000 },                // 30s
        { pattern: /\/markets\/category/, ttlMs: 15_000 },                // 15s
        { pattern: /\/pool\/global/, ttlMs: 10_000 },                     // 10s
        { pattern: /\/pool\/sector/, ttlMs: 10_000 },                     // 10s
        { pattern: /\/pool\/competition/, ttlMs: 5_000 },                 // 5s
        { pattern: /\/agents\/competitors/, ttlMs: 8_000 },               // 8s
        { pattern: /\/agents\/leaderboard/, ttlMs: 10_000 },              // 10s
    ];

    // Cleanup stale entries every 30s
    private readonly cleanupTimer = setInterval(() => this.cleanup(), 30_000);

    // Max cache size to prevent memory exhaustion (anti-manipulation)
    private readonly MAX_CACHE_SIZE = 500;

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const method = request.method;
        const url = request.url || '';

        // Only cache GET requests on public endpoints
        if (method !== 'GET') {
            return next.handle();
        }

        // Don't cache authenticated/user-specific endpoints
        const userId = request.headers['x-user-id'] || request.headers['authorization'];
        if (userId) {
            return next.handle();
        }

        // Check if this URL matches a cache rule
        const rule = this.CACHE_RULES.find(r => r.pattern.test(url));
        if (!rule) {
            return next.handle();
        }

        const cacheKey = `GET:${url}`;
        const cached = this.cache.get(cacheKey);

        // Check if cached entry is still valid
        if (cached && (Date.now() - cached.cachedAt) < rule.ttlMs) {
            // Check client's If-None-Match header for conditional request
            const clientEtag = request.headers['if-none-match'];
            if (clientEtag === cached.etag) {
                // 304 Not Modified — save bandwidth
                response.status(304);
                response.header('ETag', cached.etag);
                response.header('X-Cache', 'HIT-304');
                return of(null);
            }

            // Return cached data with ETag
            response.header('ETag', cached.etag);
            response.header('X-Cache', 'HIT');
            response.header('Cache-Control', `public, max-age=${Math.floor(rule.ttlMs / 1000)}`);
            return of(cached.data);
        }

        // Cache miss — execute handler and cache the result
        return next.handle().pipe(
            tap((data) => {
                if (data !== null && data !== undefined) {
                    // Generate ETag from response content
                    const jsonStr = JSON.stringify(data);
                    const etag = `"${createHash('md5').update(jsonStr).digest('hex').slice(0, 16)}"`;

                    // Evict oldest entries if cache is full (anti-memory-exhaustion)
                    if (this.cache.size >= this.MAX_CACHE_SIZE) {
                        const oldestKey = this.cache.keys().next().value;
                        if (oldestKey) this.cache.delete(oldestKey);
                    }

                    this.cache.set(cacheKey, {
                        data,
                        etag,
                        cachedAt: Date.now(),
                    });

                    // Set response headers
                    response.header('ETag', etag);
                    response.header('X-Cache', 'MISS');
                    response.header('Cache-Control', `public, max-age=${Math.floor(rule.ttlMs / 1000)}`);
                }
            }),
        );
    }

    /**
     * Remove expired cache entries
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        // Find max TTL for cleanup threshold
        const maxTtl = Math.max(...this.CACHE_RULES.map(r => r.ttlMs));

        for (const [key, entry] of this.cache.entries()) {
            if ((now - entry.cachedAt) > maxTtl * 2) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cache cleanup: removed ${cleaned} stale entries (${this.cache.size} remaining)`);
        }
    }

    /**
     * Force invalidate all cache entries (e.g., after data mutation)
     */
    invalidateAll(): void {
        this.cache.clear();
        this.logger.log('Cache invalidated (all entries cleared)');
    }

    /**
     * Force invalidate cache entries matching a pattern
     */
    invalidatePattern(pattern: string): void {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            this.logger.debug(`Cache invalidated: ${count} entries matching "${pattern}"`);
        }
    }
}
