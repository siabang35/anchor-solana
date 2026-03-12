import { apiRequest, API_URL } from './api';
import { io, Socket } from 'socket.io-client';

// Types mimicking the SQL schema
export interface DashboardStats {
    totalUsers: number;
    newUsersToday: number;
    newUsersWeek: number;
    totalTvl: number;
    totalVolume: number;
    activeMarkets: number;
    pendingWithdrawals: number;
    pendingWithdrawalVolume: number;
    openAlerts: number;
    pendingSecurityReviews: number;
}

export interface AdminUser {
    id: string;
    email: string;
    fullName: string;
    status: string;
    balance: number;
    lockedBalance: number;
    riskScore: number;
    totalDeposits: number;
    totalWithdrawals: number;
    lastLoginAt: string;
    createdAt: string;
}

export interface WithdrawalRequest {
    id: string;
    withdrawalId: string;
    userId: string;
    userEmail: string;
    amount: number;
    currency: string;
    chain: string;
    toAddress: string;
    status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired';
    riskScore: number;
    riskFactors: string[];
    requiresSecondApproval: boolean;
    createdAt: string;
    expiresAt: string;

    // Optional for display
    userName?: string;
}

export interface SystemAlert {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    description: string;
    status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'dismissed';
    resourceType?: string;
    resourceId?: string;
    userId?: string;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    resolvedBy?: string;
    resolvedAt?: string;
    createdAt: string;
}

export interface SuspiciousActivity {
    id: string;
    actorUserId: string;
    actorEmail?: string;
    action: string;
    actionCategory: string;
    resourceType?: string;
    resourceId?: string;
    status: string;
    ipAddress?: string;
    createdAt: string;
    // Extended properties for UI display
    type?: string;
    description?: string;
    userId?: string;
    riskScore?: number;
}

export interface AdminAuditLogQuery {
    actorId?: string;
    action?: string;
    category?: string;
    page?: number;
    limit?: number;
}

export const adminApi = {
    // Check if current user is admin
    async checkIsAdmin(): Promise<boolean> {
        try {
            await apiRequest('/admin/stats');
            return true;
        } catch (error) {
            return false;
        }
    },

    // Dashboard
    getStats: async (): Promise<DashboardStats> => {
        try {
            return await apiRequest<DashboardStats>('/admin/stats');
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
            throw error;
        }
    },

    // User Management
    getUsers: async (search?: string, page = 1, limit = 10, signal?: AbortSignal): Promise<{ data: AdminUser[], total: number }> => {
        const query = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            ...(search ? { search: search.trim() } : {})
        });
        return apiRequest<{ data: AdminUser[], total: number }>(`/admin/users?${query}`, { signal });
    },

    getUserDetail: async (id: string): Promise<any> => {
        return apiRequest(`/admin/users/${id}`);
    },

    updateUserStatus: async (userId: string, status: 'active' | 'suspended', reason?: string): Promise<void> => {
        return apiRequest(`/admin/users/${userId}/status`, {
            method: 'PATCH',
            body: { status, reason }
        });
    },

    // Finance & Withdrawals
    getPendingWithdrawals: async (signal?: AbortSignal): Promise<WithdrawalRequest[]> => {
        return apiRequest<WithdrawalRequest[]>('/admin/withdrawals/pending', { signal });
    },

    approveWithdrawal: async (id: string, txHash?: string): Promise<void> => {
        return apiRequest(`/admin/withdrawals/${id}/approve`, {
            method: 'POST',
            body: { txHash }
        });
    },

    rejectWithdrawal: async (id: string, reason: string): Promise<void> => {
        return apiRequest(`/admin/withdrawals/${id}/reject`, {
            method: 'POST',
            body: { reason }
        });
    },

    // Security & Alerts
    getSystemAlerts: async (status?: string): Promise<SystemAlert[]> => {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        const queryString = params.toString() ? `?${params.toString()}` : '';
        return apiRequest<SystemAlert[]>(`/admin/alerts${queryString}`);
    },

    updateAlertStatus: async (id: string, status: string, notes?: string): Promise<void> => {
        return apiRequest(`/admin/alerts/${id}`, {
            method: 'PATCH',
            body: { status, notes }
        });
    },

    getSuspiciousActivity: async (page = 1, limit = 20): Promise<SuspiciousActivity[]> => {
        const query = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
        return apiRequest<SuspiciousActivity[]>(`/admin/security/activity?${query}`);
    },

    blockIp: async (ip: string, reason: string): Promise<void> => {
        return apiRequest('/admin/security/block-ip', {
            method: 'POST',
            body: { ip, reason }
        });
    },

    unblockIp: async (ip: string): Promise<void> => {
        return apiRequest('/admin/security/unblock-ip', {
            method: 'POST',
            body: { ip }
        });
    },

    getAuditLogs: async (page = 1, limit = 50): Promise<any[]> => {
        const query = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
        return apiRequest<any[]>(`/admin/audit-logs?${query}`);
    },

    // ========================================================================
    // NEW SECURITY ENDPOINTS
    // ========================================================================

    getSecuritySocket: (): Socket => {
        const token = localStorage.getItem('token');
        return io(`${API_URL}/security`, {
            auth: {
                token
            },
            transports: ['websocket']
        });
    },

    getTrafficStats: async (): Promise<TrafficStats> => {
        return apiRequest<TrafficStats>('/admin/security/traffic');
    },

    getSecurityConfig: async (): Promise<SecurityConfig[]> => {
        return apiRequest<SecurityConfig[]>('/admin/security/config');
    },

    updateSecurityConfig: async (key: string, value: any): Promise<void> => {
        return apiRequest(`/admin/security/config/${key}`, {
            method: 'PATCH',
            body: { value }
        });
    },

    getRequestLogs: async (query: RequestLogQuery = {}): Promise<{ data: RequestLog[], total: number }> => {
        const params = new URLSearchParams();
        if (query.ip) params.append('ip', query.ip);
        if (query.userId) params.append('userId', query.userId);
        if (query.minStatus) params.append('minStatus', query.minStatus.toString());
        if (query.page) params.append('page', query.page.toString());
        if (query.limit) params.append('limit', query.limit.toString());

        return apiRequest<{ data: RequestLog[], total: number }>(`/admin/security/logs?${params.toString()}`);
    }
};

// New Types
export interface TrafficStats {
    sampleTime: string;
    requestsPerSecond: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    totalRequests: number;
    uniqueIps: number;
}

export interface SecurityConfig {
    key: string;
    value: any;
    description: string;
    isEditable: boolean;
    updatedAt: string;
    updatedBy?: string;
}

export interface RequestLog {
    id: string;
    method: string;
    path: string;
    statusCode: number;
    latencyMs: number;
    ipAddress: string;
    userAgent?: string;
    userId?: string;
    isSuspicious: boolean;
    riskScore: number;
    createdAt: string;
}

export interface RequestLogQuery {
    ip?: string;
    userId?: string;
    minStatus?: number;
    page?: number;
    limit?: number;
}
