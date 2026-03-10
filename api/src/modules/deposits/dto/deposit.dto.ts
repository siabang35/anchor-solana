import {
    IsString,
    IsNumber,
    IsPositive,
    IsEnum,
    IsOptional,
    Min,
    Max,
    MaxLength,
    MinLength,
    Matches,
    IsInt,
    IsUUID,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
    Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    isValidEvmAddress,
    isValidSolanaAddress,
    isValidSuiAddress,
} from '../utils/address-validator.util.js';

/**
 * Custom validator for blockchain addresses
 * Validates address format based on the chain specified in the same DTO
 */
@ValidatorConstraint({ name: 'isValidBlockchainAddress', async: false })
export class IsValidBlockchainAddressConstraint implements ValidatorConstraintInterface {
    validate(address: string, args: ValidationArguments): boolean {
        const object = args.object as any;
        const chain = object.chain;

        if (!address || !chain) {
            return false;
        }

        switch (chain) {
            case 'ethereum':
            case 'base':
            case DepositChain.ETHEREUM:
            case DepositChain.BASE:
                return isValidEvmAddress(address);
            case 'solana':
            case DepositChain.SOLANA:
                return isValidSolanaAddress(address);
            case 'sui':
            case DepositChain.SUI:
                return isValidSuiAddress(address);
            default:
                return false;
        }
    }

    defaultMessage(args: ValidationArguments): string {
        const object = args.object as any;
        return `Invalid ${object.chain || 'blockchain'} address format`;
    }
}

/**
 * Supported blockchain networks for deposits
 */
export enum DepositChain {
    ETHEREUM = 'ethereum',
    SOLANA = 'solana',
    SUI = 'sui',
    BASE = 'base',
}

/**
 * Deposit transaction status
 */
export enum DepositStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    FAILED = 'failed',
    EXPIRED = 'expired',
}

/**
 * DTO for initiating a new deposit
 */
export class InitiateDepositDto {
    @ApiProperty({
        description: 'Amount to deposit in USD',
        example: 100.00,
        minimum: 1,
        maximum: 100000,
    })
    @IsNumber({ maxDecimalPlaces: 8 })
    @IsPositive()
    @Min(1, { message: 'Minimum deposit amount is $1' })
    @Max(100000, { message: 'Maximum deposit amount is $100,000' })
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        description: 'Blockchain network for deposit',
        enum: DepositChain,
        example: DepositChain.BASE,
    })
    @IsEnum(DepositChain, { message: 'Invalid chain. Supported: ethereum, solana, sui, base' })
    chain: DepositChain;
}

/**
 * DTO for verifying/confirming a deposit transaction
 */
export class VerifyDepositDto {
    @ApiProperty({
        description: 'Unique nonce from initiation (HMAC-signed)',
        example: 'dep_abc123xyz.signature',
    })
    @IsString()
    @MinLength(20, { message: 'Nonce too short' })
    @MaxLength(128, { message: 'Nonce too long' })
    @Matches(/^dep_[a-fA-F0-9]{32,64}(\.[a-fA-F0-9]{64})?$/, { message: 'Invalid nonce format' })
    nonce: string;

    @ApiProperty({
        description: 'Transaction hash from blockchain',
        example: '0x1234567890abcdef...',
    })
    @IsString()
    @MaxLength(128)
    @Matches(/^(0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{87,88})$/, {
        message: 'Invalid transaction hash format',
    })
    txHash: string;

    @ApiPropertyOptional({
        description: 'Privy authentication token (if using embedded wallet)',
    })
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    privyToken?: string;
}

/**
 * DTO for querying deposit history
 */
