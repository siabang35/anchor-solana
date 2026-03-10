/**
 * Tech ETL Orchestrator
 * 
 * ETL pipeline for technology data from HackerNews, NewsAPI.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { HackerNewsClient, NewsAPIClient } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class TechETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    private hackerNews: HackerNewsClient;
    private newsApi: NewsAPIClient;

    constructor(
        private readonly configService: ConfigService,
        private readonly messagingService: MarketMessagingService
    ) {
        super('TechETLOrchestrator', 'tech');
        this.syncInterval = 15 * 60 * 1000; // 15 minutes

        this.hackerNews = new HackerNewsClient();
        this.newsApi = new NewsAPIClient(configService);
    }

    async onModuleInit() {
        this.logger.log('Tech ETL Orchestrator initialized');
        setTimeout(() => this.runSync(), 15000);
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
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

        try {
            // 1. Fetch HackerNews stories
            this.logger.debug('Fetching HackerNews stories...');
            const hnStories = await this.fetchHackerNews();
            recordsFetched += hnStories.length;

            // Store in tech_hn_stories
            await this.storeHNStories(hnStories);

            // Transform to market items
            const hnItems = hnStories.map(s => this.transformHNToItem(s));

            // Enrich HN items with scraped images (fallback to topic-based images)
            await this.enrichItemsWithImages(hnItems, (title) => this.getTechImageUrl(title));

            const hnStats = await this.upsertItems(hnItems);
            recordsCreated += hnStats.created;
            recordsUpdated += hnStats.updated;
            duplicatesFound += hnStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('tech', hnItems, 'news_update');

            // 2. Fetch tech news from NewsAPI
            this.logger.debug('Fetching tech news...');
            const techNews = await this.fetchTechNews();
            recordsFetched += techNews.length;

            const newsItems = techNews.map(n => this.transformNewsToItem(n));

            // Enrich news items with scraped images (fallback to topic-based images)
            await this.enrichItemsWithImages(newsItems, (title) => this.getTechImageUrl(title));

            const newsStats = await this.upsertItems(newsItems);
            recordsCreated += newsStats.created;
            recordsUpdated += newsStats.updated;
            duplicatesFound += newsStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('tech', newsItems, 'news_update');

        } catch (error) {
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'hackernews,newsapi',
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

    private async fetchHackerNews() {
        try {
            return await this.hackerNews.getTrendingTechStories(30);
        } catch (error) {
            this.logger.warn(`Failed to fetch HN: ${(error as Error).message}`);
            return [];
        }
    }

    private async fetchTechNews() {
        try {
            return await this.newsApi.getNewsByCategory('tech', 20);
        } catch (error) {
            this.logger.warn(`Failed to fetch tech news: ${(error as Error).message}`);
            return [];
        }
    }

    private async storeHNStories(stories: any[]) {
        for (const story of stories) {
            try {
                await this.supabase.from('tech_hn_stories').upsert({
                    hn_id: story.hnId,
                    title: story.title,
                    url: story.url,
                    text: story.text,
                    author: story.author,
                    score: story.score,
                    descendants: story.commentCount,
                    story_type: story.storyType,
                    published_at: story.publishedAt.toISOString(),
                }, {
                    onConflict: 'hn_id',
                });
            } catch (error) {
                this.logger.warn(`Failed to store HN story: ${(error as Error).message}`);
            }
        }
    }

    private transformHNToItem(story: any): MarketDataItem {
        const sentiment = this.analyzeSentiment(story.title);
        // Note: imageUrl not set here - enrichItemsWithImages will scrape first, then fallback

        return {
            externalId: story.id,
            source: 'hackernews',
            category: 'tech',
            contentType: 'news',
            title: story.title,
            url: story.url || `https://news.ycombinator.com/item?id=${story.hnId}`,
            // imageUrl intentionally not set - let scraper try first
            sourceName: 'Hacker News',
            author: story.author,
            publishedAt: story.publishedAt,
            impact: this.calculateImpact({ score: story.score }),
            sentiment: sentiment.sentiment,
            sentimentScore: sentiment.score,
            metadata: {
                hnId: story.hnId,
                score: story.score,
                commentCount: story.commentCount,
            },
        };
    }

    private transformNewsToItem(article: any): MarketDataItem {
        const transformed = this.newsApi.transformToMarketDataItem(article, 'tech');
        // Note: Keep NewsAPI image if available, but don't set fallback here
        // enrichItemsWithImages will handle fallback if no image

        return {
            ...transformed,
            // Keep NewsAPI image only if it exists, let fallback be applied later
            sentiment: this.analyzeSentiment(article.title).sentiment,
        };
    }

    /**
     * Get tech-themed image based on title keyword analysis
     * Provides topic-specific images for security, database, AI, tools, etc.
     */
    private getTechImageUrl(title: string): string {
        const titleLower = (title || '').toLowerCase();

        // Security / Hacking / Privacy
        if (titleLower.match(/\b(hack|security|privacy|breach|attack|vulnerability|fbi|cyber|password|encryption|malware|ransomware|exploit)\b/i)) {
            return 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=600'; // Cybersecurity
        }

        // Database / SQL
        if (titleLower.match(/\b(sql|database|mysql|postgres|mongodb|redis|sqlite|db|data center)\b/i)) {
            return 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&q=80&w=600'; // Database
        }

        // Programming Languages / Tools
        if (titleLower.match(/\b(python|javascript|typescript|rust|go|java|kotlin|swift|xcode|compiler|framework|npm|package)\b/i)) {
            return 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=600'; // Code
        }

        // AI / ML
        if (titleLower.match(/\b(ai|llm|gpt|chatgpt|openai|anthropic|claude|gemini|machine learning|neural|model|transformer)\b/i)) {
            return 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600'; // AI Brain
        }

        // Cloud / Infrastructure
        if (titleLower.match(/\b(cloud|aws|azure|gcp|kubernetes|docker|serverless|lambda|infrastructure|devops)\b/i)) {
            return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600'; // Cloud
        }

        // Open Source / GitHub
        if (titleLower.match(/\b(open source|github|gitlab|repository|fork|oss|linux|apache|mit license)\b/i)) {
            return 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=crop&q=80&w=600'; // GitHub
        }

        // Apple / iOS
        if (titleLower.match(/\b(apple|iphone|ios|macos|swift|wwdc|macbook|ipad)\b/i)) {
            return 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&q=80&w=600'; // Apple
        }

        // Google / Android
        if (titleLower.match(/\b(google|android|chrome|pixel|flutter)\b/i)) {
            return 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&q=80&w=600'; // Google
        }

        // Startup / Business
        if (titleLower.match(/\b(startup|funding|ipo|ceo|acquisition|layoff|billion|million|valuation|vc|investor)\b/i)) {
            return 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&q=80&w=600'; // Business
        }

        // Web / Browser
        if (titleLower.match(/\b(web|browser|firefox|safari|http|html|css|react|vue|angular|frontend)\b/i)) {
            return 'https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&q=80&w=600'; // Web dev
        }

        // Hardware / Chips
        if (titleLower.match(/\b(chip|cpu|gpu|nvidia|amd|intel|hardware|semiconductor|processor)\b/i)) {
            return 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'; // Circuit
        }

        // Default - varied tech images based on title hash
        const defaultImages = [
            'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600', // Tech circuit
            'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=600', // Code
            'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600', // Tech abstract
            'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600', // Matrix
            'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&q=80&w=600', // Laptop
        ];

        const titleHash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return defaultImages[titleHash % defaultImages.length];
    }
}
