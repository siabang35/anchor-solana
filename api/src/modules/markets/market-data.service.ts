/**
 * Market Data Service
 * 
 * Service for accessing ETL market data from Supabase.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class MarketDataService {
    private readonly logger = new Logger(MarketDataService.name);
    private readonly supabase: SupabaseClient;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not configured');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Get market data by category
     */
    async getByCategory(
        category: string,
        limit: number = 20,
        offset: number = 0,
        contentType?: string
    ) {
        let query = this.supabase
            .from('market_data_items')
            .select('*')
            .eq('is_active', true)
            .eq('is_duplicate', false)
            .order('published_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Filter by category unless requesting 'latest' (aggregate)
        if (category !== 'latest') {
            query = query.eq('category', category);
        }

        if (contentType) {
            query = query.eq('content_type', contentType);
        }

        const { data, error, count } = await query;

        if (error) {
            this.logger.error(`Failed to get data for ${category}: ${error.message}`);
            throw error;
        }

        return {
            data,
            pagination: {
                limit,
                offset,
                total: count,
            },
        };
    }

    /**
     * Get latest items by category
     */
    async getLatest(category: string, limit: number = 10) {
        const { data, error } = await this.supabase
            .from('market_data_items')
            .select('id, title, source_name, published_at, impact, sentiment, image_url, url')
            .eq('category', category)
            .eq('is_active', true)
            .eq('is_duplicate', false)
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to get latest for ${category}: ${error.message}`);
            throw error;
        }

        return data;
    }

    /**
     * Get single item by ID
     */
    async getById(id: string) {
        const { data, error } = await this.supabase
            .from('market_data_items')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Market data item not found: ${id}`);
        }

        return data;
    }

    /**
     * Get top signals
     */
    async getTopSignals(category?: string, hours: number = 24, limit: number = 20) {
        let query = this.supabase
            .from('market_signals')
            .select('*')
            .eq('is_active', true)
            .gte('detected_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
            .order('signal_strength', { ascending: false })
            .limit(limit);

        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to get signals: ${error.message}`);
            throw error;
        }

        return data;
    }

    /**
     * Get trending topics
     */
    async getTrendingTopics(category?: string, limit: number = 10) {
        let query = this.supabase
            .from('trending_topics')
            .select('*')
            .eq('is_active', true)
            .order('trend_score', { ascending: false })
            .limit(limit);

        if (category) {
            query = query.contains('categories', [category]);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to get trending topics: ${error.message}`);
            throw error;
        }

        return data;
    }

    /**
     * Get featured crypto assets
     */
    async getFeaturedCrypto() {
        const { data, error } = await this.supabase
            .from('crypto_assets')
            .select('*')
            .eq('is_featured', true)
            .eq('is_active', true)
            .order('market_cap_rank', { ascending: true });

        if (error) {
            this.logger.error(`Failed to get featured crypto: ${error.message}`);
            throw error;
        }

        return data;
    }

    /**
     * Get crypto Fear & Greed Index
     */
    async getCryptoFearGreed() {
        const { data, error } = await this.supabase
            .from('crypto_fear_greed')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            this.logger.error(`Failed to get fear & greed: ${error.message}`);
            return null;
        }

        return data;
    }

    /**
     * Trigger manual sync (placeholder - actual implementation in orchestrators)
     */
    async triggerSync(category: string) {
        this.logger.log(`Manual sync triggered for ${category}`);
        return { message: `Sync triggered for ${category}`, status: 'accepted' };
    }

    /**
     * Get sync status
     */
    async getSyncStatus() {
        const { data, error } = await this.supabase
            .from('market_data_sync_logs')
            .select('source, category, status, started_at, completed_at, records_created, records_fetched')
            .order('started_at', { ascending: false })
            .limit(10);

        if (error) {
            this.logger.error(`Failed to get sync status: ${error.message}`);
            return [];
        }

        return data;
    }

    // ========================================
    // AGGREGATION METHODS FOR RECOMMENDATIONS
    // ========================================

    /**
     * Get aggregated top content from ALL categories
     * Returns unified items with normalized scores for ranking
     */
    async getAggregatedTopContent(limit: number = 100): Promise<any[]> {
        const results: any[] = [];

        // 1. Fetch from market_data_items (all categories)
        const { data: marketDataItems, error: mdiError } = await this.supabase
            .from('market_data_items')
            .select('id, title, description, category, source_name, published_at, impact, sentiment, sentiment_score, relevance_score, confidence_score, image_url, url, tags')
            .eq('is_active', true)
            .eq('is_duplicate', false)
            .gte('published_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
            .order('published_at', { ascending: false })
            .limit(limit);

        if (!mdiError && marketDataItems) {
            for (const item of marketDataItems) {
                results.push({
                    id: item.id,
                    type: 'news',
                    title: item.title,
                    description: item.description,
                    category: item.category,
                    source: item.source_name,
                    publishedAt: item.published_at,
                    impact: item.impact,
                    sentiment: item.sentiment,
                    sentimentScore: item.sentiment_score || 0,
                    relevanceScore: item.relevance_score || 0.5,
                    confidenceScore: item.confidence_score || 0.5,
                    imageUrl: item.image_url,
                    url: item.url,
                    tags: item.tags || [],
                    volume: 0, // Data items don't have volume - computed from engagement
                    trendScore: 0, // Will be populated from trending_topics
                });
            }
        }

        // 2. Fetch active AI agent competitions
        const { data: markets, error: marketsError } = await this.supabase
            .from('markets')
            .select('id, title, description, category, volume, liquidity, yes_price, created_at, tags')
            .eq('resolved', false)
            .order('volume', { ascending: false })
            .limit(50);

        if (!marketsError && markets) {
            for (const market of markets) {
                results.push({
                    id: market.id,
                    type: 'market',
                    title: market.title,
                    description: market.description,
                    category: market.category,
                    source: 'exoduze',
                    publishedAt: market.created_at,
                    impact: this.volumeToImpact(market.volume),
                    sentiment: this.priceToSentiment(market.yes_price),
                    sentimentScore: (market.yes_price - 0.5) * 2,
                    relevanceScore: 0.7, // Markets are inherently relevant
                    confidenceScore: Math.min(1, market.volume / 10000), // Volume-based confidence
                    imageUrl: null,
                    url: `/market/${market.id}`,
                    tags: market.tags || [],
                    volume: market.volume || 0,
                    liquidity: market.liquidity || 0,
                    trendScore: 0,
                });
            }
        }

        return results;
    }

    /**
     * Get high-impact signals from all categories
     */
    async getHighImpactSignals(limit: number = 50): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('market_signals')
            .select('id, signal_type, title, description, category, signal_strength, confidence_score, impact, sentiment, detected_at, tags, source_url')
            .eq('is_active', true)
            .in('impact', ['high', 'critical'])
            .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('signal_strength', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.warn(`Failed to get high impact signals: ${error.message}`);
            return [];
        }

        return (data || []).map(signal => ({
            id: signal.id,
            type: 'signal',
            title: signal.title,
            description: signal.description,
            category: signal.category,
            source: 'signal',
            publishedAt: signal.detected_at,
            impact: signal.impact,
            sentiment: signal.sentiment,
            sentimentScore: 0,
            relevanceScore: signal.signal_strength || 0.5,
            confidenceScore: signal.confidence_score || 0.5,
            imageUrl: null,
            url: signal.source_url,
            tags: signal.tags || [],
            volume: 0,
            trendScore: signal.signal_strength || 0,
            signalStrength: signal.signal_strength,
        }));
    }

    /**
     * Get trending topics with their scores
     */
    async getTrendingContent(limit: number = 20): Promise<Map<string, number>> {
        const { data, error } = await this.supabase
            .from('trending_topics')
            .select('normalized_topic, trend_score')
            .eq('is_active', true)
            .order('trend_score', { ascending: false })
            .limit(limit);

        const trendMap = new Map<string, number>();
        if (!error && data) {
            for (const topic of data) {
                if (topic.normalized_topic) {
                    trendMap.set(topic.normalized_topic.toLowerCase(), topic.trend_score || 0.5);
                }
            }
        }

        return trendMap;
    }

    /**
     * Get sports events with market potential
     */
    async getSportsWithMarketPotential(limit: number = 30): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('sports_events')
            .select(`
                id, name, sport, status, start_time, venue,
                home_team_id, away_team_id, home_score, away_score,
                is_featured, thumbnail_url
            `)
            .in('status', ['scheduled', 'live'])
            .gte('start_time', new Date().toISOString())
            .lte('start_time', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('start_time', { ascending: true })
            .limit(limit);

        if (error) {
            this.logger.warn(`Failed to get sports events: ${error.message}`);
            return [];
        }

        return (data || []).map(event => ({
            id: event.id,
            type: 'sports',
            title: event.name || `${event.sport} Match`,
            description: `${event.venue || 'TBD'} - ${event.status}`,
            category: 'sports',
            source: 'thesportsdb',
            publishedAt: event.start_time,
            impact: event.is_featured ? 'high' : 'medium',
            sentiment: 'neutral',
            sentimentScore: 0,
            relevanceScore: event.is_featured ? 0.9 : 0.6,
            confidenceScore: 0.8,
            imageUrl: event.thumbnail_url,
            url: `/sports/${event.id}`,
            tags: [event.sport, event.status],
            volume: 0,
            trendScore: event.is_featured ? 0.8 : 0.4,
            sport: event.sport,
            status: event.status,
            startTime: event.start_time,
        }));
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    private volumeToImpact(volume: number): string {
        if (volume >= 10000) return 'critical';
        if (volume >= 1000) return 'high';
        if (volume >= 100) return 'medium';
        return 'low';
    }

    private priceToSentiment(yesPrice: number): string {
        if (yesPrice >= 0.7) return 'bullish';
        if (yesPrice <= 0.3) return 'bearish';
        return 'neutral';
    }
}

