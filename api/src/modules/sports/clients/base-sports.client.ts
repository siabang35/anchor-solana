/**
 * Base Sports API Client
 * 
 * Common functionality for sports API clients with rate limiting,
 * retry logic, error handling, and security measures.
 * 
 * Security Features:
 * - Request ID tracking for debugging
 * - Response sanitization
 * - Rate limiting with circuit breaker
 * - Retry with jitter to prevent thundering herd
 * - Metrics collection
 */

import { Logger } from '@nestjs/common';
import { DataSource, SyncResult } from '../types/sports.types.js';

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerDay?: number;
}

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    enableJitter?: boolean; // Add jitter to prevent thundering herd
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
    CLOSED = 'closed',     // Normal operation
    OPEN = 'open',         // Blocking requests
    HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;      // Number of failures before opening
    successThreshold: number;      // Successes needed to close from half-open
    openDurationMs: number;        // Time to wait before half-open
}

/**
 * Request metrics for monitoring
 */
export interface RequestMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTimeMs: number;
    lastRequestTime: number;
}

export interface ApiClientConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
    rateLimit: RateLimitConfig;
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    enableMetrics?: boolean;
}

/**
 * Base class for sports API clients with built-in rate limiting, retry logic, circuit breaker, and security
 */
export abstract class BaseSportsClient {
    protected readonly logger: Logger;
    protected readonly config: ApiClientConfig;
    protected requestCount: number = 0;
    protected lastRequestTime: number = 0;
    protected dailyRequestCount: number = 0;
    protected lastDayReset: number = Date.now();

    // Circuit breaker state
    protected circuitState: CircuitBreakerState = CircuitBreakerState.CLOSED;
    protected failureCount: number = 0;
    protected successCount: number = 0;
    protected lastFailureTime: number = 0;

