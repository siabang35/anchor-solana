import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Input Sanitizer Middleware
 * 
 * Provides server-side input sanitization against:
 * - XSS (Cross-Site Scripting)
 * - HTML Injection
 * - Script injection
 * - Common attack patterns
 * 
 * OWASP: A03:2021 - Injection
 * 
 * Note: This is a defense-in-depth measure. Primary protection
 * comes from output encoding and Content Security Policy.
 */
@Injectable()
export class InputSanitizerMiddleware implements NestMiddleware {
    private readonly logger = new Logger(InputSanitizerMiddleware.name);

    // Patterns that indicate potential XSS/injection attempts
    private readonly dangerousPatterns = [
        /<script\b[^>]*>/gi,       // Script tags
        /<\/script>/gi,            // Closing script tags
        /javascript:/gi,           // JavaScript protocol
        /on\w+\s*=/gi,             // Event handlers (onclick, onerror, etc.)
        /<iframe\b/gi,             // Iframe tags
        /<object\b/gi,             // Object tags
        /<embed\b/gi,              // Embed tags
        /<link\b/gi,               // Link tags (can load malicious CSS)
        /<meta\b/gi,               // Meta tags
        /<style\b/gi,              // Style tags
        /data:/gi,                 // Data URIs (can contain scripts)
        /vbscript:/gi,             // VBScript protocol
        /expression\s*\(/gi,       // CSS expressions (IE)
        /eval\s*\(/gi,             // eval() calls
        /new\s+Function\s*\(/gi,   // Function constructor
    ];

    // Fields that should never contain HTML
    private readonly strictFields = [
        'email',
        'password',
        'username',
        'phone',
        'address',
        'walletAddress',
        'signature',
        'nonce',
    ];

    use(req: Request, res: Response, next: NextFunction): void {
        if (req.body && typeof req.body === 'object') {
            const sanitizedBody = this.sanitizeObject(req.body, req);
            req.body = sanitizedBody;
        }

        if (req.query && typeof req.query === 'object') {
            const sanitizedQuery = this.sanitizeObject(req.query as Record<string, any>, req);
            req.query = sanitizedQuery;
        }

        if (req.params && typeof req.params === 'object') {
            const sanitizedParams = this.sanitizeObject(req.params, req);
            req.params = sanitizedParams;
        }

        next();
    }

    /**
     * Recursively sanitize an object
     */
    private sanitizeObject(
        obj: Record<string, any>,
        req: Request,
    ): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.sanitizeString(value, key, req);
            } else if (Array.isArray(value)) {
                result[key] = value.map((item) => {
                    if (typeof item === 'string') {
                        return this.sanitizeString(item, key, req);
                    }
                    if (typeof item === 'object' && item !== null) {
                        return this.sanitizeObject(item, req);
                    }
                    return item;
                });
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.sanitizeObject(value, req);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Sanitize a string value
     */
    private sanitizeString(value: string, fieldName: string, req: Request): string {
        // Check for dangerous patterns
        let hasDangerousContent = false;
        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(value)) {
                hasDangerousContent = true;
                break;
            }
        }

        if (hasDangerousContent) {
            this.logger.warn(
                `Potential XSS attempt detected in field "${fieldName}" from IP ${this.getClientIp(req)}`,
            );

            // For strict fields, reject the content entirely
            if (this.strictFields.includes(fieldName)) {
                return '';
            }

            // For other fields, encode HTML entities
            return this.encodeHtmlEntities(value);
        }

        // For strict fields, ensure no HTML at all
        if (this.strictFields.includes(fieldName) && this.containsHtml(value)) {
            return this.stripHtml(value);
        }

        return value;
    }

    /**
     * Encode HTML entities
     */
    private encodeHtmlEntities(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Check if string contains HTML
     */
    private containsHtml(str: string): boolean {
        return /<[^>]+>/g.test(str);
    }

    /**
     * Strip HTML tags from string
     */
    private stripHtml(str: string): string {
        return str.replace(/<[^>]+>/g, '');
    }

    /**
     * Get client IP for logging
     */
    private getClientIp(req: Request): string {
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor.split(',')[0];
            return ips.trim();
        }
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }
}
