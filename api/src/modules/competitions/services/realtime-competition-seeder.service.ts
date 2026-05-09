/**
 * Realtime Competition Seeder Service — SINGLE AUTHORITATIVE SEEDER
 * 
 * Creates exactly up to 5 UNIQUE competitions PER CATEGORY from clustered ETL data.
 * Each competition has a distinct title derived from the dominant cluster topic
 * and an appropriate time horizon based on urgency analysis.
 * 
 * Flow:
 *   1. For each category, get available slots (we want 5 per category)
 *   2. Fetch ETL data for that category
 *   3. Cluster via TF-IDF + K-Means into exactly 5 clusters
 *   4. Extract best representative title per cluster
 *   5. Assign time horizons by urgency (2h→7d)
 *   6. Dedup against existing active competitions
 *   7. Create only missing competitions
 * 
 * IMPORTANT: This is the ONLY service that creates competitions.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../database/supabase.service.js';
import { CompetitionManagerService, HORIZON_TIERS, getRefreshConfig, type HorizonTier } from './competition-manager.service.js';
import { computeTfIdf, kMeansClustering } from '../../../common/utils/clustering.util.js';
import { PoolService } from '../../pool/pool.service.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';

/** How many unique competitions to maintain PER CATEGORY (one per horizon tier) */
const TARGET_COMPETITIONS_PER_CATEGORY = 4;

/** All categories to scan for ETL data */
const CATEGORIES = ['politics', 'finance', 'crypto', 'tech', 'economy', 'science', 'sports'] as const;

/**
 * All 4 valid horizon tiers (max 1 Day) — one competition per tier per category.
 */
const COMPETITION_HORIZON_SLOTS: HorizonTier[] = ['2h', '7h', '12h', '24h'];



interface ETLCandidate {
    title: string;
    cleanTitle: string;
    description: string;
    baseProbability: number;
    textRaw: string;
    source: 'signal' | 'market' | 'trending';
    category: string;
    urgencyHints: string;
    url?: string;
    payload?: any;
    /** Source-level anti-recycling: which ETL table this came from */
    sourceTable?: string;
    /** Source-level anti-recycling: unique ID in the source table */
    sourceId?: string;
}

interface ClusteredCompetition {
    title: string;
    description: string;
    category: string;
    baseProbability: number;
    urgencyScore: number;
    clusterSize: number;
    articleUrls: string[];
    signals: any[];
    /** Tracks which ETL sources were consumed to create this competition */
    consumedSources: Array<{ source_table: string; source_id: string; source_title?: string }>;
}

@Injectable()
export class RealtimeCompetitionSeederService {
    private readonly logger = new Logger(RealtimeCompetitionSeederService.name);
    private isSeeding = false;
    private isSettling = false;
    private isRefreshingClusters = false;
    /** Track synthetic fallback index per category to avoid reuse */
    private readonly syntheticIndexMap = new Map<string, number>();

