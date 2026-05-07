/**
 * Device Fingerprint Interceptor
 * 
 * Enterprise-grade request fingerprinting for anti-bot detection,
 * anti-throttling enforcement, and wallet activity auditing.
 * 
 * Extracts: User-Agent, screen resolution, timezone, language, platform
 * Generates: SHA-256 fingerprint for device tracking
 * Stores: device_fingerprints table for anomaly detection
 */

import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { createHash } from 'crypto';
import { SupabaseService } from '../../database/supabase.service.js';

interface FingerprintData {
    userAgent: string;
    acceptLanguage: string;
    screenRes: string;
    timezone: string;
    platform: string;
}

@Injectable()
export class DeviceFingerprintInterceptor implements NestInterceptor {
    private readonly logger = new Logger(DeviceFingerprintInterceptor.name);

    constructor(private readonly supabase: SupabaseService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();

        // Extract fingerprint components from headers
        const fp = this.extractFingerprint(request);
        const hash = this.generateHash(fp);

        // Attach to request for downstream use
        request.deviceFingerprint = hash;
        request.deviceData = fp;

        return next.handle().pipe(
            tap(() => {
                // Fire-and-forget: record fingerprint asynchronously
                this.recordFingerprint(request, hash, fp).catch((err) =>
                    this.logger.debug(`Fingerprint record skipped: ${err.message}`),
                );
            }),
        );
    }

    private extractFingerprint(request: any): FingerprintData {
        const headers = request.headers || {};
        return {
            userAgent: (headers['user-agent'] || 'unknown').substring(0, 512),
            acceptLanguage: (headers['accept-language'] || 'unknown').substring(0, 64),
            screenRes: (headers['x-screen-resolution'] || headers['x-viewport'] || 'unknown').substring(0, 32),
            timezone: (headers['x-timezone'] || 'unknown').substring(0, 64),
            platform: (headers['x-platform'] || headers['sec-ch-ua-platform'] || 'unknown').substring(0, 64),
        };
    }

    private generateHash(fp: FingerprintData): string {
        const raw = [fp.userAgent, fp.acceptLanguage, fp.screenRes, fp.timezone, fp.platform].join('||');
        return createHash('sha256').update(raw).digest('hex');
    }

    private async recordFingerprint(request: any, hash: string, fp: FingerprintData): Promise<void> {
        // Only record for authenticated wallet requests
        const walletAddress = request.user?.walletAddress || request.headers['x-wallet-address'];
        if (!walletAddress) return;

        const client = this.supabase.getClient();

        // Upsert fingerprint record
        await client.from('device_fingerprints').upsert(
            {
                wallet_address: walletAddress,
                fingerprint: hash,
                user_agent: fp.userAgent,
                screen_res: fp.screenRes,
                timezone: fp.timezone,
                language: fp.acceptLanguage,
                platform: fp.platform,
                last_seen_at: new Date().toISOString(),
                request_count: 1, // Will be incremented via SQL
            },
            {
                onConflict: 'wallet_address,fingerprint',
            },
        ).match(() => { }).match(() => { });

        // Increment request count for existing records
        await client.rpc('increment_device_request_count', {
            p_wallet: walletAddress,
            p_fingerprint: hash,
        }).match(() => { }).match(() => { });
    }
}
