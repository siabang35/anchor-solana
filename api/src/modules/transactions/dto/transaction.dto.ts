import {
    IsOptional,
    IsString,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// ENUMS
// ============================================================================

export enum TransactionType {
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    TRADE_BUY = 'trade_buy',
    TRADE_SELL = 'trade_sell',
    PAYOUT = 'payout',
    REFERRAL_REWARD = 'referral_reward',
    FEE = 'fee',
    ADJUSTMENT = 'adjustment',
}

export enum TransactionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export class TransactionsQueryDto {
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

    @ApiPropertyOptional({ enum: TransactionType })
    @IsOptional()
    @IsEnum(TransactionType)
    type?: TransactionType;

    @ApiPropertyOptional({ enum: TransactionStatus })
    @IsOptional()
    @IsEnum(TransactionStatus)
    status?: TransactionStatus;

    @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class TransactionDto {
    @ApiProperty()
    id: string;

    @ApiProperty({ enum: TransactionType })
    type: TransactionType;

    @ApiProperty()
    amount: number;

    @ApiProperty()
    currency: string;

    @ApiProperty({ enum: TransactionStatus })
    status: TransactionStatus;

    @ApiPropertyOptional()
    description?: string;

    @ApiPropertyOptional()
    txHash?: string;

    @ApiPropertyOptional()
    chain?: string;

    @ApiPropertyOptional()
    resourceType?: string;

    @ApiPropertyOptional()
    resourceId?: string;

    @ApiProperty()
    balanceBefore: number;

    @ApiProperty()
    balanceAfter: number;

    @ApiProperty()
    createdAt: string;
}

export class TransactionSummaryDto {
    @ApiProperty()
    totalDeposits: number;

    @ApiProperty()
    totalWithdrawals: number;

    @ApiProperty()
    totalTradingVolume: number;

    @ApiProperty()
    totalFees: number;

    @ApiProperty()
    netPnL: number;

    @ApiProperty()
    transactionCount: number;
}

export class PnLDataDto {
    @ApiProperty()
    date: string;

    @ApiProperty()
    pnl: number;

    @ApiProperty()
    cumulativePnL: number;
}
