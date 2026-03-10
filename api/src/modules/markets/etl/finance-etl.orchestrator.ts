/**
 * Finance ETL Orchestrator
 * 
 * ETL pipeline for financial data from Alpha Vantage, NewsAPI.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { AlphaVantageClient, NewsAPIClient, FREDClient, RSSClient } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class FinanceETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    private alphaVantage: AlphaVantageClient;
    private newsApi: NewsAPIClient;
    private fred: FREDClient;
    private rss: RSSClient;

    constructor(
        private readonly configService: ConfigService,
        private readonly messagingService: MarketMessagingService
    ) {
        super('FinanceETLOrchestrator', 'finance');
        this.syncInterval = 60 * 60 * 1000; // 1 hour

        this.alphaVantage = new AlphaVantageClient(configService);
        this.newsApi = new NewsAPIClient(configService);
        this.fred = new FREDClient(configService);
        this.rss = new RSSClient();
    }

    async onModuleInit() {
        this.logger.log('Finance ETL Orchestrator initialized');
        setTimeout(() => this.runSync(), 25000);
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

        try {
            // 1. Fetch economic indicators (AV + FRED)
            this.logger.debug('Fetching economic indicators...');
            await this.fetchAndStoreIndicators();
            recordsFetched += 4; // 4 indicators

            // 2. Fetch finance news (NewsAPI + Yahoo RSS)
            this.logger.debug('Fetching finance news...');
            const financeNews = await this.fetchFinanceNews();
            const yahooItems = await this.fetchYahooFinanceRSS();
            recordsFetched += financeNews.length + yahooItems.length;

            const newsItems = [
                ...financeNews.map(n => this.transformNewsToItem(n)),
                ...yahooItems
            ];

            // Enrich items with scraped images (for items missing images)
            await this.enrichItemsWithImages(newsItems);

            const newsStats = await this.upsertItems(newsItems);
            recordsCreated += newsStats.created;
            recordsUpdated += newsStats.updated;
            duplicatesFound += newsStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('finance', newsItems, 'news_update');

        } catch (error) {
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'alpha_vantage,newsapi,fred,yahoo',
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

    private async fetchAndStoreIndicators() {
        try {
            // Alpha Vantage
            const fedRate = await this.alphaVantage.getFederalFundsRate();
            if (fedRate && fedRate.data.length > 0) {
                await this.storeIndicator('interest_rate', 'Federal Funds Rate', fedRate);
            }

            // FRED (if key available)
            const gdp = await this.fred.getGDP();
            if (gdp.length > 0) {
                await this.storeFredIndicator('gdp', 'Gross Domestic Product', gdp, 'Billions of Dollars');
            }

            const cpi = await this.fred.getCPI();
            if (cpi.length > 0) {
                await this.storeFredIndicator('cpi', 'Consumer Price Index', cpi, 'Index 1982-1984=100');
            }

        } catch (error) {
            this.logger.warn(`Failed to fetch indicators: ${(error as Error).message}`);
        }
    }

    private async storeIndicator(type: string, name: string, data: any) {
        for (const point of data.data.slice(0, 5)) {
            try {
                await this.supabase.from('finance_indicators').upsert({
                    indicator_type: type,
                    name,
                    source: 'alpha_vantage',
                    current_value: point.value,
                    value_date: point.date,
                    unit: data.unit,
                    country: 'US',
                }, {
                    onConflict: 'indicator_type,country,value_date',
                });
            } catch (error) {
                this.logger.warn(`Failed to store indicator: ${(error as Error).message}`);
            }
        }

        // Stream latest indicator
        if (data.data.length > 0) {
            const latest = data.data[0];
            await this.messagingService.publishMessage('finance', {
                type,
                name,
                value: latest.value,
                date: latest.date,
                unit: data.unit
            }, 'indicator_update');
        }
    }

    private async storeFredIndicator(type: string, name: string, data: any[], unit: string) {
        // Re-use logic similar to storeIndicator but adapted for FRED format
        const latest = data[0];
        if (!latest) return;

        await this.supabase.from('finance_indicators').upsert({
            indicator_type: type,
            name,
            source: 'fred',
            current_value: latest.value,
            value_date: latest.date,
            unit,
            country: 'US'
        }, { onConflict: 'indicator_type,country,value_date' });

        await this.messagingService.publishMessage('finance', {
            type, name, value: latest.value, date: latest.date, unit
        }, 'indicator_update');
    }

    private async fetchFinanceNews() {
        try {
            return await this.newsApi.getNewsByCategory('finance', 20);
        } catch (error) {
            this.logger.warn(`Failed to fetch finance news: ${(error as Error).message}`);
            return [];
        }
    }

    private async fetchYahooFinanceRSS(): Promise<MarketDataItem[]> {
        const url = 'https://finance.yahoo.com/news/rssindex';
        try {
            return await this.rss.fetchFeed(url, 'Yahoo Finance', 'finance');
        } catch (e) {
            this.logger.warn('Failed to fetch Yahoo RSS');
            return [];
        }
    }

    private transformNewsToItem(article: any): MarketDataItem {
        const transformed = this.newsApi.transformToMarketDataItem(article, 'finance');
        return {
            ...transformed,
            sentiment: this.analyzeSentiment(article.title).sentiment,
        };
    }
}
