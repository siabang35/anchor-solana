import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    UnauthorizedException,
    Logger,
    ConflictException,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SupabaseService } from '../../../database/supabase.service.js';
import { UsersService } from '../../users/users.service.js';
import { PasswordValidator } from '../validators/index.js';
import { EmailService } from '../../email/email.service.js';

/**
 * OTP Request Response
 */
export interface OtpRequestResponse {
    message: string;
    expiresIn: number;
    retryAfter?: number;
}

/**
 * Signup Response (uses email verification link)
 */
export interface SignupLinkResponse {
    message: string;
    requiresVerification: boolean;
}

/**
 * OTP Verification Response
 */
export interface OtpVerifyResponse {
    user: {
        id: string;
        email?: string;
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
}

/**
 * OTP Service
 * Handles:
 * - Signup: Email verification link (standard Supabase flow)
 * - Login: OTP-based verification (Supabase + Custom Fallback)
 */
@Injectable()
export class OtpService {
    private readonly logger = new Logger(OtpService.name);
    private readonly SALT_ROUNDS = 12;
    private readonly OTP_EXPIRY_MINUTES = 10;
    private readonly MIN_INTERVAL_SECONDS = 60;
    // OWASP: Longer expiry for email verification links (users may take time to check email)
    private readonly VERIFICATION_TOKEN_EXPIRY_MINUTES = 30;
    // OWASP: Secret key for HMAC-SHA256 token signing
    private readonly VERIFICATION_SECRET_KEY: string;

    constructor(
        @Optional() private readonly configService: ConfigService | undefined,
        private readonly supabaseService: SupabaseService,
        private readonly usersService: UsersService,
        private readonly passwordValidator: PasswordValidator,
        private readonly emailService: EmailService,
    ) {
        // OWASP A02:2021 - Use dedicated secret for token signing
        this.VERIFICATION_SECRET_KEY = this.configService?.get('VERIFICATION_TOKEN_SECRET')
            || this.configService?.get('JWT_SECRET')
            || 'fallback-secret-change-in-production';
    }

    /**
     * Request signup with email verification link
     */
    async requestSignupWithLink(
        email: string,
        password: string,
        fullName: string | undefined,
        ipAddress: string,
        userAgent?: string,
    ): Promise<SignupLinkResponse> {
        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check if already registered
        const existingProfile = await this.usersService.findByEmail(normalizedEmail);

        if (existingProfile) {
            const supabase = this.supabaseService.getAdminClient();
            const { data: authUser } = await supabase.auth.admin.getUserById(existingProfile.id);

            if (authUser?.user?.email_confirmed_at) {
                throw new ConflictException('Email already registered');
            }

            // User exists but is unverified - Treat as resend
            this.logger.log(`Unverified user signup retry: ${normalizedEmail} - Triggering resend`);
            return this.resendSignupVerification(normalizedEmail, ipAddress, userAgent);
        }

        // 2. Validate password strength
        const passwordValidation = this.passwordValidator.validate(password, normalizedEmail);
        if (!passwordValidation.isValid) {
            throw new BadRequestException({
                message: 'Password does not meet security requirements',
                errors: passwordValidation.errors,
                suggestions: passwordValidation.suggestions,
            });
        }

        // 3. Check rate limit
        await this.checkRateLimitAndLockout(normalizedEmail, ipAddress);

        // 4. Create user via Supabase Auth with email_confirm: false
        const supabase = this.supabaseService.getAdminClient();

        const frontendUrl = this.configService?.get('CORS_ORIGINS', 'http://localhost:5173').split(',')[0] || 'http://localhost:5173';

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: false, // Requires email verification
            user_metadata: { full_name: fullName },
        });

        if (authError) {
            this.logger.error(`Signup failed: ${authError.message}`);
            if (authError.message.includes('already registered') || authError.message.includes('duplicate')) {
                throw new ConflictException('Email already registered');
            }
            throw new BadRequestException(authError.message || 'Failed to create account');
        }

        if (!authData.user) {
            throw new BadRequestException('Failed to create account');
        }

