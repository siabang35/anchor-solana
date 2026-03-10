/**
 * Category Data Collector Service
 * 
 * Fetches ALL available data sources per category from Supabase
 * to produce a rich, multi-dimensional entropy snapshot for the CurveEngine.
 * 
 * Each category collects from:
 *   1. market_data_items (news, sentiment, titles)
 *   2. market_signals (strength, confidence, impact)
 *   3. trending_topics (trend scores, mention frequency)
 *   4. Category-specific tables (crypto_assets, finance_indicators, etc.)
 * 
 * The output is a unified CategoryDataSnapshot with numerical vectors
 * that feed into entropy, Bayesian priors, and chaotic perturbations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import * as crypto from 'crypto';

// ══════════════════════════════════════════
// Interfaces
// ══════════════════════════════════════════

export interface CategoryDataSnapshot {
    /** Raw entropy string (hash of all data concatenated) */
    entropySource: string;

    /** Multiple sentiment scores from different sources [-1, 1] */
    sentimentVector: number[];

    /** Volume/engagement metrics (normalized 0-1) */
    volumeVector: number[];

    /** Rate-of-change metrics (can be negative) */
    velocityVector: number[];

    /** Cross-metric correlations (flattened upper triangle) */
    correlationCoeffs: number[];

    /** Category-specific numerical features */
    categoryFeatures: Record<string, number>;

    /** Number of distinct data sources that contributed */
    sourceCount: number;

    /** Data freshness 0-1 (1 = very recent) */
    freshness: number;

    /** Entropy pool — pre-hashed numbers [0,1] for direct consumption */
    entropyPool: number[];

    /** Timestamp of collection */
    collectedAt: Date;
}

// ══════════════════════════════════════════
// Service
// ══════════════════════════════════════════

