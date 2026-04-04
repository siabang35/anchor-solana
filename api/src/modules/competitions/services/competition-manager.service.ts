import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { tokenize } from '../../../common/utils/clustering.util.js';

/**
 * All valid horizon tiers for the competition system.
 * Max 1 Day — reduced from 7 tiers to 4 for LLM token efficiency.
 * Each competition gets exactly one unique horizon per category.
 */
export const HORIZON_TIERS = ['2h', '7h', '12h', '24h'] as const;
export type HorizonTier = typeof HORIZON_TIERS[number];

/** Duration in milliseconds per horizon */
export const HORIZON_DURATION_MS: Record<HorizonTier, number> = {
    '2h': 2 * 60 * 60 * 1000,
    '7h': 7 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
};

/**
 * Horizon-Aware Refresh Configuration
 *
 * Each horizon tier gets optimized refresh intervals to balance
 * realtime UX vs LLM token consumption:
 *   - 2h  → aggressive (15s) — short competition needs live feel
 *   - 7h  → moderate  (30s) — active but not wasteful
 *   - 12h → relaxed   (5min) — significant token savings
 *   - 24h → lazy      (10-15min) — maximum efficiency
 */
export interface HorizonRefreshConfig {
    /** How often agents should generate LLM predictions (ms) */
    agentPredictionIntervalMs: number;
    /** How often the curve engine ticks (ms) */
    curveEngineIntervalMs: number;
    /** How often cluster data is refreshed (ms) */
    clusterRefreshIntervalMs: number;
    /** Human-readable label */
    label: string;
}

export const HORIZON_REFRESH_CONFIG: Record<HorizonTier, HorizonRefreshConfig> = {
    '2h':  { agentPredictionIntervalMs: 15_000,    curveEngineIntervalMs: 15_000,    clusterRefreshIntervalMs: 60_000,     label: '2 Hours' },
    '7h':  { agentPredictionIntervalMs: 30_000,    curveEngineIntervalMs: 30_000,    clusterRefreshIntervalMs: 150_000,    label: '7 Hours' },
    '12h': { agentPredictionIntervalMs: 300_000,   curveEngineIntervalMs: 300_000,   clusterRefreshIntervalMs: 600_000,    label: '12 Hours' },
    '24h': { agentPredictionIntervalMs: 750_000,   curveEngineIntervalMs: 600_000,   clusterRefreshIntervalMs: 1_800_000,  label: '1 Day' },
};

/** Get refresh config for a horizon, with safe fallback to 24h */
export function getRefreshConfig(horizon: string): HorizonRefreshConfig {
    return HORIZON_REFRESH_CONFIG[horizon as HorizonTier] || HORIZON_REFRESH_CONFIG['24h'];
}

/** Jaccard similarity threshold — raised from 0.45 to 0.65 to prevent rejecting distinct category topics with shared boilerplate */
const SIMILARITY_THRESHOLD = 0.65;

