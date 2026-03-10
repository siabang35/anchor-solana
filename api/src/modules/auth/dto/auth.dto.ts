import {
    IsEmail,
    IsString,
    MinLength,
    MaxLength,
    IsOptional,
    Matches,
    IsNotEmpty,
    ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Transform decorator to normalize email
 */
const NormalizeEmail = () =>
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
 * Email/Password Signup DTO
 * 
 * Enhanced with:
 * - MaxLength to prevent DoS via large payloads
 * - Email normalization
 * - Input trimming
 */
export class SignupDto {
    @ApiProperty({
        description: 'User email address',
        example: 'user@example.com',
        maxLength: 254, // RFC 5321
    })
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @MaxLength(254, { message: 'Email address is too long' })
    @NormalizeEmail()
    email: string;

    @ApiProperty({
        description: 'Password (min 8 chars, must include uppercase, lowercase, and number)',
        example: 'Password123!',
        minLength: 8,
        maxLength: 128,
    })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @MaxLength(128, { message: 'Password is too long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    })
    password: string;

    @ApiPropertyOptional({
        description: 'User full name',
        example: 'John Doe',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100, { message: 'Name is too long' })
    @TrimString()
    fullName?: string;
}

/**
 * Email/Password Login DTO
 * 
 * Enhanced with input normalization and length limits
 */
export class LoginDto {
    @ApiProperty({
        description: 'User email address',
        example: 'user@example.com',
        maxLength: 254,
    })
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @MaxLength(254, { message: 'Email address is too long' })
    @NormalizeEmail()
    email: string;

    @ApiProperty({
        description: 'User password',
        example: 'Password123!',
        maxLength: 128,
    })
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MaxLength(128, { message: 'Password is too long' })
    password: string;
}

/**
 * Magic Link Request DTO
 */
export class MagicLinkDto {
    @ApiProperty({
        description: 'Email address to send magic link to',
        example: 'user@example.com',
        maxLength: 254,
    })
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @MaxLength(254, { message: 'Email address is too long' })
    @NormalizeEmail()
    email: string;
}

/**
 * Refresh Token DTO
 * 
 * Enhanced with optional body token (can also come from cookie)
 */
export class RefreshTokenDto {
    @ApiPropertyOptional({
        description: 'Refresh token (optional if sent via cookie)',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    @IsOptional()
    @IsString()
    @ValidateIf((o) => o.refreshToken !== undefined)
    @MinLength(1, { message: 'Refresh token is required' })
    @MaxLength(2048, { message: 'Token is too long' })
    refreshToken?: string;
}
