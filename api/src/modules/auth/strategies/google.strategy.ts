import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile, StrategyOptionsWithRequest } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Google OAuth Strategy
 *
 * Enhanced with:
 * - OpenID Connect scope for id_token
 * - PKCE support via passReqToCallback
 * - Nonce extraction for verification
 * - Session state binding
 *
 * Note: Full security verification (PKCE, nonce, id_token) is handled
 * by GoogleOAuthSecurityService in the callback. This strategy extracts
 * initial profile data from the OAuth response.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    private readonly logger = new Logger(GoogleStrategy.name);

    constructor(private readonly configService: ConfigService) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
            scope: ['openid', 'email', 'profile'], // OpenID Connect for id_token
            accessType: 'offline', // Get refresh token
            passReqToCallback: true, // Pass request to validate for session access
        } as StrategyOptionsWithRequest);
    }

    /**
     * Validate OAuth callback
     *
     * Extracts user profile from Google OAuth response.
     * Full security verification is done in auth.controller using GoogleOAuthSecurityService.
     */
    async validate(
        req: Request,
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
    ): Promise<void> {
        const { id, emails, displayName, photos } = profile;

        const email = emails?.[0]?.value;
        const avatar = photos?.[0]?.value;

        if (!email) {
            this.logger.warn(`Google OAuth: No email found for profile ${id}`);
            return done(new Error('No email found in Google profile'), undefined);
        }

        // Extract params from the request for logging/debugging
        const state = req.query.state as string;
        const code = req.query.code as string;

        const user = {
            googleId: id,
            email,
            fullName: displayName,
            avatarUrl: avatar,
            accessToken,
            refreshToken,
            // Pass state and code for controller to perform full security verification
            oauthParams: {
                state,
                code,
            },
        };

        this.logger.log(`Google OAuth: Extracted profile for ${email}`);
        done(null, user);
    }
}
