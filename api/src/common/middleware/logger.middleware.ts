import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Security Logger Middleware
 * Logs all HTTP requests with sensitive data masking
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

    use(req: Request, res: Response, next: NextFunction) {
        const startTime = Date.now();
        const requestId = randomUUID();

        // Attach request ID to request for tracking
        (req as any).requestId = requestId;

        // Get client IP (handle proxies)
        const clientIp = this.getClientIp(req);

        // Log request
        const maskedBody = this.maskSensitiveData(req.body);
        const maskedQuery = this.maskSensitiveData(req.query);

        this.logger.log(
            `[${requestId}] --> ${req.method} ${req.originalUrl} | IP: ${clientIp}`,
        );

        if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'verbose') {
            if (maskedBody && typeof maskedBody === 'object' && Object.keys(maskedBody).length > 0) {
                this.logger.debug(`[${requestId}] Body: ${JSON.stringify(maskedBody)}`);
            }
            if (maskedQuery && typeof maskedQuery === 'object' && Object.keys(maskedQuery).length > 0) {
                this.logger.debug(`[${requestId}] Query: ${JSON.stringify(maskedQuery)}`);
            }
        }

        // Log response on finish
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const statusCode = res.statusCode;

            const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

            this.logger[logLevel](
                `[${requestId}] <-- ${req.method} ${req.originalUrl} | ${statusCode} | ${duration}ms`,
            );
        });

        next();
    }

    /**
     * Get client IP address, handling proxies
     */
    private getClientIp(req: Request): string {
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor.split(',')[0];
            return ips.trim();
        }
        return req.ip || req.socket.remoteAddress || 'unknown';
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
