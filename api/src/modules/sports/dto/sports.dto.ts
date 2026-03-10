/**
 * Sports DTOs
 * 
 * Data Transfer Objects for sports API endpoints with validation
 */

import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsDate, IsUUID, Min, Max, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType, EventStatus, SportsMarketType } from '../types/sports.types.js';

// ========================
// Query DTOs
// ========================

// Valid sport values for sanitization
const VALID_SPORTS = Object.values(SportType) as string[];

/**
 * Transform function to sanitize sport parameter
 * - Converts to lowercase and trims whitespace
 * - Returns undefined for wildcards (*, **, all, any)
 * - Returns undefined if value is not a valid SportType
 */
const sanitizeSportParam = ({ value }: { value: unknown }): SportType | undefined => {
    if (!value || typeof value !== 'string') return undefined;
    const sanitized = value.toLowerCase().trim();
    // Reject wildcards and invalid patterns
    if (['*', '**', 'all', 'any', ''].includes(sanitized)) return undefined;
    // Only return if it's a valid SportType
    return VALID_SPORTS.includes(sanitized) ? (sanitized as SportType) : undefined;
};

export class SportsEventsQueryDto {
    @ApiPropertyOptional({ enum: SportType })
    @IsOptional()
    @Transform(sanitizeSportParam)
    @IsEnum(SportType)
    sport?: SportType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    leagueId?: string;

    @ApiPropertyOptional({ enum: EventStatus })
    @IsOptional()
    @IsEnum(EventStatus)
    status?: EventStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    startDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    endDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    hasMarket?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: ['startTime', 'createdAt', 'volume'] })
    @IsOptional()
    @IsString()
    sortBy?: 'startTime' | 'createdAt' | 'volume' = 'startTime';

    @ApiPropertyOptional({ enum: ['asc', 'desc'] })
    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc' = 'asc';
}

export class SportsMarketsQueryDto {
    @ApiPropertyOptional({ enum: SportType })
    @IsOptional()
    @Transform(sanitizeSportParam)
    @IsEnum(SportType)
    sport?: SportType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    eventId?: string;

    @ApiPropertyOptional({ enum: SportsMarketType })
    @IsOptional()
    @IsEnum(SportsMarketType)
    marketType?: SportsMarketType;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    resolved?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: ['closesAt', 'volume', 'createdAt'] })
    @IsOptional()
    @IsString()
    sortBy?: 'closesAt' | 'volume' | 'createdAt' = 'closesAt';

    @ApiPropertyOptional({ enum: ['asc', 'desc'] })
    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc' = 'asc';
}

export class SportsLeaguesQueryDto {
    @ApiPropertyOptional({ enum: SportType })
    @IsOptional()
    @Transform(sanitizeSportParam)
    @IsEnum(SportType)
    sport?: SportType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    country?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 50;
}

// ========================
// Sync DTOs
// ========================

export class TriggerSyncDto {
    @ApiPropertyOptional({ enum: SportType })
    @IsOptional()
    @IsEnum(SportType)
    sport?: SportType;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    forceRefresh?: boolean;
}

export class SyncLeaguesDto extends TriggerSyncDto { }

export class SyncEventsDto extends TriggerSyncDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    date?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    leagueId?: string;
}

// ========================
// Response DTOs
// ========================

export class SportsLeagueResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    externalId: string;

    @ApiProperty({ enum: SportType })
    sport: SportType;

    @ApiProperty()
    name: string;

    @ApiPropertyOptional()
    nameAlternate?: string;

    @ApiPropertyOptional()
    country?: string;

    @ApiPropertyOptional()
    countryCode?: string;

    @ApiPropertyOptional()
    logoUrl?: string;

    @ApiPropertyOptional()
    bannerUrl?: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    isFeatured: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

export class SportsTeamResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    externalId: string;

    @ApiPropertyOptional()
    leagueId?: string;

    @ApiProperty({ enum: SportType })
    sport: SportType;

    @ApiProperty()
    name: string;

    @ApiPropertyOptional()
    nameShort?: string;

    @ApiPropertyOptional()
    country?: string;

    @ApiPropertyOptional()
    city?: string;

    @ApiPropertyOptional()
    stadium?: string;

    @ApiPropertyOptional()
    logoUrl?: string;

    @ApiPropertyOptional()
    primaryColor?: string;

    @ApiPropertyOptional()
    secondaryColor?: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

