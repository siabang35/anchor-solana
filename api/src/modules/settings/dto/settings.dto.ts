import {
    IsOptional,
    IsString,
    IsEnum,
    IsBoolean,
    IsNumber,
    Min,
    Max,
    MaxLength,
    MinLength,
    Matches,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// ENUMS
// ============================================================================

export enum Theme {
    LIGHT = 'light',
    DARK = 'dark',
    SYSTEM = 'system',
}

export enum Currency {
    USD = 'USD',
    EUR = 'EUR',
    GBP = 'GBP',
}

export enum Chain {
    ETHEREUM = 'ethereum',
    SOLANA = 'solana',
    SUI = 'sui',
    BASE = 'base',
}

// ============================================================================
// USER SETTINGS DTOs
// ============================================================================

export class UpdateUserSettingsDto {
    @ApiPropertyOptional({ enum: Theme })
    @IsOptional()
    @IsEnum(Theme)
    theme?: Theme;

    @ApiPropertyOptional({ enum: Currency })
    @IsOptional()
    @IsEnum(Currency)
    displayCurrency?: Currency;

    @ApiPropertyOptional({ description: 'Default slippage percentage' })
    @IsOptional()
    @IsNumber()
    @Min(0.1)
    @Max(10)
    defaultSlippage?: number;

    @ApiPropertyOptional({ description: 'Default gas preference' })
    @IsOptional()
    @IsString()
    @Matches(/^(low|medium|high|custom)$/)
    gasPreference?: string;

    @ApiPropertyOptional({ description: 'Show portfolio values' })
    @IsOptional()
    @IsBoolean()
    showPortfolioValues?: boolean;

    @ApiPropertyOptional({ description: 'Enable analytics' })
    @IsOptional()
    @IsBoolean()
    allowAnalytics?: boolean;

    @ApiPropertyOptional({ description: 'Timezone' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    timezone?: string;

    @ApiPropertyOptional({ description: 'Language code' })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
    language?: string;
}

export class UserSettingsDto {
    @ApiProperty({ enum: Theme })
    theme: Theme;

    @ApiProperty({ enum: Currency })
    displayCurrency: Currency;

    @ApiProperty()
    defaultSlippage: number;

    @ApiProperty()
    gasPreference: string;

    @ApiProperty()
    showPortfolioValues: boolean;

    @ApiProperty()
    allowAnalytics: boolean;

    @ApiProperty()
    timezone: string;

    @ApiProperty()
    language: string;
}

// ============================================================================
// API KEY DTOs
// ============================================================================

export class CreateApiKeyDto {
    @ApiProperty({ description: 'Key name for identification' })
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    name: string;

    @ApiPropertyOptional({ description: 'Key permissions' })
    @IsOptional()
    @IsArray()
    permissions?: string[];

    @ApiPropertyOptional({ description: 'Expiration in days (default: 365)' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(365)
    expiresInDays?: number;
}

export class ApiKeyDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    keyPrefix: string;

    @ApiProperty()
    permissions: string[];

    @ApiProperty()
    lastUsedAt: string | null;

    @ApiProperty()
    expiresAt: string;

    @ApiProperty()
    createdAt: string;
}

export class ApiKeyCreatedDto extends ApiKeyDto {
    @ApiProperty({ description: 'Full API key - only shown once' })
    apiKey: string;
}

// ============================================================================
// WHITELIST DTOs
// ============================================================================

export class AddWhitelistAddressDto {
    @ApiProperty({ description: 'Wallet address' })
    @IsString()
    @MinLength(26)
    @MaxLength(66)
    address: string;

    @ApiProperty({ enum: Chain })
    @IsEnum(Chain)
    chain: Chain;

    @ApiPropertyOptional({ description: 'Label for the address' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    label?: string;
}

export class WhitelistAddressDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    address: string;

    @ApiProperty({ enum: Chain })
    chain: Chain;

    @ApiProperty()
    label: string | null;

    @ApiProperty()
    isVerified: boolean;

    @ApiProperty()
    createdAt: string;
}

// ============================================================================
// SOCIAL CONNECTION DTOs
// ============================================================================

export class ConnectSocialDto {
    @ApiProperty({ description: 'OAuth token from social provider' })
    @IsString()
    @MinLength(10)
    accessToken: string;

    @ApiProperty({ description: 'Social provider' })
    @IsString()
    @Matches(/^(twitter|discord)$/)
    provider: string;
}

export class SocialConnectionDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    provider: string;

    @ApiProperty()
    username: string;

    @ApiProperty()
    profileUrl: string | null;

    @ApiProperty()
    connectedAt: string;
}
