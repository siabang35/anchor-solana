import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';

/**
 * SecurityService
 * 
 * Handles security-related operations:
 * - Rate limiting checks
 * - IP blacklist management
 * - Suspicious activity logging
 * - Device fingerprint tracking
 */
@Injectable()
export class SecurityService {
    private readonly logger = new Logger(SecurityService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    // ========================================================================
    // RATE LIMITING
    // ========================================================================

    /**
     * Check if a request should be rate limited
     * Uses the database function for atomic check-and-update
     */
    async checkRateLimit(
        identifier: string,
        endpoint: string,
        limit: number = 100,
        windowSeconds: number = 60,
        identifierType: 'user' | 'ip' | 'api_key' | 'anonymous' = 'ip',
    ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
        try {
            const { data, error } = await this.supabaseService
                .getAdminClient()
                .rpc('check_rate_limit', {
                    p_identifier_type: identifierType,
                    p_identifier: identifier,
                    p_endpoint: endpoint,
                    p_max_requests: limit,
                    p_window_seconds: windowSeconds,
                });

            if (error) {
                this.logger.error(`Rate limit check failed: ${error.message}`);
                // Fail open - allow request if rate limit check fails
                return { allowed: true, remaining: limit, resetAt: new Date() };
            }

            // RPC function returns a TABLE, so data is an array - get first row
            const result = Array.isArray(data) ? data[0] : data;
            if (!result) {
                this.logger.warn('Rate limit check returned no data');
                return { allowed: true, remaining: limit, resetAt: new Date() };
            }

            return {
                allowed: result.allowed,
                remaining: result.remaining ?? limit,
                resetAt: new Date(result.reset_at),
            };
        } catch (error) {
            this.logger.error(`Rate limit error: ${error.message}`);
            return { allowed: true, remaining: limit, resetAt: new Date() };
        }
    }

    // ========================================================================
    // IP BLACKLIST
    // ========================================================================

    /**
     * Check if an IP address is blacklisted
     */
    async isIpBlacklisted(ipAddress: string): Promise<boolean> {
        try {
            const { data, error } = await this.supabaseService
                .getAdminClient()
                .rpc('is_ip_blacklisted', { p_ip_address: ipAddress });

            if (error) {
                this.logger.error(`IP blacklist check failed: ${error.message}`);
                return false; // Fail open
            }

            return data === true;
        } catch (error) {
            this.logger.error(`IP blacklist error: ${error.message}`);
            return false;
        }
    }

    /**
     * Block an IP address
     */
    async blockIp(
        ipAddress: string,
        reason: string,
        blockedBy: string,
        expiresAt?: Date,
    ): Promise<{ success: boolean }> {
        try {
            const { error } = await this.supabaseService
                .getAdminClient()
                .rpc('block_ip', {
                    p_ip_address: ipAddress,
                    p_reason: reason,
                    p_blocked_by: blockedBy,
                    p_expires_at: expiresAt?.toISOString() || null,
                });

            if (error) {
                this.logger.error(`Failed to block IP: ${error.message}`);
                throw new BadRequestException('Failed to block IP address');
            }

            return { success: true };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Block IP error: ${error.message}`);
            throw new BadRequestException('Failed to block IP address');
        }
    }

    /**
     * Unblock an IP address
     */
    async unblockIp(ipAddress: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('ip_blacklist')
            .update({ is_active: false })
            .eq('ip_address', ipAddress);

        if (error) {
            this.logger.error(`Failed to unblock IP: ${error.message}`);
            throw new BadRequestException('Failed to unblock IP address');
        }

        return { success: true };
    }

    /**
     * Get list of blacklisted IPs
     */
    async getBlacklistedIps(): Promise<Array<{
        ipAddress: string;
        reason: string;
        blockedAt: string;
        expiresAt: string | null;
    }>> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('ip_blacklist')
            .select('ip_address, reason, created_at, expires_at')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch blacklisted IPs: ${error.message}`);
            return [];
        }

        return (data || []).map(ip => ({
            ipAddress: ip.ip_address,
            reason: ip.reason,
            blockedAt: ip.created_at,
            expiresAt: ip.expires_at,
        }));
    }

    // ========================================================================
    // SUSPICIOUS ACTIVITY
    // ========================================================================

    /**
     * Log suspicious activity
     */
    async logSuspiciousActivity(
        activityType: string,
        description: string,
        riskScore: number,
        options: {
            userId?: string;
            ipAddress?: string;
            deviceFingerprint?: string;
            metadata?: Record<string, any>;
        } = {},
    ): Promise<string> {
        try {
            const { data, error } = await this.supabaseService
                .getAdminClient()
                .rpc('log_suspicious_activity', {
                    p_user_id: options.userId || null,
                    p_activity_type: activityType,
                    p_description: description,
                    p_risk_score: riskScore,
                    p_ip_address: options.ipAddress || null,
                    p_device_fingerprint: options.deviceFingerprint || null,
                    p_metadata: options.metadata ? JSON.stringify(options.metadata) : null,
                });

            if (error) {
                this.logger.error(`Failed to log suspicious activity: ${error.message}`);
                return '';
            }

            // Auto-block IP for very high risk activities
            if (riskScore >= 90 && options.ipAddress) {
                await this.blockIp(
                    options.ipAddress,
                    `Auto-blocked due to high-risk activity: ${activityType}`,
                    'system',
                );
            }

            return data;
        } catch (error) {
            this.logger.error(`Suspicious activity logging error: ${error.message}`);
            return '';
        }
    }

