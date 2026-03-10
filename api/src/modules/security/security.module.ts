import { Module, Global } from '@nestjs/common';
import { SecurityService } from './security.service.js';
import { SecurityEventService } from './security-event.service.js';
import { RateLimitGuard, IpBlacklistGuard, DeviceFingerprintGuard } from './guards/index.js';
import { DatabaseModule } from '../../database/database.module.js';

/**
 * SecurityModule
 * 
 * Provides security services and guards globally.
 * Includes:
 * - Rate limiting
 * - IP blacklisting
 * - Suspicious activity detection
 * - Device fingerprint tracking
 * - Withdrawal limits
 * - Security event logging
 */
@Global()
@Module({
    imports: [DatabaseModule],
    providers: [
        SecurityService,
        SecurityEventService,
        RateLimitGuard,
        IpBlacklistGuard,
        DeviceFingerprintGuard,
    ],
    exports: [
        SecurityService,
        SecurityEventService,
        RateLimitGuard,
        IpBlacklistGuard,
        DeviceFingerprintGuard,
    ],
})
export class SecurityModule { }

