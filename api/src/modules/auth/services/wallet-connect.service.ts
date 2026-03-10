import {
    Injectable,
    Logger,
    UnauthorizedException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { SupabaseService } from '../../../database/supabase.service.js';
import { WalletStrategy } from '../strategies/wallet.strategy.js';
import { UsersService } from '../../users/users.service.js';
import {
    WalletConnectChallengeDto,
    WalletConnectVerifyDto,
    WalletConnectCompleteProfileDto,
    WalletChallengeResponse,
    WalletAuthResponse,
    ConnectedWalletInfo,
    WalletChain,
    WalletProvider,
} from '../dto/wallet-connect.dto.js';

/**
 * WalletConnectService
 * 
 * Handles wallet-based authentication with:
 * - SIWE (Sign-In with Ethereum) message generation
 * - Multi-chain signature verification
 * - Rate limiting and brute force protection
 * - Integration with existing auth system
 * 
 * OWASP Compliance:
 * - A02:2021 - Cryptographic signature verification
 * - A03:2021 - Input validation in DTOs
 * - A04:2021 - Single-use nonces prevent replay attacks
 * - A07:2021 - Rate limiting prevents brute force
 * - A09:2021 - Comprehensive audit logging
 */
@Injectable()
export class WalletConnectService {
    private readonly logger = new Logger(WalletConnectService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly walletStrategy: WalletStrategy,
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Generate a SIWE challenge message for wallet authentication
     * 
     * @param dto - Challenge request with wallet address and chain
     * @param ipAddress - Client IP for rate limiting
     * @param userAgent - Client user agent for device tracking
     */
    async generateChallenge(
        dto: WalletConnectChallengeDto,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<WalletChallengeResponse> {
        const { address, chain, provider } = dto;
        const ip = ipAddress || '0.0.0.0';

        // Validate address format
        if (!this.isValidAddressFormat(address, chain)) {
            throw new BadRequestException(`Invalid ${chain} address format`);
        }

        // Check rate limiting
        await this.checkRateLimit(address, ip);

        // Generate nonce in TypeScript (more reliable than database function)
        const nonce = this.generateCryptoNonce();
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000); // 5 minutes
        const domain = 'exoduze.app';
        const uri = 'https://exoduze.app';

        // Generate SIWE-compatible message
        const message = this.generateSIWEMessage(address, chain, nonce, issuedAt, expiresAt, domain, uri);

        // Store nonce in database
        const supabase = this.supabaseService.getAdminClient();
        const { error } = await supabase
            .from('wallet_auth_nonces')
            .insert({
                nonce,
                wallet_address: address.toLowerCase(),
                chain,
                message,
                domain,
                issued_at: issuedAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                ip_address: ip,
                user_agent: userAgent,
                status: 'pending',
            });

        if (error) {
            this.logger.error(`Failed to store nonce: ${error.message}`);
            throw new BadRequestException('Failed to generate authentication challenge');
        }

        this.logger.debug(`Generated challenge for ${address.slice(0, 10)}... on ${chain}`);

        return {
            message,
            nonce,
            issuedAt: issuedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            domain,
        };
    }

    /**
     * Verify wallet signature and authenticate user
     * 
     * @param dto - Verification request with signature
     * @param ipAddress - Client IP for logging and rate limiting
     * @param userAgent - Client user agent
     */
    async verifySignature(
        dto: WalletConnectVerifyDto,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<WalletAuthResponse> {
        const { address, chain, signature, message, nonce, provider } = dto;
        const ip = ipAddress || '0.0.0.0';

        // Check rate limiting first
        await this.checkRateLimit(address, ip);

        // Consume the nonce (single-use verification)
        const nonceResult = await this.consumeNonce(nonce, address, chain);
        if (!nonceResult.valid) {
            await this.logAuthAttempt(address, chain, provider, ip, false, nonceResult.reason);
            throw new UnauthorizedException(nonceResult.reason || 'Invalid nonce');
        }

        // Verify the cryptographic signature
        const verification = await this.walletStrategy.verify(
            address,
            signature,
            message,
            chain as 'ethereum' | 'solana' | 'sui' | 'base',
        );

        if (!verification.isValid) {
            await this.logAuthAttempt(address, chain, provider, ip, false, verification.error, nonceResult.nonceId);
            throw new UnauthorizedException(verification.error || 'Invalid signature');
        }

        // Find or prepare user
        const userResult = await this.findOrCreateWalletUser(address, chain, provider);

        let user = userResult.user;
        let isNewUser = userResult.isNew;

        if (!user) {
            // Create new user via Supabase Auth
            user = await this.createWalletUser(address, chain, provider);
            isNewUser = true;
        }

        // Link wallet to user if not already linked
        await this.linkWallet(user.id, address, chain, provider || 'other');

        // Log successful auth attempt
        await this.logAuthAttempt(address, chain, provider, ip, true, undefined, nonceResult.nonceId, user.id);

        // Check profile completion status
        const profilePending = !user.profile_completed && !user.username;

        // Generate JWT tokens
        const tokens = await this.generateTokens(user.id, user.email ?? undefined);

        this.logger.log(`Wallet auth successful: ${address.slice(0, 10)}... (${chain}) - User: ${user.id}`);

        return {
            user: {
                id: user.id,
                email: user.email || undefined,
                username: user.username || undefined,
                fullName: user.full_name || undefined,
                avatarUrl: user.avatar_url || undefined,
                bio: user.bio || undefined,
                walletAddresses: user.wallet_addresses?.map((w: any) => ({
                    address: w.address,
                    chain: w.chain,
                })),
            },
            tokens,
            profilePending,
            wallet: {
                address,
                chain,
                provider,
            },
        };
    }

    /**
     * Complete profile for wallet user (username + TOS)
     */
    async completeProfile(
        userId: string,
        dto: WalletConnectCompleteProfileDto,
        ipAddress?: string,
    ): Promise<WalletAuthResponse> {
        const { username, fullName, agreeToTerms, agreeToPrivacy } = dto;

        // Validate terms acceptance
        if (!agreeToTerms || !agreeToPrivacy) {
            throw new BadRequestException('You must agree to Terms of Service and Privacy Policy');
        }

        // Check username availability
        const usernameCheck = await this.checkUsernameAvailable(username);
        if (!usernameCheck.available) {
            throw new BadRequestException(usernameCheck.message || 'Username not available');
        }

        // Get existing user
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Check if already completed
        if (user.profile_completed) {
            throw new BadRequestException('Profile already completed');
        }

        const supabase = this.supabaseService.getAdminClient();
        const now = new Date().toISOString();

        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                username: username.toLowerCase(),
                full_name: fullName?.trim() || user.full_name,
                agreed_to_terms_at: now,
                agreed_to_privacy_at: now,
                profile_completed: true,
                auth_provider: 'wallet',
                updated_at: now,
            })
            .eq('id', userId);

        if (updateError) {
            this.logger.error(`Profile completion failed: ${updateError.message}`);
            throw new BadRequestException('Failed to complete profile');
        }

        this.logger.log(`Wallet profile completed for user ${userId}: @${username}`);

        // Refresh user data
        const updatedUser = await this.usersService.findById(userId);

        // Get connected wallet
        const { data: walletData } = await supabase
            .from('connected_wallets')
            .select('*')
            .eq('user_id', userId)
            .eq('is_primary', true)
            .single();

        // Generate new tokens
        const tokens = await this.generateTokens(userId, updatedUser?.email ?? undefined);

        return {
            user: {
                id: userId,
                email: updatedUser?.email || undefined,
                username: username.toLowerCase(),
                fullName: updatedUser?.full_name || fullName || undefined,
                avatarUrl: updatedUser?.avatar_url || undefined,
                bio: updatedUser?.bio || undefined,
                walletAddresses: updatedUser?.wallet_addresses?.map((w: any) => ({
                    address: w.address,
                    chain: w.chain,
                })),
            },
            tokens,
            profilePending: false,
            wallet: {
                address: walletData?.address || '',
                chain: walletData?.chain || '',
                provider: walletData?.wallet_provider,
            },
        };
    }

    /**
     * Get connected wallets for a user
     */
    async getConnectedWallets(userId: string): Promise<ConnectedWalletInfo[]> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('connected_wallets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to get connected wallets: ${error.message}`);
            return [];
        }

        return (data || []).map((wallet: any) => ({
            id: wallet.id,
            address: wallet.address,
            chain: wallet.chain,
            provider: wallet.wallet_provider,
            label: wallet.label,
            isPrimary: wallet.is_primary,
            isVerified: wallet.is_verified,
            verifiedAt: wallet.verified_at,
            createdAt: wallet.created_at,
        }));
    }

    /**
     * Disconnect a wallet from user account
     */
    async disconnectWallet(userId: string, address: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Check that user has other connected wallets or auth providers
        const { data: wallets } = await supabase
            .from('connected_wallets')
            .select('id')
            .eq('user_id', userId);

        if (!wallets || wallets.length <= 1) {
            throw new BadRequestException('Cannot disconnect the only connected wallet');
        }

        const { error } = await supabase
            .from('connected_wallets')
            .delete()
            .eq('user_id', userId)
            .eq('address', address.toLowerCase());

        if (error) {
            this.logger.error(`Failed to disconnect wallet: ${error.message}`);
            throw new BadRequestException('Failed to disconnect wallet');
        }

        this.logger.log(`Wallet disconnected: ${address.slice(0, 10)}... for user ${userId}`);
    }

    // ===============================================
    // Private Helper Methods
    // ===============================================

    /**
     * Check rate limiting for wallet auth attempts
     */
    private async checkRateLimit(address: string, ipAddress: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('check_wallet_auth_rate_limit', {
            p_wallet_address: address.toLowerCase(),
            p_ip_address: ipAddress,
            p_max_attempts: 50,
            p_window_minutes: 1,
        });

        if (error) {
            this.logger.warn(`Rate limit check failed: ${error.message}`);
            // Fail open on error
            return;
        }

        const result = data?.[0];
        if (result && !result.allowed) {
            const lockoutMinutes = 15;
            throw new ForbiddenException(
                result.reason ||
                `Too many failed attempts. Please try again in ${lockoutMinutes} minutes.`
            );
        }
    }

    /**
     * Consume a single-use nonce
     */
    private async consumeNonce(
        nonce: string,
        address: string,
        chain: string,
    ): Promise<{ valid: boolean; reason?: string; nonceId?: string }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('consume_wallet_nonce', {
            p_nonce: nonce,
            p_wallet_address: address.toLowerCase(),
            p_chain: chain,
        });

        if (error) {
            this.logger.error(`Nonce consumption failed: ${error.message}`);
            return { valid: false, reason: 'Failed to verify nonce' };
        }

        const result = data?.[0];
        return {
            valid: result?.valid || false,
            reason: result?.reason,
            nonceId: result?.nonce_id,
        };
    }

    /**
     * Log auth attempt for security auditing
     */
    private async logAuthAttempt(
        address: string,
        chain: string,
        provider?: string,
        ipAddress?: string,
        success: boolean = false,
        failureReason?: string,
        nonceId?: string,
        userId?: string,
    ): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();

            await supabase.rpc('log_wallet_auth_attempt', {
                p_wallet_address: address.toLowerCase(),
                p_chain: chain,
                p_wallet_provider: provider || 'other',
                p_ip_address: ipAddress || '0.0.0.0',
                p_success: success,
                p_failure_reason: failureReason,
                p_user_id: userId,
                p_nonce_id: nonceId,
            });
        } catch (error) {
            // Don't fail auth on logging errors
            this.logger.warn(`Failed to log auth attempt: ${error}`);
        }
    }

    /**
     * Find or create user by wallet address
     */
    private async findOrCreateWalletUser(
        address: string,
        chain: string,
        provider?: string,
    ): Promise<{ user: any | null; isNew: boolean }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('find_or_create_wallet_user', {
            p_wallet_address: address.toLowerCase(),
            p_chain: chain,
            p_wallet_provider: provider || 'other',
        });

        if (error) {
            this.logger.error(`Failed to find wallet user: ${error.message}`);
            return { user: null, isNew: true };
        }

        const result = data?.[0];
        if (result?.user_id) {
            const user = await this.usersService.findById(result.user_id);
            return { user, isNew: false };
        }

        return { user: null, isNew: true };
    }

    /**
     * Create a new user for wallet authentication
     */
    private async createWalletUser(
        address: string,
        chain: string,
        provider?: string,
    ): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        // Create user via Supabase Auth with a placeholder email
        const walletEmail = `${address.slice(0, 10)}@wallet.exoduze.app`;
        const randomPassword = this.generateRandomPassword();

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: walletEmail,
            password: randomPassword,
            email_confirm: true,
            user_metadata: {
                wallet_address: address,
                wallet_chain: chain,
                wallet_provider: provider,
            },
        });

        if (authError || !authData.user) {
            this.logger.error(`Failed to create wallet user: ${authError?.message}`);
            throw new BadRequestException('Failed to create user account');
        }

        // Create profile
        await this.usersService.createProfile({
            id: authData.user.id,
            email: null, // No real email for wallet users
            full_name: null,
            avatar_url: null,
            wallet_addresses: [{ address: address.toLowerCase(), chain, isPrimary: true }],
        });

        // Set auth provider
        await supabase
            .from('profiles')
            .update({
                auth_provider: 'wallet',
                profile_completed: false,
            })
            .eq('id', authData.user.id);

        this.logger.log(`Created wallet user: ${address.slice(0, 10)}... (${chain})`);

        return await this.usersService.findById(authData.user.id);
    }

    /**
     * Link wallet to user account
     */
    private async linkWallet(
        userId: string,
        address: string,
        chain: string,
        provider: string,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        const { error } = await supabase.rpc('link_wallet_to_user', {
            p_user_id: userId,
            p_wallet_address: address.toLowerCase(),
            p_chain: chain,
            p_wallet_provider: provider,
            p_is_primary: true,
        });

        if (error) {
            this.logger.warn(`Failed to link wallet: ${error.message}`);
            // Non-fatal - wallet may already be linked
        }
    }

    /**
     * Check username availability
     */
    private async checkUsernameAvailable(username: string): Promise<{
        available: boolean;
        message?: string;
    }> {
        const normalized = username.toLowerCase().trim();

        // Validate format
        if (!this.validateUsernameFormat(normalized)) {
            return {
                available: false,
                message: 'Invalid username format. Use 3-30 alphanumeric characters or underscores.',
            };
        }

        // Check reserved usernames
        const reserved = [
            'admin', 'administrator', 'mod', 'moderator', 'support', 'help',
            'exoduze', 'official', 'system', 'root', 'api', 'www', 'mail',
            'bot', 'null', 'undefined', 'anonymous', 'guest', 'test', 'demo',
        ];
        if (reserved.includes(normalized)) {
            return { available: false, message: 'This username is reserved.' };
        }

        // Check database
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', normalized)
            .maybeSingle();

        if (error) {
            this.logger.error(`Username check failed: ${error.message}`);
            throw new BadRequestException('Unable to check username availability');
        }

        return {
            available: !data,
            message: data ? 'Username already taken' : undefined,
        };
    }

    /**
     * Validate username format
     */
    private validateUsernameFormat(username: string): boolean {
        if (!username || username.length < 3 || username.length > 30) {
            return false;
        }
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(username);
    }

    /**
     * Validate address format for chain
     */
    private isValidAddressFormat(address: string, chain: WalletChain): boolean {
        if (!address) return false;

        switch (chain) {
            case 'ethereum':
            case 'base':
            case 'polygon':
            case 'arbitrum':
            case 'optimism':
                // EVM addresses: 0x + 40 hex chars
                return /^0x[a-fA-F0-9]{40}$/.test(address);
            case 'solana':
                // Solana: Base58, typically 32-44 chars
                // We'll be permissive here and trust the signature verification to fail if address is invalid
                // Just check basic length and allowed characters
                if (address.length < 32 || address.length > 50) return false;
                // Allow alphanumeric (some variants might differ, avoiding strict Base58 check here)
                return /^[a-zA-Z0-9]+$/.test(address);
            case 'sui':
                // SUI: 0x + 64 hex chars (or sometimes shorter)
                return /^0x[a-fA-F0-9]{40,64}$/.test(address);
            default:
                return true;
        }
    }

    /**
     * Generate random password for wallet users
     */
    private generateRandomPassword(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        for (let i = 0; i < 32; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * Generate JWT tokens
     */
    private async generateTokens(userId: string, email?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }> {
        const payload = { sub: userId, email };
        const expiresIn = this.configService.get('JWT_EXPIRES_IN', '15m');
        const refreshExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d');

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_SECRET'),
                expiresIn,
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                expiresIn: refreshExpiresIn,
            }),
        ]);

        const expiresInSeconds = this.parseExpiry(expiresIn);

        return {
            accessToken,
            refreshToken,
            expiresIn: expiresInSeconds,
        };
    }

    /**
     * Parse expiry string to seconds
     */
    private parseExpiry(expiry: string): number {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) return 900;

        const value = parseInt(match[1], 10);
        const unit = match[2];

        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 900;
        }
    }

    /**
     * Generate cryptographic nonce (32 bytes hex)
     */
    private generateCryptoNonce(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate SIWE-compatible message for wallet signing
     */
    private generateSIWEMessage(
        address: string,
        chain: string,
        nonce: string,
        issuedAt: Date,
        expiresAt: Date,
        domain: string,
        uri: string,
    ): string {
        const formatDate = (date: Date) => date.toISOString();

        // Get chain ID for EVM chains
        const chainId = this.getChainId(chain);

        // EVM chains use SIWE format (EIP-4361)
        if (['ethereum', 'base', 'polygon', 'arbitrum', 'optimism'].includes(chain)) {
            return `${domain} wants you to sign in with your Ethereum account:
${address}

Welcome to ExoDuZe! Sign this message to verify your wallet ownership.

This request will NOT trigger a blockchain transaction or cost any gas fees.

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${formatDate(issuedAt)}
Expiration Time: ${formatDate(expiresAt)}`;
        }

        // Solana message format
        if (chain === 'solana') {
            return `${domain} wants you to sign in with your Solana account:
${address}

Domain: ${domain}
Chain: Solana
Nonce: ${nonce}
Issued: ${formatDate(issuedAt)}
Expires: ${formatDate(expiresAt)}

Sign to verify ownership.`;
        }

        // SUI message format
        if (chain === 'sui') {
            return `${domain} wants you to sign in with your SUI account:
${address}

Domain: ${domain}
Chain: SUI
Nonce: ${nonce}
Issued: ${formatDate(issuedAt)}
Expires: ${formatDate(expiresAt)}

Sign to verify ownership.`;
        }

        // Generic format for other chains
        return `ExoDuZe Login Request

Wallet: ${address}
Chain: ${chain}
Nonce: ${nonce}
Issued: ${formatDate(issuedAt)}
Expires: ${formatDate(expiresAt)}

Sign to verify ownership.`;
    }

    /**
     * Get chain ID for EVM chains
     */
    private getChainId(chain: string): number {
        const chainIds: Record<string, number> = {
            ethereum: 1,
            base: 8453,
            polygon: 137,
            arbitrum: 42161,
            optimism: 10,
        };
        return chainIds[chain] || 1;
    }
}