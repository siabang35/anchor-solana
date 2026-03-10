/**
 * Privy Authentication Guard
 * 
 * Provides additional security layer by verifying Privy tokens
 * on sensitive financial operations.
 * 
 * OWASP A07:2021 - Identification and Authentication Failures
 * 
 * This guard:
 * - Validates Privy access tokens
 * - Cross-validates Privy DID against JWT user
 * - Logs failed verification attempts
 * - Supports optional enforcement (can be bypassed if Privy not configured)
 */

import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrivyService } from '../services/privy.service.js';

/**
 * Decorator key for requiring Privy verification
 */
export const REQUIRE_PRIVY_KEY = 'requirePrivy';

/**
 * Options for Privy verification
 */
export interface PrivyVerifyOptions {
    /** If true, require exact DID match with JWT user's privy_user_id */
    strictUserMatch?: boolean;
    /** Header name for Privy token (default: x-privy-token) */
    tokenHeader?: string;
    /** If true, skip verification when Privy is not configured */
    allowBypassIfNotConfigured?: boolean;
}

/**
 * Decorator to require Privy verification on an endpoint
 */
export function RequirePrivy(options: PrivyVerifyOptions = {}): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        Reflect.defineMetadata(REQUIRE_PRIVY_KEY, options, descriptor.value!);
        return descriptor;
    };
}

@Injectable()
export class PrivyAuthGuard implements CanActivate {
    private readonly logger = new Logger(PrivyAuthGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly privyService: PrivyService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Get options from decorator
        const options = this.reflector.get<PrivyVerifyOptions>(
            REQUIRE_PRIVY_KEY,
            context.getHandler(),
        );

        // If no @RequirePrivy decorator, allow
        if (!options) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const tokenHeader = options.tokenHeader || 'x-privy-token';
        const privyToken = request.headers[tokenHeader];

        // Check if Privy is configured
        if (!this.privyService.isConfigured()) {
            if (options.allowBypassIfNotConfigured) {
                this.logger.warn('Privy not configured, bypassing verification');
                return true;
            }
            throw new UnauthorizedException('Privy authentication is required but not configured');
        }

        // Require token
        if (!privyToken) {
            this.logFailedAttempt(request, 'Missing Privy token');
            throw new UnauthorizedException('Privy authentication token required');
        }

        try {
            // Verify the token
            const payload = await this.privyService.verifyToken(privyToken);

            // Attach Privy user info to request
            request.privyUser = {
                did: payload.sub,
                linkedAccounts: payload.linked_accounts || [],
                sessionId: payload.sid,
            };

            // Strict user match: verify Privy DID matches the JWT user's privy_user_id
            if (options.strictUserMatch && request.user) {
                const expectedPrivyId = request.user.privy_user_id || request.user.privyUserId;

                if (expectedPrivyId && payload.sub !== expectedPrivyId) {
                    this.logFailedAttempt(request, `Privy DID mismatch: expected ${expectedPrivyId}, got ${payload.sub}`);
                    throw new UnauthorizedException('Privy user does not match authenticated user');
                }
            }

            this.logger.debug(`Privy verification successful for ${payload.sub}`);
            return true;

        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }

            this.logFailedAttempt(request, `Token verification failed: ${error.message}`);
            throw new UnauthorizedException('Invalid Privy authentication token');
        }
    }

    /**
     * Log failed verification attempts for security monitoring
     */
    private logFailedAttempt(request: any, reason: string): void {
        const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
        const userId = request.user?.id || request.user?.sub || 'unauthenticated';
        const userAgent = request.headers['user-agent'] || 'unknown';
        const endpoint = `${request.method} ${request.path}`;

        this.logger.warn({
            message: 'Privy verification failed',
            reason,
            ip,
            userId,
            userAgent,
            endpoint,
            timestamp: new Date().toISOString(),
        });
    }
}

/**
 * Extended request interface with Privy user info
 */
export interface RequestWithPrivy extends Request {
    privyUser?: {
        did: string;
        linkedAccounts: Array<{
            type: string;
            address?: string;
            chain_type?: string;
        }>;
        sessionId?: string;
    };
}
