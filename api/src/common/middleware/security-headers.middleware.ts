import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Security Headers Middleware
 * 
 * Implements additional security headers beyond Helmet for enterprise-grade protection.
 * 
 * OWASP Headers:
 * - X-Content-Type-Options: Prevents MIME-sniffing attacks
 * - X-Frame-Options: Prevents clickjacking (supplementary to CSP)
 * - X-XSS-Protection: Disabled (CSP is preferred in modern browsers)
 * - Cache-Control: Prevents caching of sensitive data
 * - Permissions-Policy: Restricts browser features
 * - Cross-Origin headers: Prevents embedding and data leakage
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
    private readonly sensitiveEndpoints = [
        '/auth',
        '/users',
        '/dashboard',
    ];

    constructor(private readonly configService: ConfigService) { }

    use(req: Request, res: Response, next: NextFunction): void {
        // ===================
        // Core Security Headers
        // ===================

        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Prevent clickjacking (supplementary to CSP frame-ancestors)
        res.setHeader('X-Frame-Options', 'DENY');

        // Disable XSS Auditor (deprecated, CSP is preferred)
        // Setting to 0 prevents potential issues with false positives
        res.setHeader('X-XSS-Protection', '0');

        // Prevent DNS prefetch attacks
        res.setHeader('X-DNS-Prefetch-Control', 'off');

        // Download options for IE
        res.setHeader('X-Download-Options', 'noopen');

        // Permitted cross-domain policies
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

        // ===================
        // Cross-Origin Headers
        // ===================

        // Prevent embedding by other sites
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

        // Restrict resource loading
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

        // ===================
        // Permissions Policy
        // ===================
        // Restrict access to browser features
        res.setHeader('Permissions-Policy', [
            'accelerometer=()',
            'camera=()',
            'geolocation=()',
            'gyroscope=()',
            'magnetometer=()',
            'microphone=()',
            'payment=()',
            'usb=()',
            'interest-cohort=()', // Disable FLoC
        ].join(', '));

        // ===================
        // Cache Control for Sensitive Endpoints
        // ===================
        const isSensitiveEndpoint = this.sensitiveEndpoints.some(
            (endpoint) => req.url.includes(endpoint),
        );

        if (isSensitiveEndpoint) {
            // Prevent caching of authenticated data
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }

        // ===================
        // API-Specific Headers
        // ===================

        // Indicate this is an API response
        res.setHeader('X-API-Version', '1.0');

        // Server timing (dev only) for debugging
        const isDev = this.configService.get('NODE_ENV') !== 'production';
        if (isDev) {
            const start = Date.now();
            res.on('finish', () => {
                // Note: This won't actually set the header properly since
                // headers are already sent. This is just for completeness.
            });
        }

        next();
    }
}
