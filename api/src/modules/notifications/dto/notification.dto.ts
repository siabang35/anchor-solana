import {
    IsOptional,
    IsString,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsBoolean,
    IsUUID,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// ENUMS
// ============================================================================

export enum NotificationType {
    DEPOSIT_CONFIRMED = 'deposit_confirmed',
    WITHDRAWAL_INITIATED = 'withdrawal_initiated',
    WITHDRAWAL_COMPLETED = 'withdrawal_completed',
    WITHDRAWAL_FAILED = 'withdrawal_failed',
    TRADE_EXECUTED = 'trade_executed',
    MARKET_RESOLVED = 'market_resolved',
    POSITION_LIQUIDATED = 'position_liquidated',
    REFERRAL_REWARD = 'referral_reward',
    SECURITY_ALERT = 'security_alert',
    SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

export enum NotificationChannel {
    IN_APP = 'in_app',
    EMAIL = 'email',
    PUSH = 'push',
    SMS = 'sms',
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export class NotificationsQueryDto {
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

    @ApiPropertyOptional({ description: 'Filter by read status' })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isRead?: boolean;

    @ApiPropertyOptional({ enum: NotificationType })
    @IsOptional()
    @IsEnum(NotificationType)
    type?: NotificationType;
}

// ============================================================================
// ACTION DTOs
// ============================================================================

export class UpdateNotificationPreferencesDto {
    @ApiPropertyOptional({ description: 'Enable/disable each notification type' })
    @IsOptional()
    @IsObject()
    typePreferences?: Record<NotificationType, boolean>;

    @ApiPropertyOptional({ description: 'Enable/disable each channel' })
    @IsOptional()
    @IsObject()
    channelPreferences?: Record<NotificationChannel, boolean>;

    @ApiPropertyOptional({ description: 'Quiet hours start (HH:MM)' })
    @IsOptional()
    @IsString()
    quietHoursStart?: string;

    @ApiPropertyOptional({ description: 'Quiet hours end (HH:MM)' })
    @IsOptional()
    @IsString()
    quietHoursEnd?: string;
}

export class RegisterPushSubscriptionDto {
    @ApiProperty({ description: 'Push subscription endpoint' })
    @IsString()
    endpoint: string;

    @ApiProperty({ description: 'Push subscription keys' })
    @IsObject()
    keys: {
        p256dh: string;
        auth: string;
    };
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class NotificationDto {
    @ApiProperty()
    id: string;

    @ApiProperty({ enum: NotificationType })
    type: NotificationType;

    @ApiProperty()
    title: string;

    @ApiProperty()
    message: string;

    @ApiProperty()
    isRead: boolean;

    @ApiProperty()
    isArchived: boolean;

    @ApiPropertyOptional()
    actionUrl?: string;

    @ApiPropertyOptional()
    resourceType?: string;

    @ApiPropertyOptional()
    resourceId?: string;

    @ApiPropertyOptional()
    metadata?: Record<string, any>;

    @ApiProperty()
    createdAt: string;
}

export class NotificationPreferencesDto {
    @ApiProperty()
    typePreferences: Record<NotificationType, boolean>;

    @ApiProperty()
    channelPreferences: Record<NotificationChannel, boolean>;

    @ApiPropertyOptional()
    quietHoursStart?: string;

    @ApiPropertyOptional()
    quietHoursEnd?: string;
}

export class UnreadCountDto {
    @ApiProperty()
    count: number;
}
