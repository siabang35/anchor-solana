/**
 * Base ETL Orchestrator
 * 
 * Abstract base class for all category ETL pipelines.
 * Implements common patterns for data extraction, transformation, and loading.
 */

import { Logger } from '@nestjs/common';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

export interface ETLResult {
    category: string;
    source: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    recordsFetched: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    recordsFailed: number;
    duplicatesFound: number;
    errors: string[];
}

export interface MarketDataItem {
    externalId: string;
    source: string;
    category: string;
    contentType?: string;
    title: string;
    description?: string;
    content?: string;
    url?: string;
    imageUrl?: string;
    sourceName?: string;
    author?: string;
    publishedAt?: Date;
    tags?: string[];
    keywords?: string[];
    impact?: 'low' | 'medium' | 'high' | 'critical';
    sentiment?: 'bearish' | 'neutral' | 'bullish';
    sentimentScore?: number;
    relevanceScore?: number;
    metadata?: Record<string, any>;
}

export abstract class BaseETLOrchestrator {
    protected readonly logger: Logger;
    protected readonly supabase: SupabaseClient;
    protected readonly category: string;

    // Sync tracking
    protected isSyncing = false;
    protected lastSyncAt?: Date;
    protected syncInterval = 15 * 60 * 1000; // 15 minutes default

