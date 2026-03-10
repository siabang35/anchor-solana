import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';

export interface JwtPayload {
    sub: string; // User ID
    email?: string;
    walletAddress?: string;
    chain?: string;
    iat: number;
    exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                // Try Authorization header first
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                // Then try cookie
                (req) => {
                    if (req?.cookies?.access_token) {
                        return req.cookies.access_token;
                    }
                    return null;
                },
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload.sub) {
            throw new UnauthorizedException('Invalid token payload');
        }

        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return {
            id: payload.sub,
            email: payload.email,
            walletAddress: payload.walletAddress,
            chain: payload.chain,
        };
    }
}
