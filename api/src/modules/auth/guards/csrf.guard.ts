import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

export const SKIP_CSRF_KEY = 'skipCsrf';

/**
 * CSRF Guard
 * 
 * Implements double-submit cookie pattern for CSRF protection.
 * 
 * How it works:
 * 1. Server generates CSRF token and sets it in a cookie
 * 2. Client reads cookie and sends token in X-CSRF-Token header
 * 3. Server validates that cookie and header match
 * 
 * This protects against CSRF attacks because:
 * - Attackers can't read cookies from another domain (SOP)
 * - Attackers can't set custom headers in cross-origin requests
 * 
 * OWASP: A01:2021 - Broken Access Control
 */
@Injectable()
export class CsrfGuard implements CanActivate {
    private readonly logger = new Logger(CsrfGuard.name);
    private readonly csrfSecret: string;
    private readonly cookieName = 'csrf_token';
    private readonly headerName = 'x-csrf-token';

    // HTTP methods that don't need CSRF protection
    private readonly safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    constructor(
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
    ) {
        this.csrfSecret = this.configService.get('CSRF_SECRET', crypto.randomBytes(32).toString('hex'));
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse();

        // Safe methods don't need CSRF protection
        if (this.safeMethods.includes(request.method)) {
            // Still set cookie for later use
            this.ensureCsrfCookie(request, response);
            return true;
        }

        // Check if CSRF is explicitly skipped (e.g., for OAuth callbacks)
        const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (skipCsrf) {
            return true;
        }

        // For API endpoints using Bearer tokens, CSRF is less critical
        // since the attacker can't steal the Authorization header
        const hasAuthHeader = request.headers.authorization?.startsWith('Bearer ');
        if (hasAuthHeader) {
            return true;
        }

        // If using cookie-based auth, validate CSRF token
        const hasCookieAuth = request.cookies?.refresh_token || request.cookies?.access_token;
        if (hasCookieAuth) {
            return this.validateCsrfToken(request, response);
        }

        // No cookie auth, no CSRF needed
        return true;
    }

    /**
     * Validate CSRF token from header against cookie
     */
    private validateCsrfToken(request: Request, response: any): boolean {
        const cookieToken = request.cookies?.[this.cookieName];
        const headerToken = request.headers[this.headerName] as string;

        if (!cookieToken || !headerToken) {
            this.logger.warn(`CSRF validation failed: missing tokens from IP ${this.getClientIp(request)}`);
            throw new ForbiddenException('CSRF token required');
        }

        // Timing-safe comparison
        const isValid = this.timingSafeCompare(cookieToken, headerToken);

        if (!isValid) {
            this.logger.warn(`CSRF validation failed: token mismatch from IP ${this.getClientIp(request)}`);
            throw new ForbiddenException('Invalid CSRF token');
        }

        // Rotate token after successful validation
        this.rotateCsrfToken(response);

        return true;
    }

    /**
     * Ensure CSRF cookie is set
     */
    private ensureCsrfCookie(request: Request, response: any): void {
        if (!request.cookies?.[this.cookieName]) {
            this.setCsrfCookie(response);
        }
    }

    /**
     * Set new CSRF token cookie
     */
    private setCsrfCookie(response: any): void {
        const token = this.generateCsrfToken();
        const secure = this.configService.get('COOKIE_SECURE') === 'true';
        const domain = this.configService.get('COOKIE_DOMAIN', 'localhost');
        const sameSite = this.configService.get('COOKIE_SAME_SITE', 'lax');

        response.cookie(this.cookieName, token, {
            httpOnly: false, // Must be readable by JavaScript
            secure,
            domain,
            sameSite,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/',
        });
    }

    /**
     * Rotate CSRF token after use
     */
    private rotateCsrfToken(response: any): void {
        this.setCsrfCookie(response);
    }

    /**
     * Generate CSRF token
     */
    private generateCsrfToken(): string {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(16).toString('hex');
        const data = `${timestamp}.${random}`;
        const signature = crypto
            .createHmac('sha256', this.csrfSecret)
            .update(data)
            .digest('hex')
            .substring(0, 16);

        return `${data}.${signature}`;
    }

    /**
     * Timing-safe string comparison
     */
    private timingSafeCompare(a: string, b: string): boolean {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        const aBuffer = Buffer.from(a, 'utf-8');
        const bBuffer = Buffer.from(b, 'utf-8');

        if (aBuffer.length !== bBuffer.length) {
            crypto.timingSafeEqual(aBuffer, aBuffer);
            return false;
        }

        return crypto.timingSafeEqual(aBuffer, bBuffer);
    }

    /**
     * Get client IP for logging
     */
    private getClientIp(request: Request): string {
        const forwardedFor = request.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor.split(',')[0];
            return ips.trim();
        }
        return request.ip || request.socket?.remoteAddress || 'unknown';
    }
}

/**
 * Decorator to skip CSRF validation
 */
import { SetMetadata } from '@nestjs/common';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
