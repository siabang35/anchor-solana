import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';

/**
 * Decoded Privy JWT payload
 */
export interface PrivyJwtPayload {
    /** Privy user ID */
    sub: string;
    /** Issuer (privy.io) */
    iss: string;
    /** Audience (your app ID) */
    aud: string;
    /** Expiration timestamp */
    exp: number;
    /** Issued at timestamp */
    iat: number;
    /** Session ID */
    sid?: string;
    /** Linked accounts */
    linked_accounts?: Array<{
        type: string;
        address?: string;
        chain_type?: string;
        verified_at?: number;
        wallet_client?: string;
        wallet_client_type?: string;
    }>;
}

/**
 * Privy wallet creation response
 */
export interface PrivyWalletResponse {
    id: string;
    address: string;
    chain_type: string;
    wallet_client: string;
    wallet_client_type: string;
    created_at: string;
}

/**
 * Privy user with wallets
 */
export interface PrivyUser {
    id: string;
    created_at: string;
    linked_accounts: Array<{
        type: string;
        address?: string;
        chain_type?: string;
        verified_at?: number;
    }>;
}

/**
 * PrivyService
 * 
 * Handles Privy authentication, JWT verification, and wallet management.
 * Implements enterprise-grade security with:
 * - JWKS caching with automatic refresh
 * - RS256 signature verification
 * - Embedded wallet creation via Privy API
 * - Smart wallet support
 */
@Injectable()
export class PrivyService {
    private readonly logger = new Logger(PrivyService.name);
    private jwks: jose.JWTVerifyGetKey | null = null;
    private jwksLastFetch: number = 0;
    private readonly JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    private readonly appId: string;
    private readonly appSecret: string;
    private readonly jwksUrl: string;
    private readonly privyApiUrl = 'https://auth.privy.io/api/v1';

    constructor(private readonly configService: ConfigService) {
        this.appId = this.configService.get<string>('PRIVY_APP_ID', '');
        this.appSecret = this.configService.get<string>('PRIVY_APP_SECRET', '');
        this.jwksUrl = this.configService.get<string>(
            'PRIVY_JWKS_URL',
            `https://auth.privy.io/api/v1/apps/${this.appId}/jwks.json`
        );

        if (!this.appId) {
            this.logger.warn('PRIVY_APP_ID not configured');
        }
        if (!this.appSecret) {
            this.logger.warn('PRIVY_APP_SECRET not configured');
        }
    }

    /**
     * Get authorization header for Privy API
     */
    private getAuthHeader(): string {
        const credentials = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
        return `Basic ${credentials}`;
    }

    /**
     * Get JWKS key set, with caching and automatic refresh
     */
    private async getJwks(): Promise<jose.JWTVerifyGetKey> {
        const now = Date.now();

        // Return cached JWKS if still valid
        if (this.jwks && now - this.jwksLastFetch < this.JWKS_CACHE_TTL_MS) {
            return this.jwks;
        }

        // Fetch fresh JWKS
        try {
            this.logger.debug(`Fetching JWKS from ${this.jwksUrl}`);
            this.jwks = jose.createRemoteJWKSet(new URL(this.jwksUrl));
            this.jwksLastFetch = now;
            this.logger.log('JWKS refreshed successfully');
            return this.jwks;
        } catch (error) {
            this.logger.error('Failed to fetch JWKS', error);

            // If we have a cached version, use it even if stale
            if (this.jwks) {
                this.logger.warn('Using stale JWKS due to fetch failure');
                return this.jwks;
            }

            throw new UnauthorizedException('Unable to verify authentication');
        }
    }

    /**
     * Verify a Privy access token
     * 
     * @param token - The Privy access token (JWT)
     * @returns Decoded JWT payload if valid
     * @throws UnauthorizedException if token is invalid
     */
    async verifyToken(token: string): Promise<PrivyJwtPayload> {
        if (!token) {
            throw new UnauthorizedException('No authentication token provided');
        }

        // Remove "Bearer " prefix if present
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

        try {
            const jwks = await this.getJwks();

            // Verify the JWT
            const { payload } = await jose.jwtVerify(cleanToken, jwks, {
                issuer: 'privy.io',
                audience: this.appId,
            });

            // Additional validation
            this.validatePayload(payload as unknown as PrivyJwtPayload);

            this.logger.debug(`Token verified for Privy user: ${payload.sub}`);
            return payload as unknown as PrivyJwtPayload;
        } catch (error) {
            if (error instanceof jose.errors.JOSEError) {
                this.logger.warn(`JWT verification failed: ${error.message}`);
                throw new UnauthorizedException('Invalid authentication token');
            }

            if (error instanceof UnauthorizedException) {
                throw error;
            }

            this.logger.error('Unexpected error during token verification', error);
            throw new UnauthorizedException('Authentication failed');
        }
    }

