/**
 * Google OAuth Security Service
 *
 * Comprehensive security hardening for Google OAuth authentication flow.
 * Implements enterprise-grade protection following OWASP guidelines.
 *
 * Security Features:
 * - PKCE (S256) - Proof Key for Code Exchange
 * - State signing with HMAC-SHA256
 * - Session binding to prevent cross-session attacks
 * - Nonce validation for id_token binding
 * - id_token verification (aud, iss, exp, nonce, azp)
 * - JWK caching with automatic rotation
 * - Replay detection via jti registry
 * - Strict redirect_uri exact match validation
 * - Per-IP rate limiting
 *
 * @see https://developers.google.com/identity/openid-connect/openid-connect
 * @see https://datatracker.ietf.org/doc/html/rfc7636
 */

import {
    Injectable,
    Logger,
    UnauthorizedException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import * as crypto from 'crypto';
import { SupabaseService } from '../../../database/supabase.service.js';

/**
 * Google id_token JWT payload
 */
export interface GoogleIdTokenPayload {
    /** Google user ID (subject) */
    sub: string;
    /** Issuer (accounts.google.com) */
    iss: string;
    /** Audience (your client ID) */
    aud: string;
    /** Authorized party (client ID for web) */
    azp?: string;
    /** Email address */
    email: string;
    /** Email verified status */
    email_verified: boolean;
    /** Full name */
    name?: string;
    /** Profile picture URL */
    picture?: string;
    /** Given name */
    given_name?: string;
    /** Family name */
    family_name?: string;
    /** Locale */
    locale?: string;
    /** Expiration timestamp */
    exp: number;
    /** Issued at timestamp */
    iat: number;
    /** Nonce (if provided in auth request) */
    nonce?: string;
    /** JWT ID for replay detection */
    jti?: string;
    /** Access token hash */
    at_hash?: string;
}

/**
 * PKCE pair for OAuth flow
 */
export interface PKCEPair {
    /** Random code verifier (43-128 chars, stored server-side) */
    codeVerifier: string;
    /** SHA256 hash of verifier, base64url encoded */
    codeChallenge: string;
    /** Always 'S256' for SHA256 */
    codeChallengeMethod: 'S256';
}

/**
 * OAuth state data stored in database
 */
export interface OAuthStateData {
    state: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
    sessionId?: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    blockedUntil?: Date;
}

@Injectable()
export class GoogleOAuthSecurityService {
    private readonly logger = new Logger(GoogleOAuthSecurityService.name);

    // Google JWKS endpoint
    private readonly GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
    private readonly GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

    // Valid Google issuers
    private readonly VALID_ISSUERS = [
        'https://accounts.google.com',
        'accounts.google.com',
    ];

    // JWK caching
    private googleJwks: jose.JWTVerifyGetKey | null = null;
    private jwksLastFetch: number = 0;
    private readonly JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    // Configuration
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly callbackUrl: string;
    private readonly stateSecret: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
    ) {
        this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
        this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '');
        this.callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL', '');
        this.stateSecret = this.configService.get<string>(
            'OAUTH_STATE_SECRET',
            crypto.randomBytes(32).toString('hex'), // Generate if not set (dev only)
        );

        if (!this.clientId) {
            this.logger.warn('GOOGLE_CLIENT_ID not configured');
        }
        if (!this.stateSecret || this.stateSecret.length < 32) {
            this.logger.warn('OAUTH_STATE_SECRET should be at least 32 characters');
        }
    }

    // ========================================================================
    // PKCE Implementation (RFC 7636)
    // ========================================================================

    /**
     * Generate PKCE pair (code_verifier and code_challenge)
     *
     * @returns PKCE pair with S256 challenge method
     */
    generatePKCE(): PKCEPair {
        // Generate 32 random bytes = 43 base64url characters
        const codeVerifier = this.base64UrlEncode(crypto.randomBytes(32));

        // SHA256 hash of verifier, base64url encoded
        const hash = crypto.createHash('sha256').update(codeVerifier).digest();
        const codeChallenge = this.base64UrlEncode(hash);

        this.logger.debug(`Generated PKCE pair. Challenge: ${codeChallenge.substring(0, 10)}...`);

        return {
            codeVerifier,
            codeChallenge,
            codeChallengeMethod: 'S256',
        };
    }

    /**
     * Base64URL encode bytes
     */
    private base64UrlEncode(buffer: Buffer): string {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // ========================================================================
    // State Management with Signing and Session Binding
    // ========================================================================

    /**
     * Generate cryptographically secure nonce
     */
    generateNonce(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Sign state token with HMAC-SHA256
     *
     * @param state - The state token to sign
     * @param sessionId - Session ID to bind (optional but recommended)
     * @returns HMAC signature
     */
    signState(state: string, sessionId?: string): string {
        const data = sessionId ? `${state}:${sessionId}` : state;
        return crypto
            .createHmac('sha256', this.stateSecret)
            .update(data)
            .digest('hex');
    }

    /**
     * Verify state signature
     *
     * @param state - The state token
     * @param signature - The signature to verify
     * @param sessionId - Session ID if binding was used
     * @returns true if signature is valid
     */
    verifyStateSignature(state: string, signature: string, sessionId?: string): boolean {
        const expectedSignature = this.signState(state, sessionId);
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex'),
        );
    }

    /**
     * Generate complete OAuth state with PKCE and nonce
     * Stores all security data in database
     *
     * @param sessionId - Browser session ID for binding
     * @param ipAddress - Client IP address
     * @param userAgent - Client user agent
     * @returns State data for authorization URL
     */
    async generateSecureState(
        sessionId?: string,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<OAuthStateData> {
        const supabase = this.supabaseService.getAdminClient();

        // Generate PKCE pair
        const pkce = this.generatePKCE();

        // Generate nonce
        const nonce = this.generateNonce();

        // Create state in database with all security data
        const { data, error } = await supabase.rpc('create_oauth_state_secure', {
            p_provider: 'google',
            p_session_id: sessionId,
            p_ip_address: ipAddress,
            p_user_agent: userAgent,
            p_redirect_uri: this.callbackUrl,
            p_code_verifier: pkce.codeVerifier,
            p_nonce: nonce,
        });

        if (error || !data || data.length === 0) {
            this.logger.error(`Failed to create OAuth state: ${error?.message}`);
            throw new BadRequestException('Failed to initiate OAuth flow');
        }

        const result = data[0];

        this.logger.log(`Created secure OAuth state: ${result.state_token.substring(0, 10)}...`);

        return {
            state: result.state_token,
            codeVerifier: result.code_verifier,
            nonce: result.nonce,
            redirectUri: this.callbackUrl,
            sessionId,
        };
    }

    /**
     * Verify OAuth state and retrieve security data
     * Marks state as used (single-use tokens)
     *
     * @param state - State token from callback
     * @param sessionId - Session ID for binding verification
     * @returns Code verifier and nonce if valid
     */
    async verifyStateComplete(
        state: string,
        sessionId?: string,
    ): Promise<{
        valid: boolean;
        codeVerifier?: string;
        nonce?: string;
        redirectUri?: string;
        reason?: string;
    }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('verify_oauth_state_complete', {
            p_state_token: state,
            p_session_id: sessionId,
        });

        if (error) {
            this.logger.error(`State verification error: ${error.message}`);
            return { valid: false, reason: 'Internal verification error' };
        }

        if (!data || data.length === 0) {
            return { valid: false, reason: 'State verification failed' };
        }

        const result = data[0];

        if (!result.valid) {
            this.logger.warn(`Invalid OAuth state: ${result.reason}`);
            return { valid: false, reason: result.reason };
        }

        return {
            valid: true,
            codeVerifier: result.code_verifier,
            nonce: result.nonce,
            redirectUri: result.redirect_uri,
        };
    }

    // ========================================================================
    // Google JWKS Caching with Rotation Support
    // ========================================================================

    /**
     * Get Google JWKS with caching
     * Automatically refreshes when cache expires
     */
    private async getGoogleJwks(): Promise<jose.JWTVerifyGetKey> {
        const now = Date.now();

        // Return cached JWKS if still valid
        if (this.googleJwks && now - this.jwksLastFetch < this.JWKS_CACHE_TTL_MS) {
            return this.googleJwks;
        }

        // Fetch fresh JWKS
        try {
            this.logger.debug(`Fetching Google JWKS from ${this.GOOGLE_JWKS_URL}`);
            this.googleJwks = jose.createRemoteJWKSet(new URL(this.GOOGLE_JWKS_URL));
            this.jwksLastFetch = now;
            this.logger.log('Google JWKS cache refreshed successfully');
            return this.googleJwks;
        } catch (error) {
            this.logger.error('Failed to fetch Google JWKS', error);

            // If we have a cached version, use it even if stale
            if (this.googleJwks) {
                this.logger.warn('Using stale Google JWKS due to fetch failure');
                return this.googleJwks;
            }

            throw new UnauthorizedException('Unable to verify authentication');
        }
    }

    /**
     * Force JWKS cache refresh
     * Call this when key rotation is detected (e.g., signature verification failure with kid mismatch)
     */
    forceJwksRefresh(): void {
        this.jwksLastFetch = 0;
        this.googleJwks = null;
        this.logger.log('Google JWKS cache cleared, will refresh on next verification');
    }

    // ========================================================================
    // id_token Verification
    // ========================================================================

    /**
     * Verify Google id_token with full claim validation
     *
     * @param idToken - The id_token JWT from Google
     * @param expectedNonce - The nonce we sent in authorization request
     * @returns Verified token payload
     */
    async verifyIdToken(
        idToken: string,
        expectedNonce?: string,
    ): Promise<GoogleIdTokenPayload> {
        if (!idToken) {
            throw new UnauthorizedException('No id_token provided');
        }

        try {
            const jwks = await this.getGoogleJwks();

            // Verify JWT signature and standard claims
            const { payload } = await jose.jwtVerify(idToken, jwks, {
                issuer: this.VALID_ISSUERS,
                audience: this.clientId,
                clockTolerance: 5, // 5 second tolerance for clock skew
            });

            const claims = payload as unknown as GoogleIdTokenPayload;

            // Additional validation
            await this.validateIdTokenClaims(claims, expectedNonce);

            // Register jti for replay detection (if present)
            if (claims.jti) {
                await this.registerJti(claims.jti, new Date(claims.exp * 1000));
            }

            this.logger.debug(`Verified id_token for user: ${claims.email}`);

            return claims;
        } catch (error) {
            if (error instanceof jose.errors.JOSEError) {
                // Check if it's a key rotation issue
                if (error.code === 'ERR_JWKS_NO_MATCHING_KEY') {
                    this.logger.warn('JWKS key mismatch, forcing refresh');
                    this.forceJwksRefresh();
                }
                this.logger.warn(`id_token verification failed: ${error.message}`);
                throw new UnauthorizedException('Invalid authentication token');
            }

            if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
                throw error;
            }

            this.logger.error('Unexpected error during id_token verification', error);
            throw new UnauthorizedException('Authentication failed');
        }
    }

    /**
     * Validate id_token claims beyond jose library checks
     */
    private async validateIdTokenClaims(
        claims: GoogleIdTokenPayload,
        expectedNonce?: string,
    ): Promise<void> {
        const now = Math.floor(Date.now() / 1000);

        // 1. Verify issuer (jose does this, but double-check)
        if (!this.VALID_ISSUERS.includes(claims.iss)) {
            this.logger.warn(`Invalid issuer: ${claims.iss}`);
            throw new UnauthorizedException('Invalid token issuer');
        }

        // 2. Verify audience (jose does this, but double-check)
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!aud.includes(this.clientId)) {
            this.logger.warn(`Invalid audience: ${claims.aud}`);
            throw new UnauthorizedException('Invalid token audience');
        }

        // 3. Verify azp (authorized party) if present
        if (claims.azp && claims.azp !== this.clientId) {
            this.logger.warn(`Invalid authorized party: ${claims.azp}, expected: ${this.clientId}`);
            throw new UnauthorizedException('Invalid authorized party');
        }

        // 4. Verify expiration (jose does this, but extra safety)
        if (claims.exp && claims.exp < now - 5) {
            throw new UnauthorizedException('Token has expired');
        }

        // 5. Verify issued-at (reject tokens from far future)
        if (claims.iat && claims.iat > now + 60) {
            this.logger.warn('Token issued in the future, possible clock skew attack');
            throw new UnauthorizedException('Invalid token timestamp');
        }

        // 6. Verify nonce (critical for CSRF protection)
        if (expectedNonce) {
            if (!claims.nonce) {
                this.logger.warn('Expected nonce but none found in id_token');
                throw new UnauthorizedException('Missing nonce in token');
            }
            if (claims.nonce !== expectedNonce) {
                this.logger.warn(`Nonce mismatch. Expected: ${expectedNonce.substring(0, 10)}, Got: ${claims.nonce.substring(0, 10)}`);
                throw new UnauthorizedException('Nonce mismatch - possible replay attack');
            }
        }

        // 7. Verify email is present and verified
        if (!claims.email) {
            throw new UnauthorizedException('No email in token');
        }

        // Note: We allow unverified emails but may want to track this
        if (!claims.email_verified) {
            this.logger.warn(`Unverified email login attempt: ${claims.email}`);
        }

        // 8. Verify subject exists
        if (!claims.sub) {
            throw new UnauthorizedException('Invalid token: missing subject');
        }
    }

    // ========================================================================
    // Replay Detection (jti)
    // ========================================================================

    /**
     * Register JWT ID to prevent replay attacks
     *
     * @param jti - JWT ID from token
     * @param expiration - Token expiration time
     * @returns true if registered, false if already used (replay detected)
     */
    async registerJti(jti: string, expiration: Date): Promise<boolean> {
        if (!jti) return true; // No jti to register

        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('register_oauth_jti', {
            p_jti: jti,
            p_provider: 'google',
            p_token_exp: expiration.toISOString(),
        });

        if (error) {
            this.logger.error(`Failed to register jti: ${error.message}`);
            // Don't fail the flow, just log
            return true;
        }

        const result = data?.[0];
        if (result && !result.registered) {
            this.logger.warn(`Replay attack detected! jti: ${jti.substring(0, 20)}...`);
            throw new ForbiddenException('Token replay detected');
        }

        return true;
    }

    // ========================================================================
    // Rate Limiting
    // ========================================================================

    /**
     * Check OAuth flow rate limit for IP address
     *
     * @param ipAddress - Client IP address
     * @returns Rate limit status
     */
    async checkRateLimit(ipAddress: string): Promise<RateLimitResult> {
        const supabase = this.supabaseService.getAdminClient();

        const windowMs = this.configService.get<number>('OAUTH_RATE_LIMIT_WINDOW_MS', 60000);
        const maxRequests = this.configService.get<number>('OAUTH_RATE_LIMIT_MAX_REQUESTS', 10);

        const { data, error } = await supabase.rpc('check_oauth_rate_limit', {
            p_identifier: ipAddress,
            p_identifier_type: 'ip',
            p_provider: 'google',
            p_window_ms: windowMs,
            p_max_requests: maxRequests,
        });

        if (error) {
            this.logger.error(`Rate limit check failed: ${error.message}`);
            // Fail open but log the error
            return { allowed: true, remaining: 0, resetAt: new Date() };
        }

        const result = data?.[0];
        if (!result) {
            return { allowed: true, remaining: maxRequests, resetAt: new Date() };
        }

        if (!result.allowed) {
            this.logger.warn(`OAuth rate limit exceeded for IP: ${ipAddress.substring(0, 15)}...`);
        }

        return {
            allowed: result.allowed,
            remaining: result.remaining,
            resetAt: new Date(result.reset_at),
            blockedUntil: result.blocked_until ? new Date(result.blocked_until) : undefined,
        };
    }

    /**
     * Enforce rate limit (throws if blocked)
     */
    async enforceRateLimit(ipAddress: string): Promise<void> {
        const result = await this.checkRateLimit(ipAddress);

        if (!result.allowed) {
            const retryAfter = result.blockedUntil
                ? Math.ceil((result.blockedUntil.getTime() - Date.now()) / 1000)
                : 60;

            throw new ForbiddenException({
                message: 'Too many authentication attempts. Please try again later.',
                retryAfter,
            });
        }
    }

    // ========================================================================
    // Redirect URI Validation
    // ========================================================================

    /**
     * Validate redirect_uri with strict exact matching
     *
     * @param uri - The redirect URI to validate
     * @returns true if exactly matches configured callback URL
     */
    validateRedirectUri(uri: string): boolean {
        if (!uri || !this.callbackUrl) {
            return false;
        }

        const strictMode = this.configService.get<string>('OAUTH_REDIRECT_URI_STRICT', 'true') === 'true';

        if (strictMode) {
            // Exact match required
            return uri === this.callbackUrl;
        }

        // Lenient mode: check origin and path match (development only)
        try {
            const expectedUrl = new URL(this.callbackUrl);
            const actualUrl = new URL(uri);

            return (
                expectedUrl.origin === actualUrl.origin &&
                expectedUrl.pathname === actualUrl.pathname
            );
        } catch {
            return false;
        }
    }

    // ========================================================================
    // Token Exchange with PKCE
    // ========================================================================

    /**
     * Exchange authorization code for tokens with PKCE verification
     *
     * @param code - Authorization code from callback
     * @param codeVerifier - PKCE code verifier
     * @param redirectUri - Must match the redirect_uri used in authorization
     * @returns Tokens including id_token
     */
    async exchangeCodeForTokens(
        code: string,
        codeVerifier: string,
        redirectUri: string,
    ): Promise<{
        accessToken: string;
        idToken: string;
        refreshToken?: string;
        expiresIn: number;
    }> {
        if (!this.validateRedirectUri(redirectUri)) {
            this.logger.warn(`Invalid redirect_uri: ${redirectUri}`);
            throw new BadRequestException('Invalid redirect URI');
        }

        const params = new URLSearchParams({
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
        });

        try {
            const response = await fetch(this.GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})) as { error?: string };
                this.logger.error(`Token exchange failed: ${response.status}`, errorData);

                if (errorData.error === 'invalid_grant') {
                    throw new UnauthorizedException('Authorization code is invalid or expired');
                }

                throw new UnauthorizedException('Failed to exchange authorization code');
            }

            const data = (await response.json()) as {
                access_token: string;
                id_token: string;
                refresh_token?: string;
                expires_in: number;
                token_type: string;
            };

            this.logger.debug('Successfully exchanged code for tokens');

            return {
                accessToken: data.access_token,
                idToken: data.id_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Token exchange request failed', error);
            throw new UnauthorizedException('Authentication failed');
        }
    }

    // ========================================================================
    // Full Secure OAuth Flow
    // ========================================================================

    /**
     * Build Google authorization URL with all security parameters
     *
     * @param stateData - State data from generateSecureState
     * @param pkce - PKCE pair
     * @returns Full authorization URL
     */
    buildAuthorizationUrl(stateData: OAuthStateData, pkce: PKCEPair): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.callbackUrl,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            state: stateData.state,
            nonce: stateData.nonce,
            code_challenge: pkce.codeChallenge,
            code_challenge_method: pkce.codeChallengeMethod,
            prompt: 'consent select_account',
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    /**
     * Complete OAuth callback verification
     *
     * @param code - Authorization code
     * @param state - State token
     * @param sessionId - Session ID for binding
     * @param ipAddress - Client IP for rate limiting
     * @returns Verified user info from id_token
     */
    async verifyCallback(
        code: string,
        state: string,
        sessionId?: string,
        ipAddress?: string,
    ): Promise<GoogleIdTokenPayload> {
        // 1. Rate limit check
        if (ipAddress) {
            await this.enforceRateLimit(ipAddress);
        }

        // 2. Verify state and retrieve PKCE + nonce
        const stateResult = await this.verifyStateComplete(state, sessionId);
        if (!stateResult.valid || !stateResult.codeVerifier || !stateResult.nonce) {
            throw new UnauthorizedException(stateResult.reason || 'Invalid OAuth state');
        }

        // 3. Exchange code for tokens with PKCE
        const tokens = await this.exchangeCodeForTokens(
            code,
            stateResult.codeVerifier,
            stateResult.redirectUri || this.callbackUrl,
        );

        // 4. Verify id_token with nonce
        const idTokenPayload = await this.verifyIdToken(tokens.idToken, stateResult.nonce);

        this.logger.log(`OAuth callback verified for: ${idTokenPayload.email}`);

        return idTokenPayload;
    }
}
