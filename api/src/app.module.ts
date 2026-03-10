import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { MarketsModule } from './modules/markets/markets.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { DepositModule } from './modules/deposits/deposit.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { SecurityModule } from './modules/security/security.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { ReferralsModule } from './modules/referrals/referrals.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { SportsModule } from './modules/sports/sports.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { CompetitionsModule } from './modules/competitions/competitions.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { RootController } from './root.controller.js';
import { envSchema } from './config/env.validation.js';
import {
    LoggerMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
    InputSanitizerMiddleware,
} from './common/middleware/index.js';
import { AuditLogInterceptor } from './common/interceptors/index.js';

@Module({
    imports: [
        // Configuration with validation
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env.local', '.env'],
            validate: (config) => envSchema.parse(config),
            cache: true,
        }),

        // Database
        DatabaseModule,

        // Security (Global)
        SecurityModule,

        // Core Feature Modules
        AuthModule,
        UsersModule,
        DashboardModule,
        MarketsModule,
        OrdersModule,
        DepositModule,

        // New Modules
        AdminModule,
        NotificationsModule,
        SettingsModule,
        ReferralsModule,
        TransactionsModule,
        SportsModule,
        EmailModule,
        AgentsModule,
        CompetitionsModule,

        // Scheduling
        ScheduleModule.forRoot(),
    ],
    controllers: [RootController, HealthController],
    providers: [
        AuditLogInterceptor,
    ],
    exports: [
        AuditLogInterceptor,
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        // Apply security middlewares to all routes
        consumer
            .apply(
                RequestIdMiddleware,      // Generate request ID first
                SecurityHeadersMiddleware, // Add security headers
                LoggerMiddleware,          // Log requests with ID
            )
            .forRoutes('*');

        // Apply input sanitizer to routes that accept body
        consumer
            .apply(InputSanitizerMiddleware)
            .forRoutes(
                { path: '*', method: RequestMethod.POST },
                { path: '*', method: RequestMethod.PUT },
                { path: '*', method: RequestMethod.PATCH },
            );
    }
}

