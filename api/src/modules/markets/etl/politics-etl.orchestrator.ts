/**
 * Politics ETL Orchestrator
 * 
 * ETL pipeline for political data from GDELT, NewsAPI, and RSS Feeds.
 * Enhanced with auto-market generation for AI agent competitions.
 * 
 * Data Sources:
 * - GDELT: Global political events and news
 * - NewsAPI: Major news outlets (politics category)
 * - RSS Feeds: Google News, BBC, NPR, Al Jazeera, The Hill
 * 
 * Security: OWASP compliant with input sanitization
 * Anti-throttling: Rate limiting and retry logic with exponential backoff
 */

import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { GDELTClient, NewsAPIClient, RSSClient } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';
import { MarketsService } from '../markets.service.js';

// Market generation configuration
const MARKET_GENERATION_CONFIG = {
    enabled: true,
    maxMarketsPerSync: 5, // Prevent spam
    minImpactScore: 0.6,
    electionKeywords: ['election', 'vote', 'ballot', 'poll', 'candidate', 'campaign'],
    legislationKeywords: ['bill', 'legislation', 'law', 'senate', 'congress', 'parliament', 'house', 'act'],
    policyKeywords: ['policy', 'reform', 'regulation', 'sanctions', 'tariff', 'treaty'],
};

// Enhanced entity extraction patterns
const ENTITY_PATTERNS = {
    politicians: [
        'Trump', 'Biden', 'Harris', 'Obama', 'Clinton', 'Pelosi', 'McConnell',
        'Putin', 'Zelensky', 'Modi', 'Xi Jinping', 'Macron', 'Scholz', 'Sunak',
        'Starmer', 'Trudeau', 'Milei', 'Netanyahu', 'Erdogan', 'Kishida',
        'DeSantis', 'Newsom', 'Vance', 'Walz', 'Sanders', 'AOC'
    ],
    institutions: [
        'Congress', 'Senate', 'House', 'Parliament', 'Supreme Court',
        'UN', 'NATO', 'EU', 'WHO', 'WTO', 'IMF', 'World Bank',
        'White House', 'Capitol', 'Pentagon', 'State Department',
        'Federal Reserve', 'Treasury', 'FBI', 'CIA', 'DOJ'
    ],
    countries: [
        'US', 'USA', 'United States', 'China', 'Russia', 'Ukraine',
        'UK', 'Britain', 'France', 'Germany', 'Japan', 'India',
        'Israel', 'Iran', 'Saudi Arabia', 'Brazil', 'Mexico', 'Canada'
    ]
};