        // 5. Create profile
        await this.usersService.createProfile({
            id: authData.user.id,
            email: normalizedEmail,
            full_name: fullName || null,
            avatar_url: null,
            wallet_addresses: [],
        });

        // 6. Generate SECURE verification token using HMAC-SHA256
        // OWASP A02:2021 - Custom tokens are more reliable than Supabase tokens
        // and provide 30-minute validity (vs 10 min default)

        try {
            const verificationToken = await this.generateSecureVerificationToken(
                authData.user.id,
                normalizedEmail,
                'signup',
                ipAddress,
                userAgent,
            );

            // Construct SAFE frontend verification link
            // Points to frontend page that will POST the token to backend
            const verificationLink = `${frontendUrl}/auth/verify?token=${verificationToken}&type=signup&email=${encodeURIComponent(normalizedEmail)}`;

            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[DEBUG] Verification Link for ${normalizedEmail}: ${verificationLink}`);
            }

            // Send via EmailService
            await this.emailService.sendVerificationEmail(normalizedEmail, verificationLink, fullName);
            this.logger.log(`Secure verification link sent via SMTP to ${normalizedEmail}`);
        } catch (error: any) {
            this.logger.error(`Failed to send verification email: ${error.message}`);
            // If this fails, we should technically fail the request or return a warning
            throw new BadRequestException('Failed to send verification email. Please try again.');
        }

        this.logger.log(`User registered (pending verification): ${normalizedEmail}`);

        return {
            message: 'Account created! Please check your email to verify your account.',
            requiresVerification: true,
        };
    }

    /**
     * Request OTP for login
     * Validates credentials first, then sends OTP (Supabase or Custom Fallback)
     */
    async requestLoginOtp(
        email: string,
        password: string,
        ipAddress: string,
        userAgent?: string,
    ): Promise<OtpRequestResponse> {
        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check rate limit and lockout
        await this.checkRateLimitAndLockout(normalizedEmail, ipAddress);

        // 2. Verify credentials with Supabase first
        const supabase = this.supabaseService.getClient();
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
        });

        if (authError || !authData.user) {
            await this.logOtpAttempt(normalizedEmail, ipAddress, false, 'Invalid credentials', userAgent);
            throw new UnauthorizedException('Invalid email or password');
        }

        // 3. Sign out immediately (we just wanted to verify password)
        await supabase.auth.signOut();

        // 4. Now send OTP
        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
                shouldCreateUser: false,
            },
        });

        // 5. Log the request
        await this.logOtpRequest(normalizedEmail, ipAddress, 'login', userAgent, !otpError, otpError?.message);

        // === FALLBACK: Custom 6-Digit OTP ===
        if (otpError) {
            this.logger.warn(`Supabase OTP failed: ${otpError.message}. Attempting PRO SMTP Fallback (Numeric Code).`);

            const fallbackCode = await this.generateFallbackOtp(normalizedEmail);

            if (fallbackCode) {
                // Send secure numeric code via EmailService
                await this.emailService.sendEmail({
                    to: normalizedEmail,
                    subject: 'Login Verification Code - ExoDuZe',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <h1 style="color: #333;">Login Request</h1>
                            </div>
                            <p style="color: #666; font-size: 16px;">Hello,</p>
                            <p style="color: #666; font-size: 16px;">We received a login request for your ExoDuZe account. Please use the verification code below:</p>
                            
                            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                                <h1 style="margin: 0; font-size: 36px; letter-spacing: 8px; color: #2d3748; font-weight: bold;">${fallbackCode}</h1>
                            </div>

                            <p style="color: #666; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
                            <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">If you did not request this code, please secure your account.</p>
                        </div>
                    `,
                    text: `Your ExoDuZe Login Code: ${fallbackCode} (Expires in 10 minutes)`
                });

                this.logger.log(`Login OTP Code sent via SMTP fallback to ${normalizedEmail}`);

                return {
                    message: 'Verification code sent to your email (fallback)',
                    expiresIn: this.OTP_EXPIRY_MINUTES * 60,
                };
            }

            this.logger.error(`Fallback generation failed`);
            throw new BadRequestException('Failed to send verification code. Please try again.');
        }

        this.logger.log(`Login OTP requested for: ${normalizedEmail}`);

        return {
            message: 'Verification code sent to your email',
            expiresIn: this.OTP_EXPIRY_MINUTES * 60,
        };
    }

    /**
     * Verify OTP and complete login
     */
    async verifyLoginOtp(
        email: string,
        token: string,
        ipAddress: string,
        userAgent?: string,
        generateTokensFn?: (payload: { sub: string; email: string }) => Promise<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
        }>,
        type: 'signup' | 'login' | 'magiclink' | 'recovery' = 'login',
    ): Promise<OtpVerifyResponse> {
        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check lockout
        await this.checkLockout(normalizedEmail, ipAddress);

        // 2. Verify OTP with Supabase
        // 2. Verify OTP with Supabase (Robust Retry Strategy)
        // We try strictly in order of likelihood for links vs codes

        let data: any = { user: null, session: null };
        let error: any = null;
        const supabase = this.supabaseService.getClient();

        // Strategy A: Input Type Hint
        // If we know the type, try it first
        const typesToTry: ('signup' | 'magiclink' | 'recovery' | 'email')[] = [];

        if (type === 'magiclink') {
            typesToTry.push('magiclink', 'signup', 'recovery'); // Link types
        } else if (type === 'signup') {
            typesToTry.push('signup', 'magiclink', 'recovery');
        } else if (type === 'recovery') {
            typesToTry.push('recovery', 'magiclink', 'signup');
        } else {
            // 'login' usually means numeric
            typesToTry.push('email');
        }

        // Add remaining types as fallbacks
        if (!typesToTry.includes('signup')) typesToTry.push('signup');
        if (!typesToTry.includes('magiclink')) typesToTry.push('magiclink');
        if (!typesToTry.includes('recovery')) typesToTry.push('recovery');
        if (!typesToTry.includes('email')) typesToTry.push('email');

        // Execute Strategy
        for (const verifyType of typesToTry) {
            const result = await supabase.auth.verifyOtp({
                email: normalizedEmail,
                token,
                type: verifyType,
            });

            if (!result.error && result.data.user) {
                data = result.data;
                error = null;
                this.logger.log(`OTP Verified with type: ${verifyType}`);
                break;
            }

            // Keep last error and log debug
            error = result.error;
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[DEBUG] Verify ${verifyType} failed: ${result.error?.message}`);
            }
        }

        // === FALLBACK VERIFICATION ===
        if (error || !data.user) {
            // PRIORITY 1: Try Custom Secure Token Verification (for signup links)
            if (type === 'signup' || type === 'magiclink') {
                const secureResult = await this.verifySecureVerificationToken(
                    normalizedEmail,
                    token,
                    type === 'magiclink' ? 'signup' : type, // Map magiclink to signup for our tokens
                    ipAddress,
                );

                if (secureResult.isValid && secureResult.userId) {
                    this.logger.log(`Secure token verified for signup: ${normalizedEmail}`);

                    // Confirm email in Supabase if not already confirmed
                    const adminSupabase = this.supabaseService.getAdminClient();
                    const { error: confirmError } = await adminSupabase.auth.admin.updateUserById(
                        secureResult.userId,
                        { email_confirm: true }
                    );

                    if (confirmError) {
                        this.logger.warn(`Failed to confirm email in Supabase: ${confirmError.message}`);
                    }

                    // Construct the data object
                    data = { user: { id: secureResult.userId, email: normalizedEmail } as any, session: null };
                    error = null;
                } else if (secureResult.error) {
                    // If secure token explicitly failed, throw with the specific error
                    await this.logOtpAttempt(normalizedEmail, ipAddress, false, secureResult.error, userAgent);
                    throw new UnauthorizedException(secureResult.error);
                }
            }

            // PRIORITY 2: Try existing OTP fallback (for login codes)
            if (!data.user) {
                const isValidFallback = await this.verifyFallbackOtp(normalizedEmail, token);

                if (isValidFallback && generateTokensFn) {
                    // Fetch User
                    const user = await this.usersService.findByEmail(normalizedEmail);
                    if (user) {
                        this.logger.log(`Fallback OTP verified successfully for ${normalizedEmail}`);

                        // Manually construct "data.user" like Supabase
                        data = { user: { id: user.id, email: user.email } as any, session: null };
                        error = null; // Clear error
                    } else {
                        throw new UnauthorizedException('User not found during fallback verification');
                    }
                } else {
                    // Log failed attempt if all fallbacks also failed
                    await this.logOtpAttempt(normalizedEmail, ipAddress, false, error?.message || 'Invalid OTP', userAgent);
                    this.logger.warn(`OTP verification failed for ${normalizedEmail}: ${error?.message || 'Invalid Custom OTP'}`);
                    throw new UnauthorizedException('Invalid or expired verification code');
                }
            }
        }

        // 3. Log successful attempt
        await this.logOtpAttempt(normalizedEmail, ipAddress, true, undefined, userAgent);

        const userId = data.user?.id;

        if (!userId) {
            throw new UnauthorizedException('User identifier missing after verification');
        }

        // 4. Get existing profile
        const profile = await this.usersService.findById(userId);

        if (!profile) {
            throw new UnauthorizedException('User profile not found');
        }

        this.logger.log(`User logged in via OTP: ${normalizedEmail}`);

        // 5. Generate JWT tokens
        if (!generateTokensFn) {
            throw new BadRequestException('Token generation function not provided');
        }

        const tokens = await generateTokensFn({ sub: userId, email: normalizedEmail });

        return {
            user: {
                id: userId,
                email: normalizedEmail,
                fullName: profile?.full_name || undefined,
                avatarUrl: profile?.avatar_url || undefined,
                bio: profile?.bio || undefined,
                walletAddresses: profile?.wallet_addresses?.map((w: any) => ({
                    address: w.address,
                    chain: w.chain,
                })),
            },
            tokens,
        };
    }

    /**
     * Resend OTP for login (includes fallback)
     */
    async resendLoginOtp(
        email: string,
        ipAddress: string,
        userAgent?: string,
    ): Promise<OtpRequestResponse> {
        const normalizedEmail = email.toLowerCase().trim();

        await this.checkRateLimitAndLockout(normalizedEmail, ipAddress);

        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: { shouldCreateUser: false },
        });

        await this.logOtpRequest(normalizedEmail, ipAddress, 'resend', userAgent, !error, error?.message);

        // Fallback Resend
        if (error) {
            const fallbackCode = await this.generateFallbackOtp(normalizedEmail);
            if (fallbackCode) {
                await this.emailService.sendEmail({
                    to: normalizedEmail,
                    subject: 'Login Verification Code (Resend)',
                    html: `<p>Your new login code is: <b>${fallbackCode}</b></p>`,
                    text: `Your Login Code: ${fallbackCode}`
                });
                return { message: 'Code resent (fallback)', expiresIn: 600, retryAfter: 60 };
            }
        }

        if (error) {
            this.logger.error(`OTP resend failed for ${normalizedEmail}: ${error.message}`);
            throw new BadRequestException('Failed to resend verification code. Please try again.');
        }

        return {
            message: 'Verification code resent to your email',
            expiresIn: this.OTP_EXPIRY_MINUTES * 60,
            retryAfter: this.MIN_INTERVAL_SECONDS,
        };
    }

    /**
     * Resend signup verification email
     * Uses custom secure tokens for reliable verification
     */
    async resendSignupVerification(
        email: string,
        ipAddress: string,
        userAgent?: string,
    ): Promise<SignupLinkResponse> {
        const normalizedEmail = email.toLowerCase().trim();
        await this.checkRateLimitAndLockout(normalizedEmail, ipAddress);

        const frontendUrl = this.configService?.get('CORS_ORIGINS', 'http://localhost:5173').split(',')[0] || 'http://localhost:5173';

        // Find user by email to get user_id
        const user = await this.usersService.findByEmail(normalizedEmail);
        if (!user) {
            // Don't reveal if user exists or not (OWASP)
            this.logger.warn(`Resend requested for non-existent email: ${normalizedEmail}`);
            return {
                message: 'If this email is registered, a verification link has been sent.',
                requiresVerification: true,
            };
        }

        try {
            // Generate new secure verification token
            const verificationToken = await this.generateSecureVerificationToken(
                user.id,
                normalizedEmail,
                'signup',
                ipAddress,
                userAgent,
            );

            // Construct SAFE frontend verification link
            const verificationLink = `${frontendUrl}/auth/verify?token=${verificationToken}&type=signup&email=${encodeURIComponent(normalizedEmail)}`;

            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[DEBUG] Resend Verification Link for ${normalizedEmail}: ${verificationLink}`);
            }

            // Send via EmailService
            await this.emailService.sendVerificationEmail(normalizedEmail, verificationLink);
            this.logger.log(`Secure verification link resent via SMTP to ${normalizedEmail}`);
        } catch (error: any) {
            this.logger.error(`Resend failed: ${error.message}`);
            throw new BadRequestException('Failed to resend verification link. Please try again.');
        }

        await this.logOtpRequest(normalizedEmail, ipAddress, 'resend_signup', userAgent, true);

        return {
            message: 'Verification link resent.',
            requiresVerification: true,
        };
    }

    // =====================================
    // Private Helper Methods
    // =====================================

    private async checkRateLimitAndLockout(email: string, ipAddress: string): Promise<void> {
        await this.checkLockout(email, ipAddress);
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase.rpc('check_otp_rate_limit', {
            p_email: email,
            p_ip: ipAddress,
            p_min_interval_seconds: this.MIN_INTERVAL_SECONDS,
            p_max_per_hour_email: 5,
            p_max_per_hour_ip: 20,
        });

        if (error) {
            this.logger.error(`Rate limit check failed: ${error.message}`);
            return;
        }

        const result = data?.[0];
        if (result && !result.allowed) {
            throw new ForbiddenException({
                message: result.reason || 'Please wait before requesting another code',
                retryAfter: result.retry_after_seconds || this.MIN_INTERVAL_SECONDS,
            });
        }
    }

    private async checkLockout(email: string, ipAddress: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase.rpc('check_otp_lockout', {
            p_email: email,
            p_ip: ipAddress,
        });

        if (error) {
            this.logger.error(`Lockout check failed: ${error.message}`);
            return;
        }

        const result = data?.[0];
        if (result && result.is_locked) {
            const lockedUntil = new Date(result.lock_expires_at);
            const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
            throw new ForbiddenException(`Too many failed attempts. Try again in ${minutesRemaining} minutes.`);
        }
    }

    private async logOtpRequest(
        email: string,
        ipAddress: string,
        requestType: string,
        userAgent?: string,
        otpSent = true,
        sendError?: string,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        await supabase.rpc('log_otp_request', {
            p_email: email,
            p_ip: ipAddress,
            p_request_type: requestType,
            p_user_agent: userAgent || null,
            p_otp_sent: otpSent,
            p_send_error: sendError || null,
        });
    }

    private async logOtpAttempt(
        email: string,
        ipAddress: string,
        success: boolean,
        failureReason?: string,
        userAgent?: string,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        await supabase.rpc('log_otp_attempt', {
            p_email: email,
            p_ip: ipAddress,
            p_success: success,
            p_failure_reason: failureReason || null,
            p_user_agent: userAgent || null,
        });
    }

    /**
     * Generate and store custom OTP for fallback
     */
    private async generateFallbackOtp(email: string): Promise<string | null> {
        // Generate secure 6-digit code using Node crypto
        const code = crypto.randomInt(100000, 999999).toString();
        // Hash for security (OWASP requirement)
        const hash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        const supabase = this.supabaseService.getAdminClient();

        try {
            const { error } = await supabase.from('otp_fallback_codes').insert({
                email,
                code_hash: hash,
                expires_at: expiresAt.toISOString(),
            });
            if (error) {
                // Warning, not error, as table might be missing in dev if no migration
                this.logger.warn(`Fallback DB insert failed: ${error.message}`);
                throw error;
            }
            return code;
        } catch (error) {
            this.logger.error(`Failed to store fallback OTP. Ensure migration 034 is applied.`);
            return null;
        }
    }

    /**
     * Verify custom OTP from fallback table
     */
    private async verifyFallbackOtp(email: string, code: string): Promise<boolean> {
        const supabase = this.supabaseService.getAdminClient();
        try {
            const { data } = await supabase.from('otp_fallback_codes')
                .select('*')
                .eq('email', email)
                .is('used_at', null)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!data) return false;

            const isValid = await bcrypt.compare(code, data.code_hash);
            if (isValid) {
                // Mark as used (Replay protection)
                await supabase.from('otp_fallback_codes')
                    .update({ used_at: new Date().toISOString() })
                    .eq('id', data.id);
                return true;
            }
        } catch (error: any) {
            this.logger.debug(`Fallback verification: ${error.message}`);
        }
        return false;
    }

    // =====================================
    // Secure Email Verification Token Methods
    // OWASP A02:2021 - Cryptographic Failures Prevention
    // =====================================

    /**
     * Generate a secure verification token using HMAC-SHA256
     * Token format: random_bytes_hex (stored hash is HMAC of this)
     * @returns The raw token to embed in verification link
     */
    private async generateSecureVerificationToken(
        userId: string,
        email: string,
        tokenType: 'signup' | 'password_reset' | 'email_change',
        ipAddress: string,
        userAgent?: string,
    ): Promise<string> {
        // Generate 32 bytes of cryptographically secure random data
        const tokenBytes = crypto.randomBytes(32);
        const rawToken = tokenBytes.toString('hex'); // 64 char hex string

        // Create HMAC-SHA256 hash of the token
        const tokenHash = crypto
            .createHmac('sha256', this.VERIFICATION_SECRET_KEY)
            .update(rawToken)
            .digest('hex');

        // Store in database via RPC
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase.rpc('store_verification_token', {
            p_user_id: userId,
            p_email: email.toLowerCase(),
            p_token_hash: tokenHash,
            p_token_type: tokenType,
            p_ip_address: ipAddress,
            p_user_agent: userAgent || null,
            p_expires_in_minutes: this.VERIFICATION_TOKEN_EXPIRY_MINUTES,
        });

        if (error) {
            this.logger.error(`Failed to store verification token: ${error.message}`);
            throw new Error('Failed to generate verification token');
        }

        this.logger.debug(`Verification token generated for ${email}, type: ${tokenType}`);

        // Return the raw token (NOT the hash) for the email link
        return rawToken;
    }

    /**
     * Verify a secure token and return user_id if valid
     * Uses timing-safe comparison via database function
     * Token is consumed on verification (single-use)
     */
    async verifySecureVerificationToken(
        email: string,
        rawToken: string,
        tokenType: 'signup' | 'password_reset' | 'email_change',
        ipAddress: string,
    ): Promise<{ isValid: boolean; userId?: string; error?: string }> {
        // Recreate the HMAC hash from the raw token
        const tokenHash = crypto
            .createHmac('sha256', this.VERIFICATION_SECRET_KEY)
            .update(rawToken)
            .digest('hex');

        // Verify and consume via database RPC
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase.rpc('verify_and_consume_token', {
            p_email: email.toLowerCase(),
            p_token_hash: tokenHash,
            p_token_type: tokenType,
            p_ip_address: ipAddress,
        });

        if (error) {
            this.logger.error(`Token verification error: ${error.message}`);
            return { isValid: false, error: 'Verification failed. Please try again.' };
        }

        const result = data?.[0];
        if (!result) {
            return { isValid: false, error: 'Invalid verification link.' };
        }

        if (!result.is_valid) {
            this.logger.warn(`Token verification failed for ${email}: ${result.failure_reason}`);
            return { isValid: false, error: result.failure_reason };
        }

        this.logger.log(`Token verified successfully for ${email}, user: ${result.user_id}`);
        return { isValid: true, userId: result.user_id };
    }
}
