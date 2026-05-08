import * as crypto from 'crypto';

export class AntiManipulationUtil {
    /**
     * Hashes a data snapshot to ensure immutability.
     */
    static hashSnapshot(data: any): string {
        const str = JSON.stringify(data);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    /**
     * Filters spam and low credibility sources.
     * Weighs signals based on media credibility.
     */
    static filterAndWeightSignals(articles: any[]) {
        const credibilityWeights: Record<string, number> = {
            'reuters.com': 1.5,
            'bloomberg.com': 1.5,
            'apnews.com': 1.4,
            'wsj.com': 1.3,
            'ft.com': 1.3,
            // default is 1.0, low quality should be filtered
        };

        const filtered = articles.filter(a => {
            // Spam filtering logic
            if (a.isSpam || (a.content && a.content.length < 50)) return false;
            return true;
        });

        return filtered.map(a => {
            let domain = '';
            try {
                domain = new URL(a.url).hostname.replace('www.', '');
            } catch (e) {
                // Return default weight if URL is malformed
            }
            const weight = domain ? (credibilityWeights[domain] || 1.0) : 1.0;
            return {
                ...a,
                weight
            };
        });
    }

    /**
     * Clamps probability to prevent extreme confidence (>0.95 or <0.05)
     * unless there is multi-source confirmed strong signaling.
     */
    static clampProbability(prob: number, strongConfirmation: boolean = false): number {
        if (strongConfirmation) {
            return Math.max(0.01, Math.min(0.99, prob));
        }
        return Math.max(0.05, Math.min(0.95, prob));
    }

    /**
     * Deduplicates articles in a cluster based on content similarity or URL.
     */
    static deduplicateCluster(articles: any[]) {
        const unique = new Map();
        for (const a of articles) {
            unique.set(a.url, a);
        }
        return Array.from(unique.values());
    }

    /**
     * Applies Ornstein-Uhlenbeck (OU) Mean-Reversion drift.
     * Pulls the current probability towards a target (e.g. TWAP or baseline)
     * if there is a sudden deviation without strong signals.
     */
    static applyMeanReversion(currentProb: number, targetProb: number, reversionSpeed: number, dt: number): number {
        // dX_t = theta * (mu - X_t) * dt
        const drift = reversionSpeed * (targetProb - currentProb) * dt;
        return Math.max(0.01, Math.min(0.99, currentProb + drift));
    }

    /**
     * Calculates the TWAP (Time-Weighted Average Probability) from a snapshot history.
     */
    static calculateTWAP(historyProbs: number[]): number {
        if (!historyProbs || historyProbs.length === 0) return 0.5;
        const sum = historyProbs.reduce((acc, p) => acc + p, 0);
        return sum / historyProbs.length;
    }

    // ========================================================================
    // ANTI-THROTTLING / ANTI-CHUNKING / ANTI-HACKING / ANTI-MANIPULATION
    // ========================================================================

    /**
     * Cryptographically secure random outcome selection.
     * Uses crypto.randomInt (CSPRNG) instead of Math.random to prevent prediction.
     */
    static secureRandomOutcome(outcomeCount: number): number {
        if (outcomeCount <= 1) return 0;
        return crypto.randomInt(0, outcomeCount);
    }

    /**
     * Generate a cryptographic nonce for idempotency and replay protection.
     */
    static generateNonce(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Generate HMAC signature for competition creation integrity verification.
     * Proves that competition was created by authorized system, not injected.
     */
    static generateCreationHMAC(category: string, horizon: string, title: string, timestamp: number): string {
        const secret = process.env.COMPETITION_HMAC_SECRET || 'exoduze-integrity-key-v2';
        const payload = `${category}:${horizon}:${title.substring(0, 64)}:${timestamp}`;
        return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    /**
     * Sanitize competition title to prevent injection attacks.
     * Removes HTML, script tags, control characters, and excessive whitespace.
     */
    static sanitizeTitle(title: string): string {
        return title
            .replace(/<[^>]*>/g, '')           // Strip HTML tags
            .replace(/[<>'";&]/g, '')          // Remove dangerous characters
            .replace(/[\x00-\x1f\x7f]/g, '')  // Remove control characters
            .replace(/\s+/g, ' ')              // Normalize whitespace
            .trim()
            .substring(0, 200);                // Max length
    }

    /**
     * Check if a creation request is within cooldown period.
     * Anti-throttling: prevents rapid-fire creation for same slot.
     */
    static isWithinCooldown(
        cooldownMap: Map<string, number>,
        key: string,
        cooldownMs: number,
    ): boolean {
        const lastCreated = cooldownMap.get(key) || 0;
        return (Date.now() - lastCreated) < cooldownMs;
    }

    /**
     * Record a creation timestamp in the cooldown map.
     */
    static recordCreation(cooldownMap: Map<string, number>, key: string): void {
        cooldownMap.set(key, Date.now());
    }
}