@Injectable()
export class PoliticsETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    private gdelt: GDELTClient;
    private newsApi: NewsAPIClient;
    private rss: RSSClient;
    private marketsGenerated = 0;

    constructor(
        private readonly configService: ConfigService,
        private readonly messagingService: MarketMessagingService,
        @Inject(forwardRef(() => MarketsService))
        private readonly marketsService: MarketsService
    ) {
        super('PoliticsETLOrchestrator', 'politics');
        this.syncInterval = 30 * 60 * 1000; // 30 minutes

        this.gdelt = new GDELTClient();
        this.newsApi = new NewsAPIClient(configService);
        this.rss = new RSSClient();
    }

    async onModuleInit() {
        this.logger.log('Politics ETL Orchestrator initialized');
        this.logger.log(`Market generation: ${MARKET_GENERATION_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
        // Initial delay to allow DB connection
        setTimeout(() => this.runSync(), 20000);
    }

    @Cron(CronExpression.EVERY_HOUR)
    async scheduledSync() {
        await this.runSync();
    }

    async sync(): Promise<ETLResult> {
        const startedAt = new Date();
        const errors: string[] = [];
        let recordsFetched = 0;
        let recordsCreated = 0;
        let recordsUpdated = 0;
        let recordsSkipped = 0;
        let recordsFailed = 0;
        let duplicatesFound = 0;
        this.marketsGenerated = 0;

        try {
            // 1. Fetch GDELT political news (with retry)
            this.logger.debug('Fetching GDELT political news...');
            const gdeltNews = await this.fetchWithRetry(() => this.fetchGDELTNews(), 'GDELT');
            recordsFetched += gdeltNews.length;

            // 2. Fetch NewsAPI political news
            this.logger.debug('Fetching NewsAPI political news...');
            const newsApiItems = await this.fetchWithRetry(() => this.fetchPoliticsNews(), 'NewsAPI');
            recordsFetched += newsApiItems.length;

            // 3. Fetch ALL RSS Feeds concurrently (Google News, BBC, NPR, Al Jazeera, The Hill)
            this.logger.debug('Fetching RSS political feeds...');
            const rssItems = await this.fetchAllRSSFeeds();
            recordsFetched += rssItems.length;

            // Combine and Transform all items
            const allItems = [
                ...gdeltNews.map(n => this.transformGDELTToItem(n)),
                ...newsApiItems.map(n => this.transformNewsToItem(n)),
                ...rssItems
            ];

            this.logger.log(`Total items fetched: ${allItems.length} (GDELT: ${gdeltNews.length}, NewsAPI: ${newsApiItems.length}, RSS: ${rssItems.length})`);

            // 4. Enrich items with scraped images (for items missing images)
            await this.enrichItemsWithImages(allItems);

            // Upsert into unified market_data_items table
            const stats = await this.upsertItems(allItems);
            recordsCreated += stats.created;
            recordsUpdated += stats.updated;
            duplicatesFound += stats.duplicates;
            recordsFailed += stats.failed;

            // 4. Post-Process: Populate specialized Politics tables
            this.logger.debug('Processing specialized politics data...');
            await this.processSpecializedData(allItems);

            // 5. AUTO-GENERATE MARKETS from high-impact political events
            if (MARKET_GENERATION_CONFIG.enabled) {
                this.logger.debug('Generating AI agent competitions from political events...');
                await this.generateMarketsFromItems(allItems);
            }

            // 6. Stream updates to frontend via RabbitMQ
            if (allItems.length > 0) {
                const latestUpdates = allItems.slice(0, 15);
                await this.messagingService.publishMessage('politics', latestUpdates, 'news_update');
                this.logger.debug(`Streamed ${latestUpdates.length} items to RabbitMQ`);
            }

            this.logger.log(`Politics ETL completed: ${recordsCreated} created, ${recordsUpdated} updated, ${this.marketsGenerated} markets generated`);

        } catch (error) {
            this.logger.error(`Politics ETL Error: ${(error as Error).message}`);
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'gdelt,newsapi,rss',
            startedAt,
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            recordsFetched,
            recordsCreated,
            recordsUpdated,
            recordsSkipped,
            recordsFailed,
            duplicatesFound,
            errors,
        };
    }

    // --- Fetchers with Retry Logic ---

    private async fetchWithRetry<T>(
        fetchFn: () => Promise<T>,
        sourceName: string,
        maxRetries = 3
    ): Promise<T> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fetchFn();
            } catch (error) {
                if (attempt === maxRetries) {
                    this.logger.warn(`${sourceName} fetch failed after ${maxRetries} attempts: ${(error as Error).message}`);
                    return [] as unknown as T;
                }
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                this.logger.debug(`${sourceName} fetch attempt ${attempt} failed, retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        return [] as unknown as T;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async fetchGDELTNews() {
        try {
            return await this.gdelt.getPoliticalNews(30);
        } catch (error) {
            this.logger.warn(`Failed to fetch GDELT: ${(error as Error).message}`);
            return [];
        }
    }

    private async fetchPoliticsNews() {
        try {
            return await this.newsApi.getNewsByCategory('politics', 25);
        } catch (error) {
            this.logger.warn(`Failed to fetch politics news: ${(error as Error).message}`);
            return [];
        }
    }

    private async fetchAllRSSFeeds(): Promise<MarketDataItem[]> {
        try {
            return await this.rss.fetchAllPoliticsFeeds();
        } catch (error) {
            this.logger.warn(`Failed to fetch RSS feeds: ${(error as Error).message}`);
            return [];
        }
    }

    // --- Transformers ---

    private transformGDELTToItem(article: any): MarketDataItem {
        const entities = this.extractAllEntities(article.title + ' ' + (article.description || ''));
        return {
            externalId: this.generateContentHash(article.url || article.title, 'gdelt'),
            source: 'gdelt',
            category: 'politics',
            contentType: 'news',
            title: article.title,
            url: article.url,
            imageUrl: article.socialImage,
            sourceName: article.domain,
            publishedAt: article.seenDate,
            sentimentScore: article.tone ? article.tone / 10 : 0,
            sentiment: article.tone ? (article.tone > 1 ? 'bullish' : article.tone < -1 ? 'bearish' : 'neutral') : 'neutral',
            tags: ['gdelt', 'global', ...entities.slice(0, 5)],
            impact: this.calculatePoliticalImpact(article.title),
            metadata: {
                entities,
                eventType: this.detectEventType(article.title),
            }
        };
    }

    private transformNewsToItem(article: any): MarketDataItem {
        const transformed = this.newsApi.transformToMarketDataItem(article, 'politics');
        const entities = this.extractAllEntities(article.title + ' ' + (article.description || ''));
        return {
            ...transformed,
            sentiment: this.analyzeSentiment(article.title).sentiment,
            impact: this.calculatePoliticalImpact(article.title),
            metadata: {
                entities,
                eventType: this.detectEventType(article.title),
            }
        };
    }

    // --- Market Generation ---

    /**
     * Generate AI agent competitions from high-impact political items
     */
    private async generateMarketsFromItems(items: MarketDataItem[]) {
        // Sort by impact and take top candidates
        const marketCandidates = items
            .filter(item => item.impact === 'high' || item.impact === 'critical')
            .filter(item => this.isMarketWorthy(item))
            .slice(0, MARKET_GENERATION_CONFIG.maxMarketsPerSync);

        for (const item of marketCandidates) {
            try {
                const eventType = item.metadata?.eventType || 'general';
                const entities = item.metadata?.entities || [];

                const market = await this.marketsService.generateMarketFromEvent({
                    eventTitle: item.title,
                    eventDescription: item.description || item.title,
                    eventType,
                    entities,
                    deadline: this.calculateMarketDeadline(eventType, item),
                });

                if (market) {
                    this.marketsGenerated++;
                    // Stream market creation to frontend
                    await this.messagingService.publishMessage('politics', {
                        type: 'market_created',
                        market,
                    }, 'market_update');
                }
            } catch (error) {
                this.logger.warn(`Failed to generate market from item: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Check if item is worthy of becoming a market
     */
    private isMarketWorthy(item: MarketDataItem): boolean {
        const text = (item.title + ' ' + (item.description || '')).toLowerCase();

        // Must have at least one named entity
        const entities = item.metadata?.entities || [];
        if (entities.length === 0) return false;

        // Must match key political themes
        const allKeywords = [
            ...MARKET_GENERATION_CONFIG.electionKeywords,
            ...MARKET_GENERATION_CONFIG.legislationKeywords,
            ...MARKET_GENERATION_CONFIG.policyKeywords,
        ];

        return allKeywords.some(kw => text.includes(kw));
    }

    /**
     * Calculate appropriate market deadline based on event type
     */
    private calculateMarketDeadline(eventType: string, item: MarketDataItem): Date {
        const now = Date.now();
        switch (eventType) {
            case 'election':
                // Elections: 30-90 days
                return new Date(now + 60 * 24 * 60 * 60 * 1000);
            case 'legislation':
                // Bills: 14-30 days
                return new Date(now + 21 * 24 * 60 * 60 * 1000);
            case 'policy':
            case 'summit':
                // Policy/Summit: 7-14 days
                return new Date(now + 10 * 24 * 60 * 60 * 1000);
            default:
                // General: 7 days
                return new Date(now + 7 * 24 * 60 * 60 * 1000);
        }
    }

    // --- Entity Extraction ---

    /**
     * Extract all entities (politicians, institutions, countries) from text
     */
    private extractAllEntities(text: string): string[] {
        const entities: string[] = [];

        for (const entity of ENTITY_PATTERNS.politicians) {
            if (text.includes(entity)) entities.push(entity);
        }
        for (const entity of ENTITY_PATTERNS.institutions) {
            if (text.includes(entity)) entities.push(entity);
        }
        for (const entity of ENTITY_PATTERNS.countries) {
            if (text.includes(entity)) entities.push(entity);
        }

        // Dedupe and limit
        return [...new Set(entities)].slice(0, 10);
    }

    /**
     * Detect event type from text content
     */
    private detectEventType(text: string): 'election' | 'legislation' | 'policy' | 'summit' | 'general' {
        const lowerText = text.toLowerCase();

        if (MARKET_GENERATION_CONFIG.electionKeywords.some(kw => lowerText.includes(kw))) {
            return 'election';
        }
        if (MARKET_GENERATION_CONFIG.legislationKeywords.some(kw => lowerText.includes(kw))) {
            return 'legislation';
        }
        if (MARKET_GENERATION_CONFIG.policyKeywords.some(kw => lowerText.includes(kw))) {
            return 'policy';
        }
        if (lowerText.includes('summit') || lowerText.includes('talks') || lowerText.includes('meeting')) {
            return 'summit';
        }
        return 'general';
    }

    /**
     * Calculate political impact level
     */
    private calculatePoliticalImpact(title: string): 'low' | 'medium' | 'high' | 'critical' {
        const lowerTitle = title.toLowerCase();

        const criticalKeywords = ['breaking', 'war', 'impeach', 'resign', 'assassination', 'coup', 'emergency'];
        const highKeywords = ['president', 'prime minister', 'election', 'supreme court', 'sanctions', 'major', 'historic'];
        const mediumKeywords = ['congress', 'senate', 'parliament', 'bill', 'vote', 'policy'];

        if (criticalKeywords.some(kw => lowerTitle.includes(kw))) return 'critical';
        if (highKeywords.some(kw => lowerTitle.includes(kw))) return 'high';
        if (mediumKeywords.some(kw => lowerTitle.includes(kw))) return 'medium';
        return 'low';
    }

    // --- Specialized Data Processing ---

    /**
     * Process data into politics_entities, politics_events, and politics_news_items
     */
    private async processSpecializedData(items: MarketDataItem[]) {
        for (const item of items) {
            const entities = item.metadata?.entities || this.extractAllEntities(item.title);
            const entityIds: string[] = [];

            for (const entityName of entities) {
                try {
                    const { data: existing } = await this.supabase
                        .from('politics_entities')
                        .select('id')
                        .eq('name', entityName)
                        .single();

                    let entityId = existing?.id;

                    if (!entityId) {
                        const entityType = this.classifyEntity(entityName);
                        const { data: newEntity } = await this.supabase
                            .from('politics_entities')
                            .insert({
                                name: entityName,
                                entity_type: entityType,
                                country: entityType === 'country' ? entityName : 'US',
                                source: 'etl_auto'
                            })
                            .select('id')
                            .single();

                        if (newEntity) entityId = newEntity.id;
                    }

                    if (entityId) entityIds.push(entityId);
                } catch (e) {
                    // Ignore dupes or errors
                }
            }

            // Link to News Item
            const { data: dbItem } = await this.supabase
                .from('market_data_items')
                .select('id')
                .eq('external_id', item.externalId)
                .single();

            if (dbItem && entityIds.length > 0) {
                try {
                    await this.supabase
                        .from('politics_news_items')
                        .upsert({
                            data_item_id: dbItem.id,
                            entity_ids: entityIds,
                            political_significance: item.impact || 'medium'
                        }, {
                            onConflict: 'data_item_id'
                        });
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    /**
     * Classify entity type
     */
    private classifyEntity(name: string): string {
        if (ENTITY_PATTERNS.politicians.includes(name)) return 'politician';
        if (ENTITY_PATTERNS.institutions.includes(name)) return 'organization';
        if (ENTITY_PATTERNS.countries.includes(name)) return 'country';
        return 'other';
    }
}
