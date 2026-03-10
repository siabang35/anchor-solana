import {
    IsString,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsIn,
    IsUUID,
    MinLength,
    MaxLength,
    Min,
    Max,
    IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Create Market DTO
 */
export class CreateMarketDto {
    @ApiProperty({
        description: 'Market title/question',
        example: 'Will ETH reach $5,000 by end of 2024?',
        minLength: 10,
        maxLength: 200,
    })
    @IsString()
    @MinLength(10, { message: 'Title must be at least 10 characters' })
    @MaxLength(200, { message: 'Title is too long' })
    title: string;

    @ApiProperty({
        description: 'Detailed market description',
        example: 'This market resolves YES if ETH price is >= $5,000 on December 31, 2024.',
        minLength: 20,
        maxLength: 2000,
    })
    @IsString()
    @MinLength(20, { message: 'Description must be at least 20 characters' })
    @MaxLength(2000, { message: 'Description is too long' })
    description: string;

    @ApiProperty({
        description: 'Market category',
        example: 'crypto',
        enum: ['crypto', 'sports', 'politics', 'entertainment', 'science', 'tech', 'finance', 'economy', 'other'],
    })
    @IsIn(['crypto', 'sports', 'politics', 'entertainment', 'science', 'tech', 'finance', 'economy', 'other'])
    category: 'crypto' | 'sports' | 'politics' | 'entertainment' | 'science' | 'tech' | 'finance' | 'economy' | 'other';

    @ApiProperty({
        description: 'Market end time (ISO string)',
        example: '2024-12-31T23:59:59Z',
    })
    @IsDateString()
    endTime: string;

    @ApiPropertyOptional({
        description: 'Resolution time (defaults to endTime + 24h)',
        example: '2025-01-01T23:59:59Z',
    })
    @IsOptional()
    @IsDateString()
    resolutionTime?: string;

    @ApiProperty({
        description: 'Blockchain chain',
        example: 'base',
        enum: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
    })
    @IsIn(['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'])
    chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' | 'polygon';

    @ApiProperty({
        description: 'Initial liquidity in collateral token (e.g., USDC)',
        example: 1000,
        minimum: 100,
    })
    @IsNumber()
    @Min(100, { message: 'Minimum initial liquidity is 100' })
    @Max(1000000, { message: 'Maximum initial liquidity is 1,000,000' })
    @Type(() => Number)
    initialLiquidity: number;

    @ApiPropertyOptional({
        description: 'Market tags',
        example: ['ETH', 'price', '2024'],
    })
    @IsOptional()
    @IsString({ each: true })
    tags?: string[];
}

/**
 * Market Query DTO
 */
export class MarketQueryDto {
    @ApiPropertyOptional({
        description: 'Filter by category',
        example: 'crypto',
    })
    @IsOptional()
    @IsIn(['crypto', 'sports', 'politics', 'entertainment', 'science', 'tech', 'finance', 'economy', 'other'])
    category?: string;

    @ApiPropertyOptional({
        description: 'Filter by chain',
        example: 'base',
    })
    @IsOptional()
    @IsIn(['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'solana', 'sui'])
    chain?: string;

    @ApiPropertyOptional({
        description: 'Filter by resolution status',
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    resolved?: boolean;

    @ApiPropertyOptional({
        description: 'Sort by field',
        example: 'volume',
        enum: ['created', 'endTime', 'volume', 'liquidity'],
    })
    @IsOptional()
    @IsIn(['created', 'endTime', 'volume', 'liquidity'])
    sortBy?: 'created' | 'endTime' | 'volume' | 'liquidity';

    @ApiPropertyOptional({
        description: 'Sort order',
        example: 'desc',
        enum: ['asc', 'desc'],
    })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc';

    @ApiPropertyOptional({
        description: 'Page number',
        example: 1,
        minimum: 1,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    page?: number;

    @ApiPropertyOptional({
        description: 'Items per page',
        example: 20,
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number;

    @ApiPropertyOptional({
        description: 'Offset for pagination (alternative to page)',
        example: 0,
        minimum: 0,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    offset?: number;

    @ApiPropertyOptional({
        description: 'Search query',
        example: 'bitcoin',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

/**
 * Market Response DTO
 */
export class MarketResponseDto {
    id: string;
    title: string;
    description: string;
    category: string;
    creator: string;
    chain: string;
    chainId: number;
    collateralToken: string;
    endTime: string;
    resolutionTime: string;
    resolved: boolean;
    outcome: boolean | null;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}

/**
 * Resolve Market DTO
 */
export class ResolveMarketDto {
    @ApiProperty({
        description: 'Market outcome (true = YES, false = NO)',
        example: true,
    })
    @IsBoolean()
    outcome: boolean;

    @ApiPropertyOptional({
        description: 'Resolution source/evidence',
        example: 'https://coingecko.com/eth-price',
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    evidence?: string;
}
