import { IsString, IsOptional, IsNumber, IsArray, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompetitionDto {
    @ApiProperty({ description: 'Competition title' })
    @IsString()
    @MaxLength(200)
    title: string;

    @ApiPropertyOptional({ description: 'Competition description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'Sector: sports, politics, finance, tech, crypto, economy, science, signals' })
    @IsString()
    @MaxLength(20)
    sector: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    team_home?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    team_away?: string;

    @ApiPropertyOptional({ description: 'Outcome labels', example: ['Yes', 'No'] })
    @IsOptional()
    @IsArray()
    outcomes?: string[];

    @ApiProperty({ description: 'Competition start time (ISO 8601)' })
    @IsDateString()
    competition_start: string;

    @ApiProperty({ description: 'Competition end time (ISO 8601)' })
    @IsDateString()
    competition_end: string;

    @ApiPropertyOptional({ description: 'Initial probabilities in basis points' })
    @IsOptional()
    @IsArray()
    probabilities?: number[];

    @ApiPropertyOptional({ description: 'Prize pool in SOL' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    prize_pool?: number;

    @ApiPropertyOptional({ description: 'Maximum number of entries' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100000)
    max_entries?: number;

    @ApiPropertyOptional({ description: 'Bonding curve K parameter' })
    @IsOptional()
    @IsNumber()
    bonding_k?: number;

    @ApiPropertyOptional({ description: 'Bonding curve N parameter (exponent * 100)' })
    @IsOptional()
    @IsNumber()
    bonding_n?: number;

    @ApiPropertyOptional({ description: 'Tags for discoverability' })
    @IsOptional()
    @IsArray()
    tags?: string[];

    @ApiPropertyOptional({ description: 'Image URL' })
    @IsOptional()
    @IsString()
    image_url?: string;

    @ApiPropertyOptional({ description: 'Additional metadata' })
    @IsOptional()
    metadata?: Record<string, any>;
}

export class CompetitionResponseDto {
    id: string;
    title: string;
    description: string | null;
    sector: string;
    team_home: string | null;
    team_away: string | null;
    outcomes: string[];
    competition_start: string;
    competition_end: string;
    status: string;
    winning_outcome: number | null;
    prize_pool: number;
    entry_count: number;
    max_entries: number;
    probabilities: number[];
    onchain_market_pubkey: string | null;
    bonding_k: number;
    bonding_n: number;
    image_url: string | null;
    tags: string[];
    metadata?: Record<string, any>;
    seconds_remaining?: number;
    progress_pct?: number;
    capacity_pct?: number;
    created_at: string;
    updated_at: string;
}

export class SectorSummaryDto {
    sector: string;
    active_count: number;
    upcoming_count: number;
}

export class EtlWebhookDto {
    @ApiProperty()
    @IsString()
    category: string;

    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsArray()
    articles: any[];

    @ApiProperty()
    @IsArray()
    signals: any[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    horizon?: string;
}
