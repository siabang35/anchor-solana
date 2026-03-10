import {
    IsString,
    IsNotEmpty,
    IsIn,
    IsOptional,
    IsBoolean,
    MinLength,
    MaxLength,
    Matches,
    IsEthereumAddress,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Supported wallet providers for connect
 */
export const WALLET_PROVIDERS = ['metamask', 'phantom', 'coinbase', 'slush', 'walletconnect', 'other'] as const;
export type WalletProvider = typeof WALLET_PROVIDERS[number];

/**
 * Supported chains for wallet auth
 */
export const WALLET_CHAINS = ['ethereum', 'base', 'solana', 'sui', 'polygon', 'arbitrum', 'optimism'] as const;
export type WalletChain = typeof WALLET_CHAINS[number];

/**
 * Request a SIWE (Sign-In with Ethereum) challenge message
 * OWASP A03:2021 - Input validation
 */
export class WalletConnectChallengeDto {
    @ApiProperty({
        description: 'Wallet address (format varies by chain)',
        example: '0x1234567890abcdef1234567890abcdef12345678',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        enum: WALLET_CHAINS,
        example: 'ethereum',
    })
    @IsString()
    @IsIn(WALLET_CHAINS)
    chain: WalletChain;

    @ApiPropertyOptional({
        description: 'Wallet provider/software',
        enum: WALLET_PROVIDERS,
        example: 'metamask',
    })
    @IsOptional()
    @IsString()
    @IsIn(WALLET_PROVIDERS)
    provider?: WalletProvider;
}

/**
 * Verify wallet signature and authenticate
 * OWASP A02:2021 - Cryptographic verification
 */
export class WalletConnectVerifyDto {
    @ApiProperty({
        description: 'Wallet address that signed the message',
        example: '0x1234567890abcdef1234567890abcdef12345678',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        enum: WALLET_CHAINS,
        example: 'ethereum',
    })
    @IsString()
    @IsIn(WALLET_CHAINS)
    chain: WalletChain;

    @ApiProperty({
        description: 'Cryptographic signature of the challenge message',
        example: '0xabcdef...',
    })
    @IsString()
    @IsNotEmpty()
    signature: string;

    @ApiProperty({
        description: 'The original challenge message that was signed',
    })
    @IsString()
    @IsNotEmpty()
    message: string;

    @ApiProperty({
        description: 'The nonce from the challenge',
        example: 'a1b2c3d4e5f6...',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(32)
    nonce: string;

    @ApiPropertyOptional({
        description: 'Wallet provider used',
        enum: WALLET_PROVIDERS,
    })
    @IsOptional()
    @IsString()
    @IsIn(WALLET_PROVIDERS)
    provider?: WalletProvider;
}

/**
 * Complete profile for wallet user (username + TOS)
 * Required before full access is granted
 */
export class WalletConnectCompleteProfileDto {
    @ApiProperty({
        description: 'Unique username (3-30 chars, alphanumeric + underscore)',
        example: 'crypto_degen',
        minLength: 3,
        maxLength: 30,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(30)
    @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
        message: 'Username must start with a letter and contain only letters, numbers, and underscores',
    })
    @Transform(({ value }) => value?.trim()?.toLowerCase())
    username: string;

    @ApiPropertyOptional({
        description: 'Full display name',
        example: 'John Doe',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    fullName?: string;

    @ApiProperty({
        description: 'User agrees to Terms of Service',
        example: true,
    })
    @IsBoolean()
    agreeToTerms: boolean;

    @ApiProperty({
        description: 'User agrees to Privacy Policy',
        example: true,
    })
    @IsBoolean()
    agreeToPrivacy: boolean;
}

/**
 * Link an additional wallet to existing account
 */
export class LinkWalletDto {
    @ApiProperty({
        description: 'Wallet address to link',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    address: string;

    @ApiProperty({
        description: 'Blockchain network',
        enum: WALLET_CHAINS,
    })
    @IsString()
    @IsIn(WALLET_CHAINS)
    chain: WalletChain;

    @ApiProperty({
        description: 'Signature proving ownership',
    })
    @IsString()
    @IsNotEmpty()
    signature: string;

    @ApiProperty({
        description: 'Signed message',
    })
    @IsString()
    @IsNotEmpty()
    message: string;

    @ApiProperty({
        description: 'Nonce from challenge',
    })
    @IsString()
    @IsNotEmpty()
    nonce: string;

    @ApiPropertyOptional({
        description: 'Label for this wallet',
        example: 'Trading Wallet',
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    label?: string;

    @ApiPropertyOptional({
        description: 'Set as primary wallet',
    })
    @IsOptional()
    @IsBoolean()
    isPrimary?: boolean;

    @ApiPropertyOptional({
        description: 'Wallet provider',
        enum: WALLET_PROVIDERS,
    })
    @IsOptional()
    @IsString()
    @IsIn(WALLET_PROVIDERS)
    provider?: WalletProvider;
}

/**
 * Response for challenge generation
 */
export interface WalletChallengeResponse {
    /** Challenge message to sign */
    message: string;
    /** Unique nonce (must be included in verification) */
    nonce: string;
    /** When the challenge was issued */
    issuedAt: string;
    /** When the challenge expires */
    expiresAt: string;
    /** Domain for SIWE */
    domain: string;
}

/**
 * Response for wallet authentication
 */
export interface WalletAuthResponse {
    user: {
        id: string;
        email?: string;
        username?: string;
        fullName?: string;
        avatarUrl?: string;
        bio?: string;
        walletAddresses?: Array<{ address: string; chain: string }>;
    };
    tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    };
    /** True if user needs to complete profile (username + TOS) */
    profilePending: boolean;
    /** Connected wallet info */
    wallet: {
        address: string;
        chain: string;
        provider?: string;
    };
}

/**
 * Connected wallet info
 */
export interface ConnectedWalletInfo {
    id: string;
    address: string;
    chain: string;
    provider: string;
    label?: string;
    isPrimary: boolean;
    isVerified: boolean;
    verifiedAt?: string;
    createdAt: string;
}