export class DepositHistoryQueryDto {
    @ApiPropertyOptional({
        description: 'Page number (1-indexed)',
        default: 1,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional({
        description: 'Items per page',
        default: 20,
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 20;

    @ApiPropertyOptional({
        description: 'Filter by status',
        enum: DepositStatus,
    })
    @IsOptional()
    @IsEnum(DepositStatus)
    status?: DepositStatus;

    @ApiPropertyOptional({
        description: 'Filter by chain',
        enum: DepositChain,
    })
    @IsOptional()
    @IsEnum(DepositChain)
    chain?: DepositChain;
}

/**
 * Response DTO for user balance
 */
export class BalanceResponseDto {
    @ApiProperty({ example: '1000.00' })
    balance: string;

    @ApiProperty({ example: '50.00' })
    lockedBalance: string;

    @ApiProperty({ example: '950.00' })
    availableBalance: string;

    @ApiProperty({ example: 'USDC' })
    currency: string;

    @ApiPropertyOptional({
        description: 'List of assets held on different chains',
        example: [{ symbol: 'SUI', balance: '0.12', chain: 'sui', valueUsd: '0.24' }]
    })
    assets?: Array<{
        symbol: string;
        balance: string;
        chain: string;
        valueUsd?: string;
        address?: string;
    }>;
}

/**
 * Response DTO for deposit initiation
 */
export class InitiateDepositResponseDto {
    @ApiProperty({ example: 'dep_abc123xyz' })
    nonce: string;

    @ApiProperty({ example: '0x1234...5678' })
    depositAddress: string;

    @ApiProperty({ example: 300 })
    expiresInSeconds: number;

    @ApiProperty({ example: '100.00' })
    amount: string;

    @ApiProperty({ example: 'base' })
    chain: string;
}

/**
 * Response DTO for deposit transaction
 */
export class DepositTransactionDto {
    @ApiProperty({ example: 'uuid-here' })
    id: string;

    @ApiProperty({ example: '100.00' })
    amount: string;

    @ApiProperty({ example: 'USDC' })
    currency: string;

    @ApiProperty({ example: 'base' })
    chain: string;

    @ApiProperty({ example: '0x1234...5678' })
    txHash: string | null;

    @ApiProperty({ enum: DepositStatus, example: 'confirmed' })
    status: DepositStatus;

    @ApiProperty({ example: '2026-01-06T12:00:00Z' })
    createdAt: string;

    @ApiProperty({ example: '2026-01-06T12:01:00Z' })
    confirmedAt: string | null;
}

/**
 * DTO for initiating a withdrawal
 * 
 * OWASP A03:2021 - Injection Prevention
 * Uses custom validator for chain-specific address validation
 */
export class InitiateWithdrawalDto {
    @ApiProperty({
        description: 'Amount to withdraw in USD',
        example: 50.00,
        minimum: 1,
        maximum: 100000,
    })
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount can have at most 2 decimal places' })
    @IsPositive({ message: 'Amount must be positive' })
    @Min(1, { message: 'Minimum withdrawal amount is $1' })
    @Max(100000, { message: 'Maximum withdrawal amount is $100,000' })
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        description: 'Blockchain network for withdrawal',
        enum: DepositChain,
        example: DepositChain.BASE,
    })
    @IsEnum(DepositChain, { message: 'Invalid chain. Supported: ethereum, solana, sui, base' })
    chain: DepositChain;

    @ApiProperty({
        description: 'Destination wallet address (chain-specific format)',
        examples: {
            ethereum: { value: '0x742d35Cc6634C0532925a3b844Bc9e7595f3bD1d' },
            solana: { value: 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1' },
            sui: { value: '0x02a212de6a9dfa3a69e22387acfbafbb1a9e591c5d4a123456789abcdef12345' },
        },
    })
    @IsString()
    @MinLength(32, { message: 'Address too short' })
    @MaxLength(66, { message: 'Address too long' })
    @Validate(IsValidBlockchainAddressConstraint)
    toAddress: string;
}

/**
 * DTO for confirming a withdrawal
 * 
 * OWASP A03:2021 - Injection Prevention
 * Strict validation on withdrawal confirmation
 */
export class ConfirmWithdrawalDto {
    @ApiProperty({
        description: 'Withdrawal ID (UUID)',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    @IsString()
    @IsUUID('4', { message: 'Invalid withdrawal ID format' })
    withdrawalId: string;

    @ApiProperty({
        description: 'Transaction hash from blockchain (chain-specific format)',
        example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    })
    @IsString()
    @MinLength(64, { message: 'Transaction hash too short' })
    @MaxLength(128, { message: 'Transaction hash too long' })
    @Matches(
        /^(0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{43,88}|[a-fA-F0-9]{64})$/,
        { message: 'Invalid transaction hash format' },
    )
    txHash: string;
}

/**
 * Response DTO for withdrawal initiation
 */
export class WithdrawalResponseDto {
    @ApiProperty({ example: 'uuid-here' })
    id: string;

    @ApiProperty({ example: '50.00' })
    amount: string;

    @ApiProperty({ example: 'USDC' })
    currency: string;

    @ApiProperty({ example: 'base' })
    chain: string;

    @ApiProperty({ example: '0x1234...5678' })
    toAddress: string;

    @ApiProperty({ enum: DepositStatus, example: 'pending' })
    status: DepositStatus;

    @ApiProperty({ example: '2026-01-07T12:00:00Z' })
    createdAt: string;
}
