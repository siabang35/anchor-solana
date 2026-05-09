import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * ClaimRateLimitGuard — Enterprise-grade anti-abuse protection for claim endpoints.
 *
 * Security layers:
 * 1. Per-wallet rate limiting (max 3 claims per 5-minute window)
 * 2. Per-IP rate limiting (max 5 claims per 5-minute window)
 * 3. Global cooldown between claims per wallet (30 seconds)
 * 4. Suspicious pattern detection (rapid successive attempts)
 *
 * This prevents:
 * - Brute-force claim attempts on other users' prizes
 * - DDoS on the treasury wallet (expensive on-chain TXs)
 * - Race condition exploitation via rapid parallel requests
 */
@Injectable()
export class ClaimRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(ClaimRateLimitGuard.name);

    // In-memory stores (per-instance, resets on restart — acceptable for rate limiting)
    private readonly walletAttempts = new Map<string, { count: number; firstAttempt: number; lastAttempt: number }>();
    private readonly ipAttempts = new Map<string, { count: number; firstAttempt: number }>();
    private readonly blockedWallets = new Map<string, number>(); // wallet → blocked until timestamp

    // Configuration
    private readonly WALLET_MAX_ATTEMPTS = 3;       // Max 3 claims per window
    private readonly WALLET_WINDOW_MS = 5 * 60_000; // 5 minute window
    private readonly WALLET_COOLDOWN_MS = 30_000;    // 30 seconds between claims
    private readonly IP_MAX_ATTEMPTS = 5;            // Max 5 claims per IP per window
    private readonly IP_WINDOW_MS = 5 * 60_000;     // 5 minute window
    private readonly BLOCK_DURATION_MS = 15 * 60_000; // 15 minute block for suspicious activity
    private readonly SUSPICIOUS_THRESHOLD = 5;       // 5+ rapid attempts = suspicious

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const wallet = request.user?.id || request.headers['x-user-id'] || '';
        const ip = this.extractIp(request);
        const now = Date.now();

        // Layer 1: Check if wallet is temporarily blocked (suspicious activity)
        if (this.blockedWallets.has(wallet)) {
            const blockedUntil = this.blockedWallets.get(wallet)!;
            if (now < blockedUntil) {
                const remainingSec = Math.ceil((blockedUntil - now) / 1000);
                this.logger.warn(`🚫 BLOCKED wallet ${wallet.slice(0, 8)}... attempted claim (${remainingSec}s remaining)`);
                throw new HttpException(
                    { message: `Account temporarily suspended due to suspicious activity. Try again in ${remainingSec} seconds.`, code: 'CLAIM_BLOCKED' },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
            this.blockedWallets.delete(wallet);
        }

        // Layer 2: Per-wallet cooldown (minimum 30s between claims)
        const walletData = this.walletAttempts.get(wallet);
        if (walletData) {
            const timeSinceLastClaim = now - walletData.lastAttempt;
            if (timeSinceLastClaim < this.WALLET_COOLDOWN_MS) {
                const waitSec = Math.ceil((this.WALLET_COOLDOWN_MS - timeSinceLastClaim) / 1000);
                this.logger.warn(`⏱️ Cooldown active for wallet ${wallet.slice(0, 8)}... (${waitSec}s remaining)`);
                throw new HttpException(
                    { message: `Please wait ${waitSec} seconds before claiming again.`, code: 'CLAIM_COOLDOWN' },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
        }

        // Layer 3: Per-wallet rate limit (max 3 per 5-min window)
        if (walletData) {
            const windowExpired = (now - walletData.firstAttempt) > this.WALLET_WINDOW_MS;
            if (windowExpired) {
                // Reset window
                this.walletAttempts.set(wallet, { count: 1, firstAttempt: now, lastAttempt: now });
            } else {
                const newCount = walletData.count + 1;

                // Check for suspicious rapid attempts
                if (newCount >= this.SUSPICIOUS_THRESHOLD) {
                    this.blockedWallets.set(wallet, now + this.BLOCK_DURATION_MS);
                    this.walletAttempts.delete(wallet);
                    this.logger.error(`🚨 SUSPICIOUS: Wallet ${wallet.slice(0, 8)}... blocked for 15 min (${newCount} rapid attempts)`);
                    throw new HttpException(
                        { message: 'Account temporarily suspended due to suspicious activity.', code: 'CLAIM_BLOCKED' },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }

                if (newCount > this.WALLET_MAX_ATTEMPTS) {
                    const resetIn = Math.ceil((this.WALLET_WINDOW_MS - (now - walletData.firstAttempt)) / 1000);
                    this.logger.warn(`🛡️ Rate limit exceeded for wallet ${wallet.slice(0, 8)}... (${newCount}/${this.WALLET_MAX_ATTEMPTS})`);
                    throw new HttpException(
                        { message: `Claim rate limit exceeded. Try again in ${resetIn} seconds.`, code: 'CLAIM_RATE_LIMITED' },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }

                this.walletAttempts.set(wallet, { count: newCount, firstAttempt: walletData.firstAttempt, lastAttempt: now });
            }
        } else {
            this.walletAttempts.set(wallet, { count: 1, firstAttempt: now, lastAttempt: now });
        }

        // Layer 4: Per-IP rate limit (max 5 per 5-min window)
        const ipData = this.ipAttempts.get(ip);
        if (ipData) {
            const windowExpired = (now - ipData.firstAttempt) > this.IP_WINDOW_MS;
            if (windowExpired) {
                this.ipAttempts.set(ip, { count: 1, firstAttempt: now });
            } else {
                const newCount = ipData.count + 1;
                if (newCount > this.IP_MAX_ATTEMPTS) {
                    this.logger.warn(`🛡️ IP rate limit exceeded: ${ip} (${newCount}/${this.IP_MAX_ATTEMPTS})`);
                    throw new HttpException(
                        { message: 'Too many claim attempts from this network. Try again later.', code: 'IP_RATE_LIMITED' },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }
                this.ipAttempts.set(ip, { count: newCount, firstAttempt: ipData.firstAttempt });
            }
        } else {
            this.ipAttempts.set(ip, { count: 1, firstAttempt: now });
        }

        // Periodic cleanup of expired entries (every 100 requests)
        if (Math.random() < 0.01) this.cleanup(now);

        return true;
    }

    private extractIp(request: any): string {
        const forwarded = request.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
            return ips.trim();
        }
        return request.ip || request.socket?.remoteAddress || 'unknown';
    }

    private cleanup(now: number): void {
        for (const [key, data] of this.walletAttempts) {
            if ((now - data.firstAttempt) > this.WALLET_WINDOW_MS * 2) this.walletAttempts.delete(key);
        }
        for (const [key, data] of this.ipAttempts) {
            if ((now - data.firstAttempt) > this.IP_WINDOW_MS * 2) this.ipAttempts.delete(key);
        }
        for (const [key, until] of this.blockedWallets) {
            if (now > until) this.blockedWallets.delete(key);
        }
    }
}