    /**
     * Get pending suspicious activities for review
     */
    async getPendingSuspiciousActivities(): Promise<Array<{
        id: string;
        userId: string;
        activityType: string;
        description: string;
        riskScore: number;
        ipAddress: string;
        status: string;
        createdAt: string;
    }>> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('suspicious_activity')
            .select('*')
            .eq('status', 'pending')
            .order('risk_score', { ascending: false })
            .limit(100);

        if (error) {
            this.logger.error(`Failed to fetch suspicious activities: ${error.message}`);
            return [];
        }

        return (data || []).map(a => ({
            id: a.id,
            userId: a.user_id,
            activityType: a.activity_type,
            description: a.description,
            riskScore: a.risk_score,
            ipAddress: a.ip_address,
            status: a.status,
            createdAt: a.created_at,
        }));
    }

    // ========================================================================
    // DEVICE FINGERPRINTS
    // ========================================================================

    /**
     * Register or update a device fingerprint for a user
     */
    async registerDeviceFingerprint(
        userId: string,
        fingerprint: string,
        metadata: {
            userAgent?: string;
            ipAddress?: string;
            location?: string;
        } = {},
    ): Promise<{ isNewDevice: boolean; deviceId: string }> {
        // Check if fingerprint exists for this user
        const { data: existing } = await this.supabaseService
            .getAdminClient()
            .from('device_fingerprints')
            .select('id, last_seen_at')
            .eq('user_id', userId)
            .eq('fingerprint', fingerprint)
            .single();

        if (existing) {
            // Update last seen
            await this.supabaseService
                .getAdminClient()
                .from('device_fingerprints')
                .update({
                    last_seen_at: new Date().toISOString(),
                    ip_address: metadata.ipAddress,
                })
                .eq('id', existing.id);

            return { isNewDevice: false, deviceId: existing.id };
        }

        // Create new fingerprint record
        const { data: newDevice, error } = await this.supabaseService
            .getAdminClient()
            .from('device_fingerprints')
            .insert({
                user_id: userId,
                fingerprint,
                user_agent: metadata.userAgent,
                ip_address: metadata.ipAddress,
                location: metadata.location,
            })
            .select('id')
            .single();

        if (error) {
            this.logger.error(`Failed to register device: ${error.message}`);
            return { isNewDevice: true, deviceId: '' };
        }

        // Log new device as potential suspicious activity (low risk)
        await this.logSuspiciousActivity(
            'new_device',
            'Login from new device',
            20,
            { userId, ipAddress: metadata.ipAddress, deviceFingerprint: fingerprint }
        );

        return { isNewDevice: true, deviceId: newDevice.id };
    }

    /**
     * Check if a device is trusted for a user
     */
    async isDeviceTrusted(userId: string, fingerprint: string): Promise<boolean> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('device_fingerprints')
            .select('is_trusted')
            .eq('user_id', userId)
            .eq('fingerprint', fingerprint)
            .single();

        if (error || !data) {
            return false;
        }

        return data.is_trusted === true;
    }

    // ========================================================================
    // WITHDRAWAL LIMITS
    // ========================================================================

    /**
     * Check if a withdrawal is allowed based on limits
     */
    async checkWithdrawalAllowed(
        userId: string,
        amount: number,
        currency: string = 'USDC',
    ): Promise<{
        allowed: boolean;
        reason?: string;
        dailyRemaining: number;
        monthlyRemaining: number;
    }> {
        try {
            const { data, error } = await this.supabaseService
                .getAdminClient()
                .rpc('check_withdrawal_allowed', {
                    p_user_id: userId,
                    p_amount: amount,
                    p_currency: currency,
                });

            if (error) {
                this.logger.error(`Withdrawal limit check failed: ${error.message}`);
                // Fail secure - deny if check fails
                return {
                    allowed: false,
                    reason: 'Unable to verify withdrawal limits',
                    dailyRemaining: 0,
                    monthlyRemaining: 0,
                };
            }

            return {
                allowed: data.allowed,
                reason: data.reason,
                dailyRemaining: parseFloat(data.daily_remaining) || 0,
                monthlyRemaining: parseFloat(data.monthly_remaining) || 0,
            };
        } catch (error) {
            this.logger.error(`Withdrawal limit error: ${error.message}`);
            return {
                allowed: false,
                reason: 'Withdrawal limit check failed',
                dailyRemaining: 0,
                monthlyRemaining: 0,
            };
        }
    }
}
