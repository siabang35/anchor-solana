import {
    IsString,
    IsNumber,
    IsBoolean,
    IsUUID,
    Min,
    Max,
    IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsIdempotencyKey, IsUUIDv4 } from '../../../common/decorators/index.js';

/**
 * Buy Shares DTO
 */
export class BuySharesDto {
    @ApiProperty({
        description: 'Idempotency key to prevent duplicate orders',
        example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsIdempotencyKey()
    idempotencyKey: string;

    @ApiProperty({
        description: 'Market ID',
        example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsUUIDv4()
    marketId: string;

    @ApiProperty({
        description: 'Buy YES shares (true) or NO shares (false)',
        example: true,
    })
    @IsBoolean()
    isYes: boolean;

    @ApiProperty({
        description: 'Amount of collateral to spend',
        example: 100,
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @Max(1000000)
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        description: 'Maximum cost willing to pay (slippage protection)',
        example: 105,
    })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    maxCost: number;
}

/**
 * Sell Shares DTO
 */
export class SellSharesDto {
    @ApiProperty({
        description: 'Idempotency key to prevent duplicate orders',
        example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsIdempotencyKey()
    idempotencyKey: string;

    @ApiProperty({
        description: 'Market ID',
    })
    @IsUUIDv4()
    marketId: string;

    @ApiProperty({
        description: 'Sell YES shares (true) or NO shares (false)',
    })
    @IsBoolean()
    isYes: boolean;

    @ApiProperty({
        description: 'Number of shares to sell',
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    shares: number;

    @ApiProperty({
        description: 'Minimum return expected (slippage protection)',
    })
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    minReturn: number;
}

/**
 * Position Response DTO
 */
export class PositionResponseDto {
    id: string;
    userId: string;
    marketId: string;
    yesShares: number;
    noShares: number;
    avgYesCost: number;
    avgNoCost: number;
    realizedPnl: number;
    unrealizedPnl: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Order History Response DTO
 */
export class OrderResponseDto {
    id: string;
    userId: string;
    marketId: string;
    type: 'buy' | 'sell';
    side: 'yes' | 'no';
    shares: number;
    price: number;
    total: number;
    status: 'pending' | 'filled' | 'cancelled' | 'failed';
    txHash?: string;
    createdAt: string;
}
