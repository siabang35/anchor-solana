import {
    IsEmail,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsIn,
    Length,
    Matches,
    MinLength,
    MaxLength,
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
 * OTP Signup Request DTO
 * Used to request OTP for new user registration
 */
export class OtpSignupRequestDto {
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
 * OTP Login Request DTO
 * Used to request OTP for existing user login
 */
export class OtpLoginRequestDto {
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
 * OTP Verify DTO
 * Used to verify OTP and complete authentication
 */
export class OtpVerifyDto {
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
        description: 'Verification token (6-digit OTP or Magic Link token)',
        example: '123456',
        minLength: 6,
        maxLength: 512,
    })
    @IsString()
    @IsNotEmpty({ message: 'Verification code is required' })
    @Length(6, 512, { message: 'Verification token must be valid' })
    token: string;

    @ApiProperty({
        description: 'Type of verification',
        enum: ['signup', 'login', 'magiclink', 'recovery'],
        example: 'signup',
    })
    @IsString()
    @IsIn(['signup', 'login', 'magiclink', 'recovery'], { message: 'Invalid verification type' })
    type: 'signup' | 'login' | 'magiclink' | 'recovery';
}

/**
 * OTP Resend DTO
 * Used to resend OTP code
 */
export class OtpResendDto {
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
        description: 'Type of OTP to resend',
        enum: ['signup', 'login'],
        example: 'signup',
    })
    @IsString()
    @IsIn(['signup', 'login'], { message: 'Type must be either signup or login' })
    type: 'signup' | 'login';
}

/**
 * Legacy OTP Request DTO (kept for backward compatibility)
 * @deprecated Use OtpSignupRequestDto or OtpLoginRequestDto instead
 */
export class OtpRequestDto {
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @IsNotEmpty()
    @NormalizeEmail()
    email: string;
}
