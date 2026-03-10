/**
 * Multi-Source Data Fusion Service
 * 
 * Fetches and fuses ALL available data sources per category into
 * a composite signal vector for the curve engine.
 * 
 * Each category queries its specific ETL-populated tables:
 *   sports   → sports_events, market_data_items, market_signals
 *   crypto   → crypto_assets, crypto_fear_greed, market_data_items, market_signals
 *   finance  → finance_indicators, market_data_items, market_signals
 *   politics → politics_entities, politics_news_items, market_data_items
 *   economy  → finance_indicators (WB/IMF/OECD), market_data_items, trending_topics
 *   tech     → tech_hn_stories, market_data_items, trending_topics
 *   science  → science_papers, market_data_items
 *   signals  → market_signals (all categories), trending_topics
 * 
 * Output: A normalized signal vector [-1, 1] per dimension + entropy bytes + source metadata
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import * as crypto from 'crypto';

export interface FusionResult {
    /** Normalized signal values [-1,1] for [home/yes/bull, draw/neutral, away/no/bear] */
    signalVector: [number, number, number];
    /** Raw entropy bytes derived from all source data combined */
    entropyPool: number[];
    /** Names of tables/sources that contributed data */
    sourceNames: string[];
    /** Number of individual data points fused */
    dataPointCount: number;
    /** SHA-256 fingerprint of all source data (for audit/integrity) */
    sourceFingerprint: string;
    /** Detailed source breakdown for logging */
    sourceBreakdown: Record<string, number>;
}

interface SourceCollector {
    ids: string[];
    rawValues: number[];
    sentiments: number[];
    texts: string[];
    sourceName: string;
    count: number;
}

