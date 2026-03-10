import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
    OnModuleInit,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    AdminStatsDto,
    AdminUserDto,
    AdminUserDetailDto,
    AdminUsersQueryDto,
    UpdateUserStatusDto,
    PendingWithdrawalDto,
    ApproveWithdrawalDto,
    RejectWithdrawalDto,
    SystemAlertDto,
    AlertStatus,
    UpdateAlertStatusDto,
    AdminAuditLogDto,
    AdminAuditLogQueryDto,
    UserStatus,
    TrafficStatsDto,
    SecurityConfigDto,
    UpdateSecurityConfigDto,
    RequestLogDto,
    RequestLogQueryDto,
} from './dto/index.js';

/**
 * AdminService
 * 
 * Business logic for admin dashboard operations.
 * All database operations use parameterized queries via Supabase client.
 */
@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    // ========================================================================
    // PLATFORM STATISTICS
    // ========================================================================

    /**
     * Get platform-wide statistics
     * Uses the admin_platform_stats view for efficient aggregation
     */
    async getStats(): Promise<AdminStatsDto> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('admin_platform_stats')
            .select('*')
            .single();

        if (error) {
            this.logger.error(`Failed to fetch platform stats: ${error.message}`);
            // Return zeros rather than failing - dashboard should still load
            return {
                totalUsers: 0,
                newUsersToday: 0,
                newUsersWeek: 0,
                totalTvl: 0,
                totalVolume: 0,
                activeMarkets: 0,
                pendingWithdrawals: 0,
                pendingWithdrawalVolume: 0,
                openAlerts: 0,
                pendingSecurityReviews: 0,
            };
        }

        return {
            totalUsers: data.total_users || 0,
            newUsersToday: data.new_users_today || 0,
            newUsersWeek: data.new_users_week || 0,
            totalTvl: parseFloat(data.total_platform_balance) || 0,
            totalVolume: parseFloat(data.total_market_volume) || 0,
            activeMarkets: data.active_markets || 0,
            pendingWithdrawals: data.pending_withdrawals || 0,
            pendingWithdrawalVolume: parseFloat(data.pending_withdrawal_volume) || 0,
            openAlerts: data.open_alerts || 0,
            pendingSecurityReviews: data.pending_security_reviews || 0,
        };
    }

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    /**
     * List users with filtering and pagination
     */
    async getUsers(query: AdminUsersQueryDto): Promise<{
        data: AdminUserDto[];
        total: number;
        page: number;
        limit: number;
    }> {
        const { search, status, page = 1, limit = 20, sortBy, sortOrder } = query;
        const offset = (page - 1) * limit;

        let queryBuilder = this.supabaseService
            .getAdminClient()
            .from('admin_user_activity')
            .select('*', { count: 'exact' });

        // Apply search filter
        if (search) {
            queryBuilder = queryBuilder.or(
                `email.ilike.%${search}%,full_name.ilike.%${search}%,user_id.eq.${search}`
            );
        }

        // Apply status filter (would need to add status column to view)
        // For now, we'll skip this as it requires profile status

        // Apply sorting
        const sortColumn = this.mapSortField(sortBy || 'created_at');
        queryBuilder = queryBuilder.order(sortColumn, { ascending: sortOrder === 'asc' });

        // Apply pagination
        queryBuilder = queryBuilder.range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to fetch users: ${error.message}`);
            throw new BadRequestException('Failed to fetch users');
        }

        return {
            data: (data || []).map(this.mapToAdminUserDto),
            total: count || 0,
            page,
            limit,
        };
    }

    /**
     * Get detailed user information
     */
    async getUserDetail(userId: string): Promise<AdminUserDetailDto> {
        // Get user from the activity view
        const { data: user, error } = await this.supabaseService
            .getAdminClient()
            .from('admin_user_activity')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !user) {
            throw new NotFoundException('User not found');
        }

        // Get recent login history
        const { data: logins } = await this.supabaseService
            .getAdminClient()
            .from('user_sessions')
            .select('ip_address, user_agent, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Get wallet addresses
        const { data: wallets } = await this.supabaseService
            .getAdminClient()
            .from('wallet_addresses')
            .select('address, chain')
            .eq('user_id', userId);

        return {
            ...this.mapToAdminUserDto(user),
            totalDepositedAmount: parseFloat(user.total_deposited) || 0,
            totalWithdrawnAmount: parseFloat(user.total_withdrawn) || 0,
            openPositions: user.open_positions || 0,
            totalOrders: user.total_orders || 0,
            suspiciousActivityCount: user.suspicious_activity_count || 0,
            recentLogins: (logins || []).map(l => ({
                ipAddress: l.ip_address,
                userAgent: l.user_agent,
                createdAt: l.created_at,
            })),
            walletAddresses: (wallets || []).map(w => ({
                address: w.address,
                chain: w.chain,
            })),
        };
    }

    /**
     * Update user status (suspend/activate)
     */
    async updateUserStatus(
        userId: string,
        dto: UpdateUserStatusDto,
        adminUserId: string,
        ipAddress?: string,
    ): Promise<{ success: boolean }> {
        // Get current user status for audit
        const { data: currentUser, error: fetchError } = await this.supabaseService
            .getAdminClient()
            .from('profiles')
            .select('id, email, account_status')
            .eq('id', userId)
            .single();

        if (fetchError || !currentUser) {
            throw new NotFoundException('User not found');
        }

        // Update profile status
        const { error: updateError } = await this.supabaseService
            .getAdminClient()
            .from('profiles')
            .update({
                account_status: dto.status,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (updateError) {
            this.logger.error(`Failed to update user status: ${updateError.message}`);
            throw new BadRequestException('Failed to update user status');
        }

        // Log admin action
        await this.logAdminAction(adminUserId, 'update_user_status', 'user_management', {
            resourceType: 'user',
            resourceId: userId,
            oldValues: { status: currentUser.account_status },
            newValues: { status: dto.status, reason: dto.reason },
            ipAddress,
        });

        return { success: true };
    }

    // ========================================================================
    // WITHDRAWAL APPROVALS
    // ========================================================================

    /**
     * Get pending withdrawals requiring admin approval
     */
    async getPendingWithdrawals(): Promise<PendingWithdrawalDto[]> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('withdrawal_approvals')
            .select(`
                id,
                withdrawal_id,
                user_id,
                amount,
                currency,
                chain,
                to_address,
                risk_score,
                risk_factors,
                requires_second_approval,
                status,
                created_at,
                expires_at
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch pending withdrawals: ${error.message}`);
            throw new BadRequestException('Failed to fetch pending withdrawals');
        }

        if (!data || data.length === 0) {
            return [];
        }

        // Manual join to avoid relationship error
        const userIds = [...new Set(data.map(w => w.user_id))];
        let emailMap = new Map<string, string>();

        if (userIds.length > 0) {
            const { data: profiles, error: profilesError } = await this.supabaseService
                .getAdminClient()
                .from('profiles')
                .select('id, email')
                .in('id', userIds);

            if (profilesError) {
                this.logger.error(`Failed to fetch profiles for withdrawals: ${profilesError.message}`);
            } else if (profiles) {
                emailMap = new Map((profiles).map(p => [p.id, p.email]));
            }
        }

        return data.map(w => ({
            id: w.id,
            withdrawalId: w.withdrawal_id,
            userId: w.user_id,
            userEmail: emailMap.get(w.user_id) || 'Unknown',
            amount: parseFloat(w.amount),
            currency: w.currency,
            chain: w.chain,
            toAddress: w.to_address,
            riskScore: w.risk_score,
            riskFactors: w.risk_factors || [],
            requiresSecondApproval: w.requires_second_approval,
            status: w.status,
            createdAt: w.created_at,
            expiresAt: w.expires_at,
        }));
    }

    /**
     * Approve a pending withdrawal
     */
    async approveWithdrawal(
        approvalId: string,
        dto: ApproveWithdrawalDto,
        adminUserId: string,
        ipAddress?: string,
    ): Promise<{ success: boolean }> {
        // Use the database function for atomic approval
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .rpc('approve_withdrawal', {
                p_approval_id: approvalId,
                p_admin_user_id: adminUserId,
                p_notes: dto.notes || null,
            });

        if (error) {
            this.logger.error(`Failed to approve withdrawal: ${error.message}`);
            throw new BadRequestException('Failed to approve withdrawal');
        }

        if (!data) {
            throw new NotFoundException('Withdrawal approval not found or already processed');
        }

        return { success: true };
    }

    /**
     * Reject a pending withdrawal
     */
    async rejectWithdrawal(
        approvalId: string,
        dto: RejectWithdrawalDto,
        adminUserId: string,
        ipAddress?: string,
    ): Promise<{ success: boolean }> {
        // Use the database function for atomic rejection
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .rpc('reject_withdrawal', {
                p_approval_id: approvalId,
                p_admin_user_id: adminUserId,
                p_reason: dto.reason,
            });

        if (error) {
            this.logger.error(`Failed to reject withdrawal: ${error.message}`);
            throw new BadRequestException('Failed to reject withdrawal');
        }

        if (!data) {
            throw new NotFoundException('Withdrawal approval not found or already processed');
        }

        return { success: true };
    }

    // ========================================================================
    // SYSTEM ALERTS
    // ========================================================================

    /**
     * Get system alerts
     */
    async getAlerts(status?: AlertStatus): Promise<SystemAlertDto[]> {
        let query = this.supabaseService
            .getAdminClient()
            .from('system_alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (status) {
            query = query.eq('status', status);
        } else {
            // Default to open/acknowledged alerts
            query = query.in('status', ['open', 'acknowledged', 'investigating']);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to fetch alerts: ${error.message}`);
            throw new BadRequestException('Failed to fetch alerts');
        }

        return (data || []).map(a => ({
            id: a.id,
            type: a.alert_type,
            severity: a.severity,
            title: a.title,
            description: a.description,
            status: a.status,
            resourceType: a.resource_type,
            resourceId: a.resource_id,
            userId: a.user_id,
            acknowledgedBy: a.acknowledged_by,
            acknowledgedAt: a.acknowledged_at,
            resolvedBy: a.resolved_by,
            resolvedAt: a.resolved_at,
            createdAt: a.created_at,
        }));
    }

    /**
     * Update alert status
     */
    async updateAlertStatus(
        alertId: string,
        dto: UpdateAlertStatusDto,
        adminUserId: string,
    ): Promise<{ success: boolean }> {
        const updateData: any = {
            status: dto.status,
        };

        if (dto.status === 'acknowledged') {
            updateData.acknowledged_by = adminUserId;
            updateData.acknowledged_at = new Date().toISOString();
        } else if (dto.status === 'resolved') {
            updateData.resolved_by = adminUserId;
            updateData.resolved_at = new Date().toISOString();
            updateData.resolution_notes = dto.notes;
        }

        const { error } = await this.supabaseService
            .getAdminClient()
            .from('system_alerts')
            .update(updateData)
            .eq('id', alertId);

        if (error) {
            this.logger.error(`Failed to update alert: ${error.message}`);
            throw new BadRequestException('Failed to update alert');
        }

        return { success: true };
    }

    // ========================================================================
    // AUDIT LOG
    // ========================================================================

    /**
     * Get admin audit log (super admin only)
     */
    async getAuditLog(query: AdminAuditLogQueryDto): Promise<{
        data: AdminAuditLogDto[];
        total: number;
    }> {
        const { actorId, action, category, page = 1, limit = 50 } = query;
        const offset = (page - 1) * limit;

        let queryBuilder = this.supabaseService
            .getAdminClient()
            .from('admin_audit_log')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (actorId) {
            queryBuilder = queryBuilder.eq('actor_user_id', actorId);
        }
        if (action) {
            queryBuilder = queryBuilder.eq('action', action);
        }
        if (category) {
            queryBuilder = queryBuilder.eq('action_category', category);
        }

        queryBuilder = queryBuilder.range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to fetch audit log: ${error.message}`);
            throw new BadRequestException('Failed to fetch audit log');
        }

        return {
            data: (data || []).map(a => ({
                id: a.id,
                actorUserId: a.actor_user_id,
                actorEmail: a.actor_email,
                action: a.action,
                actionCategory: a.action_category,
                resourceType: a.resource_type,
                resourceId: a.resource_id,
                status: a.status,
                ipAddress: a.ip_address,
                createdAt: a.created_at,
            })),
            total: count || 0,
        };
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private mapSortField(field: string): string {
        const mapping: Record<string, string> = {
            created_at: 'signup_date',
            balance: 'balance',
            last_login: 'last_active',
            risk_score: 'suspicious_activity_count',
        };
        return mapping[field] || 'signup_date';
    }

    private mapToAdminUserDto(user: any): AdminUserDto {
        return {
            id: user.user_id,
            email: user.email || '',
            fullName: user.full_name || '',
            status: UserStatus.ACTIVE, // Would need status column
            balance: parseFloat(user.balance) || 0,
            lockedBalance: parseFloat(user.locked_balance) || 0,
            riskScore: user.suspicious_activity_count || 0,
            totalDeposits: user.total_deposits || 0,
            totalWithdrawals: user.total_withdrawals || 0,
            lastLoginAt: user.last_active || '',
            createdAt: user.signup_date || '',
        };
    }

    private async logAdminAction(
        adminUserId: string,
        action: string,
        category: string,
        options: {
            resourceType?: string;
            resourceId?: string;
            oldValues?: any;
            newValues?: any;
            ipAddress?: string;
        } = {},
    ): Promise<void> {
        try {
            await this.supabaseService.getAdminClient().rpc('log_admin_action', {
                p_actor_user_id: adminUserId,
                p_action: action,
                p_category: category,
                p_resource_type: options.resourceType || null,
                p_resource_id: options.resourceId || null,
                p_old_values: options.oldValues ? JSON.stringify(options.oldValues) : null,
                p_new_values: options.newValues ? JSON.stringify(options.newValues) : null,
                p_ip_address: options.ipAddress || null,
            });
        } catch (error) {
            // Don't fail the operation if audit logging fails
            this.logger.error(`Failed to log admin action: ${error.message}`);
        }
    }
}
