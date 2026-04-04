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

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../database/supabase.service.js';
import { CompetitionManagerService, HORIZON_TIERS, getRefreshConfig, type HorizonTier } from './competition-manager.service.js';
import { computeTfIdf, kMeansClustering } from '../../../common/utils/clustering.util.js';

/** How many unique competitions to maintain PER CATEGORY (one per horizon tier) */
const TARGET_COMPETITIONS_PER_CATEGORY = 4;

/** All categories to scan for ETL data */
const CATEGORIES = ['politics', 'finance', 'crypto', 'tech', 'economy', 'science', 'sports'] as const;

/**
 * All 4 valid horizon tiers (max 1 Day) — one competition per tier per category.
 */
const COMPETITION_HORIZON_SLOTS: HorizonTier[] = ['2h', '7h', '12h', '24h'];

/** Intra-cluster Jaccard threshold — raised from 0.40 to 0.55 to allow more diversity */
const INTRA_CLUSTER_JACCARD_THRESHOLD = 0.55;

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
}

@Injectable()
export class RealtimeCompetitionSeederService {
    private readonly logger = new Logger(RealtimeCompetitionSeederService.name);
    private isSeeding = false;
    private isRefreshingClusters = false;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly compManager: CompetitionManagerService,
    ) {}

    async onModuleInit() {
        this.logger.log(`🌱 RealtimeCompetitionSeeder initialized — ${TARGET_COMPETITIONS_PER_CATEGORY} comps per category (max 1Day)`);
        setTimeout(async () => {
            await this.retireOldHorizons();
            await this.compManager.cleanupExistingDuplicates();
            await this.seedAllCategories();
            await this.refreshMissingClusters();
        }, 5000);
    }

    @Cron('*/10 * * * *')
    async handleCron() {
        await this.seedAllCategories();
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async settleExpired() {
        await this.settleExpiredCompetitions();
    }

    /**
     * Every 5 minutes, bind fresh cluster data to active competitions that have
     * zero or stale (>10 min old) clusters. Ensures the UI always has data.
     */
    @Cron('*/5 * * * *')
    async handleClusterRefresh() {
        await this.refreshMissingClusters();
    }

    async seedAllCategories(): Promise<void> {
        if (this.isSeeding) return;
        this.isSeeding = true;

        try {
            for (const category of CATEGORIES) {
                await this.seedCategory(category);
            }
        } catch (err: any) {
            this.logger.error(`Global seeding error: ${err.message}`);
        } finally {
            this.isSeeding = false;
        }
    }

    private async seedCategory(category: string): Promise<void> {
        // 1. Check existing active/upcoming comps for this category
        const supabase = this.supabaseService.getAdminClient();
        const { count, error } = await supabase
            .from('competitions')
            .select('id', { count: 'exact', head: true })
            .eq('sector', category)
            .in('status', ['active', 'upcoming']);

        if (error) {
            this.logger.error(`Error counting competitions for ${category}: ${error.message}`);
            return;
        }

        const existingCount = count || 0;
        const openSlotCount = TARGET_COMPETITIONS_PER_CATEGORY - existingCount;

        if (openSlotCount <= 0) return;

        this.logger.log(`🌱 [${category}] ${openSlotCount} open competition slot(s). clustering...`);

        // 2. Get existing fingerprints and horizons for this category
        const existingFingerprints = await this.compManager.getActiveFingerprints(category);
        const usedHorizons = await this.getUsedHorizons(category);

        const allCandidates: ETLCandidate[] = [];
        await this.collectCategoryETL(supabase, category, allCandidates);

        if (allCandidates.length === 0) {
            this.logger.debug(`[${category}] No ETL data available`);
            return;
        }

        // Cluster the collected data into `openSlotCount` plus some buffer
        const clusteredTopics = this.clusterCandidates(allCandidates, openSlotCount + 3);

        // Sort by urgency to assign horizons
        clusteredTopics.sort((a, b) => b.urgencyScore - a.urgencyScore);

        let created = 0;
        for (const topic of clusteredTopics) {
            if (created >= openSlotCount) break;

            if (this.compManager.isTooSimilar(topic.title, existingFingerprints)) {
                this.logger.debug(`  ⏭ [${category}] Skipping similar: "${topic.title.substring(0, 60)}..."`);
                continue;
            }

            const horizon = this.assignHorizon(topic.urgencyScore, usedHorizons);
            if (!horizon) {
                this.logger.debug(`  ⏭ [${category}] No available horizon for: "${topic.title.substring(0, 60)}..."`);
                continue;
            }

            try {
                const comp = await this.compManager.createCompetition(
                    category,
                    topic.title,
                    topic.description,
                    horizon,
                    topic.baseProbability,
                );

                if (comp) {
                    usedHorizons.add(horizon);
                    existingFingerprints.add(topic.title.toLowerCase());
                    created++;
                    
                    // Automatically bind the clustered data so the UI isn't empty!
                    await this.insertInitialNewsCluster(comp.id, topic);
                }
            } catch (err: any) {
                if (!err.message?.includes('unique') && !err.message?.includes('duplicate')) {
                    this.logger.warn(`  ❌ [${category}] Failed: ${err.message}`);
                }
            }
        }
    }

    private async getUsedHorizons(category: string): Promise<Set<string>> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('competitions')
            .select('time_horizon')
            .eq('sector', category)
            .in('status', ['active', 'upcoming']);

        if (error) return new Set();
        return new Set((data || []).map(c => c.time_horizon).filter(Boolean));
    }

    private assignHorizon(urgencyScore: number, usedHorizons: Set<string>): HorizonTier | null {
        // Urgency bands mapped to 4 horizon tiers (max 1 Day)
        let preferredHorizons: HorizonTier[];
        if (urgencyScore >= 0.75) {
            preferredHorizons = ['2h', '7h'];       // Very urgent → short horizons
        } else if (urgencyScore >= 0.50) {
            preferredHorizons = ['7h', '12h'];       // Medium-high urgency
        } else if (urgencyScore >= 0.25) {
            preferredHorizons = ['12h', '24h'];      // Medium urgency
        } else {
            preferredHorizons = ['24h'];             // Long-term → max 1 day
        }

        // Try preferred horizons first
        for (const h of preferredHorizons) {
            if (!usedHorizons.has(h)) return h;
        }

        // Fallback: try ALL valid horizon tiers
        for (const h of HORIZON_TIERS) {
            if (!usedHorizons.has(h)) return h;
        }

        return null;
    }

    private async collectCategoryETL(supabase: any, category: string, allCandidates: ETLCandidate[]): Promise<void> {
        // 1. Market signals — increased limit from 15 to 25 for better diversity
        const { data: signals } = await supabase
            .from('market_signals')
            .select('title, description, signal_strength, sentiment, confidence_score')
            .eq('category', category)
            .eq('is_active', true)
            .order('signal_strength', { ascending: false })
            .limit(25);

        if (signals) {
            for (const sig of signals) {
                if (!sig.title) continue;
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
                });
            }
        }

        // 2. Market data items — increased limit from 15 to 25 for better diversity
        const { data: marketItems } = await supabase
            .from('market_data_items')
            .select('title, description, sentiment_score, impact, source_name, relevance_score, url')
            .eq('category', category)
            .eq('is_active', true)
            .in('impact', ['high', 'critical', 'medium'])
            .order('published_at', { ascending: false })
            .limit(25);

        if (marketItems) {
            for (const item of marketItems) {
                if (!item.title) continue;
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
                });
            }
        }

        // 2b. If category is 'sports', also fetch from sports_events with proper status + team names
        if (category === 'sports') {
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
                        });
                    }
                }
            }
        }

        // 3. Trending topics — FIXED: filter by category using `categories` overlap
        //    Increased limit from 8 to 15 for better diversity
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
                });
            }
        }

        // 4. SCIENCE FALLBACK: Query science_papers and science_breakthroughs directly
        //    when the standard ETL tables have insufficient data
        if (category === 'science' && allCandidates.length < 5) {
            this.logger.debug(`[science] Only ${allCandidates.length} candidates from main ETL, querying science_papers...`);

            const { data: papers } = await supabase
                .from('science_papers')
                .select('title, abstract, tldr, citation_count, venue, fields_of_study, paper_url, first_author')
                .eq('is_active', true)
                .order('citation_count', { ascending: false })
                .limit(20);

            if (papers) {
                for (const paper of papers) {
                    if (!paper.title) continue;
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
                    });
                }
                this.logger.log(`[science] Added ${papers.length} papers from science_papers fallback`);
            }

            // Also try science_breakthroughs
            const { data: breakthroughs } = await supabase
                .from('science_breakthroughs')
                .select('title, description, summary, field, impact_level, source_url')
                .eq('is_active', true)
                .order('announcement_date', { ascending: false })
                .limit(10);

            if (breakthroughs) {
                for (const bt of breakthroughs) {
                    if (!bt.title) continue;
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
                for (const item of historicalItems) {
                    if (!item.title) continue;
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
                }
                this.logger.log(`[${category}] Historical fallback yielded ${historicalItems.length} candidates`);
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
                        if (this.jaccardSimilarity(normalized, existing) > INTRA_CLUSTER_JACCARD_THRESHOLD) {
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

    private async settleExpiredCompetitions(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data: expired, error } = await supabase
                .from('competitions')
                .select('id, title, sector, time_horizon')
                .eq('status', 'active')
                .lt('competition_end', new Date().toISOString());

            if (error || !expired || expired.length === 0) return;

            for (const comp of expired) {
                await supabase
                    .from('competitions')
                    .update({ status: 'settled' })
                    .eq('id', comp.id);
            }

            await supabase
                .from('competitions')
                .update({ status: 'active' })
                .eq('status', 'upcoming')
                .lte('competition_start', new Date().toISOString())
                .gt('competition_end', new Date().toISOString());

        } catch (err: any) {
            this.logger.debug(`Settle check error: ${err.message}`);
        }
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
                ? topic.signals.map(s => ({ title: s?.title || topic.title, strength: s?.signal_strength || 0.5 }))
                : [{ title: topic.title, strength: 0.5, category: topic.category, source: 'etl-cluster' }];

            // Build article_urls — use real URLs if available, otherwise empty array (still valid)
            const articleUrls = topic.articleUrls.length > 0 ? topic.articleUrls : [];

            const sentimentValue = topic.baseProbability > 0.5 ? 1 : topic.baseProbability < 0.5 ? -1 : 0;

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

                const { data: latestItems } = await supabase
                    .from('market_data_items')
                    .select('title, description, url, sentiment_score, impact')
                    .eq('category', category)
                    .eq('is_active', true)
                    .order('published_at', { ascending: false })
                    .limit(5);

                const { data: latestSignals } = await supabase
                    .from('market_signals')
                    .select('title, signal_strength, sentiment')
                    .eq('category', category)
                    .eq('is_active', true)
                    .order('signal_strength', { ascending: false })
                    .limit(5);

                const articleUrls = (latestItems || []).map(i => i.url).filter(Boolean);
                const signals = [
                    ...(latestSignals || []).map(s => ({ title: s.title, strength: s.signal_strength || 0.5 })),
                    ...(latestItems || []).map(i => ({ title: i.title, strength: 0.5, impact: i.impact })),
                ].slice(0, 8);

                if (signals.length === 0) {
                    signals.push({ title: comp.title, strength: 0.5, source: 'structural' } as any);
                }

                const crypto = await import('crypto');
                const clusterHash = crypto.createHash('sha256')
                    .update(comp.title + Date.now().toString())
                    .digest('hex');

                const { error: insertErr } = await supabase.from('news_clusters').insert({
                    competition_id: comp.id,
                    cluster_hash: clusterHash,
                    article_urls: articleUrls,
                    signals: signals,
                    sentiment: 0,
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