@Injectable()
export class MultiSourceFusionService {
    private readonly logger = new Logger(MultiSourceFusionService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Fetch raw data collectors (with IDs and texts) before aggregation
     */
    async fetchRawCollectors(category: string, sourceFilters?: string[]): Promise<SourceCollector[]> {
        let collectors: SourceCollector[] = [];

        try {
            // 1. Always fetch market_data_items (universal source)
            const mdiCollector = await this.fetchMarketDataItems(category);
            if (mdiCollector.count > 0) collectors.push(mdiCollector);

            // 2. Always fetch market_signals
            const signalCollector = await this.fetchMarketSignals(category);
            if (signalCollector.count > 0) collectors.push(signalCollector);

            // 3. Always fetch trending_topics
            const trendCollector = await this.fetchTrendingTopics(category);
            if (trendCollector.count > 0) collectors.push(trendCollector);

            // 4. Category-specific sources
            switch (category) {
                case 'crypto':
                    const cryptoAssets = await this.fetchCryptoAssets();
                    if (cryptoAssets.count > 0) collectors.push(cryptoAssets);
                    const fearGreed = await this.fetchCryptoFearGreed();
                    if (fearGreed.count > 0) collectors.push(fearGreed);
                    break;

                case 'finance':
                    const finIndicators = await this.fetchFinanceIndicators();
                    if (finIndicators.count > 0) collectors.push(finIndicators);
                    break;

                case 'economy':
                    const econIndicators = await this.fetchEconomyIndicators();
                    if (econIndicators.count > 0) collectors.push(econIndicators);
                    break;

                case 'sports':
                    const sportsEvents = await this.fetchSportsEvents();
                    if (sportsEvents.count > 0) collectors.push(sportsEvents);
                    break;

                case 'tech':
                    const hnStories = await this.fetchTechHNStories();
                    if (hnStories.count > 0) collectors.push(hnStories);
                    break;

                case 'science':
                    const papers = await this.fetchSciencePapers();
                    if (papers.count > 0) collectors.push(papers);
                    break;

                case 'politics':
                    const politicsEntities = await this.fetchPoliticsData();
                    if (politicsEntities.count > 0) collectors.push(politicsEntities);
                    break;

                case 'signals':
                    // Cross-category signal aggregation
                    const crossSignals = await this.fetchCrossCategorySignals();
                    if (crossSignals.count > 0) collectors.push(crossSignals);
                    break;
            }

            // Apply source filtering if provided
            if (sourceFilters && sourceFilters.length > 0) {
                const filterSet = new Set(sourceFilters);
                collectors = collectors.map(c => {
                    const filteredCounts = c.ids.map((id, index) => ({ id, index })).filter(x => filterSet.has(x.id));
                    return {
                        ...c,
                        ids: filteredCounts.map(x => c.ids[x.index]),
                        rawValues: filteredCounts.map(x => c.rawValues[x.index]),
                        sentiments: filteredCounts.map(x => c.sentiments[x.index]),
                        texts: filteredCounts.map(x => c.texts[x.index]),
                        count: filteredCounts.length,
                    };
                }).filter(c => c.count > 0);
            }

        } catch (err: any) {
            this.logger.debug(`Fusion error for ${category}: ${err.message}`);
        }

        return collectors;
    }

    /**
     * Fuse all available data sources for a given category
     */
    async fuseSourcesForCategory(category: string, competitionId?: string, sourceFilters?: string[]): Promise<FusionResult> {
        const collectors = await this.fetchRawCollectors(category, sourceFilters);
        const allTexts: string[] = [];

        // Aggregate all collectors into final fusion result
        return this.aggregateCollectors(collectors, category);
    }

    // ══════════════════════════════════════════
    // Universal Sources
    // ══════════════════════════════════════════

    private async fetchMarketDataItems(category: string): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'market_data_items', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('market_data_items')
                .select('id, title, sentiment_score, relevance_score, confidence_score, impact, published_at')
                .eq('category', category)
                .eq('is_active', true)
                .order('published_at', { ascending: false })
                .limit(30);

            if (data) {
                for (const item of data) {
                    collector.ids.push(`mdi_${item.id}`);
                    collector.sentiments.push(item.sentiment_score || 0);
                    collector.rawValues.push(item.relevance_score || 0.5);
                    collector.rawValues.push(item.confidence_score || 0.5);
                    collector.rawValues.push(this.impactToNumber(item.impact));
                    collector.texts.push(`${item.title}:${item.published_at}:${item.sentiment_score}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchMarketSignals(category: string): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'market_signals', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('market_signals')
                .select('id, title, signal_strength, confidence_score, impact, sentiment, detected_at')
                .eq('category', category)
                .eq('is_active', true)
                .gte('detected_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
                .order('signal_strength', { ascending: false })
                .limit(20);

            if (data) {
                for (const sig of data) {
                    collector.ids.push(`msig_${sig.id || crypto.randomUUID()}`);
                    collector.rawValues.push(sig.signal_strength || 0.5);
                    collector.rawValues.push(sig.confidence_score || 0.5);
                    collector.rawValues.push(this.impactToNumber(sig.impact));
                    collector.sentiments.push(this.sentimentToNumber(sig.sentiment));
                    collector.texts.push(`${sig.title}:${sig.detected_at}:${sig.signal_strength}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchTrendingTopics(category: string): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'trending_topics', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('trending_topics')
                .select('topic, trend_score, mention_count, categories')
                .eq('is_active', true)
                .order('trend_score', { ascending: false })
                .limit(15);

            if (data) {
                for (const topic of data) {
                    const isRelevant = (topic.categories || []).includes(category);
                    collector.ids.push(`topic_${topic.topic}`);
                    collector.rawValues.push(topic.trend_score || 0);
                    collector.rawValues.push(isRelevant ? 1 : 0.3);
                    collector.rawValues.push(Math.min(1, (topic.mention_count || 0) / 50));
                    collector.texts.push(`${topic.topic}:${topic.trend_score}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    // ══════════════════════════════════════════
    // Category-Specific Sources
    // ══════════════════════════════════════════

    private async fetchCryptoAssets(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'crypto_assets', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('crypto_assets')
                .select('symbol, price_usd, price_change_24h, price_change_7d, volume_24h, market_cap, market_cap_rank')
                .eq('is_featured', true)
                .eq('is_active', true)
                .order('market_cap_rank', { ascending: true })
                .limit(10);

            if (data) {
                for (const asset of data) {
                    // Price momentum as signal
                    const change24h = (asset.price_change_24h || 0) / 100;
                    const change7d = (asset.price_change_7d || 0) / 100;
                    collector.ids.push(`crypto_${asset.symbol}`);
                    collector.rawValues.push(Math.tanh(change24h));
                    collector.rawValues.push(Math.tanh(change7d));
                    collector.rawValues.push(Math.min(1, (asset.volume_24h || 0) / 1e10));
                    collector.sentiments.push(change24h > 0.02 ? 0.5 : change24h < -0.02 ? -0.5 : 0);
                    collector.texts.push(`${asset.symbol}:${asset.price_usd}:${change24h}:${asset.volume_24h}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchCryptoFearGreed(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'crypto_fear_greed', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('crypto_fear_greed')
                .select('value, value_classification, timestamp')
                .order('timestamp', { ascending: false })
                .limit(5);

            if (data) {
                for (const fg of data) {
                    // Normalize 0-100 to -1 to 1 (50 = neutral)
                    const normalized = ((fg.value || 50) - 50) / 50;
                    collector.ids.push(`fg_${fg.timestamp}`);
                    collector.rawValues.push(normalized);
                    collector.sentiments.push(normalized);
                    collector.texts.push(`fg:${fg.value}:${fg.value_classification}:${fg.timestamp}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchFinanceIndicators(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'finance_indicators', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('finance_indicators')
                .select('indicator_type, name, current_value, previous_value, value_date, source')
                .order('value_date', { ascending: false })
                .limit(15);

            if (data) {
                for (const ind of data) {
                    const curr = parseFloat(ind.current_value) || 0;
                    const prev = parseFloat(ind.previous_value) || curr;
                    const delta = prev !== 0 ? (curr - prev) / Math.abs(prev) : 0;
                    collector.ids.push(`fin_${ind.indicator_type}_${ind.value_date}`);
                    collector.rawValues.push(Math.tanh(delta * 10));
                    collector.rawValues.push(curr > 0 ? Math.min(1, curr / 10) : 0);
                    collector.sentiments.push(delta > 0 ? 0.3 : delta < 0 ? -0.3 : 0);
                    collector.texts.push(`${ind.indicator_type}:${curr}:${ind.value_date}:${ind.source}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchEconomyIndicators(): Promise<SourceCollector> {
        // Economy uses the same finance_indicators table but filters differently
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'economy_indicators', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('finance_indicators')
                .select('indicator_type, name, current_value, previous_value, value_date, source, country')
                .in('source', ['worldbank', 'imf', 'oecd', 'fred', 'alpha_vantage'])
                .order('value_date', { ascending: false })
                .limit(20);

            if (data) {
                for (const ind of data) {
                    const curr = parseFloat(ind.current_value) || 0;
                    const prev = parseFloat(ind.previous_value) || curr;
                    const delta = prev !== 0 ? (curr - prev) / Math.abs(prev) : 0;
                    collector.ids.push(`eco_${ind.indicator_type}_${ind.country}_${ind.value_date}`);
                    collector.rawValues.push(Math.tanh(delta * 5));
                    collector.sentiments.push(delta > 0.01 ? 0.2 : delta < -0.01 ? -0.2 : 0);
                    collector.texts.push(`${ind.indicator_type}:${ind.country}:${curr}:${ind.source}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchSportsEvents(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'sports_events', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('sports_events')
                .select('name, sport, status, start_time, home_score, away_score, is_featured')
                .in('status', ['scheduled', 'live', 'completed'])
                .order('start_time', { ascending: false })
                .limit(20);

            if (data) {
                for (const event of data) {
                    const homeScore = event.home_score || 0;
                    const awayScore = event.away_score || 0;
                    const scoreDiff = homeScore - awayScore;
                    const isLive = event.status === 'live';
                    collector.ids.push(`sport_${event.name}_${event.start_time}`);
                    collector.rawValues.push(Math.tanh(scoreDiff / 3));
                    collector.rawValues.push(isLive ? 1 : 0.3);
                    collector.rawValues.push(event.is_featured ? 0.9 : 0.4);
                    collector.sentiments.push(scoreDiff > 0 ? 0.3 : scoreDiff < 0 ? -0.3 : 0);
                    collector.texts.push(`${event.name}:${event.sport}:${homeScore}-${awayScore}:${event.status}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchTechHNStories(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'tech_hn_stories', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('tech_hn_stories')
                .select('title, score, descendants, story_type, published_at')
                .order('published_at', { ascending: false })
                .limit(25);

            if (data) {
                for (const story of data) {
                    const scoreNorm = Math.min(1, (story.score || 0) / 500);
                    const commentNorm = Math.min(1, (story.descendants || 0) / 300);
                    collector.ids.push(`hn_${story.title}`); // don't have hn_id in this select? Actually lets just use title.
                    collector.rawValues.push(scoreNorm);
                    collector.rawValues.push(commentNorm);
                    // Score-to-comment ratio as engagement signal
                    const ratio = story.descendants > 0 ? (story.score || 0) / story.descendants : 0;
                    collector.rawValues.push(Math.min(1, ratio / 10));
                    collector.texts.push(`${story.title}:${story.score}:${story.descendants}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchSciencePapers(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'science_papers', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('science_papers')
                .select('title, citation_count, reference_count, is_open_access, fields_of_study, published_date')
                .order('published_date', { ascending: false })
                .limit(20);

            if (data) {
                for (const paper of data) {
                    const citationNorm = Math.min(1, (paper.citation_count || 0) / 200);
                    const refNorm = Math.min(1, (paper.reference_count || 0) / 100);
                    const oaNorm = paper.is_open_access ? 0.8 : 0.3;
                    collector.ids.push(`sci_${paper.title}`);
                    collector.rawValues.push(citationNorm);
                    collector.rawValues.push(refNorm);
                    collector.rawValues.push(oaNorm);
                    collector.texts.push(`${paper.title}:${paper.citation_count}:${paper.published_date}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchPoliticsData(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'politics_data', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            // Fetch politics news items with significance
            const { data } = await supabase
                .from('politics_news_items')
                .select('data_item_id, entity_ids, political_significance')
                .order('created_at', { ascending: false })
                .limit(15);

            if (data) {
                for (const item of data) {
                    const entityCount = (item.entity_ids || []).length;
                    const sigScore = item.political_significance === 'critical' ? 1 :
                        item.political_significance === 'high' ? 0.75 :
                        item.political_significance === 'medium' ? 0.5 : 0.25;
                    collector.ids.push(`pol_${item.data_item_id || crypto.randomUUID()}`);
                    collector.rawValues.push(sigScore);
                    collector.rawValues.push(Math.min(1, entityCount / 5));
                    collector.texts.push(`pol:${entityCount}:${item.political_significance}`);
                    collector.count++;
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    private async fetchCrossCategorySignals(): Promise<SourceCollector> {
        const collector: SourceCollector = { ids: [], rawValues: [], sentiments: [], texts: [], sourceName: 'cross_category', count: 0 };
        try {
            const supabase = this.supabaseService.getAdminClient();
            // Fetch high-impact signals from ALL categories for cross-correlation
            const { data } = await supabase
                .from('market_signals')
                .select('category, signal_strength, confidence_score, impact, sentiment')
                .eq('is_active', true)
                .in('impact', ['high', 'critical'])
                .gte('detected_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
                .order('signal_strength', { ascending: false })
                .limit(30);

            if (data) {
                // Group by category to detect cross-category divergence
                const catSentiments: Record<string, number[]> = {};
                for (const sig of data) {
                    const cat = sig.category || 'unknown';
                    if (!catSentiments[cat]) catSentiments[cat] = [];
                    catSentiments[cat].push(this.sentimentToNumber(sig.sentiment));
                    collector.ids.push(`cross_${cat}_${crypto.randomUUID()}`);
                    collector.rawValues.push(sig.signal_strength || 0.5);
                    collector.count++;
                }
                // Compute cross-category divergence
                const categories = Object.keys(catSentiments);
                for (let i = 0; i < categories.length; i++) {
                    for (let j = i + 0; j < categories.length; j++) {
                        if (i === j) continue;
                        const avgA = this.mean(catSentiments[categories[i]]);
                        const avgB = this.mean(catSentiments[categories[j]]);
                        const divergence = Math.abs(avgA - avgB);
                        collector.ids.push(`cross_div_${categories[i]}_${categories[j]}`);
                        collector.rawValues.push(divergence);
                        collector.texts.push(`div:${categories[i]}-${categories[j]}:${divergence.toFixed(3)}`);
                        collector.count++;
                    }
                }
            }
        } catch { /* non-critical */ }
        return collector;
    }

    // ══════════════════════════════════════════
    // Aggregation
    // ══════════════════════════════════════════

    private aggregateCollectors(collectors: SourceCollector[], category: string): FusionResult {
        if (collectors.length === 0) {
            return {
                signalVector: [0, 0, 0],
                entropyPool: this.generateFallbackEntropy(category),
                sourceNames: [],
                dataPointCount: 0,
                sourceFingerprint: crypto.createHash('sha256').update(`empty:${category}:${Date.now()}`).digest('hex'),
                sourceBreakdown: {},
            };
        }

        // Combine all text for entropy generation
        const allTexts: string[] = [];
        const allValues: number[] = [];
        const allSentiments: number[] = [];
        const sourceBreakdown: Record<string, number> = {};
        let totalPoints = 0;

        for (const c of collectors) {
            allTexts.push(...c.texts);
            allValues.push(...c.rawValues);
            allSentiments.push(...c.sentiments);
            sourceBreakdown[c.sourceName] = c.count;
            totalPoints += c.count;
        }

        // Generate deep entropy from all source texts combined
        const entropySource = allTexts.join('|') + `|${Date.now()}|${category}`;
        const entropyPool = this.hashToEntropyPool(entropySource, 40);

        // Compute signal vector using weighted sentiment + value aggregation
        const avgSentiment = allSentiments.length > 0 ? this.mean(allSentiments) : 0;
        const sentimentStd = allSentiments.length > 1 ? this.std(allSentiments) : 0.1;
        const avgValue = allValues.length > 0 ? this.mean(allValues) : 0.5;

        // Signal vector: [bullish/home, neutral/draw, bearish/away]
        // Use sentiment distribution to weight outcomes
        const bullSignal = Math.tanh(avgSentiment * 2 + avgValue - 0.5);
        const bearSignal = Math.tanh(-avgSentiment * 2 + (1 - avgValue) - 0.5);
        const neutralSignal = Math.tanh(1 - sentimentStd * 5); // High std = less neutral

        const signalVector: [number, number, number] = [
            Math.max(-1, Math.min(1, bullSignal)),
            Math.max(-1, Math.min(1, neutralSignal)),
            Math.max(-1, Math.min(1, bearSignal)),
        ];

        // Source fingerprint for integrity verification
        const sourceFingerprint = crypto.createHash('sha256')
            .update(entropySource)
            .digest('hex');

        return {
            signalVector,
            entropyPool,
            sourceNames: collectors.map(c => c.sourceName),
            dataPointCount: totalPoints,
            sourceFingerprint,
            sourceBreakdown,
        };
    }

    // ══════════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════════

    private impactToNumber(impact: string | null): number {
        switch (impact) {
            case 'critical': return 1.0;
            case 'high': return 0.75;
            case 'medium': return 0.5;
            case 'low': return 0.25;
            default: return 0.5;
        }
    }

    private sentimentToNumber(sentiment: string | null): number {
        switch (sentiment?.toLowerCase()) {
            case 'bullish': return 0.7;
            case 'bearish': return -0.7;
            case 'neutral': return 0;
            default: return 0;
        }
    }

    private mean(arr: number[]): number {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    private std(arr: number[]): number {
        if (arr.length < 2) return 0;
        const m = this.mean(arr);
        const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
        return Math.sqrt(variance);
    }

    private hashToEntropyPool(input: string, count: number): number[] {
        const numbers: number[] = [];
        let current = input;
        for (let i = 0; i < Math.ceil(count / 8); i++) {
            const hash = crypto.createHash('sha512').update(current + i.toString()).digest('hex');
            for (let j = 0; j < 16 && numbers.length < count; j++) {
                const hexChunk = hash.slice(j * 8, (j + 1) * 8);
                numbers.push(parseInt(hexChunk, 16) / 0xFFFFFFFF);
            }
            current = hash;
        }
        return numbers;
    }

    private generateFallbackEntropy(category: string): number[] {
        const seed = `fallback:${category}:${Date.now()}:${Math.random()}`;
        return this.hashToEntropyPool(seed, 20);
    }
}