@Injectable()
export class CategoryDataCollectorService {
    private readonly logger = new Logger(CategoryDataCollectorService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Collect ALL available data for a category and produce a unified snapshot
     */
    async collect(category: string): Promise<CategoryDataSnapshot> {
        const supabase = this.supabaseService.getAdminClient();
        const snapshot: CategoryDataSnapshot = {
            entropySource: '',
            sentimentVector: [],
            volumeVector: [],
            velocityVector: [],
            correlationCoeffs: [],
            categoryFeatures: {},
            sourceCount: 0,
            freshness: 0,
            entropyPool: [],
            collectedAt: new Date(),
        };

        const entropyParts: string[] = [];
        let sources = 0;

        try {
            // ═══════════════════════════════════════
            // 1. UNIVERSAL: market_data_items
            // ═══════════════════════════════════════
            const { data: items } = await supabase
                .from('market_data_items')
                .select('title, published_at, sentiment_score, sentiment, impact, relevance_score, source, tags')
                .eq('category', category)
                .eq('is_active', true)
                .order('published_at', { ascending: false })
                .limit(30);

            if (items && items.length > 0) {
                sources++;
                // Extract sentiment vector
                for (const item of items) {
                    if (item.sentiment_score != null) {
                        snapshot.sentimentVector.push(item.sentiment_score);
                    } else {
                        // Map string sentiment to numeric
                        const sentMap: Record<string, number> = { bullish: 0.5, neutral: 0, bearish: -0.5 };
                        snapshot.sentimentVector.push(sentMap[item.sentiment] ?? 0);
                    }
                    snapshot.volumeVector.push(item.relevance_score ?? 0.5);
                }

                // Compute velocity: time gaps between items
                for (let i = 1; i < Math.min(items.length, 10); i++) {
                    const t1 = new Date(items[i - 1].published_at).getTime();
                    const t0 = new Date(items[i].published_at).getTime();
                    const gapHours = Math.max(0.01, (t1 - t0) / 3600000);
                    snapshot.velocityVector.push(1 / gapHours); // Higher = faster flow
                }

                // Impact distribution as features
                const impactCounts = { low: 0, medium: 0, high: 0, critical: 0 };
                for (const item of items) {
                    if (item.impact && impactCounts.hasOwnProperty(item.impact)) {
                        impactCounts[item.impact as keyof typeof impactCounts]++;
                    }
                }
                snapshot.categoryFeatures['impact_high_ratio'] = (impactCounts.high + impactCounts.critical) / items.length;
                snapshot.categoryFeatures['impact_entropy'] = this.shannonEntropy(Object.values(impactCounts));

                // Source diversity
                const uniqueSources = new Set(items.map(i => i.source));
                snapshot.categoryFeatures['source_diversity'] = uniqueSources.size / Math.max(1, items.length);

                // Freshness: how recent is the newest item?
                const newestMs = new Date(items[0].published_at).getTime();
                const ageHours = (Date.now() - newestMs) / 3600000;
                snapshot.freshness = Math.max(0, 1 - ageHours / 24); // 1.0 = this hour, 0.0 = 24h+ old

                // Entropy from titles
                entropyParts.push(items.map(i => `${i.title}:${i.published_at}:${i.sentiment_score || 0}`).join('|'));
            }

            // ═══════════════════════════════════════
            // 2. UNIVERSAL: market_signals
            // ═══════════════════════════════════════
            const { data: signals } = await supabase
                .from('market_signals')
                .select('signal_strength, confidence_score, impact, sentiment, category')
                .eq('category', category)
                .eq('is_active', true)
                .gte('detected_at', new Date(Date.now() - 24 * 3600000).toISOString())
                .order('signal_strength', { ascending: false })
                .limit(20);

            if (signals && signals.length > 0) {
                sources++;
                for (const sig of signals) {
                    snapshot.volumeVector.push(sig.signal_strength ?? 0.5);
                    snapshot.sentimentVector.push(
                        sig.sentiment === 'bullish' ? 0.5 : sig.sentiment === 'bearish' ? -0.5 : 0
                    );
                }
                snapshot.categoryFeatures['avg_signal_strength'] =
                    signals.reduce((s, x) => s + (x.signal_strength ?? 0), 0) / signals.length;
                snapshot.categoryFeatures['avg_signal_confidence'] =
                    signals.reduce((s, x) => s + (x.confidence_score ?? 0), 0) / signals.length;

                entropyParts.push(signals.map(s => `${s.signal_strength}:${s.confidence_score}:${s.impact}`).join('|'));
            }

            // ═══════════════════════════════════════
            // 3. UNIVERSAL: trending_topics
            // ═══════════════════════════════════════
            const { data: trends } = await supabase
                .from('trending_topics')
                .select('normalized_topic, trend_score, mention_count')
                .eq('is_active', true)
                .containedBy('categories', [category])
                .order('trend_score', { ascending: false })
                .limit(15);

            if (trends && trends.length > 0) {
                sources++;
                snapshot.categoryFeatures['top_trend_score'] = trends[0].trend_score ?? 0;
                snapshot.categoryFeatures['trend_count'] = trends.length;
                snapshot.categoryFeatures['avg_mentions'] =
                    trends.reduce((s, t) => s + (t.mention_count ?? 0), 0) / trends.length;

                entropyParts.push(trends.map(t => `${t.normalized_topic}:${t.trend_score}`).join('|'));
            }

            // ═══════════════════════════════════════
            // 4. CATEGORY-SPECIFIC TABLES
            // ═══════════════════════════════════════
            switch (category) {
                case 'crypto':
                    await this.collectCrypto(supabase, snapshot, entropyParts);
                    sources += 2; // crypto_assets + fear_greed
                    break;
                case 'finance':
                    await this.collectFinance(supabase, snapshot, entropyParts);
                    sources += 1; // finance_indicators
                    break;
                case 'economy':
                    await this.collectEconomy(supabase, snapshot, entropyParts);
                    sources += 1; // finance_indicators (multi-source)
                    break;
                case 'politics':
                    await this.collectPolitics(supabase, snapshot, entropyParts);
                    sources += 1; // politics_entities + news_items
                    break;
                case 'science':
                    await this.collectScience(supabase, snapshot, entropyParts);
                    sources += 1; // science_papers
                    break;
                case 'tech':
                    await this.collectTech(supabase, snapshot, entropyParts);
                    sources += 1; // tech_hn_stories
                    break;
                case 'sports':
                    await this.collectSports(supabase, snapshot, entropyParts);
                    sources += 1; // sports_events
                    break;
            }
        } catch (err: any) {
            this.logger.warn(`Data collection error for ${category}: ${err.message}`);
        }

        // ═══════════════════════════════════════
        // FINALIZE: Compute correlations & entropy pool
        // ═══════════════════════════════════════
        snapshot.sourceCount = sources;
        snapshot.entropySource = entropyParts.join('|||');

        // Compute cross-metric correlations
        if (snapshot.sentimentVector.length >= 3 && snapshot.volumeVector.length >= 3) {
            const minLen = Math.min(snapshot.sentimentVector.length, snapshot.volumeVector.length, 10);
            const sv = snapshot.sentimentVector.slice(0, minLen);
            const vv = snapshot.volumeVector.slice(0, minLen);
            snapshot.correlationCoeffs.push(this.pearsonCorrelation(sv, vv));
        }
        if (snapshot.velocityVector.length >= 3 && snapshot.sentimentVector.length >= 3) {
            const minLen = Math.min(snapshot.velocityVector.length, snapshot.sentimentVector.length, 10);
            const vel = snapshot.velocityVector.slice(0, minLen);
            const sv = snapshot.sentimentVector.slice(0, minLen);
            snapshot.correlationCoeffs.push(this.pearsonCorrelation(vel, sv));
        }

        // Generate entropy pool from ALL collected data
        const fullEntropy =
            snapshot.entropySource +
            JSON.stringify(snapshot.categoryFeatures) +
            snapshot.sentimentVector.join(',') +
            snapshot.volumeVector.join(',') +
            snapshot.velocityVector.join(',') +
            Date.now().toString();

        snapshot.entropyPool = this.hashToNumbers(fullEntropy, 64);

        return snapshot;
    }

    // ══════════════════════════════════════════
    // Category-Specific Collectors
    // ══════════════════════════════════════════

    private async collectCrypto(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        // Crypto Assets (prices, volume, market cap)
        try {
            const { data: assets } = await supabase
                .from('crypto_assets')
                .select('symbol, price_usd, price_change_24h, price_change_7d, volume_24h, market_cap, market_cap_rank')
                .eq('is_featured', true)
                .eq('is_active', true)
                .order('market_cap_rank', { ascending: true })
                .limit(10);

            if (assets && assets.length > 0) {
                // Price changes as sentiment proxy
                for (const asset of assets) {
                    snapshot.sentimentVector.push((asset.price_change_24h ?? 0) / 100);
                    snapshot.volumeVector.push(Math.min(1, (asset.volume_24h ?? 0) / 1e10));
                    snapshot.velocityVector.push((asset.price_change_24h ?? 0) - (asset.price_change_7d ?? 0) / 7);
                }

                // Features
                const avgChange = assets.reduce((s: number, a: any) => s + (a.price_change_24h ?? 0), 0) / assets.length;
                const totalVolume = assets.reduce((s: number, a: any) => s + (a.volume_24h ?? 0), 0);
                const totalMcap = assets.reduce((s: number, a: any) => s + (a.market_cap ?? 0), 0);

                snapshot.categoryFeatures['crypto_avg_change_24h'] = avgChange;
                snapshot.categoryFeatures['crypto_total_volume'] = Math.log10(Math.max(1, totalVolume));
                snapshot.categoryFeatures['crypto_total_mcap_log'] = Math.log10(Math.max(1, totalMcap));
                snapshot.categoryFeatures['crypto_vol_mcap_ratio'] = totalVolume / Math.max(1, totalMcap);
                snapshot.categoryFeatures['crypto_dispersion'] = this.stddev(assets.map((a: any) => a.price_change_24h ?? 0));

                entropyParts.push(assets.map((a: any) =>
                    `${a.symbol}:${a.price_usd}:${a.price_change_24h}:${a.volume_24h}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`crypto_assets collection failed: ${e.message}`);
        }

        // Fear & Greed Index
        try {
            const { data: fg } = await supabase
                .from('crypto_fear_greed')
                .select('value, value_classification, timestamp')
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();

            if (fg) {
                snapshot.categoryFeatures['crypto_fear_greed'] = fg.value / 100; // Normalize 0-1
                snapshot.categoryFeatures['crypto_fg_classification'] =
                    fg.value_classification === 'Extreme Greed' ? 1.0 :
                    fg.value_classification === 'Greed' ? 0.75 :
                    fg.value_classification === 'Fear' ? 0.25 :
                    fg.value_classification === 'Extreme Fear' ? 0.0 : 0.5;

                entropyParts.push(`fg:${fg.value}:${fg.value_classification}:${fg.timestamp}`);
            }
        } catch (e: any) {
            this.logger.debug(`crypto_fear_greed collection failed: ${e.message}`);
        }
    }

    private async collectFinance(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        try {
            const { data: indicators } = await supabase
                .from('finance_indicators')
                .select('indicator_type, name, current_value, value_date, source, unit')
                .eq('country', 'US')
                .order('value_date', { ascending: false })
                .limit(20);

            if (indicators && indicators.length > 0) {
                // Group by indicator type
                const byType: Record<string, any[]> = {};
                for (const ind of indicators) {
                    if (!byType[ind.indicator_type]) byType[ind.indicator_type] = [];
                    byType[ind.indicator_type].push(ind);
                }

                for (const [type, values] of Object.entries(byType)) {
                    const latest = values[0];
                    const val = parseFloat(latest.current_value) || 0;
                    snapshot.categoryFeatures[`finance_${type}`] = val;

                    // Compute velocity if multiple data points
                    if (values.length >= 2) {
                        const prev = parseFloat(values[1].current_value) || 0;
                        if (prev !== 0) {
                            snapshot.velocityVector.push((val - prev) / Math.abs(prev));
                        }
                    }
                }

                const sourceDiversity = new Set(indicators.map((i: any) => i.source));
                snapshot.categoryFeatures['finance_source_count'] = sourceDiversity.size;

                entropyParts.push(indicators.map((i: any) =>
                    `${i.indicator_type}:${i.current_value}:${i.value_date}:${i.source}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`finance_indicators collection failed: ${e.message}`);
        }
    }

    private async collectEconomy(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        // Economy uses the same finance_indicators but from multiple international sources
        try {
            const { data: indicators } = await supabase
                .from('finance_indicators')
                .select('indicator_type, name, current_value, value_date, source, country, unit')
                .order('value_date', { ascending: false })
                .limit(30);

            if (indicators && indicators.length > 0) {
                // Cross-country diversity
                const countries = new Set(indicators.map((i: any) => i.country));
                const sources = new Set(indicators.map((i: any) => i.source));
                snapshot.categoryFeatures['economy_country_count'] = countries.size;
                snapshot.categoryFeatures['economy_source_count'] = sources.size;

                // Compute average indicator values by source
                const bySource: Record<string, number[]> = {};
                for (const ind of indicators) {
                    const val = parseFloat(ind.current_value) || 0;
                    if (!bySource[ind.source]) bySource[ind.source] = [];
                    bySource[ind.source].push(val);
                }

                for (const [src, vals] of Object.entries(bySource)) {
                    snapshot.categoryFeatures[`economy_${src}_avg`] = vals.reduce((a, b) => a + b, 0) / vals.length;
                }

                entropyParts.push(indicators.map((i: any) =>
                    `${i.source}:${i.indicator_type}:${i.current_value}:${i.country}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`economy indicators collection failed: ${e.message}`);
        }
    }

    private async collectPolitics(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        try {
            // Politics entities — most-mentioned entities
            const { data: entities } = await supabase
                .from('politics_entities')
                .select('name, entity_type')
                .limit(20);

            if (entities && entities.length > 0) {
                const typeCount: Record<string, number> = {};
                for (const e of entities) {
                    typeCount[e.entity_type] = (typeCount[e.entity_type] || 0) + 1;
                }
                snapshot.categoryFeatures['politics_entity_count'] = entities.length;
                snapshot.categoryFeatures['politics_politician_ratio'] =
                    (typeCount['politician'] || 0) / entities.length;
                snapshot.categoryFeatures['politics_entity_diversity'] =
                    this.shannonEntropy(Object.values(typeCount));

                entropyParts.push(entities.map((e: any) => `${e.name}:${e.entity_type}`).join('|'));
            }

            // Political significance distribution from politics_news_items
            const { data: newsItems } = await supabase
                .from('politics_news_items')
                .select('political_significance, entity_ids')
                .order('created_at', { ascending: false })
                .limit(20);

            if (newsItems && newsItems.length > 0) {
                const sigCounts: Record<string, number> = {};
                let totalEntityRefs = 0;
                for (const ni of newsItems) {
                    sigCounts[ni.political_significance] = (sigCounts[ni.political_significance] || 0) + 1;
                    totalEntityRefs += (ni.entity_ids?.length || 0);
                }
                snapshot.categoryFeatures['politics_high_significance_ratio'] =
                    ((sigCounts['high'] || 0) + (sigCounts['critical'] || 0)) / newsItems.length;
                snapshot.categoryFeatures['politics_avg_entity_refs'] = totalEntityRefs / newsItems.length;
            }
        } catch (e: any) {
            this.logger.debug(`politics collection failed: ${e.message}`);
        }
    }

    private async collectScience(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        try {
            const { data: papers } = await supabase
                .from('science_papers')
                .select('title, citation_count, reference_count, is_open_access, fields_of_study, source, published_date')
                .order('published_date', { ascending: false })
                .limit(20);

            if (papers && papers.length > 0) {
                // Citation velocity
                const citationCounts = papers.map((p: any) => p.citation_count ?? 0);
                snapshot.categoryFeatures['science_avg_citations'] =
                    citationCounts.reduce((a: number, b: number) => a + b, 0) / papers.length;
                snapshot.categoryFeatures['science_max_citations'] = Math.max(...citationCounts);
                snapshot.categoryFeatures['science_citation_dispersion'] = this.stddev(citationCounts);

                // Reference network density
                const refCounts = papers.map((p: any) => p.reference_count ?? 0);
                snapshot.categoryFeatures['science_avg_references'] =
                    refCounts.reduce((a: number, b: number) => a + b, 0) / papers.length;

                // Open access ratio
                const oaCount = papers.filter((p: any) => p.is_open_access).length;
                snapshot.categoryFeatures['science_oa_ratio'] = oaCount / papers.length;

                // Field diversity
                const allFields = new Set<string>();
                for (const p of papers) {
                    for (const f of p.fields_of_study || []) {
                        allFields.add(f);
                    }
                }
                snapshot.categoryFeatures['science_field_diversity'] = allFields.size;

                // Source diversity (semantic_scholar vs arxiv)
                const srcCount: Record<string, number> = {};
                for (const p of papers) {
                    srcCount[p.source] = (srcCount[p.source] || 0) + 1;
                }
                snapshot.categoryFeatures['science_source_balance'] =
                    this.shannonEntropy(Object.values(srcCount));

                // Use citations as volume proxy
                for (const p of papers) {
                    snapshot.volumeVector.push(Math.min(1, (p.citation_count ?? 0) / 500));
                }

                entropyParts.push(papers.map((p: any) =>
                    `${p.title}:${p.citation_count}:${p.reference_count}:${p.source}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`science_papers collection failed: ${e.message}`);
        }
    }

    private async collectTech(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        try {
            const { data: stories } = await supabase
                .from('tech_hn_stories')
                .select('hn_id, title, score, descendants, story_type, published_at')
                .order('published_at', { ascending: false })
                .limit(20);

            if (stories && stories.length > 0) {
                const scores = stories.map((s: any) => s.score ?? 0);
                const comments = stories.map((s: any) => s.descendants ?? 0);

                snapshot.categoryFeatures['tech_avg_score'] =
                    scores.reduce((a: number, b: number) => a + b, 0) / stories.length;
                snapshot.categoryFeatures['tech_max_score'] = Math.max(...scores);
                snapshot.categoryFeatures['tech_score_dispersion'] = this.stddev(scores);
                snapshot.categoryFeatures['tech_avg_comments'] =
                    comments.reduce((a: number, b: number) => a + b, 0) / stories.length;
                snapshot.categoryFeatures['tech_engagement_ratio'] =
                    comments.reduce((a: number, b: number) => a + b, 0) /
                    Math.max(1, scores.reduce((a: number, b: number) => a + b, 0));

                // Story type distribution
                const typeCounts: Record<string, number> = {};
                for (const s of stories) {
                    typeCounts[s.story_type || 'story'] = (typeCounts[s.story_type || 'story'] || 0) + 1;
                }
                snapshot.categoryFeatures['tech_type_diversity'] =
                    this.shannonEntropy(Object.values(typeCounts));

                // HN scores as volume proxy
                for (const s of stories) {
                    snapshot.volumeVector.push(Math.min(1, (s.score ?? 0) / 500));
                }

                entropyParts.push(stories.map((s: any) =>
                    `${s.hn_id}:${s.score}:${s.descendants}:${s.title}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`tech_hn_stories collection failed: ${e.message}`);
        }
    }

    private async collectSports(supabase: any, snapshot: CategoryDataSnapshot, entropyParts: string[]) {
        try {
            const { data: events } = await supabase
                .from('sports_events')
                .select('name, sport, status, start_time, home_score, away_score, is_featured')
                .in('status', ['scheduled', 'live', 'finished'])
                .order('start_time', { ascending: false })
                .limit(20);

            if (events && events.length > 0) {
                const liveCount = events.filter((e: any) => e.status === 'live').length;
                const featuredCount = events.filter((e: any) => e.is_featured).length;
                const finishedCount = events.filter((e: any) => e.status === 'finished').length;

                snapshot.categoryFeatures['sports_live_ratio'] = liveCount / events.length;
                snapshot.categoryFeatures['sports_featured_ratio'] = featuredCount / events.length;
                snapshot.categoryFeatures['sports_finished_ratio'] = finishedCount / events.length;
                snapshot.categoryFeatures['sports_event_count'] = events.length;

                // Score differential for finished/live games
                const scoreDiffs: number[] = [];
                for (const e of events) {
                    if (e.home_score != null && e.away_score != null) {
                        scoreDiffs.push(e.home_score - e.away_score);
                    }
                }
                if (scoreDiffs.length > 0) {
                    snapshot.categoryFeatures['sports_avg_score_diff'] =
                        scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length;
                    snapshot.categoryFeatures['sports_score_dispersion'] = this.stddev(scoreDiffs);
                }

                // Sport diversity
                const sports = new Set(events.map((e: any) => e.sport));
                snapshot.categoryFeatures['sports_diversity'] = sports.size;

                entropyParts.push(events.map((e: any) =>
                    `${e.name}:${e.status}:${e.home_score ?? '-'}:${e.away_score ?? '-'}:${e.start_time}`
                ).join('|'));
            }
        } catch (e: any) {
            this.logger.debug(`sports_events collection failed: ${e.message}`);
        }
    }

    // ══════════════════════════════════════════
    // Mathematical Utilities
    // ══════════════════════════════════════════

    /** Shannon entropy of a distribution (higher = more diverse) */
    private shannonEntropy(counts: number[]): number {
        const total = counts.reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        let entropy = 0;
        for (const c of counts) {
            if (c > 0) {
                const p = c / total;
                entropy -= p * Math.log2(p);
            }
        }
        return entropy;
    }

    /** Standard deviation */
    private stddev(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    /** Pearson correlation coefficient between two vectors */
    private pearsonCorrelation(x: number[], y: number[]): number {
        const n = Math.min(x.length, y.length);
        if (n < 2) return 0;

        const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

        let num = 0, dx = 0, dy = 0;
        for (let i = 0; i < n; i++) {
            const xi = x[i] - mx;
            const yi = y[i] - my;
            num += xi * yi;
            dx += xi * xi;
            dy += yi * yi;
        }

        const denom = Math.sqrt(dx * dy);
        if (denom === 0) return 0;
        return Math.max(-1, Math.min(1, num / denom));
    }

    /** Convert a string into N numbers in [0, 1] via SHA-256 chaining */
    private hashToNumbers(input: string, count: number): number[] {
        const numbers: number[] = [];
        let current = input;

        for (let i = 0; i < Math.ceil(count / 8); i++) {
            const hash = crypto.createHash('sha256').update(current + i.toString()).digest('hex');
            for (let j = 0; j < 8 && numbers.length < count; j++) {
                const hexByte = hash.slice(j * 8, (j + 1) * 8);
                numbers.push(parseInt(hexByte, 16) / 0xFFFFFFFF);
            }
            current = hash;
        }

        return numbers;
    }
}
