import {
    IsOptional,
    IsString,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsUUID,
    IsBoolean,
    MinLength,
    MaxLength,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// ENUMS
// ============================================================================

export enum UserStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    PENDING = 'pending',
}

export enum WithdrawalApprovalStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    ESCALATED = 'escalated',
}

export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical',
}

export enum AlertStatus {
    OPEN = 'open',
    ACKNOWLEDGED = 'acknowledged',
    INVESTIGATING = 'investigating',
    RESOLVED = 'resolved',
    DISMISSED = 'dismissed',
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export class AdminUsersQueryDto {
    @ApiPropertyOptional({ description: 'Search by email, name, or ID' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @ApiPropertyOptional({ enum: UserStatus })
    @IsOptional()
    @IsEnum(UserStatus)
    status?: UserStatus;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ description: 'Sort field' })
    @IsOptional()
    @IsString()
    @Matches(/^(created_at|balance|last_login|risk_score)$/, {
        message: 'Invalid sort field',
    })
    sortBy?: string = 'created_at';

    @ApiPropertyOptional({ enum: ['asc', 'desc'] })
    @IsOptional()
    @IsString()
    @Matches(/^(asc|desc)$/)
    sortOrder?: 'asc' | 'desc' = 'desc';
}

export class AdminAuditLogQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    actorId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    action?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    category?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 50;
}

// ============================================================================
// ACTION DTOs
// ============================================================================

export class UpdateUserStatusDto {
    @ApiProperty({ enum: UserStatus })
    @IsEnum(UserStatus)
    status: UserStatus;

    @ApiPropertyOptional({ description: 'Reason for status change' })
    @IsOptional()
    @IsString()
    @MinLength(10)
    @MaxLength(500)
    reason?: string;
}

