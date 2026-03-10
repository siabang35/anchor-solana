/**
 * Deposit Audit Service
 * 
 * Provides comprehensive audit logging for all financial operations.
 * OWASP A09:2021 - Security Logging and Monitoring Failures
 * 
 * Features:
 * - Immutable audit trail for deposits and withdrawals
 * - Balance change tracking with before/after values
 * - IP, User-Agent, and device fingerprint logging
 * - Failed operation logging for security analysis
 * - Tamper detection with HMAC signatures
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { SupabaseService } from '../../../database/supabase.service.js';

/**
 * Audit event types
 */
export enum AuditEventType {
    // Deposit events
    DEPOSIT_INITIATED = 'deposit.initiated',
    DEPOSIT_VERIFIED = 'deposit.verified',
    DEPOSIT_FAILED = 'deposit.failed',
    DEPOSIT_EXPIRED = 'deposit.expired',

    // Withdrawal events
    WITHDRAWAL_INITIATED = 'withdrawal.initiated',
    WITHDRAWAL_CONFIRMED = 'withdrawal.confirmed',
    WITHDRAWAL_FAILED = 'withdrawal.failed',
    WITHDRAWAL_CANCELLED = 'withdrawal.cancelled',

    // Wallet events
    WALLET_GENERATED = 'wallet.generated',
    WALLET_GENERATION_FAILED = 'wallet.generation_failed',

    // Balance events
    BALANCE_CREDITED = 'balance.credited',
    BALANCE_DEBITED = 'balance.debited',
    BALANCE_LOCKED = 'balance.locked',
    BALANCE_UNLOCKED = 'balance.unlocked',

    // Security events
    VERIFICATION_FAILED = 'security.verification_failed',
    RATE_LIMIT_EXCEEDED = 'security.rate_limit',
    SUSPICIOUS_ACTIVITY = 'security.suspicious',
    ADDRESS_VALIDATION_FAILED = 'security.invalid_address',
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
    eventType: AuditEventType;
    userId: string;
    data: Record<string, any>;
    metadata: {
        ipAddress?: string;
        userAgent?: string;
        deviceFingerprint?: string;
        sessionId?: string;
        requestId?: string;
    };
}

/**
 * Balance change tracking
 */
export interface BalanceChange {
    userId: string;
    currency: string;
    previousBalance: number;
    newBalance: number;
    previousLockedBalance: number;
    newLockedBalance: number;
    changeAmount: number;
    reason: string;
    transactionId?: string;
}