    constructor(name: string, category: string) {
        this.logger = new Logger(name);
        this.category = category;

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not configured');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Main sync method - override in subclasses
     */
    abstract sync(): Promise<ETLResult>;

    /**
     * Check if sync should run
     */
    shouldSync(): boolean {
        if (this.isSyncing) {
            return false;
        }
        if (!this.lastSyncAt) {
            return true;
        }
        return Date.now() - this.lastSyncAt.getTime() >= this.syncInterval;
    }

    /**
     * Run sync with error handling
     */
    async runSync(): Promise<ETLResult | null> {
        if (!this.shouldSync()) {
            this.logger.debug('Sync skipped - already running or too soon');
            return null;
        }

        this.isSyncing = true;
        const startedAt = new Date();

        try {
            this.logger.log(`Starting ${this.category} ETL sync...`);
            const result = await this.sync();
            this.lastSyncAt = new Date();

            // Log sync to database
            await this.logSync(result);

            this.logger.log(`${this.category} ETL sync completed in ${result.durationMs}ms`);
            return result;
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error(`${this.category} ETL sync failed: ${errorMessage}`);

            await this.logSync({
                category: this.category,
                source: 'mixed',
                startedAt,
                completedAt: new Date(),
                durationMs: Date.now() - startedAt.getTime(),
                recordsFetched: 0,
                recordsCreated: 0,
                recordsUpdated: 0,
                recordsSkipped: 0,
                recordsFailed: 0,
                duplicatesFound: 0,
                errors: [errorMessage],
            });

            return null;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Upsert market data items
     */
    protected async upsertItems(items: MarketDataItem[]): Promise<{
        created: number;
        updated: number;
        skipped: number;
        failed: number;
        duplicates: number;
    }> {
        const stats = { created: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 };

        if (items.length === 0) {
            return stats;
        }

        for (const item of items) {
            try {
                // Check for existing item
                const { data: existing } = await this.supabase
                    .from('market_data_items')
                    .select('id, content_hash')
                    .eq('external_id', item.externalId)
                    .eq('source', item.source)
                    .single();

                if (existing) {
                    // Update existing
                    const { error } = await this.supabase
                        .from('market_data_items')
                        .update({
                            title: item.title,
                            description: item.description,
                            content: item.content,
                            image_url: item.imageUrl,
                            sentiment: item.sentiment,
                            sentiment_score: item.sentimentScore,
                            relevance_score: item.relevanceScore,
                            tags: item.tags,
                            keywords: item.keywords,
                            metadata: item.metadata,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', existing.id);

                    if (error) {
                        stats.failed++;
                        this.logger.warn(`Failed to update item ${item.externalId}: ${error.message}`);
                    } else {
                        stats.updated++;
                    }
                } else {
                    // Insert new
                    const { error } = await this.supabase
                        .from('market_data_items')
                        .insert({
                            external_id: item.externalId,
                            source: item.source,
                            category: item.category,
                            content_type: item.contentType || 'news',
                            title: item.title,
                            description: item.description,
                            content: item.content,
                            url: item.url,
                            image_url: item.imageUrl,
                            source_name: item.sourceName,
                            author: item.author,
                            published_at: item.publishedAt?.toISOString(),
                            tags: item.tags || [],
                            keywords: item.keywords || [],
                            impact: item.impact || 'medium',
                            sentiment: item.sentiment || 'neutral',
                            sentiment_score: item.sentimentScore,
                            relevance_score: item.relevanceScore || 0.5,
                            metadata: item.metadata || {},
                        });

                    if (error) {
                        if (error.code === '23505') {
                            // Duplicate
                            stats.duplicates++;
                        } else {
                            stats.failed++;
                            this.logger.warn(`Failed to insert item ${item.externalId}: ${error.message}`);
                        }
                    } else {
                        stats.created++;
                    }
                }
            } catch (error) {
                stats.failed++;
                this.logger.error(`Error processing item ${item.externalId}: ${(error as Error).message}`);
            }
        }

        return stats;
    }

    /**
     * Log sync to database
     */
    protected async logSync(result: ETLResult): Promise<void> {
        try {
            await this.supabase.from('market_data_sync_logs').insert({
                source: result.source,
                category: result.category,
                sync_type: 'incremental',
                started_at: result.startedAt.toISOString(),
                completed_at: result.completedAt.toISOString(),
                duration_ms: result.durationMs,
                status: result.errors.length > 0 ? 'failed' : 'completed',
                records_fetched: result.recordsFetched,
                records_created: result.recordsCreated,
                records_updated: result.recordsUpdated,
                records_skipped: result.recordsSkipped,
                records_failed: result.recordsFailed,
                duplicates_found: result.duplicatesFound,
                error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
            });
        } catch (error) {
            this.logger.error(`Failed to log sync: ${(error as Error).message}`);
        }
    }

    /**
     * Generate content hash for deduplication
     */
    protected generateContentHash(title: string, source: string): string {
        const crypto = require('crypto');
        const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return crypto.createHash('sha256')
            .update(`${normalized}::${source}`)
            .digest('hex');
    }

    /**
     * Extract sentiment from text
     */
    protected analyzeSentiment(text: string): { sentiment: 'bearish' | 'neutral' | 'bullish'; score: number } {
        const lowerText = text.toLowerCase();

        const bullishWords = ['gain', 'rise', 'surge', 'bullish', 'growth', 'positive', 'success', 'win', 'breakthrough'];
        const bearishWords = ['loss', 'fall', 'crash', 'bearish', 'decline', 'negative', 'fail', 'crisis', 'risk'];

        let score = 0;
        for (const word of bullishWords) {
            if (lowerText.includes(word)) score += 0.1;
        }
        for (const word of bearishWords) {
            if (lowerText.includes(word)) score -= 0.1;
        }

        score = Math.max(-1, Math.min(1, score)); // Clamp to [-1, 1]

        return {
            sentiment: score > 0.1 ? 'bullish' : score < -0.1 ? 'bearish' : 'neutral',
            score,
        };
    }

    /**
     * Calculate impact level
     */
    protected calculateImpact(item: { score?: number; mentions?: number; volume?: number }): 'low' | 'medium' | 'high' | 'critical' {
        const score = item.score || 0;
        const mentions = item.mentions || 0;
        const volume = item.volume || 0;

        const combined = score + mentions * 10 + volume;

        if (combined > 1000) return 'critical';
        if (combined > 500) return 'high';
        if (combined > 100) return 'medium';
        return 'low';
    }

    /**
     * Enrich items with images scraped from their URLs
     * Fetches og:image, twitter:image for items without images
     * @param items - Items to enrich
     * @param getFallbackImage - Optional callback to get topic-based fallback image from title
     */
    protected async enrichItemsWithImages(
        items: MarketDataItem[],
        getFallbackImage?: (title: string, description?: string) => string
    ): Promise<void> {
        // Filter items that need images AND have URLs to scrape
        const itemsNeedingImages = items.filter(item => !item.imageUrl && item.url);

        if (itemsNeedingImages.length === 0) {
            // Still apply fallbacks to items without URLs
            if (getFallbackImage) {
                for (const item of items) {
                    if (!item.imageUrl) {
                        item.imageUrl = getFallbackImage(item.title || '', item.description);
                    }
                }
            }
            this.logger.debug('All items already have images or no URLs, applied fallbacks');
            return;
        }

        this.logger.log(`Enriching ${itemsNeedingImages.length} items with scraped images...`);

        // Dynamic import to avoid circular dependencies
        const { ImageScraperUtil } = await import('../../../common/utils/image-scraper.util.js');

        const results = await ImageScraperUtil.scrapeImages(
            itemsNeedingImages.map(item => ({ url: item.url, imageUrl: item.imageUrl })),
            5, // concurrency
            { timeout: 5000 }
        );

        // Apply scraped images to items
        let enrichedCount = 0;
        for (const item of itemsNeedingImages) {
            if (item.url) {
                const result = results.get(item.url);
                if (result?.imageUrl && result.source !== 'placeholder') {
                    // Use scraped image
                    item.imageUrl = result.imageUrl;
                    enrichedCount++;
                } else if (getFallbackImage) {
                    // Use topic-based fallback from callback
                    item.imageUrl = getFallbackImage(item.title || '', item.description);
                } else {
                    // Use generic category placeholder
                    item.imageUrl = ImageScraperUtil.getPlaceholderForCategory(item.category);
                }
            }
        }

        // Apply fallbacks to remaining items without images
        if (getFallbackImage) {
            for (const item of items) {
                if (!item.imageUrl) {
                    item.imageUrl = getFallbackImage(item.title || '', item.description);
                }
            }
        }

        this.logger.log(`Image enrichment complete: ${enrichedCount} real images scraped, ${itemsNeedingImages.length - enrichedCount} using fallbacks`);
    }
}
