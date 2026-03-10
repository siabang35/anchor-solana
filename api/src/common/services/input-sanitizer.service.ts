/**
 * Input Sanitizer Service
 * 
 * Provides comprehensive input sanitization for all external data.
 * Prevents XSS, SQL injection, and other common attacks.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SanitizationResult<T> {
    data: T;
    warnings: string[];
    modified: boolean;
}

export interface SanitizationOptions {
    allowHtml?: boolean;
    maxStringLength?: number;
    allowedProtocols?: string[];
    stripNullBytes?: boolean;
}

@Injectable()
export class InputSanitizerService {
    private readonly logger = new Logger(InputSanitizerService.name);

    // Dangerous patterns to detect
    private readonly dangerousPatterns = {
        sqlInjection: [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC)\b)/gi,
            /(\b(UNION\s+SELECT|OR\s+1\s*=\s*1|AND\s+1\s*=\s*1)\b)/gi,
            /(--|\/\*|\*\/|;)/g,
        ],
        xss: [
            /<script\b[^>]*>[\s\S]*?<\/script>/gi,
            /<script\b[^>]*>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /data:text\/html/gi,
            /<iframe\b[^>]*>/gi,
            /<object\b[^>]*>/gi,
            /<embed\b[^>]*>/gi,
            /<link\b[^>]*>/gi,
        ],
        pathTraversal: [
            /\.\.\//g,
            /\.\.%2f/gi,
            /\.\.\\/g,
            /\.\.%5c/gi,
        ],
    };

    // Default options
    private readonly defaultOptions: SanitizationOptions = {
        allowHtml: false,
        maxStringLength: 10000,
        allowedProtocols: ['http:', 'https:'],
        stripNullBytes: true,
    };

    /**
     * Sanitize a single string value
     */
    sanitizeString(value: string, options?: SanitizationOptions): SanitizationResult<string> {
        const opts = { ...this.defaultOptions, ...options };
        const warnings: string[] = [];
        let modified = false;
        let result = value;

        // Strip null bytes
        if (opts.stripNullBytes && result.includes('\0')) {
            result = result.replace(/\0/g, '');
            warnings.push('Null bytes removed');
            modified = true;
        }

        // Truncate if too long
        if (opts.maxStringLength && result.length > opts.maxStringLength) {
            result = result.substring(0, opts.maxStringLength);
            warnings.push(`String truncated to ${opts.maxStringLength} characters`);
            modified = true;
        }

        // Check for SQL injection patterns
        for (const pattern of this.dangerousPatterns.sqlInjection) {
            if (pattern.test(result)) {
                warnings.push('Potential SQL injection pattern detected');
                result = result.replace(pattern, '');
                modified = true;
            }
        }

        // Check for XSS patterns
        if (!opts.allowHtml) {
            for (const pattern of this.dangerousPatterns.xss) {
                if (pattern.test(result)) {
                    warnings.push('Potential XSS pattern detected');
                    result = result.replace(pattern, '');
                    modified = true;
                }
            }
        }

        // Check for path traversal
        for (const pattern of this.dangerousPatterns.pathTraversal) {
            if (pattern.test(result)) {
                warnings.push('Path traversal pattern detected');
                result = result.replace(pattern, '');
                modified = true;
            }
        }

        // HTML entity encode if not allowing HTML
        if (!opts.allowHtml) {
            const encoded = this.htmlEncode(result);
            if (encoded !== result) {
                modified = true;
            }
            result = encoded;
        }

        if (warnings.length > 0) {
            this.logger.warn(`Sanitization warnings: ${warnings.join(', ')}`);
        }

        return { data: result, warnings, modified };
    }

    /**
     * Sanitize a URL
     */
    sanitizeUrl(url: string, options?: SanitizationOptions): SanitizationResult<string | null> {
        const opts = { ...this.defaultOptions, ...options };
        const warnings: string[] = [];

        try {
            const parsed = new URL(url);

            // Check protocol
            if (!opts.allowedProtocols?.includes(parsed.protocol)) {
                warnings.push(`Invalid protocol: ${parsed.protocol}`);
                return { data: null, warnings, modified: true };
            }

            // Block localhost and private IPs in production
            const hostname = parsed.hostname.toLowerCase();
            const privatePatterns = [
                'localhost',
                '127.0.0.1',
                '0.0.0.0',
                /^10\./,
                /^192\.168\./,
                /^172\.(1[6-9]|2[0-9]|3[01])\./,
                /^169\.254\./,
            ];

            for (const pattern of privatePatterns) {
                if (typeof pattern === 'string' ? hostname === pattern : pattern.test(hostname)) {
                    warnings.push('Private/local URL detected');
                    return { data: null, warnings, modified: true };
                }
            }

            return { data: parsed.toString(), warnings, modified: false };
        } catch {
            warnings.push('Invalid URL format');
            return { data: null, warnings, modified: true };
        }
    }

    /**
     * Sanitize an entire object recursively
     */
    sanitizeObject<T extends Record<string, unknown>>(
        obj: T,
        options?: SanitizationOptions,
    ): SanitizationResult<T> {
        const warnings: string[] = [];
        let modified = false;
        const sanitized = { ...obj };

        for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === 'string') {
                const result = this.sanitizeString(value, options);
                if (result.modified) {
                    (sanitized as Record<string, unknown>)[key] = result.data;
                    modified = true;
                }
                warnings.push(...result.warnings.map(w => `${key}: ${w}`));
            } else if (Array.isArray(value)) {
                const arrayResult = this.sanitizeArray(value, options);
                if (arrayResult.modified) {
                    (sanitized as Record<string, unknown>)[key] = arrayResult.data;
                    modified = true;
                }
                warnings.push(...arrayResult.warnings);
            } else if (value !== null && typeof value === 'object') {
                const objResult = this.sanitizeObject(value as Record<string, unknown>, options);
                if (objResult.modified) {
                    (sanitized as Record<string, unknown>)[key] = objResult.data;
                    modified = true;
                }
                warnings.push(...objResult.warnings);
            }
        }

        return { data: sanitized, warnings, modified };
    }

    /**
     * Sanitize an array
     */
    sanitizeArray<T>(arr: T[], options?: SanitizationOptions): SanitizationResult<T[]> {
        const warnings: string[] = [];
        let modified = false;
        const sanitized: T[] = [];

        for (const item of arr) {
            if (typeof item === 'string') {
                const result = this.sanitizeString(item, options);
                sanitized.push(result.data as T);
                if (result.modified) modified = true;
                warnings.push(...result.warnings);
            } else if (item !== null && typeof item === 'object') {
                if (Array.isArray(item)) {
                    const arrayResult = this.sanitizeArray(item, options);
                    sanitized.push(arrayResult.data as T);
                    if (arrayResult.modified) modified = true;
                    warnings.push(...arrayResult.warnings);
                } else {
                    const objResult = this.sanitizeObject(item as Record<string, unknown>, options);
                    sanitized.push(objResult.data as T);
                    if (objResult.modified) modified = true;
                    warnings.push(...objResult.warnings);
                }
            } else {
                sanitized.push(item);
            }
        }

        return { data: sanitized, warnings, modified };
    }

    /**
     * Validate and sanitize external API response
     */
    sanitizeApiResponse<T>(response: T, sourceName: string): T {
        if (response === null || response === undefined) {
            return response;
        }

        if (typeof response === 'string') {
            const result = this.sanitizeString(response);
            if (result.modified) {
                this.logger.warn(`[${sourceName}] API response modified during sanitization`);
            }
            return result.data as T;
        }

        if (Array.isArray(response)) {
            const result = this.sanitizeArray(response);
            if (result.modified) {
                this.logger.warn(`[${sourceName}] API response array modified during sanitization`);
            }
            return result.data as T;
        }

        if (typeof response === 'object') {
            const result = this.sanitizeObject(response as Record<string, unknown>);
            if (result.modified) {
                this.logger.warn(`[${sourceName}] API response object modified during sanitization`);
            }
            return result.data as T;
        }

        return response;
    }

    /**
     * HTML encode a string
     */
    private htmlEncode(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Check if a value contains dangerous patterns
     */
    containsDangerousPatterns(value: string): { hasDangerous: boolean; types: string[] } {
        const types: string[] = [];

        for (const pattern of this.dangerousPatterns.sqlInjection) {
            if (pattern.test(value)) {
                types.push('sql_injection');
                break;
            }
        }

        for (const pattern of this.dangerousPatterns.xss) {
            if (pattern.test(value)) {
                types.push('xss');
                break;
            }
        }

        for (const pattern of this.dangerousPatterns.pathTraversal) {
            if (pattern.test(value)) {
                types.push('path_traversal');
                break;
            }
        }

        return { hasDangerous: types.length > 0, types };
    }
}