    // Metrics tracking
    protected metrics: RequestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTimeMs: 0,
        lastRequestTime: 0,
    };
    private responseTimes: number[] = [];

    protected readonly defaultRetry: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        enableJitter: true,
    };

    protected readonly defaultCircuitBreaker: CircuitBreakerConfig = {
        failureThreshold: 5,       // Open after 5 failures
        successThreshold: 3,       // Close after 3 successes in half-open
        openDurationMs: 30000,     // Wait 30 seconds before half-open
    };

    // Suspicious patterns to detect in responses
    private readonly suspiciousPatterns = [
        /<script\b[^>]*>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /data:text\/html/i,
    ];

    constructor(
        protected readonly name: string,
        protected readonly source: DataSource,
        config: ApiClientConfig,
    ) {
        this.logger = new Logger(`${name}Client`);
        this.config = {
            timeout: 30000,
            retry: this.defaultRetry,
            circuitBreaker: this.defaultCircuitBreaker,
            enableMetrics: true,
            ...config,
        };
    }

    /**
     * Generate unique request ID for tracking
     */
    protected generateRequestId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${this.name.toLowerCase()}_${timestamp}_${random}`;
    }

    /**
     * Get retry delay with jitter to prevent thundering herd
     */
    protected getRetryDelayWithJitter(attempt: number): number {
        const retryConfig = this.config.retry || this.defaultRetry;
        const baseDelay = Math.min(
            retryConfig.baseDelayMs * Math.pow(2, attempt),
            retryConfig.maxDelayMs,
        );

        if (retryConfig.enableJitter) {
            // Add 0-30% jitter
            const jitter = Math.random() * 0.3 * baseDelay;
            return Math.floor(baseDelay + jitter);
        }

        return baseDelay;
    }

    /**
     * Sanitize URL to prevent SSRF attacks
     */
    protected sanitizeUrl(url: string): string {
        try {
            const parsed = new URL(url);

            // Only allow http/https protocols
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error(`Invalid protocol: ${parsed.protocol}`);
            }

            // Block localhost and private IPs
            const hostname = parsed.hostname.toLowerCase();
            if (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.16.')
            ) {
                throw new Error('Private/local URLs are not allowed');
            }

            return parsed.toString();
        } catch (error) {
            this.logger.error(`URL sanitization failed: ${url}`, error);
            throw new Error('Invalid URL');
        }
    }

    /**
     * Sanitize string to prevent XSS
     */
    protected sanitizeString(value: string | undefined): string | undefined {
        if (!value) return value;

        // Check for suspicious patterns
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(value)) {
                this.logger.warn(`Suspicious pattern detected in response data`);
                // Remove the suspicious content
                value = value.replace(pattern, '');
            }
        }

        // Basic HTML entity encoding for safety
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Sanitize entire response object
     */
    protected sanitizeResponse<T>(data: T): T {
        if (data === null || data === undefined) return data;

        if (typeof data === 'string') {
            return this.sanitizeString(data) as T;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeResponse(item)) as T;
        }

        if (typeof data === 'object') {
            const sanitized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                sanitized[key] = this.sanitizeResponse(value);
            }
            return sanitized as T;
        }

        return data;
    }

    /**
     * Update metrics after request
     */
    protected updateMetrics(responseTimeMs: number, success: boolean): void {
        if (!this.config.enableMetrics) return;

        this.metrics.totalRequests++;
        this.metrics.lastRequestTime = Date.now();

        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        // Keep last 100 response times for average
        this.responseTimes.push(responseTimeMs);
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }

        this.metrics.averageResponseTimeMs =
            this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    }

    /**
     * Get current metrics
     */
    public getMetrics(): RequestMetrics {
        return { ...this.metrics };
    }

    /**
     * Check circuit breaker state and throw if open
     */
    protected checkCircuitBreaker(): void {
        const cbConfig = this.config.circuitBreaker || this.defaultCircuitBreaker;

        if (this.circuitState === CircuitBreakerState.OPEN) {
            const timeSinceFailure = Date.now() - this.lastFailureTime;

            if (timeSinceFailure >= cbConfig.openDurationMs) {
                // Transition to half-open
                this.circuitState = CircuitBreakerState.HALF_OPEN;
                this.successCount = 0;
                this.logger.log(`Circuit breaker transitioning to HALF_OPEN`);
            } else {
                const waitTime = cbConfig.openDurationMs - timeSinceFailure;
                throw new Error(
                    `Circuit breaker is OPEN. Wait ${Math.ceil(waitTime / 1000)}s before retrying.`
                );
            }
        }
    }

    /**
     * Record a successful request
     */
    protected recordSuccess(): void {
        const cbConfig = this.config.circuitBreaker || this.defaultCircuitBreaker;

        if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= cbConfig.successThreshold) {
                this.circuitState = CircuitBreakerState.CLOSED;
                this.failureCount = 0;
                this.successCount = 0;
                this.logger.log(`Circuit breaker CLOSED after ${cbConfig.successThreshold} successes`);
            }
        } else {
            this.failureCount = 0; // Reset failure count on success
        }
    }

    /**
     * Record a failed request
     */
    protected recordFailure(): void {
        const cbConfig = this.config.circuitBreaker || this.defaultCircuitBreaker;
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
            // Any failure in half-open goes back to open
            this.circuitState = CircuitBreakerState.OPEN;
            this.logger.warn(`Circuit breaker OPEN again after failure in HALF_OPEN`);
        } else if (this.failureCount >= cbConfig.failureThreshold) {
            this.circuitState = CircuitBreakerState.OPEN;
            this.logger.warn(
                `Circuit breaker OPEN after ${this.failureCount} consecutive failures`
            );
        }
    }

    /**
     * Check and apply rate limiting
     */
    protected async checkRateLimit(): Promise<void> {
        const now = Date.now();

        // Reset daily counter if needed
        if (now - this.lastDayReset > 24 * 60 * 60 * 1000) {
            this.dailyRequestCount = 0;
            this.lastDayReset = now;
        }

        // Check daily limit
        if (this.config.rateLimit.requestsPerDay &&
            this.dailyRequestCount >= this.config.rateLimit.requestsPerDay) {
            throw new Error(`Daily rate limit exceeded (${this.config.rateLimit.requestsPerDay} requests/day)`);
        }

        // Calculate delay needed for per-minute rate limit
        const minDelayMs = (60 * 1000) / this.config.rateLimit.requestsPerMinute;
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < minDelayMs) {
            const waitTime = minDelayMs - timeSinceLastRequest;
            if (waitTime > 1000) {
                this.logger.warn(`Rate limiting: waiting ${waitTime}ms (Request ${this.requestCount}/${this.config.rateLimit.requestsPerMinute} per min)`);
            } else {
                this.logger.verbose(`Rate limiting: waiting ${waitTime}ms`);
            }
            await this.sleep(waitTime);
        }
    }

    /**
     * Make an API request with rate limiting, retry logic, circuit breaker, and security
     */
    protected async makeRequest<T>(
        url: string,
        options: RequestInit = {},
    ): Promise<T> {
        const requestId = this.generateRequestId();
        const startTime = Date.now();

        // Check circuit breaker first
        this.checkCircuitBreaker();

        await this.checkRateLimit();

        const retryConfig = this.config.retry || this.defaultRetry;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    this.config.timeout,
                );

                this.logger.debug(`[${requestId}] Request attempt ${attempt + 1}: ${url}`);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Request-ID': requestId,
                        ...this.getAuthHeaders(),
                        ...options.headers,
                    },
                });

                clearTimeout(timeoutId);

                // Update rate limit counters
                this.lastRequestTime = Date.now();
                this.requestCount++;
                this.dailyRequestCount++;

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(
                        `API request failed: ${response.status} ${response.statusText} - ${errorBody}`,
                    );
                }

                const data = await response.json() as T;
                const responseTimeMs = Date.now() - startTime;

                // Record success for circuit breaker
                this.recordSuccess();

                // Update metrics
                this.updateMetrics(responseTimeMs, true);

                this.logger.debug(`[${requestId}] Request completed in ${responseTimeMs}ms`);

                return data;
            } catch (error) {
                lastError = error as Error;
                this.logger.warn(
                    `[${requestId}] Request attempt ${attempt + 1} failed: ${lastError.message}`,
                );

                if (attempt < retryConfig.maxRetries) {
                    // Use jitter for retry delay
                    const delay = this.getRetryDelayWithJitter(attempt);
                    this.logger.debug(`[${requestId}] Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        // Record failure for circuit breaker after all retries exhausted
        this.recordFailure();

        // Update metrics with failure
        const responseTimeMs = Date.now() - startTime;
        this.updateMetrics(responseTimeMs, false);

        this.logger.error(`[${requestId}] Request failed after ${retryConfig.maxRetries + 1} attempts`);

        throw lastError || new Error('Request failed after retries');
    }

    /**
     * Get authentication headers (override in subclasses)
     */
    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Sleep utility
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a sync result object
     */
    protected createSyncResult(
        syncType: string,
        partial: Partial<SyncResult>,
    ): SyncResult {
        return {
            success: true,
            source: this.source,
            syncType,
            recordsFetched: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
            recordsFailed: 0,
            durationMs: 0,
            ...partial,
        };
    }

    /**
     * Log sync operation
     */
    protected logSync(
        operation: string,
        sport: string | undefined,
        count: number,
    ): void {
        this.logger.log(
            `[${operation}] ${sport ? `${sport}: ` : ''}Processed ${count} records`,
        );
    }

    /**
     * Get current rate limit status
     */
    public getRateLimitStatus(): {
        requestsThisMinute: number;
        requestsToday: number;
        limitPerMinute: number;
        limitPerDay: number | undefined;
    } {
        return {
            requestsThisMinute: this.requestCount,
            requestsToday: this.dailyRequestCount,
            limitPerMinute: this.config.rateLimit.requestsPerMinute,
            limitPerDay: this.config.rateLimit.requestsPerDay,
        };
    }

    /**
     * Get circuit breaker status
     */
    public getCircuitBreakerStatus(): {
        state: CircuitBreakerState;
        failureCount: number;
        successCount: number;
        lastFailureTime: number;
    } {
        return {
            state: this.circuitState,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
        };
    }

    /**
     * Manually reset circuit breaker (e.g., for admin intervention)
     */
    public resetCircuitBreaker(): void {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.logger.log('Circuit breaker manually reset to CLOSED');
    }

    /**
     * Abstract method to test connection
     */
    abstract testConnection(): Promise<boolean>;
}
