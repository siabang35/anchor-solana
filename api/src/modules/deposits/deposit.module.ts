import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DepositController } from './deposit.controller.js';
import { DepositService } from './deposit.service.js';
import { PrivyService } from './services/privy.service.js';
import { DepositAuditService } from './services/deposit-audit.service.js';
import { PrivyAuthGuard } from './guards/privy-auth.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { SecurityModule } from '../security/security.module.js';

/**
 * DepositModule
 * 
 * Handles user deposits and balance management with Privy wallet integration.
 * Implements enterprise-grade security for financial transactions.
 * 
 * OWASP Compliant:
 * - A01: Access control via JWT + Privy dual auth
 * - A03: Input validation via DTOs
 * - A04: Rate limiting on all endpoints
 * - A09: Comprehensive audit logging
 */
@Module({
    imports: [
        ConfigModule,
        DatabaseModule,
        SecurityModule,
    ],
    controllers: [DepositController],
    providers: [
        DepositService,
        PrivyService,
        DepositAuditService,
        PrivyAuthGuard,
    ],
    exports: [DepositService, DepositAuditService],
})
export class DepositModule { }

