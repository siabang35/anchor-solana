import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy, GoogleStrategy, WalletStrategy } from './strategies/index.js';
import { JwtAuthGuard, CsrfGuard } from './guards/index.js';
import { UsersModule } from '../users/users.module.js';
import { PasswordValidator } from './validators/index.js';
import { TokenBlacklistService, SecurityEventService, GoogleOAuthSecurityService } from './services/index.js';
import { WalletConnectService } from './services/wallet-connect.service.js';
import { OtpService } from './services/otp.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
    imports: [
        DatabaseModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
                },
            }),
        }),
        UsersModule,
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        WalletConnectService,
        OtpService,
        GoogleOAuthSecurityService,
        JwtStrategy,
        GoogleStrategy,
        WalletStrategy,
        JwtAuthGuard,
        CsrfGuard,
        PasswordValidator,
        TokenBlacklistService,
        SecurityEventService,
    ],
    exports: [
        AuthService,
        WalletConnectService,
        OtpService,
        GoogleOAuthSecurityService,
        JwtAuthGuard,
        CsrfGuard,
        PasswordValidator,
        TokenBlacklistService,
        SecurityEventService,
    ],
})
export class AuthModule { }

