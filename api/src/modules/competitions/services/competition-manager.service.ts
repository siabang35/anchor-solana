import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { tokenize } from '../../../common/utils/clustering.util.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';

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

    /** Debounce: last time autoSettleExpired was executed */
    private lastAutoSettleTs = 0;
    private static readonly AUTO_SETTLE_DEBOUNCE_MS = 30_000; // 30s debounce

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * AUTO-SETTLE: Call DB function to settle all expired competitions.
     * This ensures expired competitions are cleared from the active cap count
     * BEFORE we attempt to create new ones, preventing false cap violations.
     * Returns the number of competitions that were auto-settled.
     */
    async autoSettleExpired(force = false): Promise<number> {
        // Debounce: skip if called within the last 30s (unless forced)
        const now = Date.now();
        if (!force && (now - this.lastAutoSettleTs) < CompetitionManagerService.AUTO_SETTLE_DEBOUNCE_MS) {
            return 0;
        }
        this.lastAutoSettleTs = now;

        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data, error } = await supabase.rpc('auto_settle_expired_competitions');

            if (error) {
                this.logger.warn(`Auto-settle RPC error: ${error.message}`);
                // Fallback: do it app-side
                return this.autoSettleExpiredAppSide();
            }

            const settledCount = typeof data === 'number' ? data : 0;
            if (settledCount > 0) {
                this.logger.log(`⚡ Auto-settled ${settledCount} expired competition(s) via DB RPC`);
            }
            return settledCount;
        } catch (err: any) {
            this.logger.warn(`Auto-settle exception: ${err.message}`);
            return this.autoSettleExpiredAppSide();
        }
    }

    /**
     * App-side fallback for auto-settling expired competitions
     * when the DB RPC function is not available.
     */
    private async autoSettleExpiredAppSide(): Promise<number> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const now = new Date().toISOString();

            const { data: expired } = await supabase
                .from('competitions')
                .select('id')
                .eq('status', 'active')
                .lt('competition_end', now);

            if (!expired || expired.length === 0) return 0;

            const ids = expired.map(c => c.id);
            await supabase
                .from('competitions')
                .update({
                    status: 'settled',
                    metadata: {
                        settledAt: now,
                        settledBy: 'auto_expire_appside',
                        autoSettled: true,
                    },
                })
                .in('id', ids);

            this.logger.log(`⚡ Auto-settled ${ids.length} expired competition(s) via app-side fallback`);
            return ids.length;
        } catch (err: any) {
            this.logger.error(`App-side auto-settle error: ${err.message}`);
            return 0;
        }
    }

    /**
     * Returns available (unfilled) horizon slots globally.
     * Since we now create 5 global competitions (not per-category), 
     * we check which horizons are not yet occupied by ANY active/upcoming competition.
     */
    async getAvailableHorizonSlots(category?: string): Promise<HorizonTier[]> {
        const supabase = this.supabaseService.getAdminClient();
        const now = new Date().toISOString();

        let query = supabase
            .from('competitions')
            .select('time_horizon')
            .in('status', ['active', 'upcoming'])
            .gt('competition_end', now); // Only count non-expired as occupied

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
     * Returns which specific horizon tiers are missing for a given category.
     * Used by the seeder to fill exactly the right slots after settlement.
     * ENHANCED: Also treats time-expired (but not yet settled) competitions as missing,
     * so the system immediately knows a slot needs replacement.
     */
    async getMissingHorizonSlots(category: string): Promise<HorizonTier[]> {
        const supabase = this.supabaseService.getAdminClient();
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('competitions')
            .select('time_horizon')
            .eq('sector', category.toLowerCase())
            .in('status', ['active', 'upcoming'])
            .gt('competition_end', now); // Only count non-expired as "filled"

        if (error) {
            this.logger.error(`Error checking missing slots for ${category}: ${error.message}`);
            return [...HORIZON_TIERS]; // Assume all missing on error
        }

        const usedHorizons = new Set<string>(
            (data || []).map(c => c.time_horizon).filter(Boolean),
        );
        const missing = HORIZON_TIERS.filter(h => !usedHorizons.has(h));

        if (missing.length > 0) {
            this.logger.debug(`[${category}] Missing horizon slots: [${missing.join(', ')}]`);
        }
        return missing;
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
     * ANTI-RECYCLING: Get ALL historical fingerprints for a category.
     * Includes settled, cancelled, and active competitions.
     * This ensures that once a topic has been used in ANY competition,
     * it is NEVER reused — guaranteeing fresh data every time.
     */
    async getAllHistoricalFingerprints(category: string): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('title')
            .eq('sector', category.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(500); // Last 500 competitions per category — no status filter

        if (error) {
            this.logger.error(`Error fetching historical fingerprints for ${category}: ${error.message}`);
            return new Set();
        }

        const fingerprints = new Set<string>();
        for (const row of data || []) {
            if (row.title) {
                fingerprints.add(this.normalizeTitle(row.title));
            }
        }
        this.logger.debug(`[${category}] Historical fingerprints: ${fingerprints.size} unique titles`);
        return fingerprints;
    }

    /**
     * ANTI-RECYCLING: Get ALL used source titles across ALL categories.
     * Used to exclude ETL data items that have already been consumed.
     * Stores multiple normalized variants per title for bulletproof matching.
     */
    async getAllUsedSourceTitles(category: string): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('title, description')
            .eq('sector', category.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            this.logger.error(`Error fetching used source titles for ${category}: ${error.message}`);
            return new Set();
        }

        const titles = new Set<string>();
        for (const row of data || []) {
            if (row.title) {
                const raw = row.title.toLowerCase().trim();
                // Variant 1: Raw lowercase
                titles.add(raw);
                // Variant 2: Standard normalized
                titles.add(this.normalizeTitle(row.title));
                // Variant 3: Hash-stripped (remove [abc123] suffixes)
                const hashStripped = raw
                    .replace(/\[[a-f0-9]{4,10}\]/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                titles.add(hashStripped);
                // Variant 4: Base title (strip "— outcome prediction?" and hash)
                const baseTitle = raw
                    .replace(/\s*[—–\-]+\s*outcome prediction\??/gi, '')
                    .replace(/\[[a-f0-9]{4,10}\]/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (baseTitle.length > 5) titles.add(baseTitle);
            }
            // Also store description snippets for cross-reference
            if (row.description) {
                const descNorm = row.description.toLowerCase().trim();
                if (descNorm.length > 20 && descNorm.length < 300) {
                    titles.add(descNorm);
                }
            }
        }
        this.logger.debug(`[${category}] Loaded ${titles.size} used source title variants for anti-recycling`);
        return titles;
    }

    /**
     * Check if a candidate title is too similar to any existing active competition.
     * Uses token-based Jaccard similarity (threshold: 0.45).
     * Also checks cross-category to prevent same topic appearing in multiple sectors.
     */
    isTooSimilar(candidateTitle: string, existingFingerprints: Set<string>): boolean {
        const normalizedCandidate = this.normalizeTitle(candidateTitle);

        // Layer 1: Exact match
        if (existingFingerprints.has(normalizedCandidate)) return true;

        // Layer 2: Substring/contains match (catches hash suffix variations)
        if (normalizedCandidate.length >= 15) {
            for (const existing of existingFingerprints) {
                if (existing.length < 15) continue;
                // Only do substring match if the lengths are relatively similar to avoid generic matches
                if (existing.length >= normalizedCandidate.length * 0.5 && existing.length <= normalizedCandidate.length * 2.0) {
                    if (normalizedCandidate.includes(existing) || existing.includes(normalizedCandidate)) {
                        this.logger.debug(`Dedup (substring): "${candidateTitle.substring(0, 40)}..." ⊂ "${existing.substring(0, 40)}..."`);
                        return true;
                    }
                }
            }
        }

        // Layer 3: Token-level Jaccard similarity check
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

            if (similarity > 0.75) {
                this.logger.debug(`Dedup (Jaccard): "${candidateTitle.substring(0, 40)}..." ~= "${existing.substring(0, 40)}..." (sim=${similarity.toFixed(3)})`);
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
        imageUrl?: string | null,
        tags?: string[],
    ): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        const validHorizon = HORIZON_TIERS.includes(horizon as HorizonTier) ? horizon as HorizonTier : '24h';
        const duration = HORIZON_DURATION_MS[validHorizon] || HORIZON_DURATION_MS['24h'];
        const start = Date.now();
        const end = start + duration;

        // NOTE: autoSettleExpired() is called once per seed cycle by the seeder,
        // NOT per-insert — avoids N redundant DB calls per category.

        // Anti-hacking: sanitize title input
        const safeTitle = AntiManipulationUtil.sanitizeTitle(title);
        const safeDescription = AntiManipulationUtil.sanitizeTitle(description);

        // Anti-manipulation: generate integrity HMAC + nonce
        const nonce = AntiManipulationUtil.generateNonce();
        const integrityHmac = AntiManipulationUtil.generateCreationHMAC(
            category, validHorizon, safeTitle, start,
        );

        const { data, error } = await supabase.from('competitions').insert({
            title: safeTitle,
            description: safeDescription,
            sector: category.toLowerCase(),
            status: 'active',
            competition_start: new Date(start).toISOString(),
            competition_end: new Date(end).toISOString(),
            time_horizon: validHorizon,
            base_probability: baseProbability,
            probabilities: [Math.round(baseProbability * 10000), 10000 - Math.round(baseProbability * 10000)],
            image_url: imageUrl || null,
            tags: tags && tags.length > 0 ? tags : [],
            metadata: {
                autoGenerated: true,
                source: 'etl-cluster-pipeline',
                horizon: validHorizon,
                createdAt: new Date().toISOString(),
                nonce,
                integrityHmac,
            },
        }).select('*').single();

        if (error) {
            // Unique constraint violation = expected (slot already filled)
            if (error.message?.includes('unique') || error.message?.includes('duplicate') || error.code === '23505') {
                this.logger.warn(`Competition creation blocked by unique constraint [${category}/${validHorizon}] — skipping.`);
                return null;
            }
            // Cap error from DB trigger — force auto-settle and retry ONCE
            if (error.message?.includes('already at cap')) {
                this.logger.warn(`Cap hit for [${category}/${validHorizon}] — forcing auto-settle and retrying...`);
                await this.autoSettleExpired(true);
                // Retry the insert once after settling
                const { data: retryData, error: retryErr } = await supabase.from('competitions').insert({
                    title: safeTitle,
                    description: safeDescription,
                    sector: category.toLowerCase(),
                    status: 'active',
                    competition_start: new Date(start).toISOString(),
                    competition_end: new Date(end).toISOString(),
                    time_horizon: validHorizon,
                    base_probability: baseProbability,
                    probabilities: [Math.round(baseProbability * 10000), 10000 - Math.round(baseProbability * 10000)],
                    image_url: imageUrl || null,
                    metadata: {
                        autoGenerated: true,
                        source: 'etl-cluster-pipeline',
                        horizon: validHorizon,
                        createdAt: new Date().toISOString(),
                        nonce,
                        integrityHmac,
                        retryAfterSettle: true,
                    },
                }).select('*').single();

                if (retryErr) {
                    this.logger.error(`Retry also failed for [${category}/${validHorizon}]: ${retryErr.message}`);
                    return null;
                }
                this.logger.log(`✅ Retry succeeded: "${safeTitle}" [${validHorizon}] in ${category}`);
                return retryData;
            }
            this.logger.error(`Failed to create competition: ${error.message}`);
            return null;
        }

        this.logger.log(`✅ Created: "${safeTitle}" [${validHorizon}] in ${category}`);
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

    // ========================================================================
    // SOURCE-LEVEL ANTI-RECYCLING: Track consumed ETL data by source ID
    // ========================================================================

    /**
     * Get all consumed source IDs for a category and source table.
     * Returns a Set of source IDs that have already been used in past competitions.
     * This is the BULLETPROOF layer of anti-recycling: even if title normalization
     * misses a match, the source ID will catch it.
     */
    async getUsedSourceIds(category: string, sourceTable: string): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();
        try {
            const { data, error } = await supabase.rpc('get_used_source_ids', {
                p_category: category.toLowerCase(),
                p_source_table: sourceTable,
            });

            if (error) {
                // Fallback: direct query if RPC not available yet
                const { data: directData } = await supabase
                    .from('used_competition_sources')
                    .select('source_id')
                    .eq('category', category.toLowerCase())
                    .eq('source_table', sourceTable)
                    .order('consumed_at', { ascending: false })
                    .limit(1000);

                return new Set((directData || []).map(r => r.source_id));
            }

            return new Set((data || []).map((r: any) => typeof r === 'string' ? r : r.source_id));
        } catch (err: any) {
            this.logger.warn(`getUsedSourceIds error (${category}/${sourceTable}): ${err.message}`);
            return new Set();
        }
    }

    /**
     * Record which ETL source items were consumed to create a competition.
     * Called after successful competition creation to ensure data is never reused.
     * 
     * @param competitionId - The newly created competition ID
     * @param category - The competition category/sector
     * @param sources - Array of {source_table, source_id, source_title}
     */
    async recordUsedSources(
        competitionId: string,
        category: string,
        sources: Array<{ source_table: string; source_id: string; source_title?: string }>,
    ): Promise<void> {
        if (sources.length === 0) return;

        const supabase = this.supabaseService.getAdminClient();
        try {
            const { error } = await supabase.rpc('record_used_sources', {
                p_competition_id: competitionId,
                p_category: category.toLowerCase(),
                p_sources: sources,
            });

            if (error) {
                // Fallback: direct insert if RPC not available yet
                const rows = sources.map(s => ({
                    competition_id: competitionId,
                    source_table: s.source_table,
                    source_id: s.source_id,
                    source_title: s.source_title || null,
                    category: category.toLowerCase(),
                }));

                await supabase
                    .from('used_competition_sources')
                    .upsert(rows, { onConflict: 'source_table,source_id,competition_id' });
            }

            this.logger.debug(`[${category}] Recorded ${sources.length} consumed source(s) for competition ${competitionId}`);
        } catch (err: any) {
            // Non-fatal — title-based dedup still works as fallback
            this.logger.warn(`recordUsedSources error: ${err.message}`);
        }
    }

    /**
     * Periodic cleanup: prune used_competition_sources older than 30 days.
     * Prevents unbounded table growth while maintaining enough history
     * to prevent any realistic recycling scenario.
     */
    async cleanupOldSourceTracking(): Promise<number> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data, error } = await supabase.rpc('cleanup_old_used_sources');

            if (error) {
                this.logger.warn(`Source tracking cleanup error: ${error.message}`);
                return 0;
            }

            const cleaned = typeof data === 'number' ? data : 0;
            if (cleaned > 0) {
                this.logger.log(`🧹 Pruned ${cleaned} old source tracking record(s)`);
            }
            return cleaned;
        } catch (err: any) {
            this.logger.warn(`Source tracking cleanup exception: ${err.message}`);
            return 0;
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
            .replace(/\[[a-f0-9]{4,10}\]/gi, '') // Strip hash suffixes like [72240c]
            .replace(/\$[\d,.]+/g, '')      // Remove price values like $32.93
            .replace(/[\d,.]+%/g, '')        // Remove percentages
            .replace(/\d{1,2}h\s*change/gi, '') // Remove "24h Change" patterns
            .replace(/source:\s*https?:\/\/\S+/gi, '') // Remove source URLs
            .replace(/https?:\/\/\S+/gi, '')    // Remove any URLs
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')           // Re-normalize spaces after all replacements
            .trim()
            .toLowerCase();
    }
}