    /**
     * Additional payload validation
     */
    private validatePayload(payload: PrivyJwtPayload): void {
        // Check expiration (jose already does this, but extra safety)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            throw new UnauthorizedException('Token has expired');
        }

        // Check issued-at (reject tokens issued too far in the future)
        if (payload.iat && payload.iat > now + 60) {
            this.logger.warn('Token issued in the future, possible clock skew attack');
            throw new UnauthorizedException('Invalid token timestamp');
        }

        // Validate subject exists
        if (!payload.sub) {
            throw new UnauthorizedException('Invalid token: missing user ID');
        }
    }

    /**
     * Get Privy user by ID
     */
    async getUser(privyUserId: string): Promise<PrivyUser | null> {
        try {
            const response = await fetch(`${this.privyApiUrl}/users/${privyUserId}`, {
                method: 'GET',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'privy-app-id': this.appId,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Privy API error: ${response.status}`);
            }

            return (await response.json()) as PrivyUser;
        } catch (error) {
            this.logger.error(`Failed to get Privy user ${privyUserId}`, error);
            return null;
        }
    }

    /**
     * Create an embedded wallet for a user
     * 
     * @param privyUserId - Privy user ID
     * @param chainType - Chain type (ethereum, solana, etc.)
     * @returns Created wallet details
     */
    async createEmbeddedWallet(
        privyUserId: string,
        chainType: 'ethereum' | 'solana' | 'sui' = 'ethereum',
    ): Promise<PrivyWalletResponse | null> {
        if (!this.appSecret) {
            throw new BadRequestException('Privy API not configured');
        }

        try {
            this.logger.log(`Creating embedded wallet for user ${privyUserId} on ${chainType}`);

            const response = await fetch(`${this.privyApiUrl}/wallets`, {
                method: 'POST',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'privy-app-id': this.appId,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chain_type: chainType,
                    owner: {
                        user_id: privyUserId,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Privy wallet creation failed: ${response.status} - ${errorText}`);

                // If wallet already exists, try to get existing wallets
                if (response.status === 409) {
                    const user = await this.getUser(privyUserId);
                    const existingWallet = user?.linked_accounts?.find(
                        a => a.type === 'wallet' && a.chain_type === chainType
                    );
                    if (existingWallet?.address) {
                        return {
                            id: `existing_${existingWallet.address}`,
                            address: existingWallet.address,
                            chain_type: chainType,
                            wallet_client: 'privy',
                            wallet_client_type: 'privy',
                            created_at: new Date().toISOString(),
                        };
                    }
                }

                throw new BadRequestException('Failed to create wallet');
            }

            const wallet = (await response.json()) as PrivyWalletResponse;
            this.logger.log(`Created wallet ${wallet.address} for user ${privyUserId}`);

            return wallet;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Failed to create embedded wallet', error);
            throw new BadRequestException('Failed to create wallet');
        }
    }

    /**
     * Validate address format for a specific chain type
     * 
     * OWASP A03:2021 - Injection
     * Validates address format to prevent invalid data from being used
     * 
     * @param address - The wallet address to validate
     * @param chainType - The chain type for format validation
     * @returns true if the address format is valid for the chain
     */
    isValidAddressFormat(address: string, chainType: 'ethereum' | 'solana' | 'sui'): boolean {
        if (!address) return false;

        switch (chainType) {
            case 'ethereum':
                // EVM addresses: 0x + 40 hex chars = 42 total
                return /^0x[a-fA-F0-9]{40}$/.test(address);
            case 'solana':
                // Solana addresses: Base58, typically 32-44 chars
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
            case 'sui':
                // SUI addresses: 0x + 64 hex chars = 66 total
                return /^0x[a-fA-F0-9]{64}$/.test(address);
            default:
                return true;
        }
    }

    /**
     * Get user's embedded wallets
     */
    async getEmbeddedWallets(privyUserId: string): Promise<PrivyWalletResponse[]> {
        const user = await this.getUser(privyUserId);
        if (!user) {
            return [];
        }

        return user.linked_accounts
            .filter(a => a.type === 'wallet' && a.address)
            .map(a => ({
                id: `wallet_${a.address}`,
                address: a.address!,
                chain_type: a.chain_type || 'ethereum',
                wallet_client: 'privy',
                wallet_client_type: 'privy',
                created_at: new Date(a.verified_at || Date.now()).toISOString(),
            }));
    }

    /**
     * Get or create embedded wallet for user
     * 
     * SECURITY: Validates address format before returning cached wallets
     * to prevent returning EVM addresses for SUI chain requests
     */
    async getOrCreateWallet(
        privyUserId: string,
        chainType: 'ethereum' | 'solana' | 'sui' = 'ethereum',
    ): Promise<PrivyWalletResponse> {
        // First check if user already has a wallet
        const wallets = await this.getEmbeddedWallets(privyUserId);
        const existingWallet = wallets.find(w => w.chain_type === chainType);

        if (existingWallet) {
            // CRITICAL: Validate address format before returning
            // This prevents returning invalid addresses (e.g., EVM address for SUI)
            if (this.isValidAddressFormat(existingWallet.address, chainType)) {
                this.logger.debug(`Using existing wallet ${existingWallet.address} for ${privyUserId}`);
                return existingWallet;
            } else {
                this.logger.warn(
                    `Invalid ${chainType} address format detected: ${existingWallet.address}. ` +
                    `Expected format for ${chainType}, forcing wallet recreation.`
                );
                // Fall through to create a new wallet
            }
        }

        // Create new wallet
        this.logger.log(`Creating new ${chainType} wallet for user ${privyUserId}`);
        const newWallet = await this.createEmbeddedWallet(privyUserId, chainType);
        if (!newWallet) {
            throw new BadRequestException('Failed to create wallet');
        }

        // Validate the newly created wallet address
        if (!this.isValidAddressFormat(newWallet.address, chainType)) {
            this.logger.error(
                `Privy returned invalid ${chainType} address: ${newWallet.address}. ` +
                `Address does not match expected format.`
            );
            throw new BadRequestException(`Failed to generate valid ${chainType} wallet`);
        }

        return newWallet;
    }


    /**
     * Extract wallet address from Privy token
     * 
     * @param token - Privy access token
     * @param chainType - Optional chain type filter (e.g., 'ethereum', 'solana')
     * @returns Wallet address if found
     */
    async getWalletAddress(token: string, chainType?: string): Promise<string | null> {
        const payload = await this.verifyToken(token);

        if (!payload.linked_accounts) {
            return null;
        }

        const walletAccount = payload.linked_accounts.find(account => {
            if (account.type !== 'wallet') return false;
            if (chainType && account.chain_type !== chainType) return false;
            return !!account.address;
        });

        return walletAccount?.address || null;
    }

    /**
     * Check if Privy service is properly configured
     */
    isConfigured(): boolean {
        return !!this.appId && !!this.appSecret;
    }

    /**
     * Import a user into Privy using custom auth ID (Supabase UUID)
     * Uses the latest Privy API v2 format
     */
    async importUser(customUserId: string): Promise<PrivyUser> {
        if (!this.appSecret) {
            throw new BadRequestException('Privy API not configured');
        }

        try {
            this.logger.log(`Importing user ${customUserId} into Privy`);

            // Privy API v2 format - do not include deprecated create_embedded_wallet
            // Wallets are created separately after user import
            const response = await fetch(`${this.privyApiUrl}/users`, {
                method: 'POST',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'privy-app-id': this.appId,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    linked_accounts: [
                        {
                            type: 'custom_auth',
                            custom_user_id: customUserId,
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorText = JSON.stringify(errorData);

                // Handle case where user already exists (409 Conflict)
                if (response.status === 409) {
                    this.logger.warn(`User ${customUserId} already exists in Privy, attempting to retrieve`);

                    // Try to find existing user by custom_user_id
                    const existingUser = await this.findUserByCustomId(customUserId);
                    if (existingUser) {
                        return existingUser;
                    }

                    throw new BadRequestException('User exists but could not be retrieved');
                }

                this.logger.error(`Privy user import failed: ${response.status} - ${errorText}`);
                throw new BadRequestException(`Failed to import user: ${errorText}`);
            }

            const user = (await response.json()) as PrivyUser;
            this.logger.log(`Imported user ${customUserId} -> ${user.id}`);
            return user;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Failed to import user', error);
            throw new BadRequestException('Failed to create Privy user');
        }
    }

    /**
     * Find a Privy user by their custom_user_id
     * Useful when handling 409 conflicts during import
     */
    async findUserByCustomId(customUserId: string): Promise<PrivyUser | null> {
        if (!this.appSecret) {
            return null;
        }

        try {
            // Search for user with custom_auth linked account
            const response = await fetch(
                `${this.privyApiUrl}/users?custom_user_id=${encodeURIComponent(customUserId)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': this.getAuthHeader(),
                        'privy-app-id': this.appId,
                    },
                }
            );

            if (!response.ok) {
                this.logger.warn(`Failed to find user by custom ID: ${response.status}`);
                return null;
            }

            const data = await response.json() as any;
            // The API returns an array of users or a single user
            const users = Array.isArray(data) ? data : (data.users || [data]);

            if (users.length > 0) {
                this.logger.debug(`Found existing Privy user for custom_user_id: ${customUserId}`);
                return users[0] as PrivyUser;
            }

            return null;
        } catch (error) {
            this.logger.error('Error finding user by custom ID', error);
            return null;
        }
    }

    /**
     * Check if only read operations are available (no API secret)
     */
    isReadOnlyMode(): boolean {
        return !!this.appId && !this.appSecret;
    }
}