    /** Anti-throttling: per slot cooldown map (key: `category::horizon`) */
    private readonly creationCooldowns = new Map<string, number>();
    private static readonly CREATION_COOLDOWN_MS = 180_000; // 3 min between same slot — prevents loop

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly compManager: CompetitionManagerService,
        @Optional() private readonly poolService?: PoolService,
    ) { }

    async onModuleInit() {
        this.logger.log(`🌱 RealtimeCompetitionSeeder initialized — ${TARGET_COMPETITIONS_PER_CATEGORY} comps per category (max 1Day)`);
        setTimeout(async () => {
            // PHASE 0: Auto-settle any expired competitions FIRST
            await this.compManager.autoSettleExpired(true);
            await this.retireOldHorizons();
            await this.compManager.cleanupExistingDuplicates();
            // PHASE 1: Only seed missing slots, DO NOT cancel active ones on restart
            await this.seedAllCategories();
            await this.refreshMissingClusters();
        }, 5000);
    }

    /** Every 5 minutes: scan all categories and fill any missing horizon slots */
    @Cron('*/5 * * * *')
    async handleCron() {
        await this.seedAllCategories();
    }

    /** Every 30 seconds: settle expired + immediately replenish freed slots. */
    @Cron('*/30 * * * * *')
    async settleAndReplenishCron() {
        await this.settleAndReplenish();
    }

    /**
     * Every 5 minutes, bind fresh cluster data to active competitions that have
     * zero or stale (>10 min old) clusters. Ensures the UI always has data.
     */
    @Cron('*/5 * * * *')
    async handleClusterRefresh() {
        await this.refreshMissingClusters();
    }

    /**
     * PRE-WARMING: Every 2 minutes, check for competitions nearing expiry
     * (within 80% of their duration) and pre-fetch fresh ETL data for replacement.
     * This ensures instant refill when the competition actually expires.
     */
    @Cron('*/2 * * * *')
    async preWarmExpiringSlots() {
        await this.preWarmUpcomingReplacements();
    }

    /**
     * Daily cleanup at 3:30 AM: prune old source tracking records
     * and stale data to keep the anti-recycling table bounded.
     */
    @Cron('30 3 * * *')
    async dailyCleanup() {
        this.logger.log('🧹 Running daily source tracking cleanup...');
        await this.compManager.cleanupOldSourceTracking();
    }

    async seedAllCategories(): Promise<void> {
        if (this.isSeeding) return;
        this.isSeeding = true;

        try {
            // ALWAYS settle expired competitions BEFORE checking missing slots
            // This is the core fix: prevents "already at cap" errors
            const settledCount = await this.compManager.autoSettleExpired();
            if (settledCount > 0) {
                this.logger.log(`⚡ Pre-seed: settled ${settledCount} expired competition(s)`);
            }

            for (const category of CATEGORIES) {
                await this.seedCategory(category);
            }
        } catch (err: any) {
            this.logger.error(`Global seeding error: ${err.message}`);
        } finally {
            this.isSeeding = false;
        }
    }

    /**
     * PUBLIC: Force reset all competitions and reseed with fresh data.
     * Called by the admin API endpoint.
     * Returns a summary object with counts.
     */
    async forceResetAndReseed(): Promise<{ settled: number; cancelled: number; seeded: number }> {
        this.logger.log('🔁 Force reset and reseed requested via admin API');

        // Clear all cooldowns so fresh seed isn't throttled
        this.creationCooldowns.clear();

        const supabase = this.supabaseService.getAdminClient();
        let settledCount = 0;
        let cancelledCount = 0;

        // Step 1: Auto-settle expired
        settledCount = await this.compManager.autoSettleExpired(true);

        // Step 2: Settle remaining active with proper pool settlement
        const { data: activeComps } = await supabase
            .from('competitions')
            .select('id, title, sector, time_horizon, outcomes')
            .in('status', ['active', 'upcoming']);

        if (activeComps && activeComps.length > 0) {
            for (const comp of activeComps) {
                let winningOutcome = 0;
                if (comp.outcomes && Array.isArray(comp.outcomes) && comp.outcomes.length > 0) {
                    winningOutcome = AntiManipulationUtil.secureRandomOutcome(comp.outcomes.length);
                }
                const settlementNonce = AntiManipulationUtil.generateNonce();
                const settlementHash = AntiManipulationUtil.hashSnapshot({
                    id: comp.id, winningOutcome, nonce: settlementNonce,
                    settledAt: new Date().toISOString(),
                });

                await supabase
                    .from('competitions')
                    .update({
                        status: 'settled',
                        winning_outcome: winningOutcome,
                        metadata: {
                            settlementHash, settlementNonce,
                            settledAt: new Date().toISOString(),
                            settledBy: 'admin_force_reset',
                        },
                    })
                    .eq('id', comp.id);

                try {
                    if (this.poolService) {
                        await this.poolService.settlePool(comp.id, 'admin_force_reset');
                    }
                } catch (_e) { }
                cancelledCount++;
            }
        }

        // Step 3: Small delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 4: Seed fresh
        let seededCount = 0;
        for (const category of CATEGORIES) {
            const before = await this.compManager.getMissingHorizonSlots(category);
            await this.seedCategory(category);
            const after = await this.compManager.getMissingHorizonSlots(category);
            seededCount += (before.length - after.length);
        }

        this.logger.log(`✅ Force reset complete: settled=${settledCount}, cancelled=${cancelledCount}, seeded=${seededCount}`);
        return { settled: settledCount, cancelled: cancelledCount, seeded: seededCount };
    }

    /**
     * STARTUP-ONLY: Cancel all existing competitions and seed fresh ones.
     * This ensures a completely clean slate on server restart:
     *   1. Settle all expired competitions (with pool settlement if applicable)
     *   2. Cancel all remaining active/upcoming competitions
     *   3. Seed fresh competitions with all 4 horizons per category
     * 
     * Anti-recycling: Old data is properly marked so it won't be reused.
     * Anti-manipulation: Each new competition gets fresh HMAC + nonce.
     */
    private async cancelAllAndSeedFresh(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();

            // Step 1: Settle expired competitions properly (with pool payouts)
            const { data: expired } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, outcomes')
                .eq('status', 'active')
                .lt('competition_end', new Date().toISOString());

            if (expired && expired.length > 0) {
                for (const comp of expired) {
                    let winningOutcome = 0;
                    if (comp.outcomes && Array.isArray(comp.outcomes) && comp.outcomes.length > 0) {
                        winningOutcome = AntiManipulationUtil.secureRandomOutcome(comp.outcomes.length);
                    }
                    const settlementNonce = AntiManipulationUtil.generateNonce();
                    const settlementHash = AntiManipulationUtil.hashSnapshot({
                        id: comp.id, winningOutcome, nonce: settlementNonce,
                        settledAt: new Date().toISOString(),
                    });

                    await supabase
                        .from('competitions')
                        .update({
                            status: 'settled',
                            winning_outcome: winningOutcome,
                            metadata: {
                                settlementHash, settlementNonce,
                                settledAt: new Date().toISOString(),
                                settledBy: 'startup_fresh_seed',
                            },
                        })
                        .eq('id', comp.id);

                    // Settle pool if service available
                    try {
                        if (this.poolService) {
                            await this.poolService.settlePool(comp.id, 'startup_fresh_seed');
                        }
                    } catch (_e) { }
                }
                this.logger.log(`⚖️ Startup: settled ${expired.length} expired competition(s)`);
            }

            // Step 2: Cancel ALL remaining active/upcoming competitions
            // IMPORTANT: Settle pools FIRST to prevent user stakes from being stranded
            const { data: remaining } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, outcomes')
                .in('status', ['active', 'upcoming']);

            if (remaining && remaining.length > 0) {
                // Settle pools for competitions that have active stakes
                for (const comp of remaining) {
                    try {
                        if (this.poolService) {
                            // Determine a CSPRNG outcome for fair settlement
                            let winningOutcome = 0;
                            if (comp.outcomes && Array.isArray(comp.outcomes) && comp.outcomes.length > 0) {
                                winningOutcome = AntiManipulationUtil.secureRandomOutcome(comp.outcomes.length);
                            }
                            const settlementNonce = AntiManipulationUtil.generateNonce();
                            const settlementHash = AntiManipulationUtil.hashSnapshot({
                                id: comp.id, winningOutcome, nonce: settlementNonce,
                                settledAt: new Date().toISOString(),
                            });

                            await supabase
                                .from('competitions')
                                .update({
                                    status: 'settled',
                                    winning_outcome: winningOutcome,
                                    metadata: {
                                        settlementHash, settlementNonce,
                                        settledAt: new Date().toISOString(),
                                        settledBy: 'startup_graceful_settle',
                                    },
                                })
                                .eq('id', comp.id);

                            await this.poolService.settlePool(comp.id, 'startup_graceful_settle');
                            this.logger.log(`⚖️ Startup: gracefully settled pool for "${(comp.title || '').substring(0, 40)}"`);
                        } else {
                            // No pool service — just cancel
                            await supabase
                                .from('competitions')
                                .update({
                                    status: 'cancelled',
                                    metadata: {
                                        cancelledAt: new Date().toISOString(),
                                        cancelledBy: 'startup_fresh_seed',
                                        reason: 'Server restart — no pool service for settlement',
                                    },
                                })
                                .eq('id', comp.id);
                        }
                    } catch (settleErr: any) {
                        // Fallback: cancel if settlement fails
                        this.logger.warn(`Startup settle failed for ${comp.id}, cancelling: ${settleErr.message}`);
                        await supabase
                            .from('competitions')
                            .update({
                                status: 'cancelled',
                                metadata: {
                                    cancelledAt: new Date().toISOString(),
                                    cancelledBy: 'startup_fresh_seed',
                                    reason: `Server restart — settlement failed: ${settleErr.message}`,
                                },
                            })
                            .eq('id', comp.id);
                    }
                }

                this.logger.log(`⚖️ Startup: processed ${remaining.length} remaining competition(s) with pool settlement`);
            }

            // Step 3: Small delay to let DB constraints settle
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Step 4: Clear ALL cooldowns for a clean startup seed
            this.creationCooldowns.clear();
            this.syntheticIndexMap.clear();

            // Step 5: Seed fresh competitions for ALL categories
            this.logger.log(`🚀 Startup: seeding fresh competitions for ${CATEGORIES.length} categories...`);
            for (const category of CATEGORIES) {
                await this.seedCategory(category);
            }

            // Step 6: Verify all slots filled — retry any gaps once (with delay for DB consistency)
            await new Promise(resolve => setTimeout(resolve, 2000));
            let totalMissing = 0;
            for (const category of CATEGORIES) {
                const missing = await this.compManager.getMissingHorizonSlots(category);
                if (missing.length > 0) {
                    this.logger.warn(`⚠️ [${category}] Still missing ${missing.length} slot(s) after initial seed: [${missing.join(', ')}]`);
                    // Clear cooldowns for missing slots and retry
                    for (const h of missing) {
                        this.creationCooldowns.delete(`${category}::${h}`);
                    }
                    await this.seedCategory(category);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    totalMissing += (await this.compManager.getMissingHorizonSlots(category)).length;
                }
            }
            if (totalMissing > 0) {
                this.logger.warn(`⚠️ ${totalMissing} slot(s) still unfilled after retry — will be picked up by cron`);
            }

            this.logger.log(`✅ Startup: fresh seed complete — all categories should have 4 competitions each`);
        } catch (err: any) {
            this.logger.error(`cancelAllAndSeedFresh error: ${err.message}`);
            // Fallback: try normal seeding
            await this.seedAllCategories();
        }
    }

    /**
     * HORIZON-SLOT-AWARE SEEDING
     * Instead of counting open slots, explicitly checks which horizon tiers
     * (2h, 7h, 12h, 24h) are missing and fills each one specifically.
     * Anti-throttling: skips slots still within cooldown period.
     */
    private async seedCategory(category: string): Promise<void> {
        // 1. Get exactly which horizon slots are missing
        const missingSlots = await this.compManager.getMissingHorizonSlots(category);
        if (missingSlots.length === 0) return;

        // 2. Anti-throttling: filter out slots still in cooldown
        const slotsToFill = missingSlots.filter(horizon => {
            const key = `${category}::${horizon}`;
            return !AntiManipulationUtil.isWithinCooldown(
                this.creationCooldowns, key,
                RealtimeCompetitionSeederService.CREATION_COOLDOWN_MS,
            );
        });

        if (slotsToFill.length === 0) return;

        this.logger.log(`🌱 [${category}] Filling ${slotsToFill.length} missing slot(s): [${slotsToFill.join(', ')}]`);

        // 3. ANTI-RECYCLING (DUAL LAYER): 
        //    Layer A: Title-based historical fingerprints (Jaccard + exact + substring)
        //    Layer B: Source-ID-based tracking (bulletproof — catches reformatted titles)
        const historicalFingerprints = await this.compManager.getAllHistoricalFingerprints(category);
        const usedSourceTitles = await this.compManager.getAllUsedSourceTitles(category);

        // Source-ID anti-recycling: get consumed IDs per ETL table
        const usedSignalIds = await this.compManager.getUsedSourceIds(category, 'market_signals');
        const usedMarketIds = await this.compManager.getUsedSourceIds(category, 'market_data_items');
        const usedTrendingIds = await this.compManager.getUsedSourceIds(category, 'trending_topics');
        const usedSportsIds = await this.compManager.getUsedSourceIds(category, 'sports_events');
        const usedScienceIds = await this.compManager.getUsedSourceIds(category, 'science_papers');
        const usedBreakthroughIds = await this.compManager.getUsedSourceIds(category, 'science_breakthroughs');

        const usedSourceIdMap: Record<string, Set<string>> = {
            market_signals: usedSignalIds,
            market_data_items: usedMarketIds,
            trending_topics: usedTrendingIds,
            sports_events: usedSportsIds,
            science_papers: usedScienceIds,
            science_breakthroughs: usedBreakthroughIds,
        };

        // 4. Collect ETL candidates — filtered against BOTH used titles AND used source IDs
        const supabase = this.supabaseService.getAdminClient();
        const allCandidates: ETLCandidate[] = [];
        await this.collectCategoryETL(supabase, category, allCandidates, usedSourceTitles, usedSourceIdMap);

        if (allCandidates.length === 0) {
            this.logger.warn(`[${category}] No fresh ETL data — using synthetic fallback`);
            const syntheticCandidates = this.generateSyntheticCandidates(category, slotsToFill.length);
            allCandidates.push(...syntheticCandidates);
        }

        // If still not enough candidates, supplement with synthetics
        if (allCandidates.length < slotsToFill.length) {
            const deficit = slotsToFill.length - allCandidates.length;
            this.logger.warn(`[${category}] Only ${allCandidates.length} candidates for ${slotsToFill.length} slots — adding ${deficit} synthetic`);
            const syntheticCandidates = this.generateSyntheticCandidates(category, deficit);
            allCandidates.push(...syntheticCandidates);
        }

        // 5. Cluster candidates
        const clusteredTopics = this.clusterCandidates(allCandidates, slotsToFill.length + 3);
        clusteredTopics.sort((a, b) => b.urgencyScore - a.urgencyScore);

        // 6. Fill each missing horizon slot with the best available fresh topic
        for (const horizon of slotsToFill) {
            // Find best non-duplicate candidate for this slot
            let bestTopic: ClusteredCompetition | null = null;
            for (const topic of clusteredTopics) {
                if (this.compManager.isTooSimilar(topic.title, historicalFingerprints)) continue;
                bestTopic = topic;
                break;
            }

            // SYNTHETIC FALLBACK: If all ETL candidates were rejected by dedup,
            // generate a fresh synthetic candidate for this specific slot
            if (!bestTopic) {
                this.logger.warn(`  🔧 [${category}/${horizon}] All ETL candidates rejected by dedup — generating synthetic`);
                const synthCandidates = this.generateSyntheticCandidates(category, 1);
                if (synthCandidates.length > 0) {
                    const synth = synthCandidates[0];
                    bestTopic = {
                        title: synth.cleanTitle,
                        description: synth.description,
                        category: synth.category,
                        baseProbability: synth.baseProbability,
                        urgencyScore: 0.5,
                        clusterSize: 1,
                        articleUrls: [],
                        signals: [],
                        consumedSources: [],
                    };
                }
            }

            if (!bestTopic) {
                this.logger.error(`  ❌ [${category}/${horizon}] Could not generate any candidate`);
                continue;
            }

            try {
                const comp = await this.compManager.createCompetition(
                    category,
                    bestTopic.title,
                    bestTopic.description,
                    horizon,
                    bestTopic.baseProbability,
                );

                if (comp) {
                    historicalFingerprints.add(bestTopic.title.toLowerCase());
                    AntiManipulationUtil.recordCreation(this.creationCooldowns, `${category}::${horizon}`);

                    // SOURCE-LEVEL ANTI-RECYCLING: Record which ETL items were consumed
                    if (bestTopic.consumedSources && bestTopic.consumedSources.length > 0) {
                        await this.compManager.recordUsedSources(
                            comp.id,
                            category,
                            bestTopic.consumedSources,
                        );
                    }

                    // Remove used topic from pool
                    const idx = clusteredTopics.indexOf(bestTopic);
                    if (idx >= 0) clusteredTopics.splice(idx, 1);
                    await this.insertInitialNewsCluster(comp.id, bestTopic);
                    this.logger.log(`  ✅ Filled [${category}/${horizon}] "${bestTopic.title.substring(0, 60)}..." (${bestTopic.consumedSources?.length || 0} sources tracked)`);
                }
            } catch (err: any) {
                if (!err.message?.includes('unique') && !err.message?.includes('duplicate')) {
                    this.logger.warn(`  ❌ [${category}/${horizon}] Failed: ${err.message}`);
                }
            }
        }
    }

    // getUsedHorizons and assignHorizon removed — replaced by
    // compManager.getMissingHorizonSlots() for precise slot-aware filling.

    /**
     * Collect ETL candidates for a category, filtered against used source titles.
     * ANTI-RECYCLING: Skips any ETL item whose title matches a previously used competition.
     * Uses 3-layer dedup: exact match → substring match → Jaccard similarity.
     */
    private async collectCategoryETL(
        supabase: any,
        category: string,
        allCandidates: ETLCandidate[],
        usedSourceTitles: Set<string> = new Set(),
        usedSourceIdMap: Record<string, Set<string>> = {},
    ): Promise<void> {
        /**
         * BULLETPROOF anti-recycling check.
         * Layer 1: Exact normalized match
         * Layer 2: Substring/contains match (catches hash suffixes like [72240c])
         * Layer 3: Jaccard similarity (catches paraphrased or reformatted titles)
         */
        const deepNormalize = (title: string): string => {
            return title
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[—–\-]+/g, ' ')
                .replace(/outcome prediction\??/gi, '')
                .replace(/\[[a-f0-9]{4,10}\]/gi, '')   // Strip hash suffixes like [72240c]
                .replace(/\$[\d,.]+/g, '')              // Strip prices
                .replace(/[\d,.]+%/g, '')               // Strip percentages
                .replace(/\d{1,2}h\s*change/gi, '')     // Strip "24h change"
                .replace(/source:\s*https?:\/\/\S+/gi, '') // Strip source URLs
                .replace(/https?:\/\/\S+/gi, '')        // Strip any URLs
                .replace(/[^\w\s]/g, '')                // Strip special chars
                .replace(/\s+/g, ' ')                   // Re-normalize spaces
                .trim();
        };

        const tokenize = (text: string): Set<string> => {
            // Filter out common meaningless words that falsely inflate similarity
            const stopWords = new Set(['vs', 'the', 'a', 'an', 'for', 'in', 'on', 'at', 'to', 'of', 'and', 'with', 'by']);
            return new Set(text.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
        };

        const jaccardSim = (a: Set<string>, b: Set<string>): number => {
            if (a.size === 0 || b.size === 0) return 0;
            let intersection = 0;
            for (const t of a) { if (b.has(t)) intersection++; }
            const union = a.size + b.size - intersection;
            return union > 0 ? intersection / union : 0;
        };

        // Pre-compute normalized + tokenized versions of all used titles
        const normalizedUsedSet = new Set<string>();
        const tokenizedUsed: Set<string>[] = [];
        for (const used of usedSourceTitles) {
            const norm = deepNormalize(used);
            normalizedUsedSet.add(norm);
            tokenizedUsed.push(tokenize(norm));
        }

        const isAlreadyUsed = (title: string): boolean => {
            if (!title) return true;
            const norm = deepNormalize(title);
            if (norm.length < 5) return false; // Too short to be meaningful

            // Layer 1: Exact normalized match
            if (normalizedUsedSet.has(norm)) return true;

            // Layer 2: Substring/contains match (catches hash suffixes, slight variations)
            for (const usedNorm of normalizedUsedSet) {
                if (usedNorm.length < 10) continue;
                if (norm.includes(usedNorm) || usedNorm.includes(norm)) return true;
            }

            // Layer 3: Jaccard similarity (catches paraphrased/reformatted titles)
            const candidateTokens = tokenize(norm);
            if (candidateTokens.size < 3) return false;
            for (const usedTokens of tokenizedUsed) {
                if (usedTokens.size < 3) continue;
                const sim = jaccardSim(candidateTokens, usedTokens);
                if (sim > 0.75) return true; // Threshold raised from 0.45 to 0.75 to allow different matches in same league
            }

            return false;
        };
        // 1. Market signals — increased limit from 15 to 25 for better diversity
        const { data: signals } = await supabase
            .from('market_signals')
            .select('id, title, description, signal_strength, sentiment, confidence_score')
            .eq('category', category)
            .eq('is_active', true)
            .order('signal_strength', { ascending: false })
            .limit(25);

        if (signals) {
            const usedSignalIds = usedSourceIdMap['market_signals'] || new Set();
            for (const sig of signals) {
                if (!sig.title) continue;
                // SOURCE-ID anti-recycling: skip if this exact source was already consumed
                if (sig.id && usedSignalIds.has(String(sig.id))) continue;
                if (isAlreadyUsed(sig.title)) continue; // Title-based anti-recycling
                const sentiment = sig.sentiment === 'bullish' ? 0.6 : sig.sentiment === 'bearish' ? 0.4 : 0.5;
                const confidence = sig.confidence_score || 0.5;
                const baseProbability = Math.max(0.2, Math.min(0.8, sentiment * 0.6 + confidence * 0.4));
                allCandidates.push({
                    title: sig.title,
                    cleanTitle: this.cleanTitle(sig.title),
                    description: sig.description || `Probability assessment for: ${sig.title}`,
                    baseProbability,
                    textRaw: `${sig.title} ${sig.description || ''} ${category}`,
                    source: 'signal',
                    category,
                    urgencyHints: `${sig.title} ${sig.description || ''}`,
                    payload: sig,
                    sourceTable: 'market_signals',
                    sourceId: sig.id ? String(sig.id) : undefined,
                });
            }
        }

        // 2. Market data items — increased limit from 15 to 25 for better diversity
        const usedMarketItemIds = usedSourceIdMap['market_data_items'] || new Set();
        const { data: marketItems } = await supabase
            .from('market_data_items')
            .select('id, title, description, sentiment_score, impact, source_name, relevance_score, url')
            .eq('category', category)
            .eq('is_active', true)
            .in('impact', ['high', 'critical', 'medium'])
            .order('published_at', { ascending: false })
            .limit(25);

        if (marketItems) {
            for (const item of marketItems) {
                if (!item.title) continue;
                // SOURCE-ID anti-recycling: skip if this exact source was already consumed
                if (item.id && usedMarketItemIds.has(String(item.id))) continue;
                if (isAlreadyUsed(item.title)) continue; // Title-based anti-recycling
                const sentimentScore = item.sentiment_score || 0;
                const baseProbability = Math.max(0.2, Math.min(0.8, 0.5 + sentimentScore * 0.2));
                allCandidates.push({
                    title: item.title,
                    cleanTitle: this.cleanTitle(item.title),
                    description: item.description || `Event forecasting: ${item.title}`,
                    baseProbability,
                    textRaw: `${item.title} ${item.description || ''} ${category} ${item.impact || ''}`,
                    source: 'market',
                    category,
                    urgencyHints: `${item.title} ${item.description || ''} ${item.impact || ''}`,
                    url: item.url,
                    payload: item,
                    sourceTable: 'market_data_items',
                    sourceId: item.id ? String(item.id) : undefined,
                });
            }
        }

        // 2b. If category is 'sports', also fetch from sports_events with proper status + team names
        if (category === 'sports') {
            const usedSportsIds = usedSourceIdMap['sports_events'] || new Set();
            // Query sports_events — simple select to avoid FK hint issues
            const { data: sportsEvents } = await supabase
                .from('sports_events')
                .select('id, home_team_id, away_team_id, start_time, status, sport, external_id, name, venue, league_id')
                .eq('status', 'scheduled') // FIXED: was 'NS', actual enum is 'scheduled'
                .order('start_time', { ascending: true })
                .limit(25);

            if (sportsEvents && sportsEvents.length > 0) {
                this.logger.log(`[sports] Found ${sportsEvents.length} scheduled sports events`);

                // Batch-resolve team names for all events
                const teamIds = new Set<string>();
                const leagueIds = new Set<string>();
                for (const ev of sportsEvents) {
                    if (ev.home_team_id) teamIds.add(ev.home_team_id);
                    if (ev.away_team_id) teamIds.add(ev.away_team_id);
                    if (ev.league_id) leagueIds.add(ev.league_id);
                }

                const teamNameMap = new Map<string, string>();
                const leagueNameMap = new Map<string, string>();

                if (teamIds.size > 0) {
                    const { data: teams } = await supabase
                        .from('sports_teams')
                        .select('id, name')
                        .in('id', Array.from(teamIds));
                    if (teams) teams.forEach(t => teamNameMap.set(t.id, t.name));
                }

                if (leagueIds.size > 0) {
                    const { data: leagues } = await supabase
                        .from('sports_leagues')
                        .select('id, name')
                        .in('id', Array.from(leagueIds));
                    if (leagues) leagues.forEach(l => leagueNameMap.set(l.id, l.name));
                }

                for (const event of sportsEvents) {
                    const homeName = teamNameMap.get(event.home_team_id) || event.name?.split(' vs ')?.[0] || `Team ${(event.home_team_id || '').substring(0, 8)}`;
                    const awayName = teamNameMap.get(event.away_team_id) || event.name?.split(' vs ')?.[1] || `Team ${(event.away_team_id || '').substring(0, 8)}`;
                    const leagueName = leagueNameMap.get(event.league_id) || '';
                    const sportLabel = (event.sport || 'sports').charAt(0).toUpperCase() + (event.sport || 'sports').slice(1);

                    const title = leagueName
                        ? `${leagueName}: ${homeName} vs ${awayName}`
                        : `${sportLabel}: ${homeName} vs ${awayName}`;

                    // SOURCE-ID anti-recycling
                    if (event.id && usedSportsIds.has(String(event.id))) continue;
                    if (isAlreadyUsed(title)) continue; // Title-based anti-recycling

                    const startDate = event.start_time ? new Date(event.start_time) : null;
                    const timeHint = startDate
                        ? (startDate.getTime() - Date.now() < 24 * 60 * 60 * 1000 ? 'today live' : 'tomorrow upcoming')
                        : '';

                    allCandidates.push({
                        title: title,
                        cleanTitle: this.cleanTitle(title),
                        description: `${sportLabel} match prediction: ${homeName} vs ${awayName}${leagueName ? ` (${leagueName})` : ''}${event.venue ? ` at ${event.venue}` : ''}`,
                        baseProbability: 0.5,
                        textRaw: `${title} ${homeName} ${awayName} match sports game outcome prediction ${sportLabel} ${leagueName}`,
                        source: 'market',
                        category,
                        urgencyHints: `${timeHint} match game ${sportLabel}`,
                        payload: event,
                        sourceTable: 'sports_events',
                        sourceId: event.id ? String(event.id) : undefined,
                    });
                }
            } else {
                this.logger.debug(`[sports] No scheduled sports_events found, trying fallback queries`);

                // Fallback: try 'live' status events too
                const { data: liveEvents } = await supabase
                    .from('sports_events')
                    .select('id, home_team_id, away_team_id, start_time, status, sport, name, venue')
                    .in('status', ['live', 'halftime'])
                    .order('start_time', { ascending: true })
                    .limit(15);

                if (liveEvents) {
                    for (const event of liveEvents) {
                        const title = event.name || `${event.sport}: Live Match`;
                        if (event.id && usedSportsIds.has(String(event.id))) continue;
                        if (isAlreadyUsed(title)) continue; // Title-based anti-recycling
                        allCandidates.push({
                            title,
                            cleanTitle: this.cleanTitle(title),
                            description: `Live ${event.sport} match outcome prediction`,
                            baseProbability: 0.5,
                            textRaw: `${title} live match sports game outcome prediction`,
                            source: 'market',
                            category,
                            urgencyHints: `live now today match game breaking`,
                            payload: event,
                            sourceTable: 'sports_events',
                            sourceId: event.id ? String(event.id) : undefined,
                        });
                    }
                }
            }
        }

        // 3. Trending topics — FIXED: filter by category using `categories` overlap
        //    Increased limit from 8 to 15 for better diversity
        const usedTrendIds = usedSourceIdMap['trending_topics'] || new Set();
        const { data: trending } = await supabase
            .from('trending_topics')
            .select('topic, trend_score, mention_count, categories')
            .eq('is_active', true)
            .contains('categories', [category])
            .order('trend_score', { ascending: false })
            .limit(15);

        if (trending) {
            for (const trend of trending) {
                if (!trend.topic) continue;
                if ((trend as any).id && usedTrendIds.has(String((trend as any).id))) continue;
                if (isAlreadyUsed(trend.topic)) continue; // Title-based anti-recycling
                const rawTitle = `${trend.topic}: emerging trend — outcome prediction?`;
                allCandidates.push({
                    title: rawTitle,
                    cleanTitle: this.cleanTitle(rawTitle),
                    description: `Trending topic: ${trend.topic} (${trend.mention_count || 0} mentions)`,
                    baseProbability: 0.5,
                    textRaw: `${trend.topic} trending prediction market ${category}`,
                    source: 'trending',
                    category,
                    urgencyHints: trend.topic,
                    sourceTable: 'trending_topics',
                    sourceId: (trend as any).id ? String((trend as any).id) : undefined,
                });
            }
        }

        // 4. SCIENCE FALLBACK: Query science_papers and science_breakthroughs directly
        //    when the standard ETL tables have insufficient data
        if (category === 'science' && allCandidates.length < 5) {
            this.logger.debug(`[science] Only ${allCandidates.length} candidates from main ETL, querying science_papers...`);
            const usedPaperIds = usedSourceIdMap['science_papers'] || new Set();

            const { data: papers } = await supabase
                .from('science_papers')
                .select('title, abstract, tldr, citation_count, venue, fields_of_study, paper_url, first_author')
                .eq('is_active', true)
                .order('citation_count', { ascending: false })
                .limit(20);

            if (papers) {
                for (const paper of papers) {
                    if (!paper.title) continue;
                    if ((paper as any).id && usedPaperIds.has(String((paper as any).id))) continue;
                    if (isAlreadyUsed(paper.title)) continue; // Title-based anti-recycling
                    const citationImpact = (paper.citation_count || 0) > 100 ? 0.7 : (paper.citation_count || 0) > 10 ? 0.6 : 0.5;
                    allCandidates.push({
                        title: paper.title,
                        cleanTitle: this.cleanTitle(paper.title),
                        description: paper.tldr || paper.abstract?.substring(0, 300) || `Research paper: ${paper.title}`,
                        baseProbability: citationImpact,
                        textRaw: `${paper.title} ${paper.abstract || ''} ${(paper.fields_of_study || []).join(' ')} science research`,
                        source: 'market',
                        category,
                        urgencyHints: `research paper ${(paper.fields_of_study || []).join(' ')}`,
                        url: paper.paper_url,
                        payload: paper,
                        sourceTable: 'science_papers',
                        sourceId: (paper as any).id ? String((paper as any).id) : undefined,
                    });
                }
                this.logger.log(`[science] Added ${papers.length} papers from science_papers fallback`);
            }

            // Also try science_breakthroughs
            const usedBtIds = usedSourceIdMap['science_breakthroughs'] || new Set();
            const { data: breakthroughs } = await supabase
                .from('science_breakthroughs')
                .select('title, description, summary, field, impact_level, source_url')
                .eq('is_active', true)
                .order('announcement_date', { ascending: false })
                .limit(10);

            if (breakthroughs) {
                for (const bt of breakthroughs) {
                    if (!bt.title) continue;
                    if ((bt as any).id && usedBtIds.has(String((bt as any).id))) continue;
                    if (isAlreadyUsed(bt.title)) continue; // Title-based anti-recycling
                    const impactProb = bt.impact_level === 'critical' ? 0.75 : bt.impact_level === 'high' ? 0.65 : 0.55;
                    allCandidates.push({
                        title: bt.title,
                        cleanTitle: this.cleanTitle(bt.title),
                        description: bt.summary || bt.description || `Scientific breakthrough: ${bt.title}`,
                        baseProbability: impactProb,
                        textRaw: `${bt.title} ${bt.description || ''} ${bt.field || ''} breakthrough discovery science`,
                        source: 'market',
                        category,
                        urgencyHints: `breakthrough discovery ${bt.field || 'science'}`,
                        url: bt.source_url,
                        payload: bt,
                        sourceTable: 'science_breakthroughs',
                        sourceId: (bt as any).id ? String((bt as any).id) : undefined,
                    });
                }
                this.logger.log(`[science] Added ${breakthroughs.length} entries from science_breakthroughs fallback`);
            }
        }

        // 5. GENERIC LAST-RESORT FALLBACK: If we still have 0 candidates after all queries,
        //    pull the most recent historical market_data_items (without is_active filter)
        if (allCandidates.length === 0) {
            this.logger.warn(`[${category}] ⚠️ All ETL sources returned 0 data — using historical fallback`);

            const { data: historicalItems } = await supabase
                .from('market_data_items')
                .select('title, description, sentiment_score, impact, source_name, url')
                .eq('category', category)
                .order('published_at', { ascending: false })
                .limit(15);

            if (historicalItems) {
                let fallbackPushed = 0;
                for (const item of historicalItems) {
                    if (!item.title) continue;
                    // RELAXED FALLBACK: If we are here, we are desperate for data.
                    // Only reject if it's an EXACT match, ignore the aggressive token similarity.
                    const norm = deepNormalize(item.title);
                    if (normalizedUsedSet.has(norm)) continue;

                    allCandidates.push({
                        title: item.title,
                        cleanTitle: this.cleanTitle(item.title),
                        description: item.description || `Event forecasting: ${item.title}`,
                        baseProbability: Math.max(0.2, Math.min(0.8, 0.5 + (item.sentiment_score || 0) * 0.2)),
                        textRaw: `${item.title} ${item.description || ''} ${category} ${item.impact || ''}`,
                        source: 'market',
                        category,
                        urgencyHints: `${item.title} ${item.description || ''} ${item.impact || ''}`,
                        url: item.url,
                        payload: item,
                    });
                    fallbackPushed++;
                }
                this.logger.log(`[${category}] Historical fallback yielded ${fallbackPushed} valid candidates`);
            }
        }
    }

    private clusterCandidates(candidates: ETLCandidate[], targetCount: number): ClusteredCompetition[] {
        const results: ClusteredCompetition[] = [];
        if (candidates.length === 0) return results;

        const k = Math.min(targetCount, candidates.length);

        try {
            const texts = candidates.map(c => c.textRaw);
            const vectors = computeTfIdf(texts);
            const assignments = kMeansClustering(vectors, k);

            const clusters = new Map<number, ETLCandidate[]>();
            for (let i = 0; i < assignments.length; i++) {
                const clusterId = assignments[i];
                if (!clusters.has(clusterId)) clusters.set(clusterId, []);
                clusters.get(clusterId)!.push(candidates[i]);
            }

            const usedNormalizedTitles = new Set<string>();

            for (const [clusterId, cluster] of clusters) {
                cluster.sort((a, b) => {
                    const priority: Record<string, number> = { signal: 3, market: 2, trending: 1 };
                    return (priority[b.source] || 0) - (priority[a.source] || 0);
                });

                let best: ETLCandidate | null = null;
                for (const candidate of cluster) {
                    const normalized = this.normalizeForDedup(candidate.cleanTitle);
                    if (usedNormalizedTitles.has(normalized)) continue;

                    let tooSimilar = false;
                    for (const existing of usedNormalizedTitles) {
                        if (this.jaccardSimilarity(normalized, existing) > 0.55) {
                            tooSimilar = true;
                            break;
                        }
                    }

                    if (!tooSimilar) {
                        best = candidate;
                        usedNormalizedTitles.add(normalized);
                        break;
                    }
                }

                if (!best) continue;

                results.push({
                    title: best.cleanTitle,
                    description: best.description,
                    category: best.category,
                    baseProbability: best.baseProbability,
                    urgencyScore: this.computeUrgencyFromText(best.urgencyHints),
                    clusterSize: cluster.length,
                    articleUrls: cluster.map(c => c.url).filter(Boolean) as string[],
                    signals: cluster.map(c => c.payload).filter(Boolean),
                    // Collect ALL consumed source IDs from this cluster for anti-recycling tracking
                    consumedSources: cluster
                        .filter(c => c.sourceTable && c.sourceId)
                        .map(c => ({
                            source_table: c.sourceTable!,
                            source_id: c.sourceId!,
                            source_title: c.title?.substring(0, 200),
                        })),
                });
            }
        } catch (e: any) {
            this.logger.error(`Clustering error: ${e.message}`);
        }

        return results;
    }

    private computeUrgencyFromText(text: string): number {
        const lower = text.toLowerCase();
        let score = 0.5;
        const urgentPatterns = /\b(breaking|urgent|live|tonight|today|speech|address|press|ongoing|immediate|crash|surge|alert|minutes|hours|now|flash)\b/g;
        score += (lower.match(urgentPatterns) || []).length * 0.1;
        const mediumPatterns = /\b(tomorrow|weekend|earnings|report|meeting|summit|conference|hearing|trial|announce|week)\b/g;
        score += (lower.match(mediumPatterns) || []).length * 0.02;
        const longPatterns = /\b(election|month|policy|bill|quarter|season|legislation|long-term|annual|campaign|monthly|yearly|decade)\b/g;
        score -= (lower.match(longPatterns) || []).length * 0.1;
        return Math.max(0, Math.min(1, score));
    }

    /**
     * SYNTHETIC FALLBACK: Generate competition candidates when ETL data is exhausted.
     * Uses category-specific topic templates with timestamp-based uniqueness
     * to guarantee every category can always fill all 4 horizon slots.
     */
    private generateSyntheticCandidates(category: string, count: number): ETLCandidate[] {
        const templates: Record<string, string[]> = {
            politics: [
                'Government Policy Impact Assessment',
                'Legislative Agenda Progress Forecast',
                'Political Leadership Confidence Index',
                'Regulatory Reform Outcome Prediction',
                'Diplomatic Relations Shift Analysis',
                'Election Cycle Momentum Tracker',
                'Congressional Approval Rating Forecast',
                'International Summit Outcome Analysis',
            ],
            finance: [
                'Market Volatility Index Forecast',
                'Interest Rate Decision Prediction',
                'Equity Market Direction Analysis',
                'Bond Yield Movement Forecast',
                'Sector Rotation Pattern Prediction',
                'Corporate Earnings Surprise Index',
                'Currency Pair Movement Forecast',
                'IPO Market Sentiment Tracker',
            ],
            tech: [
                'AI Industry Adoption Rate Forecast',
                'Tech Sector Innovation Index',
                'Semiconductor Supply Chain Outlook',
                'Cloud Computing Growth Prediction',
                'Cybersecurity Threat Level Forecast',
                'Tech IPO Pipeline Analysis',
                'Software Revenue Growth Prediction',
                'Hardware Market Share Shift Forecast',
            ],
            crypto: [
                'Bitcoin Market Sentiment Analysis',
                'DeFi Protocol Adoption Forecast',
                'Crypto Regulatory Compliance Outlook',
                'Blockchain Network Activity Prediction',
                'Stablecoin Market Cap Forecast',
                'NFT Market Volume Prediction',
                'Layer 2 Scaling Adoption Tracker',
                'Crypto Institutional Flow Analysis',
            ],
            sports: [
                'Championship Contender Performance Forecast',
                'League Standings Movement Prediction',
                'Player Transfer Market Impact Analysis',
                'Tournament Bracket Outcome Forecast',
                'Team Form Momentum Tracker',
                'Injury Impact Assessment Prediction',
                'Season Playoff Race Analysis',
                'Athletic Performance Index Forecast',
            ],
            economy: [
                'GDP Growth Rate Forecast',
                'Inflation Trajectory Prediction',
                'Employment Market Outlook Analysis',
                'Consumer Spending Pattern Forecast',
                'Trade Balance Direction Prediction',
                'Housing Market Momentum Tracker',
                'Manufacturing Output Forecast',
                'Supply Chain Resilience Index',
            ],
            science: [
                'Climate Research Impact Assessment',
                'Medical Research Breakthrough Forecast',
                'Space Exploration Milestone Prediction',
                'Renewable Energy Adoption Tracker',
                'Biotech Innovation Pipeline Forecast',
                'Quantum Computing Progress Index',
                'Genomics Research Impact Prediction',
                'Environmental Policy Effect Forecast',
            ],
        };

        const categoryTemplates = templates[category] || templates['economy'];
        const idx = this.syntheticIndexMap.get(category) || 0;
        const now = Date.now();
        const candidates: ETLCandidate[] = [];

        for (let i = 0; i < count; i++) {
            const templateIdx = (idx + i) % categoryTemplates.length;
            const uniqueSuffix = ((now + i) % 100000).toString(36);
            const title = `${categoryTemplates[templateIdx]} [${uniqueSuffix}]`;

            candidates.push({
                title,
                cleanTitle: this.cleanTitle(title),
                description: `Live prediction market: ${categoryTemplates[templateIdx]}`,
                baseProbability: 0.45 + Math.random() * 0.1,
                textRaw: `${title} ${category} prediction market forecast analysis`,
                source: 'trending',
                category,
                urgencyHints: `${category} forecast analysis prediction`,
            });
        }

        this.syntheticIndexMap.set(category, idx + count);
        this.logger.log(`[${category}] Generated ${count} synthetic candidate(s)`);
        return candidates;
    }

    private cleanTitle(rawTitle: string): string {
        let title = rawTitle.trim();
        title = title.replace(/\s*[-–—]\s*$/, '');
        if (title.length > 120) {
            title = title.substring(0, 117) + '...';
        }
        if (!title.endsWith('?')) {
            title = `${title} — outcome prediction?`;
        }
        return title;
    }

    private normalizeForDedup(title: string): string {
        return title
            .replace(/\s+/g, ' ')
            .replace(/[—–\-]+/g, ' ')
            .replace(/outcome prediction\??/gi, '')
            .replace(/\$[\d,.]+/g, '')
            .replace(/[^\w\s]/g, '')
            .trim()
            .toLowerCase();
    }

    private jaccardSimilarity(a: string, b: string): number {
        const tokensA = new Set(a.split(/\s+/).filter(w => w.length > 2));
        const tokensB = new Set(b.split(/\s+/).filter(w => w.length > 2));
        if (tokensA.size === 0 || tokensB.size === 0) return 0;
        let intersection = 0;
        for (const t of tokensA) {
            if (tokensB.has(t)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    /**
     * ATOMIC SETTLE + IMMEDIATE REPLENISH (AUTO-REFILL)
     *
     * This is the core auto-refill engine. Runs every 15 seconds.
     * When a 2h competition ends, it immediately:
     *   1. Settles it (CSPRNG outcome, pool settlement, prize disbursement)
     *   2. Records the freed slot (e.g., crypto/2h)
     *   3. Creates a NEW 2h competition with FRESH data for that same category
     *
     * The same applies for 7h, 12h, 24h — each freed slot gets an identical
     * horizon replacement with completely new, never-before-used data.
     *
     * ANTI-RECYCLING: Historical fingerprints ensure no topic is ever reused.
     * ANTI-MANIPULATION: CSPRNG for outcomes, HMAC for creation integrity.
     * ANTI-THROTTLING: isSettling guard + per-slot cooldowns prevent storms.
     * ANTI-CHUNKING: All settlements processed atomically before replenishment.
     */
    private async settleAndReplenish(): Promise<void> {
        if (this.isSettling || this.isSeeding) return;
        this.isSettling = true;

        try {
            const supabase = this.supabaseService.getAdminClient();

            // --- PRE-PHASE: Auto-settle expired via DB function (safety net) ---
            await this.compManager.autoSettleExpired();

            // --- PHASE 1: Find expired competitions that need proper settlement ---
            //     The DB trigger may have already marked them as settled,
            //     but we still need to do pool distribution + prize disbursement.
            const { data: expired, error } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, outcomes, status')
                .or('status.eq.active,status.eq.settled')
                .lt('competition_end', new Date().toISOString())
                .is('winning_outcome', null); // Only unprocessed ones

            // Also find any that were auto-settled by DB trigger but not pool-settled
            const { data: autoSettled } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, outcomes')
                .eq('status', 'settled')
                .is('winning_outcome', null)
                .lt('competition_end', new Date().toISOString());

            const toProcess = [
                ...(expired || []),
                ...(autoSettled || []),
            ];

            // Deduplicate by id
            const seen = new Set<string>();
            const uniqueToProcess = toProcess.filter(c => {
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
            });

            if (uniqueToProcess.length === 0) {
                await this.promoteUpcoming(supabase);
                return;
            }

            // --- PHASE 2: Settle all expired competitions ---
            const freedSlots: { category: string; horizon: string }[] = [];

            for (const comp of uniqueToProcess) {
                // Anti-manipulation: CSPRNG outcome (not predictable Math.random)
                let winningOutcome = 0;
                if (comp.outcomes && Array.isArray(comp.outcomes) && comp.outcomes.length > 0) {
                    winningOutcome = AntiManipulationUtil.secureRandomOutcome(comp.outcomes.length);
                }

                // Generate settlement integrity hash
                const settlementNonce = AntiManipulationUtil.generateNonce();
                const settlementHash = AntiManipulationUtil.hashSnapshot({
                    id: comp.id, winningOutcome, nonce: settlementNonce,
                    settledAt: new Date().toISOString(),
                });

                await supabase
                    .from('competitions')
                    .update({
                        status: 'settled',
                        winning_outcome: winningOutcome,
                        metadata: {
                            settlementHash,
                            settlementNonce,
                            settledAt: new Date().toISOString(),
                            settledBy: 'system_auto',
                        },
                    })
                    .eq('id', comp.id);

                this.logger.log(`⚖️ Settled: [${comp.sector}/${comp.time_horizon}] "${(comp.title || '').substring(0, 50)}" → outcome=${winningOutcome}`);

                // Settle pool + disburse prizes on-chain
                try {
                    if (this.poolService) {
                        await this.poolService.settlePool(comp.id, 'system_cron');
                        this.logger.log(`🏆 Pool settled + prizes disbursed for ${comp.id}`);
                    } else {
                        const { error: settleErr } = await supabase.rpc('settle_competition_pool', {
                            p_competition_id: comp.id,
                            p_settled_by: 'system_cron',
                        });
                        if (settleErr) this.logger.error(`Pool settle error: ${settleErr.message}`);
                    }
                } catch (e: any) {
                    this.logger.error(`Pool settlement exception for ${comp.id}: ${e.message}`);
                }

                // Record freed slot for immediate replenishment
                if (comp.sector && comp.time_horizon) {
                    freedSlots.push({ category: comp.sector, horizon: comp.time_horizon });
                }
            }

            // Refresh leaderboard after settlements
            try { await supabase.rpc('refresh_global_leaderboard'); } catch (_e) { }

            // --- PHASE 3: Promote upcoming → active ---
            await this.promoteUpcoming(supabase);

            // --- PHASE 4: IMMEDIATE AUTO-REFILL of freed slots ---
            if (freedSlots.length > 0 && !this.isSeeding) {
                this.isSeeding = true; // Acquire seed mutex for refill
                try {
                    this.logger.log(`🔄 Auto-refilling ${freedSlots.length} freed slot(s): [${freedSlots.map(s => `${s.category}/${s.horizon}`).join(', ')}]`);

                    // Small delay to let DB constraints settle after settlement
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const categoriesToSeed = new Set(freedSlots.map(s => s.category));
                    for (const category of categoriesToSeed) {
                        const categorySlots = freedSlots.filter(s => s.category === category);
                        this.logger.log(`  🌱 [${category}] Refilling ${categorySlots.length} slot(s): [${categorySlots.map(s => s.horizon).join(', ')}]`);
                        try {
                            for (const slot of categorySlots) {
                                this.creationCooldowns.delete(`${slot.category}::${slot.horizon}`);
                            }
                            await this.seedCategory(category);
                        } catch (err: any) {
                            this.logger.error(`Auto-refill error for ${category}: ${err.message}`);
                        }
                    }
                } finally {
                    this.isSeeding = false; // Release seed mutex
                }
            }

        } catch (err: any) {
            this.logger.error(`settleAndReplenish error: ${err.message}`);
        } finally {
            this.isSettling = false;
        }
    }

    /** Promote upcoming competitions to active when their start time has passed */
    private async promoteUpcoming(supabase: any): Promise<void> {
        try {
            await supabase
                .from('competitions')
                .update({ status: 'active' })
                .eq('status', 'upcoming')
                .lte('competition_start', new Date().toISOString())
                .gt('competition_end', new Date().toISOString());
        } catch (_e) { }
    }

    /**
     * FIXED: Always bind a cluster entry — never skip.
     * If the topic has no article URLs or signals, we create a structural cluster
     * using the topic title and description as signal data. This ensures the
     * ClusterDataPanel always has data to render for every category.
     */
    private async insertInitialNewsCluster(competitionId: string, topic: ClusteredCompetition): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const crypto = await import('crypto');
            const clusterHash = crypto.createHash('sha256').update(topic.title + Date.now().toString()).digest('hex');

            // Build signals array — use real signals if available, otherwise create a structural one
            const signalData = topic.signals.length > 0
                ? topic.signals.map(s => ({
                    title: s?.title || topic.title,
                    strength: s?.sentiment_score || s?.signal_strength || 0.5,
                    source: s?.source_name || s?.source || 'nlp-analysis'
                }))
                : [{ title: topic.title, strength: 0.5, category: topic.category, source: 'etl-cluster' }];

            // Build article_urls — use real URLs if available, otherwise empty array (still valid)
            const articleUrls = topic.articleUrls.length > 0 ? topic.articleUrls : [];

            // Map probability 0.2-0.8 to sentiment -1 to 1 based on real NLP data
            const totalStrength = (signalData as any[]).reduce((sum, s) => sum + (s.strength || 0.5), 0);
            const avgStrength = totalStrength / signalData.length;
            const sentimentValue = (avgStrength - 0.5) * 2;

            await supabase.from('news_clusters').insert({
                competition_id: competitionId,
                cluster_hash: clusterHash,
                article_urls: articleUrls,
                signals: signalData,
                sentiment: sentimentValue,
            });
            this.logger.debug(`✅ Bound initial news_cluster for "${topic.title.substring(0, 50)}..." [${topic.category}]`);
        } catch (e: any) {
            this.logger.warn(`Failed to bind initial news_cluster: ${e.message}`);
        }
    }

    /**
     * PRE-WARMING ENGINE: Pre-fetch fresh data for competitions approaching expiry.
     * 
     * When a competition has consumed 80%+ of its duration, this method:
     *   1. Identifies the category + horizon that will need replacement
     *   2. Validates that fresh ETL data exists for that replacement
     *   3. Logs readiness status so the auto-refill (every 15s) can act instantly
     * 
     * This eliminates the "cold start" delay between settlement and refill,
     * ensuring users always see 4 active competitions per category.
     * 
     * IMPORTANT: This does NOT create competitions — it only validates readiness.
     * The actual creation happens in settleAndReplenish() after proper settlement.
     */
    private async preWarmUpcomingReplacements(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const now = Date.now();

            // Find active competitions that are 80%+ through their duration
            const { data: activeComps } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon, competition_start, competition_end')
                .eq('status', 'active')
                .gt('competition_end', new Date().toISOString());

            if (!activeComps || activeComps.length === 0) return;

            const nearExpiry: Array<{ category: string; horizon: string; remainingMs: number; title: string }> = [];

            for (const comp of activeComps) {
                if (!comp.competition_start || !comp.competition_end || !comp.time_horizon) continue;

                const startMs = new Date(comp.competition_start).getTime();
                const endMs = new Date(comp.competition_end).getTime();
                const totalDuration = endMs - startMs;
                const elapsed = now - startMs;
                const progress = elapsed / totalDuration;

                // Only pre-warm if >80% through
                if (progress >= 0.80 && progress < 1.0) {
                    const remainingMs = endMs - now;
                    nearExpiry.push({
                        category: comp.sector,
                        horizon: comp.time_horizon,
                        remainingMs,
                        title: (comp.title || '').substring(0, 50),
                    });
                }
            }

            if (nearExpiry.length === 0) return;

            this.logger.log(`🔥 Pre-warming: ${nearExpiry.length} competition(s) approaching expiry`);

            // For each near-expiry competition, validate that fresh ETL data exists
            const categoriesChecked = new Set<string>();
            for (const item of nearExpiry) {
                if (categoriesChecked.has(item.category)) continue;
                categoriesChecked.add(item.category);

                const remainingMinutes = Math.round(item.remainingMs / 60000);
                const usedSourceTitles = await this.compManager.getAllUsedSourceTitles(item.category);

                // Quick check: count available fresh market_data_items
                const { count: freshItemCount } = await supabase
                    .from('market_data_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('category', item.category)
                    .eq('is_active', true);

                const availableFresh = (freshItemCount || 0);
                const usedCount = usedSourceTitles.size;

                if (availableFresh <= usedCount) {
                    this.logger.warn(`⚠️ [${item.category}] ETL data pool exhausted! ${availableFresh} total, ${usedCount} used. Fresh data ingestion needed.`);
                } else {
                    this.logger.debug(`🟢 [${item.category}] Pre-warm ready: ~${availableFresh - usedCount} fresh items available, ${remainingMinutes}min until [${item.horizon}] expires`);
                }
            }
        } catch (err: any) {
            this.logger.warn(`Pre-warming error: ${err.message}`);
        }
    }

    /**
     * Periodic cluster refresh — finds active competitions with zero or stale clusters
     * and binds fresh ETL data to them. Runs every 5 minutes to keep the UI alive.
     */
    /**
     * Retire any existing competitions with removed horizon tiers (3d, 5d, 7d).
     * Called once on startup after the horizon reduction to 4 tiers.
     */
    private async retireOldHorizons(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const removedHorizons = ['3d', '5d', '7d'];

            const { data: oldComps, error } = await supabase
                .from('competitions')
                .select('id, title, time_horizon')
                .in('status', ['active', 'upcoming'])
                .in('time_horizon', removedHorizons);

            if (error || !oldComps || oldComps.length === 0) {
                this.logger.log('✅ No legacy horizon competitions to retire');
                return;
            }

            const ids = oldComps.map(c => c.id);
            await supabase
                .from('competitions')
                .update({ status: 'cancelled' })
                .in('id', ids);

            this.logger.log(`🧹 Retired ${ids.length} competitions with removed horizons (3d/5d/7d)`);
        } catch (err: any) {
            this.logger.warn(`Failed to retire old horizon competitions: ${err.message}`);
        }
    }

    private async refreshMissingClusters(): Promise<void> {
        if (this.isRefreshingClusters) return;
        this.isRefreshingClusters = true;

        try {
            const supabase = this.supabaseService.getAdminClient();

            // Find active competitions WITH time_horizon for staleness check
            const { data: activeComps, error } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon')
                .in('status', ['active', 'upcoming']);

            if (error || !activeComps || activeComps.length === 0) return;

            let refreshed = 0;
            for (const comp of activeComps) {
                // Horizon-aware staleness — use the configured cluster refresh interval
                const horizon = comp.time_horizon || '24h';
                const refreshConfig = getRefreshConfig(horizon);
                const stalenessThreshold = new Date(Date.now() - refreshConfig.clusterRefreshIntervalMs).toISOString();

                const { count: clusterCount } = await supabase
                    .from('news_clusters')
                    .select('id', { count: 'exact', head: true })
                    .eq('competition_id', comp.id)
                    .gte('created_at', stalenessThreshold);

                if ((clusterCount || 0) > 0) continue;

                const category = comp.sector;
                if (!category) continue;

                const { data: latestItemsRaw } = await supabase
                    .from('market_data_items')
                    .select('title, description, url, sentiment_score, impact')
                    .eq('category', category)
                    .eq('is_active', true)
                    .order('published_at', { ascending: false })
                    .limit(20);

                const { data: latestSignalsRaw } = await supabase
                    .from('market_signals')
                    .select('title, signal_strength, sentiment')
                    .eq('category', category)
                    .eq('is_active', true)
                    .order('signal_strength', { ascending: false })
                    .limit(20);

                // Randomly pick 5 items to avoid making all competitions look identical
                const latestItems = latestItemsRaw ? latestItemsRaw.sort(() => 0.5 - Math.random()).slice(0, 5) : [];
                const latestSignals = latestSignalsRaw ? latestSignalsRaw.sort(() => 0.5 - Math.random()).slice(0, 5) : [];

                const articleUrls = (latestItems || []).map(i => i.url).filter(Boolean);
                const signals = [
                    ...(latestSignals || []).map(s => ({ 
                        title: s.title, 
                        strength: s.signal_strength || 0.5,
                        sentiment: s.sentiment || ((Math.random() * 0.4) - 0.2) // slight random fallback
                    })),
                    ...(latestItems || []).map(i => {
                        let itemSentiment = i.sentiment_score || 0;
                        if (i.sentiment_score === null || i.sentiment_score === undefined) {
                            if (i.impact === 'high') itemSentiment = 0.5 + (Math.random() * 0.3);
                            else if (i.impact === 'low') itemSentiment = -0.3 - (Math.random() * 0.3);
                            else itemSentiment = (Math.random() * 0.2) - 0.1; // neutral-ish
                        }
                        return { 
                            title: i.title, 
                            strength: 0.5, 
                            impact: i.impact,
                            sentiment: itemSentiment
                        };
                    }),
                ].sort(() => 0.5 - Math.random()).slice(0, 8);

                if (signals.length === 0) {
                    signals.push({ title: comp.title, strength: 0.5, sentiment: (Math.random() * 0.2) - 0.1, source: 'structural' } as any);
                }

                const crypto = await import('crypto');
                const clusterHash = crypto.createHash('sha256')
                    .update(comp.title + Date.now().toString())
                    .digest('hex');

                // Calculate dynamic sentiment from ACTUAL NLP signals
                let avgSentiment = 0;
                if (signals && signals.length > 0) {
                    const totalSentiment = (signals as any[]).reduce((sum, s) => sum + (s.sentiment || 0), 0);
                    avgSentiment = totalSentiment / signals.length;
                }

                const { error: insertErr } = await supabase.from('news_clusters').insert({
                    competition_id: comp.id,
                    cluster_hash: clusterHash,
                    article_urls: articleUrls,
                    signals: signals,
                    sentiment: avgSentiment,
                });

                if (!insertErr) {
                    refreshed++;
                    this.logger.debug(`🔄 Refreshed cluster for [${category}/${horizon}] "${comp.title.substring(0, 40)}..."`);
                }
            }

            if (refreshed > 0) {
                this.logger.log(`🔄 Refreshed clusters for ${refreshed} competitions`);
            }
        } catch (err: any) {
            this.logger.warn(`Cluster refresh error: ${err.message}`);
        } finally {
            this.isRefreshingClusters = false;
        }
    }
}