export class SportsEventResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    externalId: string;

    @ApiPropertyOptional()
    leagueId?: string;

    @ApiPropertyOptional()
    homeTeamId?: string;

    @ApiPropertyOptional()
    awayTeamId?: string;

    @ApiProperty({ enum: SportType })
    sport: SportType;

    @ApiPropertyOptional()
    season?: string;

    @ApiPropertyOptional()
    round?: string;

    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional()
    venue?: string;

    @ApiProperty()
    startTime: Date;

    @ApiProperty({ enum: EventStatus })
    status: EventStatus;

    @ApiPropertyOptional()
    statusDetail?: string;

    @ApiPropertyOptional()
    elapsedTime?: number;

    @ApiPropertyOptional()
    homeScore?: number;

    @ApiPropertyOptional()
    awayScore?: number;

    @ApiPropertyOptional()
    thumbnailUrl?: string;

    @ApiProperty()
    hasMarket: boolean;

    @ApiProperty()
    isFeatured: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    // Joined data
    @ApiPropertyOptional({ type: () => SportsTeamResponseDto })
    homeTeam?: SportsTeamResponseDto;

    @ApiPropertyOptional({ type: () => SportsTeamResponseDto })
    awayTeam?: SportsTeamResponseDto;

    @ApiPropertyOptional({ type: () => SportsLeagueResponseDto })
    league?: SportsLeagueResponseDto;

    @ApiPropertyOptional()
    metadata?: any;
}

export class SportsMarketResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    eventId: string;

    @ApiPropertyOptional()
    marketId?: string;

    @ApiProperty({ enum: SportsMarketType })
    marketType: SportsMarketType;

    @ApiProperty()
    title: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiProperty()
    question: string;

    @ApiProperty({ type: [String] })
    outcomes: string[];

    @ApiProperty({ type: [Number] })
    outcomePrices: number[];

    @ApiProperty()
    yesPrice: number;

    @ApiProperty()
    noPrice: number;

    @ApiProperty()
    volume: number;

    @ApiProperty()
    liquidity: number;

    @ApiProperty()
    resolved: boolean;

    @ApiPropertyOptional()
    outcome?: boolean;

    @ApiPropertyOptional()
    opensAt?: Date;

    @ApiPropertyOptional()
    closesAt?: Date;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    isFeatured: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    // Joined data
    @ApiPropertyOptional({ type: () => SportsEventResponseDto })
    event?: SportsEventResponseDto;

    @ApiPropertyOptional()
    metadata?: any;
}

export class SyncResultResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    source: string;

    @ApiProperty()
    syncType: string;

    @ApiProperty()
    recordsFetched: number;

    @ApiProperty()
    recordsCreated: number;

    @ApiProperty()
    recordsUpdated: number;

    @ApiProperty()
    recordsFailed: number;

    @ApiProperty()
    durationMs: number;

    @ApiPropertyOptional({ type: [String] })
    errors?: string[];
}

export class PaginatedResponseDto<T> {
    @ApiProperty()
    data: T[];

    @ApiProperty()
    total: number;

    @ApiProperty()
    page: number;

    @ApiProperty()
    limit: number;

    @ApiProperty()
    totalPages: number;
}

// ========================
// Create/Update DTOs
// ========================

export class CreateSportsMarketDto {
    @ApiProperty()
    @IsUUID()
    eventId: string;

    @ApiProperty({ enum: SportsMarketType })
    @IsEnum(SportsMarketType)
    marketType: SportsMarketType;

    @ApiProperty()
    @IsString()
    title: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty()
    @IsString()
    question: string;

    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    outcomes: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    opensAt?: Date;

    @ApiProperty()
    @Type(() => Date)
    @IsDate()
    closesAt: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    autoResolve?: boolean;
}

export class ResolveMarketDto {
    @ApiProperty()
    @IsBoolean()
    outcome: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    resolutionSource?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    resolutionProof?: string;
}
