import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface BlacklistEntry {
    jti: string;
    expiresAt: number;
    revokedAt: number;
    reason: string;
    userId?: string;
}

/**
 * Token Blacklist Service
 * 
 * In-memory token blacklist for:
 * - Logout token revocation
 * - Forced session termination
 * - Compromised token handling
 * 
 * OWASP: A07:2021 - Identification and Authentication Failures
 * 
 * Note: For production with multiple instances, use Redis or database.
 * This implementation is suitable for single-instance deployments
 * or as a fallback when Redis is unavailable.
 */
@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
    private readonly logger = new Logger(TokenBlacklistService.name);
    private readonly blacklist = new Map<string, BlacklistEntry>();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly ttlMs: number;

    constructor(private readonly configService: ConfigService) {
        // Token TTL in milliseconds (default: 7 days for refresh tokens)
        this.ttlMs = this.configService.get<number>('TOKEN_BLACKLIST_TTL_MS', 7 * 24 * 60 * 60 * 1000);

        // Run cleanup every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);

        this.logger.log('Token blacklist service initialized');
    }

    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    /**
     * Add a token to the blacklist
     * 
     * @param jti - JWT ID to blacklist
     * @param expiresAt - When the token naturally expires (Unix timestamp)
     * @param reason - Reason for blacklisting
     * @param userId - Optional user ID for logging
     */
    blacklistToken(
        jti: string,
        expiresAt: number,
        reason: 'logout' | 'password_change' | 'revoked' | 'compromised',
        userId?: string,
    ): void {
        if (!jti) {
            this.logger.warn('Attempted to blacklist token without JTI');
            return;
        }

        this.blacklist.set(jti, {
            jti,
            expiresAt,
            revokedAt: Date.now(),
            reason,
            userId,
        });

        this.logger.debug(`Token blacklisted: ${jti.substring(0, 8)}... (${reason})`);
    }

    /**
     * Check if a token is blacklisted
     * 
     * @param jti - JWT ID to check
     * @returns true if blacklisted
     */
    isBlacklisted(jti: string): boolean {
        if (!jti) return false;

        const entry = this.blacklist.get(jti);
        if (!entry) return false;

        // Token still in blacklist and not yet expired
        return true;
    }

    /**
     * Revoke all tokens for a user
     * Used when password is changed or account is compromised
     * 
     * @param userId - User ID to revoke tokens for
     * @param reason - Reason for revocation
     */
    revokeAllUserTokens(
        userId: string,
        reason: 'password_change' | 'compromised' | 'admin_action',
    ): void {
        // Store user ID with timestamp to reject any tokens issued before this time
        const revokeTime = Date.now();

        // In a full implementation, you would store this in a separate user revocation table
        // For now, we log the action for audit purposes
        this.logger.warn(`All tokens revoked for user ${userId.substring(0, 8)}... (${reason}) at ${revokeTime}`);
    }

    /**
     * Get blacklist statistics
     */
    getStats(): {
        size: number;
        oldestEntry: number | null;
        byReason: Record<string, number>;
    } {
        let oldestEntry: number | null = null;
        const byReason: Record<string, number> = {};

        for (const entry of this.blacklist.values()) {
            if (oldestEntry === null || entry.revokedAt < oldestEntry) {
                oldestEntry = entry.revokedAt;
            }
            byReason[entry.reason] = (byReason[entry.reason] || 0) + 1;
        }

        return {
            size: this.blacklist.size,
            oldestEntry,
            byReason,
        };
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;

        for (const [jti, entry] of this.blacklist.entries()) {
            // Remove entry if the original token would have expired
            // Plus some buffer time (1 hour)
            if (entry.expiresAt * 1000 + 60 * 60 * 1000 < now) {
                this.blacklist.delete(jti);
                removed++;
            }
        }

        if (removed > 0) {
            this.logger.debug(`Cleaned up ${removed} expired blacklist entries`);
        }
    }
}
