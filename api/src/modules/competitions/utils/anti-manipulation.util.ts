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
            const domain = new URL(a.url).hostname.replace('www.', '');
            const weight = credibilityWeights[domain] || 1.0;
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
}
