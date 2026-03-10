/**
 * NewsAPI Client
 * 
 * Client for fetching news from NewsAPI.org
 * Used for: Politics, Finance, Tech, Latest categories
 * 
 * Rate Limits (Free tier):
 * - 100 requests per day
 * - No minute limit specified
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// NewsAPI Response Types
export interface NewsArticle {
    source: {
        id: string | null;
        name: string;
    };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
}

export interface NewsAPIResponse {
    status: string;
    totalResults: number;
    articles: NewsArticle[];
}

export interface NewsAPIError {
    status: string;
    code: string;
    message: string;
}

// Category mapping for NewsAPI queries
export const NEWS_CATEGORY_QUERIES: Record<string, string[]> = {
    politics: ['politics', 'election', 'government', 'policy', 'democracy'],
    finance: ['stock market', 'economy', 'federal reserve', 'interest rates', 'banking'],
    tech: ['technology', 'AI', 'artificial intelligence', 'startup', 'software'],
    latest: ['breaking news', 'world news', 'trending'],
};

export const NEWS_CATEGORY_DOMAINS: Record<string, string> = {
    politics: 'bbc.com,reuters.com,politico.com,cnn.com,washingtonpost.com',
    finance: 'bloomberg.com,reuters.com,cnbc.com,wsj.com,ft.com',
    tech: 'techcrunch.com,theverge.com,wired.com,arstechnica.com,engadget.com',
    latest: 'bbc.com,reuters.com,cnn.com,theguardian.com,nytimes.com',
};

const NEWSAPI_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 50, // Conservative limit
    requestsPerDay: 95, // Leave buffer for free tier
    retryAfterMs: 3600000, // 1 hour retry for daily limit
};

@Injectable()
export class NewsAPIClient extends BaseAPIClient {
    constructor(private readonly configService: ConfigService) {
        super(
            'NewsAPIClient',
            'https://newsapi.org/v2',
            configService.get<string>('NEWSAPI_KEY'),
            NEWSAPI_RATE_LIMIT
        );

        if (!this.apiKey) {
            this.logger.warn('NEWSAPI_KEY not configured. NewsAPI requests will fail.');
        }
    }

    protected getAuthHeaders(): Record<string, string> {
        if (!this.apiKey) return {};
        return {
            'X-Api-Key': this.apiKey,
        };
    }

    /**
     * Get top headlines by category
     */
    async getTopHeadlines(
        category?: string,
        country: string = 'us',
        pageSize: number = 20
    ): Promise<NewsArticle[]> {
        const endpoint = `/top-headlines?country=${country}&pageSize=${Math.min(pageSize, 100)}${category ? `&category=${this.sanitizeInput(category)}` : ''
            }`;

        try {
            const response = await this.makeRequest<NewsAPIResponse>(endpoint);

            if (response.status !== 'ok') {
                throw new Error(`NewsAPI error: ${response.status}`);
            }

            this.logger.debug(`Fetched ${response.articles.length} headlines`);
            return response.articles;
        } catch (error) {
            this.logger.error(`Failed to fetch headlines: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Search everything with query
     */
    async searchNews(
        query: string,
        options: {
            domains?: string;
            from?: string;
            to?: string;
            language?: string;
            sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
            pageSize?: number;
        } = {}
    ): Promise<NewsArticle[]> {
        const sanitizedQuery = this.sanitizeInput(query);
        const params = new URLSearchParams({
            q: sanitizedQuery,
            language: options.language || 'en',
            sortBy: options.sortBy || 'publishedAt',
            pageSize: String(Math.min(options.pageSize || 20, 100)),
        });

        if (options.domains) {
            params.set('domains', options.domains);
        }
        if (options.from) {
            params.set('from', options.from);
        }
        if (options.to) {
            params.set('to', options.to);
        }

        const endpoint = `/everything?${params.toString()}`;

        try {
            if (!this.apiKey) {
                this.logger.warn('NewsAPI key not configured - skipping request');
                return [];
            }

            const response = await this.makeRequest<NewsAPIResponse | NewsAPIError>(endpoint);

            // Check for API error response
            if ('code' in response && response.status === 'error') {
                if (response.code === 'apiKeyInvalid' || response.code === 'apiKeyExhausted') {
                    this.logger.error(`NewsAPI key error: ${response.message}. Free tier only works from localhost.`);
                    return [];
                }
                throw new Error(`NewsAPI error: ${response.message}`);
            }

            if (response.status !== 'ok') {
                throw new Error(`NewsAPI error: ${response.status}`);
            }

            const apiResponse = response as NewsAPIResponse;
            this.logger.debug(`Searched and found ${apiResponse.articles?.length || 0} articles for "${query}"`);
            return apiResponse.articles || [];
        } catch (error) {
            const errMsg = (error as Error).message;
            // Handle 401 gracefully - usually means free tier restriction
            if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
                this.logger.warn(`NewsAPI free tier restriction: API only works from localhost. Consider upgrading to paid tier.`);
                return [];
            }
            this.logger.error(`Failed to search news: ${errMsg}`);
            throw error;
        }
    }

    /**
     * Get news by market category
     */
    async getNewsByCategory(
        category: 'politics' | 'finance' | 'tech' | 'latest',
        pageSize: number = 20
    ): Promise<NewsArticle[]> {
        const queries = NEWS_CATEGORY_QUERIES[category] || [];
        const domains = NEWS_CATEGORY_DOMAINS[category];

        if (queries.length === 0) {
            return this.getTopHeadlines(category, 'us', pageSize);
        }

        // Use first query term with domain filtering
        const query = queries[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        return this.searchNews(query, {
            domains,
            from,
            sortBy: 'publishedAt',
            pageSize,
        });
    }

    /**
     * Transform NewsAPI article to unified format
     */
    transformToMarketDataItem(article: NewsArticle, category: string): {
        externalId: string;
        source: string;
        category: string;
        title: string;
        description?: string;
        content?: string;
        url: string;
        imageUrl?: string;
        sourceName: string;
        author?: string;
        publishedAt: Date;
        tags: string[];
    } {
        return {
            externalId: this.generateArticleId(article),
            source: 'newsapi',
            category,
            title: article.title,
            description: article.description || undefined,
            content: article.content || undefined,
            url: article.url,
            imageUrl: article.urlToImage || undefined,
            sourceName: article.source.name,
            author: article.author || undefined,
            publishedAt: new Date(article.publishedAt),
            tags: this.extractTags(article.title, article.description),
        };
    }

    /**
     * Generate unique ID for article
     */
    private generateArticleId(article: NewsArticle): string {
        const crypto = require('crypto');
        const content = `${article.url}::${article.publishedAt}`;
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
    }

    /**
     * Extract tags from article content
     */
    private extractTags(title: string, description: string | null): string[] {
        const text = `${title} ${description || ''}`.toLowerCase();
        const tags: string[] = [];

        const keywords = [
            'ai', 'bitcoin', 'crypto', 'election', 'stock', 'tech', 'climate',
            'government', 'economy', 'inflation', 'federal reserve', 'startup'
        ];

        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                tags.push(keyword);
            }
        }

        return tags.slice(0, 10); // Limit tags
    }
}
