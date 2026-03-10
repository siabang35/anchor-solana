import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SupabaseService } from '../../database/supabase.service.js';
import { EmailService } from '../email/email.service.js';

export interface WalletAddress {
    address: string;
    chain: string;
    isPrimary: boolean;
}

export interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    preferences: Record<string, any>;
    wallet_addresses: WalletAddress[];
    created_at: string;
    updated_at: string;
    // Google OAuth fields
    username?: string | null;
    profile_completed?: boolean;
    google_id?: string | null;
    privy_user_id?: string | null;
    auth_provider?: string | null;
    agreed_to_terms_at?: string | null;
    agreed_to_privacy_at?: string | null;
    // Email verification
    email_verified?: boolean;
}

export interface ProfileInsert {
    id: string;
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    preferences?: Record<string, any>;
    wallet_addresses?: WalletAddress[];
}

export interface ProfileUpdate {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    preferences?: Record<string, any>;
    wallet_addresses?: WalletAddress[];
    email_verified?: boolean;
}

export interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
}

/**
 * Users Service
 * Manages user profiles and wallet addresses
 */
@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);
    private readonly VERIFICATION_TOKEN_EXPIRY_MINUTES = 30;
    private readonly VERIFICATION_SECRET_KEY: string;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
        private readonly emailService: EmailService,
    ) {
        this.VERIFICATION_SECRET_KEY = this.configService.get('VERIFICATION_TOKEN_SECRET')
            || this.configService.get('JWT_SECRET')
            || 'fallback-secret-change-in-production';
    }

    /**
     * Find user by ID
     */
    async findById(id: string): Promise<Profile | null> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            this.logger.error(`Failed to find user: ${error.message}`);
            return null;
        }

        return data as Profile;
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<Profile | null> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            this.logger.error(`Failed to find user by email: ${error.message}`);
            return null;
        }

        return data as Profile;
    }

    /**
     * Find user by wallet address
     */
    async findByWalletAddress(address: string, chain: string): Promise<Profile | null> {
        const supabase = this.supabaseService.getAdminClient();

        // First check wallet_addresses table
        const { data: walletData, error: walletError } = await supabase
            .from('wallet_addresses')
            .select('user_id')
            .eq('address', address.toLowerCase())
            .eq('chain', chain)
            .single();

        if (walletError || !walletData) {
            // Try profiles table JSONB field as fallback
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('*');

            if (profileError || !profiles) return null;

            // Search in wallet_addresses JSONB array
            const found = (profiles as Profile[]).find((p) =>
                p.wallet_addresses?.some(
                    (w) => w.address.toLowerCase() === address.toLowerCase() && w.chain === chain
                )
            );

            return found || null;
        }

        return this.findById((walletData as { user_id: string }).user_id);
    }

    /**
     * Create user profile
     */
    async createProfile(profile: ProfileInsert): Promise<Profile> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('profiles')
            .insert({
                id: profile.id,
                email: profile.email,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                bio: profile.bio,
                preferences: profile.preferences || {},
                wallet_addresses: profile.wallet_addresses || [],
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to create profile: ${error.message}`);
            throw new Error(`Failed to create profile: ${error.message}`);
        }

        this.logger.log(`Profile created: ${profile.id}`);
        return data as Profile;
    }

    /**
     * Update user profile
     * Handles missing email_verified column gracefully
     */
    async updateProfile(id: string, update: ProfileUpdate): Promise<Profile> {
        this.logger.log(`Updating profile ${id} with data: ${JSON.stringify(update)}`);

        const supabase = this.supabaseService.getAdminClient();

        // First attempt with all fields
        let { data, error } = await supabase
            .from('profiles')
            .update({ ...update, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        // If error mentions email_verified column, retry without it
        if (error && (error.message?.includes('email_verified') || error.code === '42703')) {
            this.logger.warn(`email_verified column not found, retrying without it`);
            const { email_verified, ...updateWithoutEmailVerified } = update;

            // Store email_verified status in preferences as fallback
            if (email_verified !== undefined) {
                updateWithoutEmailVerified.preferences = {
                    ...updateWithoutEmailVerified.preferences,
                    email_verified_flag: email_verified,
                };
            }

            const retryResult = await supabase
                .from('profiles')
                .update({ ...updateWithoutEmailVerified, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            this.logger.error(`Failed to update profile ${id}: ${error.message}`);
            this.logger.error(`Error details: ${JSON.stringify(error)}`);
            throw new NotFoundException('Profile not found');
        }

        this.logger.log(`Profile ${id} updated successfully: ${JSON.stringify(data)}`);
        return data as Profile;
    }

    /**
     * Add wallet address to user
     */
    async addWalletAddress(
        userId: string,
        address: string,
        chain: 'ethereum' | 'solana' | 'sui' | 'base',
        isPrimary = false,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Check if this is the first wallet (make it primary)
        const { data: existingWallets } = await supabase
            .from('wallet_addresses')
            .select('id')
            .eq('user_id', userId);

        const shouldBePrimary = isPrimary || !(existingWallets as any[])?.length;

        // If making primary, unset other primary wallets
        if (shouldBePrimary) {
            await supabase
                .from('wallet_addresses')
                .update({ is_primary: false })
                .eq('user_id', userId);
        }

        // Insert new wallet
        const { error } = await supabase.from('wallet_addresses').insert({
            user_id: userId,
            address: address.toLowerCase(),
            chain,
            is_primary: shouldBePrimary,
        });

        if (error) {
            // Might already exist, that's okay
            if (!error.message.includes('duplicate')) {
                this.logger.error(`Failed to add wallet: ${error.message}`);
            }
        }

        // Also update JSONB in profiles for quick lookups
        const profile = await this.findById(userId);
        if (profile) {
            const wallets = profile.wallet_addresses || [];
            const exists = wallets.some(
                (w) => w.address.toLowerCase() === address.toLowerCase() && w.chain === chain
            );

            if (!exists) {
                wallets.push({ address: address.toLowerCase(), chain, isPrimary: shouldBePrimary });
                await this.updateProfile(userId, { wallet_addresses: wallets });
            }
        }
    }

    /**
     * Remove wallet address
     */
    async removeWalletAddress(userId: string, address: string, chain: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        await supabase
            .from('wallet_addresses')
            .delete()
            .eq('user_id', userId)
            .eq('address', address.toLowerCase())
            .eq('chain', chain);

        // Update profiles JSONB
        const profile = await this.findById(userId);
        if (profile) {
            const wallets = profile.wallet_addresses?.filter(
                (w) => !(w.address.toLowerCase() === address.toLowerCase() && w.chain === chain)
            );
            await this.updateProfile(userId, { wallet_addresses: wallets });
        }
    }

    /**
     * Get user's wallet addresses
     */
    async getWalletAddresses(userId: string) {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('wallet_addresses')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) {
            this.logger.error(`Failed to get wallets: ${error.message}`);
            return [];
        }

        return data as Array<{
            id: string;
            user_id: string;
            address: string;
            chain: string;
            is_primary: boolean;
            created_at: string;
        }>;
    }

    /**
     * Upload user avatar
     */
    async uploadAvatar(userId: string, file: MulterFile): Promise<string> {
        const supabase = this.supabaseService.getAdminClient();
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;

        const { error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            });

        if (error) {
            this.logger.error(`Failed to upload avatar: ${error.message}`);
            throw new Error(`Failed to upload avatar: ${error.message}`);
        }

        const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Update profile with new avatar URL
        await this.updateProfile(userId, { avatar_url: data.publicUrl });

        return data.publicUrl;
    }

    /**
     * Request email verification for wallet users
     * Uses secure HMAC-SHA256 token system with fallback storage
     * OWASP: Rate limiting, secure tokens, anti-replay
     */
    async requestEmailVerification(userId: string, email: string): Promise<{ message: string }> {
        const normalizedEmail = email.toLowerCase().trim();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            throw new BadRequestException('Invalid email format');
        }

        // Check if email is already in use by another user
        const existingUser = await this.findByEmail(normalizedEmail);
        if (existingUser && existingUser.id !== userId) {
            throw new BadRequestException('This email is already in use');
        }

        // Get current user
        const user = await this.findById(userId);
        if (!user) throw new NotFoundException('User not found');

        // Rate limiting: Max 3 verification emails per hour
        const pendingData = user.preferences?.email_verification;
        if (pendingData?.requests_count >= 3) {
            const lastRequest = new Date(pendingData.last_request_at);
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (lastRequest > hourAgo) {
                throw new BadRequestException('Too many verification attempts. Please wait an hour.');
            }
        }

        // Generate secure token (64 hex chars)
        const rawToken = crypto.randomBytes(32).toString('hex');

        // Create HMAC-SHA256 hash of the token for secure storage
        const tokenHash = crypto
            .createHmac('sha256', this.VERIFICATION_SECRET_KEY)
            .update(rawToken)
            .digest('hex');

        // Token expiry: 30 minutes
        const expiresAt = Date.now() + this.VERIFICATION_TOKEN_EXPIRY_MINUTES * 60 * 1000;

        // Store token in user preferences (fallback storage)
        // This works without database migration
        const verificationData = {
            email: normalizedEmail,
            token_hash: tokenHash,
            expires_at: expiresAt,
            created_at: Date.now(),
            requests_count: (pendingData?.requests_count || 0) + 1,
            last_request_at: new Date().toISOString(),
        };

        await this.updateProfile(userId, {
            preferences: {
                ...user.preferences,
                email_verification: verificationData,
                pending_email: normalizedEmail,
            }
        });

        // Send verification email
        const frontendUrl = this.configService.get('CORS_ORIGINS', 'http://localhost:5173').split(',')[0];
        const verificationLink = `${frontendUrl}/auth/verify?token=${rawToken}&type=email_change&email=${encodeURIComponent(normalizedEmail)}&uid=${userId}`;

        try {
            await this.emailService.sendVerificationEmail(normalizedEmail, verificationLink, user.full_name || undefined);
            this.logger.log(`Verification email sent to ${normalizedEmail} for user ${userId}`);
        } catch (emailError: any) {
            this.logger.error(`Failed to send verification email: ${emailError.message}`);
            throw new BadRequestException('Failed to send verification email');
        }

        return { message: 'Verification link sent to your email' };
    }

    /**
     * Verify email with secure token (for link-based verification)
     * OWASP: Anti-replay, timing-safe comparison, single-use tokens
     */
    async verifyEmailWithToken(email: string, rawToken: string, userId?: string): Promise<Profile> {
        const normalizedEmail = email.toLowerCase().trim();

        // Recreate the HMAC hash from the raw token
        const tokenHash = crypto
            .createHmac('sha256', this.VERIFICATION_SECRET_KEY)
            .update(rawToken)
            .digest('hex');

        // If userId is provided, use it directly (from URL param)
        let user: Profile | null = null;

        if (userId) {
            user = await this.findById(userId);
        } else {
            // Try to find user by pending email in preferences
            const supabase = this.supabaseService.getAdminClient();
            const { data: profiles } = await supabase
                .from('profiles')
                .select('*')
                .ilike('preferences->>pending_email', normalizedEmail);

            if (profiles && profiles.length > 0) {
                user = profiles[0] as Profile;
            }
        }

        if (!user) {
            this.logger.warn(`No user found for email verification: ${normalizedEmail}`);
            throw new BadRequestException('Invalid verification link');
        }

        // Get stored verification data
        const verificationData = user.preferences?.email_verification;

        if (!verificationData) {
            throw new BadRequestException('No verification pending for this email');
        }

        // Check email matches
        if (verificationData.email !== normalizedEmail) {
            throw new BadRequestException('Email mismatch');
        }

        // Check expiry
        if (Date.now() > verificationData.expires_at) {
            // Clear expired verification data
            const { email_verification, pending_email, ...restPreferences } = user.preferences || {};
            await this.updateProfile(user.id, { preferences: restPreferences });
            throw new BadRequestException('This verification link has expired. Please request a new one.');
        }

        // Timing-safe token comparison using HMAC
        const storedHash = verificationData.token_hash;
        const isValidToken = crypto.timingSafeEqual(
            Buffer.from(storedHash, 'hex'),
            Buffer.from(tokenHash, 'hex')
        );

        if (!isValidToken) {
            throw new BadRequestException('Invalid verification token');
        }

        // Token is valid! Update email and set as verified
        // Clear verification data (single-use token)
        const { email_verification, pending_email, ...restPreferences } = user.preferences || {};

        const updatedProfile = await this.updateProfile(user.id, {
            email: normalizedEmail,
            email_verified: true,
            preferences: restPreferences,
        });

        this.logger.log(`Email verified for user ${user.id}: ${normalizedEmail}`);
        return updatedProfile;
    }

    /**
     * Verify email with code (legacy method - kept for backward compatibility)
     */
    async verifyEmailUpdate(userId: string, email: string, code: string): Promise<Profile> {
        // If code looks like a token (64 hex chars), use token verification
        if (code.length === 64 && /^[a-f0-9]+$/.test(code)) {
            return this.verifyEmailWithToken(email, code);
        }

        // Legacy code-based verification
        const user = await this.findById(userId);
        if (!user) throw new NotFoundException('User not found');

        const verificationData = user.preferences?.email_verification;

        if (!verificationData) {
            throw new BadRequestException('No verification pending');
        }

        if (verificationData.email !== email) {
            throw new BadRequestException('Email mismatch');
        }

        if (Date.now() > verificationData.expiresAt) {
            throw new BadRequestException('Verification code expired');
        }

        if (verificationData.code !== code) {
            const attempts = (verificationData.attempts || 0) + 1;
            if (attempts >= 5) {
                const { email_verification, ...restPreferences } = user.preferences;
                await this.updateProfile(userId, { preferences: restPreferences });
                throw new BadRequestException('Too many failed attempts. Please request a new code.');
            }

            await this.updateProfile(userId, {
                preferences: {
                    ...user.preferences,
                    email_verification: { ...verificationData, attempts }
                }
            });
            throw new BadRequestException('Invalid verification code');
        }

        // Code is valid! Update email and set as verified
        const { email_verification, ...restPreferences } = user.preferences;

        return this.updateProfile(userId, {
            email: email,
            email_verified: true,
            preferences: restPreferences
        });
    }
}
