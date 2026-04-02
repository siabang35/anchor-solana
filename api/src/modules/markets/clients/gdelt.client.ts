/**
 * GDELT Client
 * 
 * Client for GDELT Project API - Global event database monitoring
 * Used for: Politics, Economy, Signals categories
 * 
 * Rate Limits: No strict limits but should be respectful
 */

import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

export interface GDELTEvent {
    globalEventId: string;
    dateAdded: Date;
    actor1Name?: string;
    actor1CountryCode?: string;
    actor1Type?: string;
    actor2Name?: string;
    actor2CountryCode?: string;
    eventCode?: string;
    eventRootCode?: string;
    quadClass: number; // 1-4 (Verbal Cooperation, Material Cooperation, Verbal Conflict, Material Conflict)
    goldsteinScale: number; // -10 to +10
    numMentions: number;
    numSources: number;
    numArticles: number;
    avgTone: number;
    sourceUrl?: string;
}

export interface GDELTArticle {
    url: string;
    title: string;
    seenDate: Date;
    socialImage?: string;
    domain: string;
    language: string;
    sourcecountry?: string;
    tone?: number;
}

const GDELT_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    retryAfterMs: 1000,
};

@Injectable()
export class GDELTClient extends BaseAPIClient {
    constructor() {
        super(
            'GDELTClient',
            'https://api.gdeltproject.org/api/v2',
            undefined,
            GDELT_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Search GDELT DOC API for articles
     */
    async searchArticles(
        query: string,
        options: {
            maxRecords?: number;
            mode?: 'artlist' | 'timelinevol' | 'timelinetone';
            timespan?: string; // e.g., '24h', '1w', '1m'
            sourceLang?: string;
            sourceCountry?: string;
        } = {}
    ): Promise<GDELTArticle[]> {
        const sanitizedQuery = encodeURIComponent(this.sanitizeInput(query));
        const params = new URLSearchParams({
            query: sanitizedQuery,
            mode: options.mode || 'artlist',
            maxrecords: String(options.maxRecords || 25),
            format: 'json',
        });

        if (options.timespan) {
            params.set('timespan', options.timespan);
        }
        if (options.sourceLang) {
            params.set('sourcelang', options.sourceLang);
        }
        if (options.sourceCountry) {
            params.set('sourcecountry', options.sourceCountry);
        }

        const endpoint = `/doc/doc?${params.toString()}`;

        try {
            const response = await this.makeRequest<any>(endpoint, { timeout: 5000, retries: 0 });

            if (!response.articles) {
                return [];
            }

            return response.articles.map((article: any) => this.transformArticle(article));
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
                this.logger.debug(`GDELT unavailable - network issue`);
            } else {
                this.logger.warn(`GDELT search failed: ${msg}`);
            }
            return [];
        }
    }

    /**
     * Get political news
     */
    async getPoliticalNews(limit: number = 25): Promise<GDELTArticle[]> {
        return this.searchArticles('politics OR election OR government OR parliament', {
            maxRecords: limit,
            timespan: '24h',
            sourceLang: 'eng',
        });
    }

    /**
     * Get economic news
     */
    async getEconomicNews(limit: number = 25): Promise<GDELTArticle[]> {
        return this.searchArticles('economy OR gdp OR inflation OR central bank OR interest rate', {
            maxRecords: limit,
            timespan: '24h',
            sourceLang: 'eng',
        });
    }

    /**
     * Get news by country
     */
    async getNewsByCountry(countryCode: string, limit: number = 25): Promise<GDELTArticle[]> {
        return this.searchArticles(`sourcecountry:${countryCode}`, {
            maxRecords: limit,
            timespan: '24h',
        });
    }

    /**
     * Get global events (GKG)
     */
    async getGlobalEvents(
        theme: string,
        options: {
            timespan?: string;
            maxRecords?: number;
        } = {}
    ): Promise<GDELTArticle[]> {
        return this.searchArticles(`theme:${theme}`, {
            maxRecords: options.maxRecords || 25,
            timespan: options.timespan || '24h',
        });
    }

    /**
     * Get tone timeline for a topic
     */
    async getToneTrend(
        query: string,
        timespan: string = '7d'
    ): Promise<{ date: string; tone: number }[]> {
        const sanitizedQuery = encodeURIComponent(this.sanitizeInput(query));
        const params = new URLSearchParams({
            query: sanitizedQuery,
            mode: 'timelinetone',
            timespan,
            format: 'json',
        });

        const endpoint = `/doc/doc?${params.toString()}`;

        try {
            const response = await this.makeRequest<any>(endpoint, { timeout: 5000, retries: 0 });

            if (!response.timeline) {
                return [];
            }

            return response.timeline.map((item: any) => ({
                date: item.date,
                tone: parseFloat(item.tonemean) || 0,
            }));
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
                this.logger.debug(`GDELT tone trend unavailable - network issue`);
            } else {
                this.logger.warn(`GDELT tone trend failed: ${msg}`);
            }
            return [];
        }
    }

    private transformArticle(article: any): GDELTArticle {
        return {
            url: article.url,
            title: article.title,
            seenDate: new Date(article.seendate),
            socialImage: article.socialimage,
            domain: article.domain,
            language: article.language,
            sourcecountry: article.sourcecountry,
            tone: article.tone ? parseFloat(article.tone) : undefined,
        };
    }

    /**
     * Transform GDELT article to unified market data format
     */
    transformToMarketDataItem(article: GDELTArticle, category: string) {
        const crypto = require('crypto');
        return {
            externalId: crypto.createHash('sha256').update(article.url).digest('hex').substring(0, 32),
            source: 'gdelt',
            category,
            title: article.title,
            description: null,
            content: null,
            url: article.url,
            imageUrl: article.socialImage,
            sourceName: article.domain,
            author: null,
            publishedAt: article.seenDate,
            sentimentScore: article.tone ? article.tone / 10 : 0, // Normalize to -1 to 1
        };
    }
}