export class ApproveWithdrawalDto {
    @ApiPropertyOptional({ description: 'Approval notes' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class RejectWithdrawalDto {
    @ApiProperty({ description: 'Rejection reason (required)' })
    @IsString()
    @MinLength(10, { message: 'Rejection reason must be at least 10 characters' })
    @MaxLength(500)
    reason: string;
}

export class UpdateAlertStatusDto {
    @ApiProperty({ enum: AlertStatus })
    @IsEnum(AlertStatus)
    status: AlertStatus;

    @ApiPropertyOptional({ description: 'Resolution notes' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    notes?: string;
}

export class BlockIpDto {
    @ApiProperty({ description: 'IP address or CIDR range' })
    @IsString()
    @Matches(
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/,
        { message: 'Invalid IP address or CIDR format' }
    )
    ipAddress: string;

    @ApiProperty({ description: 'Reason for blocking' })
    @IsString()
    @MinLength(5)
    @MaxLength(500)
    reason: string;

    @ApiPropertyOptional({ description: 'Block expiration (null = permanent)' })
    @IsOptional()
    @IsString()
    expiresAt?: string;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class AdminStatsDto {
    @ApiProperty()
    totalUsers: number;

    @ApiProperty()
    newUsersToday: number;

    @ApiProperty()
    newUsersWeek: number;

    @ApiProperty()
    totalTvl: number;

    @ApiProperty()
    totalVolume: number;

    @ApiProperty()
    activeMarkets: number;

    @ApiProperty()
    pendingWithdrawals: number;

    @ApiProperty()
    pendingWithdrawalVolume: number;

    @ApiProperty()
    openAlerts: number;

    @ApiProperty()
    pendingSecurityReviews: number;
}

export class AdminUserDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    email: string;

    @ApiProperty()
    fullName: string;

    @ApiProperty({ enum: UserStatus })
    status: UserStatus;

    @ApiProperty()
    balance: number;

    @ApiProperty()
    lockedBalance: number;

    @ApiProperty()
    riskScore: number;

    @ApiProperty()
    totalDeposits: number;

    @ApiProperty()
    totalWithdrawals: number;

    @ApiProperty()
    lastLoginAt: string;

    @ApiProperty()
    createdAt: string;
}

export class AdminUserDetailDto extends AdminUserDto {
    @ApiProperty()
    totalDepositedAmount: number;

    @ApiProperty()
    totalWithdrawnAmount: number;

    @ApiProperty()
    openPositions: number;

    @ApiProperty()
    totalOrders: number;

    @ApiProperty()
    suspiciousActivityCount: number;

    @ApiProperty({ type: [Object] })
    recentLogins: Array<{
        ipAddress: string;
        userAgent: string;
        createdAt: string;
    }>;

    @ApiProperty({ type: [Object] })
    walletAddresses: Array<{
        address: string;
        chain: string;
    }>;
}

export class PendingWithdrawalDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    withdrawalId: string;

    @ApiProperty()
    userId: string;

    @ApiProperty()
    userEmail: string;

    @ApiProperty()
    amount: number;

    @ApiProperty()
    currency: string;

    @ApiProperty()
    chain: string;

    @ApiProperty()
    toAddress: string;

    @ApiProperty()
    riskScore: number;

    @ApiProperty({ type: [String] })
    riskFactors: string[];

    @ApiProperty()
    requiresSecondApproval: boolean;

    @ApiProperty()
    status: WithdrawalApprovalStatus;

    @ApiProperty()
    createdAt: string;

    @ApiProperty()
    expiresAt: string;
}

export class SystemAlertDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    type: string;

    @ApiProperty({ enum: AlertSeverity })
    severity: AlertSeverity;

    @ApiProperty()
    title: string;

    @ApiProperty()
    description: string;

    @ApiProperty({ enum: AlertStatus })
    status: AlertStatus;

    @ApiProperty()
    resourceType?: string;

    @ApiProperty()
    resourceId?: string;

    @ApiProperty()
    userId?: string;

    @ApiProperty()
    acknowledgedBy?: string;

    @ApiProperty()
    acknowledgedAt?: string;

    @ApiProperty()
    resolvedBy?: string;

    @ApiProperty()
    resolvedAt?: string;

    @ApiProperty()
    createdAt: string;
}

export class AdminAuditLogDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    actorUserId: string;

    @ApiProperty()
    actorEmail?: string;

    @ApiProperty()
    action: string;

    @ApiProperty()
    actionCategory: string;

    @ApiProperty()
    resourceType?: string;

    @ApiProperty()
    resourceId?: string;

    @ApiProperty()
    status: string;

    @ApiProperty()
    ipAddress?: string;

    @ApiProperty()
    createdAt: string;
}

// ============================================================================
// SECURITY DTOs
// ============================================================================

export class SecurityConfigDto {
    @ApiProperty()
    key: string;

    @ApiProperty({ type: 'object' })
    value: any;

    @ApiProperty()
    description: string;

    @ApiProperty()
    isEditable: boolean;

    @ApiProperty()
    updatedAt: string;

    @ApiProperty({ required: false })
    updatedBy?: string;
}

export class UpdateSecurityConfigDto {
    @ApiProperty({ type: 'object', description: 'New JSON value for the config key' })
    @IsOptional() // Value can be anything, validation depends on key type logic in service
    value: any;
}

export class TrafficStatsDto {
    @ApiProperty()
    sampleTime: string;

    @ApiProperty()
    requestsPerSecond: number;

    @ApiProperty()
    avgLatencyMs: number;

    @ApiProperty()
    p95LatencyMs: number;

    @ApiProperty()
    errorRate: number; // calculated as (client_error + server_error) / total

    @ApiProperty()
    totalRequests: number;

    @ApiProperty()
    uniqueIps: number;
}

export class RequestLogDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    method: string;

    @ApiProperty()
    path: string;

    @ApiProperty()
    statusCode: number;

    @ApiProperty()
    latencyMs: number;

    @ApiProperty()
    ipAddress: string;

    @ApiProperty({ required: false })
    userAgent?: string;

    @ApiProperty({ required: false })
    userId?: string;

    @ApiProperty()
    isSuspicious: boolean;

    @ApiProperty()
    riskScore: number;

    @ApiProperty()
    createdAt: string;
}

export class RequestLogQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    ip?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    minStatus?: number;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 50;
}