@Injectable()
export class DepositAuditService {
    private readonly logger = new Logger(DepositAuditService.name);
    private readonly hmacSecret: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
    ) {
        // Secret for HMAC signatures (should be in env)
        this.hmacSecret = this.configService.get<string>(
            'AUDIT_HMAC_SECRET',
            'default-audit-secret-change-in-production'
        );
    }

    /**
     * Log an audit event
     */
    async log(entry: AuditLogEntry): Promise<string> {
        const client = this.supabaseService.getAdminClient();
        const eventId = this.generateEventId();
        const timestamp = new Date().toISOString();

        // Create signature for tamper detection
        const signature = this.createSignature({
            eventId,
            eventType: entry.eventType,
            userId: entry.userId,
            timestamp,
            data: entry.data,
        });

        const { error } = await client
            .from('audit_logs')
            .insert({
                id: eventId,
                event_type: entry.eventType,
                user_id: entry.userId,
                data: entry.data,
                metadata: entry.metadata,
                signature,
                created_at: timestamp,
            });

        if (error) {
            // Log to console even if DB fails - critical for security
            this.logger.error('Failed to write audit log to database', {
                error,
                entry,
            });
            // Still log to stdout for log aggregation
            console.log(JSON.stringify({
                type: 'AUDIT_FALLBACK',
                eventId,
                ...entry,
                timestamp,
            }));
        } else {
            this.logger.debug(`Audit log created: ${eventId} - ${entry.eventType}`);
        }

        return eventId;
    }

    /**
     * Log a deposit initiation
     */
    async logDepositInitiated(
        userId: string,
        nonce: string,
        amount: number,
        chain: string,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType: AuditEventType.DEPOSIT_INITIATED,
            userId,
            data: {
                nonce,
                amount,
                chain,
            },
            metadata,
        });
    }

    /**
     * Log a deposit verification
     */
    async logDepositVerified(
        userId: string,
        nonce: string,
        txHash: string,
        amount: number,
        chain: string,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType: AuditEventType.DEPOSIT_VERIFIED,
            userId,
            data: {
                nonce,
                txHash,
                amount,
                chain,
            },
            metadata,
        });
    }

    /**
     * Log a failed deposit verification
     */
    async logDepositFailed(
        userId: string,
        nonce: string,
        reason: string,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType: AuditEventType.DEPOSIT_FAILED,
            userId,
            data: {
                nonce,
                reason,
            },
            metadata,
        });
    }

    /**
     * Log a withdrawal initiation
     */
    async logWithdrawalInitiated(
        userId: string,
        withdrawalId: string,
        amount: number,
        chain: string,
        toAddress: string,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType: AuditEventType.WITHDRAWAL_INITIATED,
            userId,
            data: {
                withdrawalId,
                amount,
                chain,
                toAddress: this.maskAddress(toAddress),
            },
            metadata,
        });
    }

    /**
     * Log a balance change
     */
    async logBalanceChange(change: BalanceChange): Promise<string> {
        const eventType = change.changeAmount >= 0
            ? AuditEventType.BALANCE_CREDITED
            : AuditEventType.BALANCE_DEBITED;

        return this.log({
            eventType,
            userId: change.userId,
            data: {
                currency: change.currency,
                previousBalance: change.previousBalance,
                newBalance: change.newBalance,
                previousLockedBalance: change.previousLockedBalance,
                newLockedBalance: change.newLockedBalance,
                changeAmount: change.changeAmount,
                reason: change.reason,
                transactionId: change.transactionId,
            },
            metadata: {},
        });
    }

    /**
     * Log a security event
     */
    async logSecurityEvent(
        eventType: AuditEventType,
        userId: string,
        description: string,
        data: Record<string, any>,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType,
            userId,
            data: {
                description,
                ...data,
            },
            metadata,
        });
    }

    /**
     * Log wallet generation
     */
    async logWalletGenerated(
        userId: string,
        chain: string,
        address: string,
        metadata: AuditLogEntry['metadata'],
    ): Promise<string> {
        return this.log({
            eventType: AuditEventType.WALLET_GENERATED,
            userId,
            data: {
                chain,
                address: this.maskAddress(address),
            },
            metadata,
        });
    }

    /**
     * Verify audit log signature (tamper detection)
     */
    async verifyLogIntegrity(eventId: string): Promise<boolean> {
        const client = this.supabaseService.getAdminClient();

        const { data, error } = await client
            .from('audit_logs')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error || !data) {
            return false;
        }

        const expectedSignature = this.createSignature({
            eventId: data.id,
            eventType: data.event_type,
            userId: data.user_id,
            timestamp: data.created_at,
            data: data.data,
        });

        return data.signature === expectedSignature;
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(): string {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `audit_${timestamp}_${random}`;
    }

    /**
     * Create HMAC signature for tamper detection
     */
    private createSignature(data: Record<string, any>): string {
        const payload = JSON.stringify(data, Object.keys(data).sort());
        return createHmac('sha256', this.hmacSecret)
            .update(payload)
            .digest('hex');
    }

    /**
     * Mask sensitive address data for logging
     */
    private maskAddress(address: string): string {
        if (!address || address.length < 10) {
            return '***';
        }
        const start = address.slice(0, 6);
        const end = address.slice(-4);
        return `${start}...${end}`;
    }
}
