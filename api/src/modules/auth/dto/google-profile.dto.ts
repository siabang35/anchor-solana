import {
    IsString,
    IsBoolean,
    IsOptional,
    MinLength,
    MaxLength,
    Matches,
    Equals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Transform decorator to trim and normalize username
 */
const NormalizeUsername = () =>
    Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        return value.toLowerCase().trim();
    });

/**
 * Transform decorator to trim strings
 */
const TrimString = () =>
    Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        return value.trim();
    });

/**
 * Google Profile Completion DTO
 * 
 * Used when a new user logs in via Google OAuth and needs to complete their profile.
 * Implements OWASP A03:2021 - Injection prevention through strict validation.
 * 
 * @security
 * - Username validation prevents injection attacks
 * - MaxLength limits prevent DoS attacks
 * - Terms acceptance is legally required
 */
export class GoogleProfileCompletionDto {
    @ApiProperty({
        description: 'Unique username (3-30 chars, alphanumeric and underscore only)',
        example: 'john_doe123',
        minLength: 3,
        maxLength: 30,
    })
    @IsString({ message: 'Username must be a string' })
    @MinLength(3, { message: 'Username must be at least 3 characters' })
    @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: 'Username can only contain letters, numbers, and underscores',
    })
    @NormalizeUsername()
    username: string;

    @ApiPropertyOptional({
        description: 'Full name (optional, pre-filled from Google)',
        example: 'John Doe',
        maxLength: 100,
    })
    @IsOptional()
    @IsString({ message: 'Full name must be a string' })
    @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
    @TrimString()
    fullName?: string;

    @ApiProperty({
        description: 'User must agree to Terms of Service',
        example: true,
    })
    @IsBoolean({ message: 'Terms agreement must be a boolean' })
    @Equals(true, { message: 'You must agree to the Terms of Service' })
    agreeToTerms: boolean;

    @ApiProperty({
        description: 'User must agree to Privacy Policy',
        example: true,
    })
    @IsBoolean({ message: 'Privacy agreement must be a boolean' })
    @Equals(true, { message: 'You must agree to the Privacy Policy' })
    agreeToPrivacy: boolean;
}

/**
 * OAuth State Token DTO
 * 
 * Used for CSRF protection in OAuth flow
 */
export class OAuthStateDto {
    @ApiProperty({
        description: 'OAuth state token for CSRF protection',
        example: 'abc123xyz789',
    })
    @IsString()
    @MinLength(16)
    @MaxLength(128)
    state: string;
}

/**
 * Username Check Response
 */
export interface UsernameCheckResponse {
    available: boolean;
    username: string;
    message?: string;
}
