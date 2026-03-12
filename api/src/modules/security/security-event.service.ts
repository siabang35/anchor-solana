/**
 * Security Event Service
 * 
 * Centralized security event logging for forensics and compliance.
 * Logs authentication failures, rate limit violations, suspicious activities.
 * 
 * OWASP A09:2021 - Security Logging and Monitoring Failures
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SecurityEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
    type: string;
    severity: SecurityEventSeverity;
    userId?: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
}

interface SecurityEventLog extends SecurityEvent {
    timestamp: string;
    requestId?: string;
}

@Injectable()
export class SecurityEventService {
    private readonly logger = new Logger('SecurityEvent');
    private readonly enabled: boolean;

    constructor(@Optional() private readonly configService?: ConfigService) {
        this.enabled = this.configService?.get('ENABLE_SECURITY_LOGGING') !== 'false';
    }

    /**
     * Log a security event
     */
    async logEvent(event: SecurityEvent, requestId?: string): Promise<void> {
        if (!this.enabled) return;

        const logEntry: SecurityEventLog = {
            timestamp: new Date().toISOString(),
            requestId,
            ...event,
        };

        // Log based on severity
        const message = `[${event.type}] ${this.formatEventMessage(logEntry)}`;

        switch (event.severity) {
            case 'critical':
                this.logger.error(message);
                break;
            case 'high':
                this.logger.warn(message);
                break;
            case 'medium':
                this.logger.warn(message);
                break;
            default:
                this.logger.log(message);
        }

        // In production, persist to database for forensics
        // await this.persistEvent(logEntry);
    }

    /**
     * Log authentication failure
     */
    async logAuthFailure(
        ip: string,
        reason: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.logEvent({
            type: 'AUTH_FAILURE',
            severity: 'medium',
            ip,
            details: { reason, ...details },
        });
    }

    /**
     * Log suspicious login attempt
     */
    async logSuspiciousLogin(
        userId: string,
        ip: string,
        reason: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.logEvent({
            type: 'SUSPICIOUS_LOGIN',
            severity: 'high',
            userId,
            ip,
            details: { reason, ...details },
        });
    }

    /**
     * Log rate limit violation
     */
    async logRateLimitViolation(
        ip: string,
        endpoint: string,
        userId?: string,
    ): Promise<void> {
        await this.logEvent({
            type: 'RATE_LIMIT_VIOLATION',
            severity: 'medium',
            ip,
            userId,
            details: { endpoint },
        });
    }

    /**
     * Log brute force attempt
     */
    async logBruteForceAttempt(
        ip: string,
        targetType: 'email' | 'wallet' | 'otp',
        target: string,
    ): Promise<void> {
        await this.logEvent({
            type: 'BRUTE_FORCE_ATTEMPT',
            severity: 'high',
            ip,
            details: { targetType, target: this.maskSensitive(target, targetType) },
        });
    }

    /**
     * Log CSRF token mismatch
     */
    async logCsrfViolation(ip: string, userAgent?: string): Promise<void> {
        await this.logEvent({
            type: 'CSRF_VIOLATION',
            severity: 'high',
            ip,
            userAgent,
        });
    }

    /**
     * Log XSS/injection attempt
     */
    async logInjectionAttempt(
        ip: string,
        field: string,
        pattern: string,
    ): Promise<void> {
        await this.logEvent({
            type: 'INJECTION_ATTEMPT',
            severity: 'critical',
            ip,
            details: { field, pattern },
        });
    }

    /**
     * Log unauthorized access attempt
     */
    async logUnauthorizedAccess(
        ip: string,
        resource: string,
        userId?: string,
    ): Promise<void> {
        await this.logEvent({
            type: 'UNAUTHORIZED_ACCESS',
            severity: 'high',
            ip,
            userId,
            details: { resource },
        });
    }

    /**
     * Log WebSocket security event
     */
    async logWsSecurityEvent(
        eventType: 'WS_AUTH_FAILURE' | 'WS_RATE_LIMIT' | 'WS_INVALID_MESSAGE',
        ip: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.logEvent({
            type: eventType,
            severity: 'medium',
            ip,
            details,
        });
    }

    /**
     * Log admin action for audit trail
     */
    async logAdminAction(
        adminId: string,
        action: string,
        targetId?: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.logEvent({
            type: 'ADMIN_ACTION',
            severity: 'low',
            userId: adminId,
            details: { action, targetId, ...details },
        });
    }

    /**
     * Log financial security event
     */
    async logFinancialSecurity(
        userId: string,
        eventType: 'LARGE_WITHDRAWAL' | 'DUPLICATE_ORDER' | 'SUSPICIOUS_ACTIVITY',
        amount?: number,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.logEvent({
            type: eventType,
            severity: eventType === 'SUSPICIOUS_ACTIVITY' ? 'high' : 'medium',
            userId,
            details: { amount, ...details },
        });
    }

    /**
     * Format event message for logging
     */
    private formatEventMessage(event: SecurityEventLog): string {
        const parts: string[] = [];

        if (event.userId) parts.push(`User: ${event.userId}`);
        if (event.ip) parts.push(`IP: ${event.ip}`);
        if (event.requestId) parts.push(`ReqID: ${event.requestId}`);

        if (event.details) {
            const detailStr = Object.entries(event.details)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ');
            parts.push(detailStr);
        }

        return parts.join(' | ');
    }

    /**
     * Mask sensitive data for logging
     */
    private maskSensitive(value: string, type: string): string {
        switch (type) {
            case 'email':
                const [user, domain] = value.split('@');
                return `${user.substring(0, 2)}***@${domain}`;
            case 'wallet':
                return `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
            default:
                return '***';
        }
    }
}
