import {
    Injectable,
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityService } from '../security.service.js';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator.js';

/**
 * RateLimitGuard
 * 
 * Guards endpoints with rate limiting based on:
 * - User ID (if authenticated)
 * - IP address (as fallback)
 * 
 * Uses @RateLimit() decorator to configure limits per endpoint
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly logger = new Logger(RateLimitGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly securityService: SecurityService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Get rate limit configuration from decorator
        const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()]
        );

        // If no rate limit configured, allow
        if (!rateLimitOptions) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Determine identifier (user ID or IP)
        const userId = request.user?.sub;
        const ipAddress = request.ip || request.headers['x-forwarded-for'] || 'unknown';
        const identifier = userId || ipAddress;
        const identifierType: 'user' | 'ip' = userId ? 'user' : 'ip';

        // Get endpoint path
        const endpoint = `${request.method}:${request.route?.path || request.path}`;

        const { limit, windowSeconds } = rateLimitOptions;

        // Check rate limit
        const result = await this.securityService.checkRateLimit(
            identifier,
            endpoint,
            limit,
            windowSeconds,
            identifierType,
        );

        // Set rate limit headers
        response.setHeader('X-RateLimit-Limit', limit);
        response.setHeader('X-RateLimit-Remaining', result.remaining);
        response.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

        if (!result.allowed) {
            this.logger.warn(
                `Rate limit exceeded: ${identifier} on ${endpoint}`
            );

            // Log as suspicious if severe
            if (result.remaining < -10) { // Way over limit
                await this.securityService.logSuspiciousActivity(
                    'rate_limit_abuse',
                    `Extreme rate limit violation on ${endpoint}`,
                    50,
                    { userId, ipAddress }
                );
            }

            throw new HttpException(
                {
                    statusCode: HttpStatus.TOO_MANY_REQUESTS,
                    message: 'Too many requests. Please try again later.',
                    retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return true;
    }
}

/**
 * IpBlacklistGuard
 * 
 * Guards all endpoints by checking if the client IP is blacklisted.
 * Should be applied globally or to sensitive endpoints.
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
    private readonly logger = new Logger(IpBlacklistGuard.name);

    constructor(private readonly securityService: SecurityService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const ipAddress = request.ip ||
            request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            request.connection?.remoteAddress ||
            'unknown';

        const isBlacklisted = await this.securityService.isIpBlacklisted(ipAddress);

        if (isBlacklisted) {
            this.logger.warn(`Blocked request from blacklisted IP: ${ipAddress}`);

            throw new HttpException(
                {
                    statusCode: HttpStatus.FORBIDDEN,
                    message: 'Access denied',
                },
                HttpStatus.FORBIDDEN,
            );
        }

        return true;
    }
}

/**
 * DeviceFingerprintGuard
 * 
 * Tracks device fingerprints for authenticated users.
 * Does not block, but registers new devices and flags suspicious patterns.
 */
@Injectable()
export class DeviceFingerprintGuard implements CanActivate {
    private readonly logger = new Logger(DeviceFingerprintGuard.name);

    constructor(private readonly securityService: SecurityService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Only track for authenticated users
        if (!user?.sub) {
            return true;
        }

        // Get fingerprint from header (client-side generated)
        const fingerprint = request.headers['x-device-fingerprint'];
        if (!fingerprint) {
            return true; // Don't block if no fingerprint provided
        }

        const ipAddress = request.ip || request.headers['x-forwarded-for'];
        const userAgent = request.headers['user-agent'];

        // Register/update device
        const { isNewDevice } = await this.securityService.registerDeviceFingerprint(
            user.sub,
            fingerprint,
            { ipAddress, userAgent }
        );

        // Attach to request for downstream use
        request.deviceInfo = {
            fingerprint,
            isNewDevice,
            ipAddress,
        };

        return true;
    }
}
