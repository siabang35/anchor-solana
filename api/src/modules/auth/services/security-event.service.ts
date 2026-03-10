import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../../database/supabase.service.js';

export type SecurityEventType =
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    | 'SIGNUP'
    | 'PASSWORD_CHANGE'
    | 'WALLET_CONNECTED'
    | 'WALLET_DISCONNECTED'
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_UNLOCKED'
    | 'TOKEN_REFRESH'
    | 'TOKEN_REVOKED'
    | 'SUSPICIOUS_ACTIVITY'
    | 'BRUTE_FORCE_ATTEMPT'
    | 'CSRF_VIOLATION'
    | 'INVALID_TOKEN';

export interface SecurityEvent {
    type: SecurityEventType;
    userId?: string;
    ipAddress: string;
    userAgent: string;
    details?: Record<string, any>;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
}

/**
 * Security Event Service
 * 
 * Centralized security event logging for:
 * - Compliance and audit requirements
 * - Threat detection and incident response
 * - User activity tracking
 * - Security analytics
 * 
 * OWASP: A09:2021 - Security Logging and Monitoring Failures
 */
@Injectable()
export class SecurityEventService {
    private readonly logger = new Logger('SecurityEvent');
    private readonly persistEvents: boolean;

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
    ) {
        this.persistEvents = this.configService.get('PERSIST_SECURITY_EVENTS', 'false') === 'true';
    }

    /**
     * Log a security event
     */
    async log(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
        const fullEvent: SecurityEvent = {
            ...event,
            timestamp: new Date(),
        };

        // Always log to console with appropriate level
        this.logToConsole(fullEvent);

        // Optionally persist to database
        if (this.persistEvents) {
            await this.persistToDatabase(fullEvent);
        }
    }

    /**
     * Log successful login
     */
    async loginSuccess(
        userId: string,
        ipAddress: string,
        userAgent: string,
        method: 'email' | 'wallet' | 'google' | 'magic_link',
    ): Promise<void> {
        await this.log({
            type: 'LOGIN_SUCCESS',
            userId,
            ipAddress,
            userAgent,
            severity: 'low',
            details: { method },
        });
    }

    /**
     * Log failed login attempt
     */
    async loginFailed(
        identifier: string,
        ipAddress: string,
        userAgent: string,
        reason: string,
    ): Promise<void> {
        await this.log({
            type: 'LOGIN_FAILED',
            ipAddress,
            userAgent,
            severity: 'medium',
            details: { identifier: this.maskIdentifier(identifier), reason },
        });
    }

    /**
     * Log account lockout
     */
    async accountLocked(
        identifier: string,
        ipAddress: string,
        userAgent: string,
        attemptCount: number,
    ): Promise<void> {
        await this.log({
            type: 'ACCOUNT_LOCKED',
            ipAddress,
            userAgent,
            severity: 'high',
            details: {
                identifier: this.maskIdentifier(identifier),
                attemptCount,
            },
        });
    }

    /**
     * Log brute force detection
     */
    async bruteForceDetected(
        ipAddress: string,
        userAgent: string,
        targetCount: number,
    ): Promise<void> {
        await this.log({
            type: 'BRUTE_FORCE_ATTEMPT',
            ipAddress,
            userAgent,
            severity: 'critical',
            details: { targetCount },
        });
    }

    /**
     * Log suspicious activity
     */
    async suspiciousActivity(
        reason: string,
        ipAddress: string,
        userAgent: string,
        details?: Record<string, any>,
    ): Promise<void> {
        await this.log({
            type: 'SUSPICIOUS_ACTIVITY',
            ipAddress,
            userAgent,
            severity: 'high',
            details: { reason, ...details },
        });
    }

    /**
     * Log CSRF violation
     */
    async csrfViolation(
        ipAddress: string,
        userAgent: string,
        endpoint: string,
    ): Promise<void> {
        await this.log({
            type: 'CSRF_VIOLATION',
            ipAddress,
            userAgent,
            severity: 'high',
            details: { endpoint },
        });
    }

    /**
     * Log console with appropriate level
     */
    private logToConsole(event: SecurityEvent): void {
        const message = this.formatLogMessage(event);

        switch (event.severity) {
            case 'critical':
                this.logger.error(`🚨 ${message}`);
                break;
            case 'high':
                this.logger.warn(`⚠️ ${message}`);
                break;
            case 'medium':
                this.logger.log(`📋 ${message}`);
                break;
            case 'low':
                this.logger.debug(`ℹ️ ${message}`);
                break;
        }
    }

    /**
     * Format log message
     */
    private formatLogMessage(event: SecurityEvent): string {
        const parts = [
            `[${event.type}]`,
            event.userId ? `User: ${event.userId.substring(0, 8)}...` : 'Anonymous',
            `IP: ${event.ipAddress}`,
        ];

        if (event.details) {
            const detailStr = Object.entries(event.details)
                .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(' ');
            parts.push(detailStr);
        }

        return parts.join(' | ');
    }

    /**
     * Persist event to database
     */
    private async persistToDatabase(event: SecurityEvent): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            await supabase.from('security_events').insert({
                event_type: event.type,
                user_id: event.userId || null,
                ip_address: event.ipAddress,
                user_agent: event.userAgent,
                severity: event.severity,
                details: event.details || {},
                created_at: event.timestamp.toISOString(),
            });
        } catch (error) {
            // Don't let persistence failures affect the main flow
            this.logger.warn(`Failed to persist security event: ${error}`);
        }
    }

    /**
     * Mask sensitive identifier for logging
     */
    private maskIdentifier(identifier: string): string {
        if (!identifier) return 'unknown';

        if (identifier.includes('@')) {
            // Email: mask middle part
            const [local, domain] = identifier.split('@');
            const maskedLocal = local.length > 2
                ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
                : '*'.repeat(local.length);
            return `${maskedLocal}@${domain}`;
        }

        // Wallet address or other: show first and last 4 chars
        if (identifier.length > 10) {
            return `${identifier.substring(0, 4)}...${identifier.substring(identifier.length - 4)}`;
        }

        return '*'.repeat(identifier.length);
    }
}
