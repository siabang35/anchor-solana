import Parser from 'rss-parser';
import { Logger } from '@nestjs/common';
import { MarketDataItem } from '../etl/base-etl.orchestrator.js';

export class RSSClient {
    private parser: Parser;
    private readonly logger = new Logger(RSSClient.name);

    constructor() {
        this.parser = new Parser({
            customFields: {
                item: [
                    ['media:content', 'media'],
                    ['media:thumbnail', 'thumbnail'],
                    ['dc:creator', 'creator'],
                ],
            },
        });
    }

    /**
     * Fetch items from a generic RSS feed URL
     */
    async fetchFeed(url: string, sourceName: string, category: string): Promise<MarketDataItem[]> {
        try {
            const feed = await this.parser.parseURL(url);

            return feed.items.map(item => this.transformToMarketDataItem(item, sourceName, category));
        } catch (error) {
            this.logger.warn(`Failed to fetch RSS feed from ${url}: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Fetch Politics news from Google News
     */
    async fetchGoogleNewsPolitics(): Promise<MarketDataItem[]> {
        // specific topic feed for US Politics, can be adjusted
        const url = 'https://news.google.com/rss/headlines/section/topic/POLITICS?hl=en-US&gl=US&ceid=US:en';
        return this.fetchFeed(url, 'Google News', 'politics');
    }

    /**
     * Fetch Politics news from Reuters
     */
    async fetchReutersPolitics(): Promise<MarketDataItem[]> {
        // Reuters doesn't have an official public RSS anymore, but many mirrors exist.
        // For robustness, we might use a reliable aggregator or just skip if unavailable.
        // Using a common placeholder or public feed if available.
        // Alternatively, use BBC or others.

        // Using BBC Politics as a reliable alternative
        return this.fetchBBCPolitics();
    }

    /**
     * Fetch Politics news from BBC
     */
    async fetchBBCPolitics(): Promise<MarketDataItem[]> {
        const url = 'http://feeds.bbci.co.uk/news/politics/rss.xml';
        return this.fetchFeed(url, 'BBC News', 'politics');
    }

    async fetchNPRPolitics(): Promise<MarketDataItem[]> {
        const url = 'https://feeds.npr.org/1014/rss.xml'; // NPR Politics
        return this.fetchFeed(url, 'NPR', 'politics');
    }

    /**
     * Fetch Google Trends Daily (US)
     */
    async fetchGoogleTrends(): Promise<MarketDataItem[]> {
        const url = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=US';
        const items = await this.fetchFeed(url, 'Google Trends', 'trends');
        return items.map(item => ({
            ...item,
            category: 'trends',
            contentType: 'trend',
            // Google Trends RSS puts the traffic in description usually, or we parse it.
            // For now, treat as high impact trend.
            impact: 'high',
            tags: ['trending', ...(item.tags || [])]
        }));
    }

    /**
     * Fetch Politics news from Al Jazeera (International perspective)
     */
    async fetchAlJazeeraPolitics(): Promise<MarketDataItem[]> {
        const url = 'https://www.aljazeera.com/xml/rss/all.xml';
        const items = await this.fetchFeed(url, 'Al Jazeera', 'politics');
        // Filter to political content only
        return items.filter(item =>
            this.isPoliticalContent(item.title + ' ' + (item.description || ''))
        );
    }

    /**
     * Fetch Politics news from The Hill (US Congress focus)
     */
    async fetchTheHillPolitics(): Promise<MarketDataItem[]> {
        const url = 'https://thehill.com/feed/';
        const items = await this.fetchFeed(url, 'The Hill', 'politics');
        // Filter to core political content
        return items.filter(item =>
            this.isPoliticalContent(item.title + ' ' + (item.description || ''))
        );
    }

    /**
     * Fetch all politics feeds concurrently
     */
    async fetchAllPoliticsFeeds(): Promise<MarketDataItem[]> {
        const results = await Promise.allSettled([
            this.fetchGoogleNewsPolitics(),
            this.fetchBBCPolitics(),
            this.fetchNPRPolitics(),
            this.fetchAlJazeeraPolitics(),
            this.fetchTheHillPolitics(),
        ]);

        const allItems: MarketDataItem[] = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                allItems.push(...result.value);
            } else {
                this.logger.warn(`Feed fetch failed: ${result.reason}`);
            }
        }

        return allItems;
    }

    /**
     * Check if content is politically relevant
     */
    private isPoliticalContent(text: string): boolean {
        const politicalKeywords = [
            'election', 'president', 'congress', 'senate', 'parliament',
            'government', 'vote', 'legislation', 'bill', 'policy',
            'democrat', 'republican', 'party', 'campaign', 'minister',
            'prime minister', 'political', 'governor', 'secretary',
            'white house', 'capitol', 'law', 'court', 'supreme court'
        ];
        const lowerText = text.toLowerCase();
        return politicalKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Transform RSS item to MarketDataItem
     */
    private transformToMarketDataItem(item: any, source: string, category: string): MarketDataItem {
        const crypto = require('crypto');

        // Generate robust ID
        const generateId = (str: string) =>
            crypto.createHash('sha256').update(str).digest('hex');

        // Extract image
        let imageUrl = undefined;
        if (item.media?.$?.url) imageUrl = item.media.$.url;
        if (item.thumbnail?.$?.url) imageUrl = item.thumbnail.$.url; // YouTube style
        if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) imageUrl = item.enclosure.url;

        return {
            externalId: generateId(item.guid || item.link || item.title),
            source: 'rss',
            category: category,
            contentType: 'news',
            title: item.title || 'Untitled',
            description: item.contentSnippet || item.summary || '',
            content: item.content || item['content:encoded'] || '',
            url: item.link,
            imageUrl: imageUrl,
            sourceName: source, // e.g., 'BBC News'
            author: item.creator || item.author,
            publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
            tags: item.categories || [],
            metadata: {
                originalGuid: item.guid
            }
        };
    }
}
