/**
 * Base API Client
 * 
 * Abstract base class for all market data API clients.
 * Implements OWASP-compliant security, rate limiting, and anti-throttling.
 */

import { Logger } from '@nestjs/common';

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerDay: number;
    retryAfterMs: number;
}

export interface RequestOptions {
    timeout?: number;
    retries?: number;
    headers?: Record<string, string>;
}

export abstract class BaseAPIClient {
    protected readonly logger: Logger;
    protected readonly baseUrl: string;
    protected readonly apiKey?: string;
    protected readonly rateLimitConfig: RateLimitConfig;

    // Rate limiting state
    protected requestsThisMinute = 0;
    protected requestsToday = 0;
    protected lastMinuteReset = Date.now();
    protected lastDayReset = Date.now();
    protected retryAfter = 0;

    // Circuit breaker state
    protected consecutiveFailures = 0;
    protected readonly maxConsecutiveFailures = 5;
    protected circuitBreakerOpen = false;
    protected circuitBreakerResetTime = 0;

    constructor(
        name: string,
        baseUrl: string,
        apiKey: string | undefined,
        rateLimitConfig: RateLimitConfig
    ) {
        this.logger = new Logger(name);
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.rateLimitConfig = rateLimitConfig;
    }

    /**
     * Check if we can make a request (rate limiting)
     */
    canMakeRequest(): boolean {
        // Check circuit breaker
        if (this.circuitBreakerOpen) {
            if (Date.now() < this.circuitBreakerResetTime) {
                return false;
            }
            // Reset circuit breaker
            this.circuitBreakerOpen = false;
            this.consecutiveFailures = 0;
        }

        // Check retry after
        if (Date.now() < this.retryAfter) {
            return false;
        }

        // Reset counters if needed
        this.resetCountersIfNeeded();

        // Check limits
        return (
            this.requestsThisMinute < this.rateLimitConfig.requestsPerMinute &&
            this.requestsToday < this.rateLimitConfig.requestsPerDay
        );
    }

    /**
     * Get remaining requests info
     */
    getRateLimitStatus(): { remainingMinute: number; remainingDay: number; canRequest: boolean } {
        this.resetCountersIfNeeded();
        return {
            remainingMinute: Math.max(0, this.rateLimitConfig.requestsPerMinute - this.requestsThisMinute),
            remainingDay: Math.max(0, this.rateLimitConfig.requestsPerDay - this.requestsToday),
            canRequest: this.canMakeRequest(),
        };
    }

    /**
     * Reset rate limit counters if time windows have passed
     */
    protected resetCountersIfNeeded(): void {
        const now = Date.now();

        // Reset minute counter
        if (now - this.lastMinuteReset >= 60000) {
            this.requestsThisMinute = 0;
            this.lastMinuteReset = now;
        }

        // Reset day counter
        if (now - this.lastDayReset >= 86400000) {
            this.requestsToday = 0;
            this.lastDayReset = now;
        }
    }

    /**
     * Increment request counters
     */
    protected incrementRequestCount(): void {
        this.requestsThisMinute++;
        this.requestsToday++;
    }

    /**
     * Handle successful request
     */
    protected handleSuccess(): void {
        this.consecutiveFailures = 0;
    }

    /**
     * Handle failed request
     */
    protected handleFailure(error: Error): void {
        this.consecutiveFailures++;

        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.circuitBreakerOpen = true;
            this.circuitBreakerResetTime = Date.now() + 60000; // 1 minute
            this.logger.warn(`Circuit breaker opened due to ${this.consecutiveFailures} consecutive failures`);
        }
    }

    /**
     * Make HTTP request with rate limiting and error handling
     */
    protected async makeRequest<T>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<T> {
        if (!this.canMakeRequest()) {
            const status = this.getRateLimitStatus();
            throw new Error(
                `Rate limit exceeded. Remaining: ${status.remainingMinute}/min, ${status.remainingDay}/day`
            );
        }

        const url = `${this.baseUrl}${endpoint}`;
        const timeout = options.timeout || 30000;
        const maxRetries = options.retries || 3;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.incrementRequestCount();

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const defaultHeaders = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ExoduzeMarketData/1.0 (Integration; +https://github.com/exoduze/project)',
                    ...this.getAuthHeaders(),
                };

                const response = await fetch(url, {
                    headers: {
                        ...defaultHeaders,
                        ...options.headers,
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Handle rate limit headers
                this.handleRateLimitHeaders(response.headers);

                if (!response.ok) {
                    // Handle specific error codes
                    if (response.status === 429) {
                        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                        this.retryAfter = Date.now() + retryAfter * 1000;
                        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
                    }

                    if (response.status >= 500) {
                        throw new Error(`Server error: ${response.status}`);
                    }

                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                this.handleSuccess();
                return data as T;

            } catch (error) {
                lastError = error as Error;
                this.handleFailure(lastError);

                if (attempt < maxRetries) {
                    // Exponential backoff with jitter
                    const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
                    this.logger.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Request failed after all retries');
    }

    /**
     * Get authentication headers for the API
     */
    protected abstract getAuthHeaders(): Record<string, string>;

    /**
     * Handle rate limit headers from response
     */
    protected handleRateLimitHeaders(headers: Headers): void {
        // Override in subclasses for API-specific handling
        const remaining = headers.get('X-RateLimit-Remaining');
        if (remaining && parseInt(remaining, 10) <= 1) {
            this.logger.warn('Rate limit nearly exhausted');
        }
    }

    /**
     * Sanitize input string (OWASP)
     */
    protected sanitizeInput(input: string): string {
        return input
            .replace(/[<>'"]/g, '') // Remove potential XSS characters
            .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
            .trim()
            .substring(0, 500); // Limit length
    }

    /**
     * Sleep utility
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
