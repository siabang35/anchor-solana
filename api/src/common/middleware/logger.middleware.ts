import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Security Logger Middleware (Adapter-Agnostic)
 *
 * Logs all HTTP requests with sensitive data masking.
 * Works with both Express and Fastify via NestJS abstraction.
 *
 * Performance notes:
 * - Uses hrtime for sub-millisecond precision
 * - Deferred response logging via raw response events
 * - Sensitive fields are masked before logging (OWASP compliance)
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    // Fields to mask in logs
    private readonly sensitiveFields = [
        'password',
        'token',
        'authorization',
        'secret',
        'apikey',
        'api_key',
        'refreshtoken',
        'refresh_token',
        'accesstoken',
        'access_token',
        'signature',
        'privatekey',
        'private_key',
    ];

    use(req: any, res: any, next: () => void) {
        const startTime = process.hrtime.bigint();
        // Use Fastify's request.id or fallback
        const requestId = req.id || req.requestId || randomUUID();

        // Attach request ID for downstream use
        req.requestId = requestId;

        // Get client IP (handle proxies) — works on both Express and Fastify
        const clientIp = this.getClientIp(req);

        // Log request
        const url = req.originalUrl || req.url || '/';
        const method = req.method || 'UNKNOWN';

        this.logger.log(
            `[${requestId}] --> ${method} ${url} | IP: ${clientIp}`,
        );

        if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'verbose') {
            const maskedBody = this.maskSensitiveData(req.body);
            const maskedQuery = this.maskSensitiveData(req.query);
            if (maskedBody && typeof maskedBody === 'object' && Object.keys(maskedBody).length > 0) {
                this.logger.debug(`[${requestId}] Body: ${JSON.stringify(maskedBody)}`);
            }
            if (maskedQuery && typeof maskedQuery === 'object' && Object.keys(maskedQuery).length > 0) {
                this.logger.debug(`[${requestId}] Query: ${JSON.stringify(maskedQuery)}`);
            }
        }

        // Log response on finish
        // Works with both Express (res.on) and Fastify (res.raw.on)
        const rawRes = res.raw || res;
        const onFinish = () => {
            const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000;
            const statusCode = res.statusCode || rawRes.statusCode || 0;

            const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

            this.logger[logLevel](
                `[${requestId}] <-- ${method} ${url} | ${statusCode} | ${elapsed.toFixed(1)}ms`,
            );
        };

        if (typeof rawRes.on === 'function') {
            rawRes.on('finish', onFinish);
        }

        next();
    }

    /**
     * Get client IP address, handling proxies (adapter-agnostic)
     */
    private getClientIp(req: any): string {
        const forwardedFor = req.headers?.['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor.split(',')[0];
            return ips.trim();
        }
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }

    /**
     * Recursively mask sensitive fields in objects
     */
    private maskSensitiveData(data: any): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map((item) => this.maskSensitiveData(item));
        }

        const masked: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();
            if (this.sensitiveFields.some((field) => lowerKey.includes(field))) {
                masked[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                masked[key] = this.maskSensitiveData(value);
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }
}