@Injectable()
export class CompetitionManagerService {
    private readonly logger = new Logger(CompetitionManagerService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Returns available (unfilled) horizon slots globally.
     * Since we now create 5 global competitions (not per-category), 
     * we check which horizons are not yet occupied by ANY active/upcoming competition.
     */
    async getAvailableHorizonSlots(category?: string): Promise<HorizonTier[]> {
        const supabase = this.supabaseService.getAdminClient();

        let query = supabase
            .from('competitions')
            .select('time_horizon')
            .in('status', ['active', 'upcoming']);

        if (category) {
            query = query.eq('sector', category.toLowerCase());
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Error checking horizon slots: ${error.message}`);
            return [];
        }

        const usedHorizons = new Set<string>((data || []).map(c => c.time_horizon).filter(Boolean));
        return HORIZON_TIERS.filter(h => !usedHorizons.has(h));
    }

    /**
     * Returns the total number of available slots.
     */
    async getAvailableSlots(category?: string): Promise<number> {
        const slots = await this.getAvailableHorizonSlots(category);
        return slots.length;
    }

    /**
     * Get ALL active fingerprints across ALL categories (cross-category dedup).
     * Returns a Set of normalized lowercase title strings.
     */
    async getAllActiveFingerprints(): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('title')
            .in('status', ['active', 'upcoming']);

        if (error) {
            this.logger.error(`Error fetching global fingerprints: ${error.message}`);
            return new Set();
        }

        const fingerprints = new Set<string>();
        for (const row of data || []) {
            if (row.title) {
                fingerprints.add(this.normalizeTitle(row.title));
            }
        }
        return fingerprints;
    }

    /**
     * Get active fingerprints for a specific category.
     */
    async getActiveFingerprints(category: string): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('title')
            .eq('sector', category.toLowerCase())
            .in('status', ['active', 'upcoming']);

        if (error) {
            this.logger.error(`Error fetching fingerprints for ${category}: ${error.message}`);
            return new Set();
        }

        const fingerprints = new Set<string>();
        for (const row of data || []) {
            if (row.title) {
                fingerprints.add(this.normalizeTitle(row.title));
            }
        }
        return fingerprints;
    }

    /**
     * Check if a candidate title is too similar to any existing active competition.
     * Uses token-based Jaccard similarity (threshold: 0.45).
     * Also checks cross-category to prevent same topic appearing in multiple sectors.
     */
    isTooSimilar(candidateTitle: string, existingFingerprints: Set<string>): boolean {
        const normalizedCandidate = this.normalizeTitle(candidateTitle);

        // Exact match
        if (existingFingerprints.has(normalizedCandidate)) return true;

        // Token-level Jaccard similarity check
        const candidateTokens = new Set(tokenize(normalizedCandidate));
        if (candidateTokens.size === 0) return false;

        for (const existing of existingFingerprints) {
            const existingTokens = new Set(tokenize(existing));
            if (existingTokens.size === 0) continue;

            // Jaccard similarity
            let intersection = 0;
            for (const token of candidateTokens) {
                if (existingTokens.has(token)) intersection++;
            }
            const union = candidateTokens.size + existingTokens.size - intersection;
            const similarity = union > 0 ? intersection / union : 0;

            if (similarity > SIMILARITY_THRESHOLD) {
                this.logger.debug(`Dedup: "${candidateTitle.substring(0, 40)}..." ~= "${existing.substring(0, 40)}..." (Jaccard=${similarity.toFixed(3)})`);
                return true;
            }
        }

        return false;
    }

    /**
     * Creates a new competition with enforced horizon uniqueness.
     * The DB UNIQUE index will reject duplicates even if app-level dedup misses.
     */
    async createCompetition(
        category: string,
        title: string,
        description: string,
        horizon: HorizonTier | string,
        baseProbability: number = 0.5,
    ): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        const validHorizon = HORIZON_TIERS.includes(horizon as HorizonTier) ? horizon as HorizonTier : '24h';
        const duration = HORIZON_DURATION_MS[validHorizon] || HORIZON_DURATION_MS['24h'];
        const start = Date.now();
        const end = start + duration;

        const { data, error } = await supabase.from('competitions').insert({
            title,
            description,
            sector: category.toLowerCase(),
            status: 'active',
            competition_start: new Date(start).toISOString(),
            competition_end: new Date(end).toISOString(),
            time_horizon: validHorizon,
            base_probability: baseProbability,
            probabilities: [Math.round(baseProbability * 10000), 10000 - Math.round(baseProbability * 10000)],
            metadata: {
                autoGenerated: true,
                source: 'etl-cluster-pipeline',
                horizon: validHorizon,
                createdAt: new Date().toISOString(),
            },
        }).select('*').single();

        if (error) {
            // Unique constraint violation = expected (slot already filled)
            if (error.message?.includes('unique') || error.message?.includes('duplicate') || error.code === '23505') {
                this.logger.warn(`Competition creation blocked by unique constraint [${category}/${validHorizon}] — skipping.`);
                return null;
            }
            this.logger.error(`Failed to create competition: ${error.message}`);
            return null;
        }

        this.logger.log(`✅ Created: "${title}" [${validHorizon}] in ${category}`);
        return data;
    }

    /**
     * Cleanup existing duplicate competitions on startup.
     * Keeps oldest competition per normalized title among active/upcoming.
     * Also removes duplicates per (sector, time_horizon).
     */
    async cleanupExistingDuplicates(): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        try {
            const { data: active, error } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, created_at')
                .in('status', ['active', 'upcoming'])
                .order('created_at', { ascending: true });

            if (error || !active) return;

            const seenTitles = new Set<string>();
            const seenHorizons = new Set<string>();
            const duplicateIds: string[] = [];

            for (const comp of active) {
                const normalizedTitle = this.normalizeTitle(comp.title || '');
                const horizonKey = `${comp.sector}::${comp.time_horizon}`;

                // Check for title duplicate
                let isDuplicate = false;
                if (seenTitles.has(normalizedTitle)) {
                    isDuplicate = true;
                } else {
                    // Check Jaccard similarity against all existing titles
                    const candidateTokens = new Set(tokenize(normalizedTitle));
                    for (const existing of seenTitles) {
                        const existingTokens = new Set(tokenize(existing));
                        let intersection = 0;
                        for (const t of candidateTokens) {
                            if (existingTokens.has(t)) intersection++;
                        }
                        const union = candidateTokens.size + existingTokens.size - intersection;
                        const sim = union > 0 ? intersection / union : 0;
                        if (sim > SIMILARITY_THRESHOLD) {
                            isDuplicate = true;
                            break;
                        }
                    }
                }

                // Check for horizon duplicate
                if (comp.time_horizon && seenHorizons.has(horizonKey)) {
                    isDuplicate = true;
                }

                if (isDuplicate) {
                    duplicateIds.push(comp.id);
                } else {
                    seenTitles.add(normalizedTitle);
                    if (comp.time_horizon) seenHorizons.add(horizonKey);
                }
            }

            if (duplicateIds.length > 0) {
                await supabase
                    .from('competitions')
                    .update({ status: 'cancelled' })
                    .in('id', duplicateIds);

                this.logger.log(`🧹 Cancelled ${duplicateIds.length} duplicate competitions on startup`);
            } else {
                this.logger.log('✅ No duplicate competitions found');
            }
        } catch (err: any) {
            this.logger.error(`Duplicate cleanup error: ${err.message}`);
        }
    }

    /**
     * Normalize a title for fingerprint comparison.
     * Strips prices, common suffixes, and special characters.
     */
    private normalizeTitle(title: string): string {
        return title
            .replace(/\s+/g, ' ')
            .replace(/[—–\-]+/g, ' ')
            .replace(/outcome prediction\??/gi, '')
            .replace(/\$[\d,.]+/g, '')      // Remove price values like $32.93
            .replace(/[\d,.]+%/g, '')        // Remove percentages
            .replace(/\d{1,2}h\s*change/gi, '') // Remove "24h Change" patterns
            .replace(/[^\w\s]/g, '')
            .trim()
            .toLowerCase();
    }
}
