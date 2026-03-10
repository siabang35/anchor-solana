import {
    IsString,
    IsIn,
    MinLength,
    MaxLength,
    IsOptional,
    Matches,
    registerDecorator,
    ValidationOptions,
    ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Supported blockchain networks
 */
export const SUPPORTED_CHAINS = ['ethereum', 'solana', 'sui', 'base'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

/**
 * Chain-specific wallet address patterns
 * OWASP A03:2021 - Input Validation
 */
const WALLET_PATTERNS: Record<SupportedChain, RegExp> = {
    ethereum: /^0x[a-fA-F0-9]{40}$/,
    base: /^0x[a-fA-F0-9]{40}$/,
    solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    sui: /^0x[a-fA-F0-9]{64}$/,
};

/**
 * Custom validator for chain-specific wallet address validation
 */
function IsChainSpecificAddress(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isChainSpecificAddress',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: 'Invalid wallet address format for the specified chain',
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    const obj = args.object as Record<string, unknown>;
                    const chain = obj.chain as SupportedChain;

                    if (!chain || !WALLET_PATTERNS[chain]) {
                        return false;
                    }

                    return WALLET_PATTERNS[chain].test(value);
                },
            },
        });
    };
}

/**
 * Transform decorator to normalize wallet address
 */
const NormalizeWalletAddress = () =>
    Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        // Trim whitespace
        return value.trim();
    });

/**
 * Wallet Authentication Challenge Request DTO
 * 
 * Enhanced with strict validation patterns for each chain
 */
export class WalletChallengeDto {
    @ApiProperty({
        description: 'Wallet address',
        example: '0x1234567890abcdef1234567890abcdef12345678',
    })
    @IsString()
    @MinLength(20, { message: 'Invalid wallet address' })
    @MaxLength(100, { message: 'Wallet address is too long' })
    @NormalizeWalletAddress()
    @IsChainSpecificAddress()
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        example: 'ethereum',
        enum: SUPPORTED_CHAINS,
    })
    @IsIn(SUPPORTED_CHAINS, {
        message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`,
    })
    chain: SupportedChain;
}

/**
 * Wallet Authentication Verify DTO
 * 
 * Enhanced with signature validation and length limits
 */
export class WalletVerifyDto {
    @ApiProperty({
        description: 'Wallet address',
        example: '0x1234567890abcdef1234567890abcdef12345678',
    })
    @IsString()
    @MinLength(20, { message: 'Invalid wallet address' })
    @MaxLength(100, { message: 'Wallet address is too long' })
    @NormalizeWalletAddress()
    @IsChainSpecificAddress()
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        example: 'ethereum',
        enum: SUPPORTED_CHAINS,
    })
    @IsIn(SUPPORTED_CHAINS, {
        message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`,
    })
    chain: SupportedChain;

    @ApiProperty({
        description: 'Wallet signature',
        example: '0xabcdef...',
    })
    @IsString()
    @MinLength(1, { message: 'Signature is required' })
    @MaxLength(1024, { message: 'Signature is too long' })
    signature: string;

    @ApiProperty({
        description: 'Original message that was signed',
        example: 'Sign this message to verify your wallet...',
    })
    @IsString()
    @MinLength(1, { message: 'Message is required' })
    @MaxLength(2048, { message: 'Message is too long' })
    message: string;

    @ApiPropertyOptional({
        description: 'Challenge nonce',
        example: 'abc123',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64, { message: 'Nonce is too long' })
    nonce?: string;
}

/**
 * Link Wallet DTO
 * 
 * Used to link a wallet to existing account
 */
export class LinkWalletDto {
    @ApiProperty({
        description: 'Wallet address',
        example: '0x1234567890abcdef1234567890abcdef12345678',
    })
    @IsString()
    @MinLength(20, { message: 'Invalid wallet address' })
    @MaxLength(100, { message: 'Wallet address is too long' })
    @NormalizeWalletAddress()
    @IsChainSpecificAddress()
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        example: 'ethereum',
        enum: SUPPORTED_CHAINS,
    })
    @IsIn(SUPPORTED_CHAINS, {
        message: `Chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`,
    })
    chain: SupportedChain;

    @ApiProperty({
        description: 'Wallet signature',
        example: '0xabcdef...',
    })
    @IsString()
    @MinLength(1, { message: 'Signature is required' })
    @MaxLength(1024, { message: 'Signature is too long' })
    signature: string;

    @ApiProperty({
        description: 'Original message that was signed',
        example: 'Sign this message to verify your wallet...',
    })
    @IsString()
    @MinLength(1, { message: 'Message is required' })
    @MaxLength(2048, { message: 'Message is too long' })
    message: string;
}

