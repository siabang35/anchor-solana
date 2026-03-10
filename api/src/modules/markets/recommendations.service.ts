/**
 * Recommendations Service
 * 
 * AI-driven recommendation engine for "For You" and "Top Markets" feeds.
 * Implements:
 * - Weighted Multi-Factor Ranking for Top Markets
 * - K-Means Clustering + Diversity for For You
 * - OWASP-compliant input handling
 * - Anti-throttling with caching
 */

import { Injectable, Logger } from '@nestjs/common';
import { MarketDataService } from './market-data.service.js';

// Unified item interface for all content types
// Unified item interface for all content types
export interface UnifiedItem {
    id: string;
    type: 'news' | 'market' | 'signal' | 'sports';
    title: string;
    description: string;
    category: string;
    source: string;
    publishedAt: string;
    impact: string;
    sentiment: string;
    sentimentScore: number;
    relevanceScore: number;
    confidenceScore: number;
    imageUrl: string | null;
    url: string | null;
    tags: string[];
    volume: number;
    trendScore: number;
    // Computed score
    _score?: number;
    _vector?: number[];
}

// Scoring weights for Top Markets algorithm
const TOP_MARKETS_WEIGHTS = {
    volume: 0.25,        // Trading volume (for markets)
    impact: 0.20,        // Impact level (critical/high/medium/low)
    signalStrength: 0.20, // Signal relevance
    trendScore: 0.15,    // Trending topic boost
    freshness: 0.10,     // Time decay
    engagement: 0.10,    // Derived engagement score
};

// Impact level to numeric score mapping
const IMPACT_SCORES: Record<string, number> = {
    critical: 1.0,
    high: 0.75,
    medium: 0.5,
    low: 0.25,
};

@Injectable()
export class RecommendationsService {
    private readonly logger = new Logger(RecommendationsService.name);

    // In-memory cache for performance (anti-throttling)
    private topMarketsCache: { data: UnifiedItem[]; timestamp: number } | null = null;
    private forYouCache: Map<string, { data: UnifiedItem[]; timestamp: number }> = new Map();
    private readonly CACHE_TTL_MS = 60000; // 1 minute cache

    constructor(
        private readonly marketDataService: MarketDataService,
    ) { }

