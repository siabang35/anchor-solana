import {
    IsOptional,
    IsString,
    IsInt,
    Min,
    Max,
    Matches,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// DTOs
// ============================================================================

export class CreateReferralCodeDto {
    @ApiPropertyOptional({ description: 'Custom code (optional, auto-generated if empty)' })
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z0-9]{4,12}$/, { message: 'Code must be 4-12 alphanumeric uppercase characters' })
    customCode?: string;
}

export class ApplyReferralCodeDto {
    @ApiProperty({ description: 'Referral code to apply' })
    @IsString()
    @Matches(/^[A-Z0-9]{4,12}$/, { message: 'Invalid referral code format' })
    code: string;
}

export class ReferralCodeDto {
    @ApiProperty()
    code: string;

    @ApiProperty()
    totalReferrals: number;

    @ApiProperty()
    activeReferrals: number;

    @ApiProperty()
    totalEarnings: number;

    @ApiProperty()
    pendingEarnings: number;

    @ApiProperty()
    createdAt: string;
}

export class ReferralStatsDto {
    @ApiProperty()
    code: string;

    @ApiProperty()
    totalReferrals: number;

    @ApiProperty()
    activeReferrals: number;

    @ApiProperty()
    totalEarnings: number;

    @ApiProperty()
    pendingEarnings: number;

    @ApiProperty()
    tier: number;

    @ApiProperty()
    commissionRate: number;

    @ApiProperty({ type: [Object] })
    recentReferrals: Array<{
        id: string;
        email: string;
        signupDate: string;
        tradingVolume: number;
        earnings: number;
    }>;
}

export class ReferralRewardDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    amount: number;

    @ApiProperty()
    currency: string;

    @ApiProperty()
    status: string;

    @ApiProperty()
    referredUserId: string;

    @ApiProperty()
    createdAt: string;
}
