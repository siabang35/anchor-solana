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

        try {
            // 1. Batch check existing items to count created vs updated
            const externalIds = items.map(item => item.externalId);
            const { data: existingItems, error: selectErr } = await this.supabase
                .from('market_data_items')
                .select('external_id')
                .in('external_id', externalIds);

            if (selectErr) throw selectErr;

            const existingSet = new Set(existingItems?.map(x => x.external_id) || []);

            // 2. Prepare payload for batch upsert
            const upsertData = items.map(item => ({
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
                published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
                tags: item.tags || [],
                keywords: item.keywords || [],
                impact: item.impact || 'medium',
                sentiment: item.sentiment || 'neutral',
                sentiment_score: item.sentimentScore,
                relevance_score: item.relevanceScore || 0.5,
                metadata: item.metadata || {},
                updated_at: new Date().toISOString(),
            }));

            // 3. Execute batch upsert
            const { error: upsertErr } = await this.supabase
                .from('market_data_items')
                .upsert(upsertData, { onConflict: 'external_id,source' });

            if (upsertErr) throw upsertErr;

            // Update stats
            for (const item of items) {
                if (existingSet.has(item.externalId)) {
                    stats.updated++;
                } else {
                    stats.created++;
                }
            }

            return stats;

        } catch (batchError: any) {
            this.logger.warn(`Batch upsert failed (${batchError.message}). Falling back to individual processing...`);
            
            // Fallback: Individual processing (original slow behavior)
            for (const item of items) {
                try {
                    const { data: existing } = await this.supabase
                        .from('market_data_items')
                        .select('id')
                        .eq('external_id', item.externalId)
                        .eq('source', item.source)
                        .single();

                    if (existing) {
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
                                published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
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
                                stats.duplicates++;
                            } else {
                                stats.failed++;
                                this.logger.warn(`Failed to insert item ${item.externalId}: ${error.message}`);
                            }
                        } else {
                            stats.created++;
                        }
                    }
                } catch (singleError: any) {
                    stats.failed++;
                    this.logger.error(`Error processing item ${item.externalId}: ${singleError.message}`);
                }
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
     * Extract sentiment from text synchronously (fallback)
     */
    protected analyzeSentiment(text: string): { sentiment: 'bearish' | 'neutral' | 'bullish'; score: number } {
        const lowerText = text.toLowerCase();

        const bullishWords = ['gain', 'rise', 'surge', 'bullish', 'growth', 'positive', 'success', 'win', 'breakthrough', 'upgrade', 'outperform'];
        const bearishWords = ['loss', 'fall', 'crash', 'bearish', 'decline', 'negative', 'fail', 'crisis', 'risk', 'downgrade', 'underperform'];

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
     * Advanced NLP Sentiment Analysis via HuggingFace API with Database Caching.
     * Uses FinBERT for finance/crypto and generic models for others.
     */
    protected async analyzeSentimentAsync(text: string): Promise<{ sentiment: 'bearish' | 'neutral' | 'bullish'; score: number }> {
        if (!text || text.trim().length === 0) return { sentiment: 'neutral', score: 0 };
        
        const enabled = process.env.NLP_SENTIMENT_ENABLED === 'true';
        const token = process.env.HUGGINGFACE_TOKEN;
        
        // Fallback to keyword matching if disabled or missing token
        if (!enabled || !token) {
            return this.analyzeSentiment(text);
        }

        // Generate cache key
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
        // Determine best NLP model for the category domain
        let model = 'distilbert-base-uncased-finetuned-sst-2-english';
        if (['crypto', 'finance', 'economy'].includes(this.category)) {
            model = 'ProsusAI/finbert';
        }
        
        // Allow explicit override via environment
        if (process.env.NLP_SENTIMENT_MODEL === 'finbert') {
            model = 'ProsusAI/finbert';
        } else if (process.env.NLP_SENTIMENT_MODEL === 'distilbert') {
            model = 'distilbert-base-uncased-finetuned-sst-2-english';
        }

        try {
            // 1. Check Database Cache First
            const { data: cached } = await this.supabase
                .from('nlp_sentiment_cache')
                .select('sentiment, sentiment_score')
                .eq('content_hash', hash)
                .single();

            if (cached) {
                return {
                    sentiment: cached.sentiment as 'bearish' | 'neutral' | 'bullish',
                    score: parseFloat(cached.sentiment_score)
                };
            }

            // 2. Call HuggingFace Inference API
            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: text.substring(0, 500) }), // truncate for safety
            });

            if (!response.ok) {
                throw new Error(`HF API returned ${response.status}`);
            }

            const result = await response.json();
            
            // Parse result based on model type
            let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
            let score = 0;

            if (Array.isArray(result) && Array.isArray(result[0])) {
                const predictions = result[0]; // e.g. [{label: "positive", score: 0.9}]
                
                if (model === 'ProsusAI/finbert') {
                    // FinBERT outputs: positive, negative, neutral
                    const pos = predictions.find((p: any) => p.label === 'positive')?.score || 0;
                    const neg = predictions.find((p: any) => p.label === 'negative')?.score || 0;
                    score = pos - neg;
                } else {
                    // DistilBERT outputs: POSITIVE, NEGATIVE
                    const pos = predictions.find((p: any) => p.label === 'POSITIVE')?.score || 0;
                    const neg = predictions.find((p: any) => p.label === 'NEGATIVE')?.score || 0;
                    score = pos - neg;
                }
                
                score = Math.max(-1, Math.min(1, score));
                sentiment = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';
            }

            // 3. Save to DB Cache
            await this.supabase.from('nlp_sentiment_cache').upsert({
                content_hash: hash,
                text_content: text.substring(0, 1000), // store up to 1000 chars
                sentiment,
                sentiment_score: score,
                model_used: model,
                analyzed_at: new Date().toISOString()
            }, { onConflict: 'content_hash' });

            return { sentiment, score };

        } catch (error: any) {
            this.logger.warn(`NLP Sentiment analysis failed (${error.message}) - falling back to keyword matching`);
            return this.analyzeSentiment(text);
        }
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

    private s3ClientInstance: any = null;
    private r2Config: {
        accountId: string;
        accessKeyId: string;
        secretAccessKey: string;
        bucketMedia: string;
        publicUrl: string;
    } | null = null;

    /**
     * Initialize S3 client for Cloudflare R2 on demand
     */
    protected async getR2Client() {
        if (this.s3ClientInstance) {
            return this.s3ClientInstance;
        }

        const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
        const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
        const bucketMedia = process.env.CLOUDFLARE_R2_BUCKET_MEDIA || 'exoduze';
        const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

        if (!accountId || !accessKeyId || !secretAccessKey) {
            this.logger.warn('Cloudflare R2 is not fully configured in environment. Skipping image mirroring.');
            return null;
        }

        try {
            const { S3Client } = await import('@aws-sdk/client-s3');
            this.s3ClientInstance = new S3Client({
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
                region: 'auto',
            });
            this.r2Config = {
                accountId,
                accessKeyId,
                secretAccessKey,
                bucketMedia,
                publicUrl: publicUrl || `https://${bucketMedia}.${accountId}.r2.cloudflarestorage.com`,
            };
            return this.s3ClientInstance;
        } catch (err: any) {
            this.logger.error(`Failed to initialize R2 S3 Client in base ETL: ${err.message}`);
            return null;
        }
    }

    /**
     * Download and mirror an external news image to Cloudflare R2
     */
    protected async mirrorImageToR2(
        imageUrl: string,
        category: string,
        externalId: string
    ): Promise<string | null> {
        // Skip placeholders (Unsplash or fallback images) to save storage and writes
        if (!imageUrl || imageUrl.startsWith('data:') || !imageUrl.startsWith('http') || imageUrl.includes('unsplash.com') || imageUrl.includes('placeholder')) {
            return null;
        }

        // If it's already a public R2 CDN URL, return as is
        const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;
        if (publicUrlBase && imageUrl.startsWith(publicUrlBase)) {
            return imageUrl;
        }

        const client = await this.getR2Client();
        if (!client || !this.r2Config) {
            return null;
        }

        try {
            const crypto = await import('crypto');
            // Generate a deterministic filename based on URL hash
            const urlHash = crypto.createHash('sha256').update(imageUrl).digest('hex');
            
            // Extract original file extension, fallback to jpg
            let ext = 'jpg';
            try {
                const parsedUrl = new URL(imageUrl);
                const pathParts = parsedUrl.pathname.split('.');
                if (pathParts.length > 1) {
                    const possibleExt = pathParts.pop()?.toLowerCase();
                    if (possibleExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(possibleExt)) {
                        ext = possibleExt;
                    }
                }
            } catch {}

            const key = `news_images/${category}/${externalId}_${urlHash}.${ext}`;
            const cleanBase = this.r2Config.publicUrl.endsWith('/') ? this.r2Config.publicUrl.slice(0, -1) : this.r2Config.publicUrl;
            const targetUrl = `${cleanBase}/${key}`;

            // Download the image with 5s timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(imageUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'ExoduzeBot/1.0 (+https://exoduze.app; image-mirroring)',
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                this.logger.debug(`Failed to fetch original image for mirroring from ${imageUrl}: HTTP ${response.status}`);
                return null;
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/')) {
                this.logger.debug(`Skipping mirroring: content-type ${contentType} is not an image`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Size boundary protection: Max 2MB per image to preserve R2 Free Tier storage space
            const MAX_SIZE = 2 * 1024 * 1024;
            if (buffer.length > MAX_SIZE) {
                this.logger.warn(`Image from ${imageUrl} exceeds maximum limit of 2MB (${(buffer.length / 1024 / 1024).toFixed(2)}MB). Skipping mirroring.`);
                return null;
            }

            // Upload to Cloudflare R2
            const { PutObjectCommand } = await import('@aws-sdk/client-s3');
            const command = new PutObjectCommand({
                Bucket: this.r2Config.bucketMedia,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000, immutable', // Cache at edge CDN
            });

            await client.send(command);
            this.logger.debug(`Successfully mirrored image to R2: ${targetUrl}`);
            return targetUrl;

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                this.logger.warn(`Failed to mirror image ${imageUrl} to R2: ${err.message}`);
            } else {
                this.logger.warn(`Mirroring of image ${imageUrl} timed out (5s)`);
            }
            return null;
        }
    }

    /**
     * Enrich items with images scraped from their URLs
     * Fetches og:image, twitter:image for items without images, and mirrors all new images to Cloudflare R2.
     * @param items - Items to enrich
     * @param getFallbackImage - Optional callback to get topic-based fallback image from title
     */
    protected async enrichItemsWithImages(
        items: MarketDataItem[],
        getFallbackImage?: (title: string, description?: string) => string
    ): Promise<void> {
        // Filter items that need images AND have URLs to scrape
        const itemsNeedingImages = items.filter(item => !item.imageUrl && item.url);

        if (itemsNeedingImages.length > 0) {
            this.logger.log(`Enriching ${itemsNeedingImages.length} items with scraped images...`);

            // Dynamic import to avoid circular dependencies
            const { ImageScraperUtil } = await import('../../../common/utils/image-scraper.util.js');

            const results = await ImageScraperUtil.scrapeImages(
                itemsNeedingImages.map(item => ({ url: item.url, imageUrl: item.imageUrl })),
                5, // concurrency
                { timeout: 5000 }
            );

            // Apply scraped images to items
            for (const item of itemsNeedingImages) {
                if (item.url) {
                    const result = results.get(item.url);
                    if (result?.imageUrl && result.source !== 'placeholder') {
                        // Use scraped image
                        item.imageUrl = result.imageUrl;
                    } else if (getFallbackImage) {
                        // Use topic-based fallback from callback
                        item.imageUrl = getFallbackImage(item.title || '', item.description);
                    } else {
                        // Use generic category placeholder
                        item.imageUrl = ImageScraperUtil.getPlaceholderForCategory(item.category);
                    }
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
        } else {
            // Ensure no items are left with null imageUrl
            const { ImageScraperUtil } = await import('../../../common/utils/image-scraper.util.js');
            for (const item of items) {
                if (!item.imageUrl) {
                    item.imageUrl = ImageScraperUtil.getPlaceholderForCategory(item.category);
                }
            }
        }

        // --- R2 Mirroring Optimization ---
        // To preserve Class A operations (writes) and free-tier bandwidth, we only download
        // and mirror images to Cloudflare R2 for NEW items that do not yet exist in the DB.
        const externalIds = items.map(item => item.externalId).filter(Boolean);
        let existingSet = new Set<string>();

        if (externalIds.length > 0) {
            try {
                const { data: existingItems } = await this.supabase
                    .from('market_data_items')
                    .select('external_id')
                    .in('external_id', externalIds);
                existingSet = new Set(existingItems?.map(x => x.external_id) || []);
            } catch (err: any) {
                this.logger.warn(`Failed to check existing items for image mirroring: ${err.message}`);
            }
        }

        // Filter items that are new AND have valid external imageUrl
        const newItemsToMirror = items.filter(item => !existingSet.has(item.externalId) && item.imageUrl);
        if (newItemsToMirror.length > 0) {
            this.logger.log(`Found ${newItemsToMirror.length} new items. Mirroring original images to Cloudflare R2...`);
            const concurrency = 5;
            let mirroredCount = 0;

            for (let i = 0; i < newItemsToMirror.length; i += concurrency) {
                const batch = newItemsToMirror.slice(i, i + concurrency);
                await Promise.all(
                    batch.map(async item => {
                        if (item.imageUrl) {
                            const r2Url = await this.mirrorImageToR2(item.imageUrl, item.category, item.externalId);
                            if (r2Url) {
                                item.imageUrl = r2Url;
                                mirroredCount++;
                            }
                        }
                    })
                );
            }
            this.logger.log(`Mirroring complete: ${mirroredCount}/${newItemsToMirror.length} images mirrored to R2 successfully.`);
        }
    }
}