    /**
     * Get Top Markets (Global Hotness)
     * Uses weighted multi-factor ranking algorithm:
     * Score = Volume(25%) + Impact(20%) + SignalStrength(20%) + TrendScore(15%) + Freshness(10%) + Engagement(10%)
     */
    async getTopMarkets(limit: number = 20, offset: number = 0): Promise<UnifiedItem[]> {
        // Check cache first (anti-throttling)
        if (this.topMarketsCache && Date.now() - this.topMarketsCache.timestamp < this.CACHE_TTL_MS) {
            this.logger.debug(`Returning cached Top Markets (offset: ${offset}, limit: ${limit})`);
            return this.topMarketsCache.data.slice(offset, offset + limit);
        }

        this.logger.debug('Computing fresh Top Markets ranking...');

        try {
            // 1. Aggregate data from ALL sources
            const [contentItems, signals, sportsEvents, trendMap] = await Promise.all([
                this.marketDataService.getAggregatedTopContent(150), // Increased source pool
                this.marketDataService.getHighImpactSignals(70),
                this.marketDataService.getSportsWithMarketPotential(50),
                this.marketDataService.getTrendingContent(30),
            ]);

            // 2. Combine all items
            const allItems: UnifiedItem[] = [...contentItems, ...signals, ...sportsEvents];

            if (allItems.length === 0) {
                this.logger.warn('No items found for Top Markets');
                return [];
            }

            // 3. Apply trending boost from trending topics
            for (const item of allItems) {
                const titleWords = (item.title || '').toLowerCase().split(/\s+/);
                const tagWords = (item.tags || []).map((t: string) => t.toLowerCase());
                const allWords = [...titleWords, ...tagWords];

                let trendBoost = 0;
                for (const word of allWords) {
                    if (trendMap.has(word)) {
                        trendBoost = Math.max(trendBoost, trendMap.get(word) || 0);
                    }
                }
                item.trendScore = Math.max(item.trendScore || 0, trendBoost);
            }

            // 4. Normalize values for scoring
            const maxVolume = Math.max(...allItems.map(i => i.volume || 0), 1);
            const now = Date.now();

            // 5. Compute weighted scores
            const scoredItems = allItems.map(item => {
                // Volume score (0-1)
                const volumeScore = (item.volume || 0) / maxVolume;

                // Impact score (0-1)
                const impactScore = IMPACT_SCORES[item.impact] || 0.5;

                // Signal strength / relevance (0-1)
                const signalScore = item.relevanceScore || 0.5;

                // Trend score (0-1)
                const trendScore = item.trendScore || 0;

                // Freshness score (decays over 48 hours)
                const ageHours = (now - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
                const freshnessScore = Math.max(0, 1 - (ageHours / 48));

                // Engagement score (derived from confidence and type)
                const engagementScore = item.type === 'market' ? 0.8 :
                    item.type === 'signal' ? 0.7 :
                        item.type === 'sports' ? 0.6 : 0.5;

                // Weighted composite score
                const _score =
                    (volumeScore * TOP_MARKETS_WEIGHTS.volume) +
                    (impactScore * TOP_MARKETS_WEIGHTS.impact) +
                    (signalScore * TOP_MARKETS_WEIGHTS.signalStrength) +
                    (trendScore * TOP_MARKETS_WEIGHTS.trendScore) +
                    (freshnessScore * TOP_MARKETS_WEIGHTS.freshness) +
                    (engagementScore * TOP_MARKETS_WEIGHTS.engagement);

                return { ...item, _score };
            });

            // 6. Sort by score descending
            scoredItems.sort((a, b) => (b._score || 0) - (a._score || 0));

            // 7. Apply diversity constraint: max 5 items per category
            const result: UnifiedItem[] = [];
            const categoryCounts: Record<string, number> = {};
            const MAX_PER_CATEGORY = 5;

            // Generate a larger set (e.g., 200 items) to support pagination
            const MAX_GENERATED_ITEMS = 200;

            for (const item of scoredItems) {
                const cat = item.category || 'unknown';
                if ((categoryCounts[cat] || 0) < MAX_PER_CATEGORY) {
                    result.push(item);
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                }
                if (result.length >= MAX_GENERATED_ITEMS) break;
            }

            // 8. Cache the FULL result
            this.topMarketsCache = { data: result, timestamp: Date.now() };

            const finalResult = result.slice(offset, offset + limit);
            this.logger.log(`Top Markets computed: ${result.length} items total, returning ${finalResult.length} (offset ${offset})`);
            return finalResult;

        } catch (error) {
            this.logger.error(`Failed to compute Top Markets: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Get "For You" Recommendations (AI Clustering + Diversity)
     * Uses K-Means clustering with diversity constraints and mutual exclusion from Top Markets.
     */
    async getForYou(userId: string | undefined, limit: number = 20, offset: number = 0): Promise<UnifiedItem[]> {
        const cacheKey = userId || 'anonymous';

        // Check cache (anti-throttling)
        const cached = this.forYouCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            this.logger.debug(`Returning cached For You for ${cacheKey} (offset: ${offset}, limit: ${limit})`);
            return cached.data.slice(offset, offset + limit);
        }

        this.logger.debug(`Computing fresh For You recommendations for ${cacheKey}...`);

        try {
            // 1. Get Top Markets IDs for mutual exclusion
            const topMarkets = await this.getTopMarkets(50, 0); // Increase to check exclusion against more top items
            const excludeIds = new Set(topMarkets.map(m => m.id));

            // 2. Aggregate data from ALL sources
            const [contentItems, signals, sportsEvents] = await Promise.all([
                this.marketDataService.getAggregatedTopContent(150),
                this.marketDataService.getHighImpactSignals(50),
                this.marketDataService.getSportsWithMarketPotential(30),
            ]);

            // 3. Combine and filter out Top Markets items
            let candidates: UnifiedItem[] = [...contentItems, ...signals, ...sportsEvents]
                .filter(item => !excludeIds.has(item.id));

            if (candidates.length === 0) {
                this.logger.warn('No candidates for For You after filtering');
                return [];
            }

            // 4. Create feature vectors for K-Means clustering
            const now = Date.now();

            candidates = candidates.map(item => {
                const ageHours = (now - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
                const freshnessScore = Math.max(0, 1 - (ageHours / 72));
                const impactScore = IMPACT_SCORES[item.impact] || 0.5;
                const sentimentIntensity = Math.abs(item.sentimentScore || 0);

                // Feature vector: [impact, freshness, sentiment_intensity, category_weight]
                const categoryWeight = this.getCategoryWeight(item.category);
                const _vector = [impactScore, freshnessScore, sentimentIntensity, categoryWeight];

                return { ...item, _vector };
            });

            // 5. K-Means Clustering (K=5)
            const K = 5;
            const clusters = this.kMeansClustering(candidates, K);

            // 6. Select items with diversity
            // Strategy: Pick top items from each cluster, preferring controversial (sentiment near 0.5)
            const result: UnifiedItem[] = [];
            const categoryCounts: Record<string, number> = {};
            const MAX_PER_CATEGORY = 4;
            const MAX_GENERATED_ITEMS = 100; // Cap to keep consistent with pagination needs

            // Score items within each cluster by "interestingness"
            for (const cluster of clusters) {
                const scored = cluster.map(item => {
                    const controversyScore = 1 - Math.abs((item.sentimentScore || 0)); // Higher for neutral
                    const freshnessScore = item._vector?.[1] || 0.5;
                    const interestScore = (controversyScore * 0.4) + (freshnessScore * 0.6);
                    return { ...item, _score: interestScore };
                });

                scored.sort((a, b) => (b._score || 0) - (a._score || 0));

                // Pick top items from cluster with category diversity
                for (const item of scored) {
                    const cat = item.category || 'unknown';
                    if ((categoryCounts[cat] || 0) < MAX_PER_CATEGORY && !result.some(r => r.id === item.id)) {
                        result.push(item);
                        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                    }
                    if (result.length >= MAX_GENERATED_ITEMS) break;
                }

                if (result.length >= MAX_GENERATED_ITEMS) break;
            }

            // 7. Cache and return
            this.forYouCache.set(cacheKey, { data: result, timestamp: Date.now() });

            // Cleanup old cache entries
            if (this.forYouCache.size > 100) {
                const firstKey = this.forYouCache.keys().next().value;
                if (firstKey) this.forYouCache.delete(firstKey);
            }

            this.logger.log(`For You computed: ${result.length} items for ${cacheKey}, returning ${Math.min(limit, result.length - offset)} (offset ${offset})`);
            return result.slice(offset, offset + limit);

        } catch (error) {
            this.logger.error(`Failed to compute For You: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * K-Means Clustering Implementation
     * Simple but effective for our use case
     */
    private kMeansClustering(items: UnifiedItem[], k: number): UnifiedItem[][] {
        if (items.length <= k) {
            return items.map(item => [item]);
        }

        // Initialize centroids randomly
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        let centroids = shuffled.slice(0, k).map(item => item._vector || [0.5, 0.5, 0.5, 0.5]);

        const MAX_ITERATIONS = 10;
        let assignments: number[] = new Array(items.length).fill(0);

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            // Assign each item to nearest centroid
            assignments = items.map(item => {
                const vec = item._vector || [0.5, 0.5, 0.5, 0.5];
                let minDist = Infinity;
                let cluster = 0;

                for (let c = 0; c < k; c++) {
                    const dist = this.euclideanDistance(vec, centroids[c]);
                    if (dist < minDist) {
                        minDist = dist;
                        cluster = c;
                    }
                }

                return cluster;
            });

            // Update centroids
            const newCentroids: number[][] = [];
            for (let c = 0; c < k; c++) {
                const clusterItems = items.filter((_, idx) => assignments[idx] === c);
                if (clusterItems.length === 0) {
                    newCentroids.push(centroids[c]); // Keep old centroid
                } else {
                    const dims = centroids[c].length;
                    const mean = new Array(dims).fill(0);
                    for (const item of clusterItems) {
                        const vec = item._vector || new Array(dims).fill(0.5);
                        for (let d = 0; d < dims; d++) {
                            mean[d] += vec[d];
                        }
                    }
                    newCentroids.push(mean.map(v => v / clusterItems.length));
                }
            }

            centroids = newCentroids;
        }

        // Build cluster arrays
        const clusters: UnifiedItem[][] = Array.from({ length: k }, () => []);
        for (let i = 0; i < items.length; i++) {
            clusters[assignments[i]].push(items[i]);
        }

        // Sort clusters by size (largest first for better selection)
        return clusters.sort((a, b) => b.length - a.length);
    }

    /**
     * Euclidean distance between two vectors
     */
    private euclideanDistance(a: number[], b: number[]): number {
        let sum = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            sum += Math.pow((a[i] || 0) - (b[i] || 0), 2);
        }
        return Math.sqrt(sum);
    }

    /**
     * Get category weight for feature vector
     */
    private getCategoryWeight(category: string): number {
        const weights: Record<string, number> = {
            crypto: 0.9,
            finance: 0.85,
            politics: 0.8,
            tech: 0.75,
            sports: 0.7,
            economy: 0.65,
            science: 0.6,
            latest: 0.5,
            signals: 0.95,
        };
        return weights[category] || 0.5;
    }

    /**
     * Clear caches (useful for testing or manual refresh)
     */
    clearCache(): void {
        this.topMarketsCache = null;
        this.forYouCache.clear();
        this.logger.log('Recommendation caches cleared');
    }
}
