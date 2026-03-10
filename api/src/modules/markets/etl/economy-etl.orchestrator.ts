/**
 * Economy ETL Orchestrator
 * 
 * ETL pipeline for economy data from World Bank, GDELT.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { WorldBankClient, GDELTClient, IMFClient, OECDClient, AlphaVantageClient } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class EconomyETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    constructor(
        private readonly worldBank: WorldBankClient,
        private readonly imf: IMFClient,
        private readonly oecd: OECDClient,
        private readonly alphaVantage: AlphaVantageClient,
        private readonly gdelt: GDELTClient,
        private readonly messagingService: MarketMessagingService
    ) {
        super('EconomyETLOrchestrator', 'economy');
        this.syncInterval = 24 * 60 * 60 * 1000; // 24 hours
    }

    async onModuleInit() {
        this.logger.log('Economy ETL Orchestrator initialized');
        setTimeout(() => this.runSync(), 35000);
    }

    @Cron('0 0 * * *') // Daily at midnight
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
            // 1. Fetch World Bank data for major economies
            this.logger.debug('Fetching World Bank data...');
            const countryData = await this.fetchWorldBankData();
            recordsFetched += Object.keys(countryData).length;

            // 1b. Fetch IMF Data (Inflation, GDP)
            try {
                this.logger.debug('Fetching IMF major economic indicators...');
                const imfData = await this.imf.getMajorEconomicIndicators('US'); // Example: US
                recordsFetched += imfData.length;
                await this.storeEconomicIndicators(imfData, 'imf');
            } catch (err) {
                this.logger.warn(`IMF sync failed: ${(err as Error).message}`);
                errors.push(`IMF: ${(err as Error).message}`);
            }

            // 1c. Fetch OECD Data
            try {
                this.logger.debug('Fetching OECD MEI data...');
                const oecdData = await this.oecd.getMEI('USA', 'LORSGP'); // Example: US GDP
                recordsFetched += oecdData.length;
                await this.storeEconomicIndicators(oecdData.map(d => ({
                    indicatorId: d.subject,
                    date: d.date,
                    value: d.value,
                    area: d.location
                })), 'oecd');
            } catch (err) {
                this.logger.warn(`OECD sync failed: ${(err as Error).message}`);
                errors.push(`OECD: ${(err as Error).message}`);
            }

            // 1d. Fetch Alpha Vantage Data
            try {
                this.logger.debug('Fetching Alpha Vantage economic indicators...');
                const avRealGDP = await this.alphaVantage.getRealGDP();
                if (avRealGDP) {
                    recordsFetched += avRealGDP.data.length;
                    await this.storeEconomicIndicators(avRealGDP.data.map(d => ({
                        indicatorId: 'REAL_GDP',
                        date: d.date,
                        value: d.value,
                        area: 'USA' // AV returns US data mostly for these endpoints
                    })), 'alpha_vantage');
                }
            } catch (err) {
                this.logger.warn(`AlphaVantage sync failed: ${(err as Error).message}`);
                errors.push(`AlphaVantage: ${(err as Error).message}`);
            }

            // 2. Fetch economic news from GDELT
            this.logger.debug('Fetching economic news...');
            const economicNews = await this.fetchEconomicNews();
            recordsFetched += economicNews.length;

            const newsItems = economicNews.map(n => this.transformGDELTToItem(n));

            // Enrich news items with scraped images
            await this.enrichItemsWithImages(newsItems);

            const newsStats = await this.upsertItems(newsItems);
            recordsCreated += newsStats.created;
            recordsUpdated += newsStats.updated;
            duplicatesFound += newsStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('economy', newsItems, 'news_update');

        } catch (error) {
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'worldbank,gdelt',
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

    private async fetchWorldBankData() {
        try {
            return await this.worldBank.getMajorEconomies();
        } catch (error) {
            this.logger.warn(`Failed to fetch World Bank data: ${(error as Error).message}`);
            return {};
        }
    }

    private async fetchEconomicNews() {
        try {
            return await this.gdelt.getEconomicNews(25);
        } catch (error) {
            this.logger.warn(`Failed to fetch economic news: ${(error as Error).message}`);
            return [];
        }
    }

    private transformGDELTToItem(article: any): MarketDataItem {
        return {
            externalId: this.generateContentHash(article.url || article.title, 'gdelt'),
            source: 'gdelt',
            category: 'economy',
            contentType: 'news',
            title: article.title,
            url: article.url,
            imageUrl: article.socialImage,
            sourceName: article.domain,
            publishedAt: article.seenDate,
            sentimentScore: article.tone ? article.tone / 10 : 0,
            sentiment: article.tone ? (article.tone > 1 ? 'bullish' : article.tone < -1 ? 'bearish' : 'neutral') : 'neutral',
        };
    }

    private async storeEconomicIndicators(data: any[], source: string) {
        if (data.length === 0) return;

        // 1. Convert to Feed Items (for the generic 'Economy' feed)
        const feedItems: MarketDataItem[] = data.map(record => {
            const date = record.date ? new Date(record.date) : new Date();
            const valueStr = typeof record.value === 'number'
                ? record.value.toLocaleString('en-US')
                : record.value;

            // Generate a descriptive title
            let title = '';
            let indicatorName = record.indicatorId || 'Economic Indicator';

            if (source === 'imf') {
                title = `IMF Report: ${indicatorName} for ${record.area || 'Global'}`;
            } else if (source === 'oecd') {
                title = `OECD Data: ${indicatorName} (${record.area})`;
            } else if (source === 'alpha_vantage') {
                title = `US Real GDP Update: ${valueStr}`;
                indicatorName = 'Real GDP';
            } else {
                title = `Economic Update: ${indicatorName}`;
            }

            // Get country flag/economy image based on area
            const imageUrl = this.getEconomyImageUrl(record.area || source);

            return {
                externalId: this.generateContentHash(`${source}-${record.indicatorId}-${date.getTime()}`, source),
                source: source as any,
                category: 'economy',
                contentType: 'indicator',
                title: title,
                description: `Latest ${indicatorName} data released. Value: ${valueStr}`,
                sourceName: source.toUpperCase(),
                publishedAt: date,
                imageUrl: imageUrl,
                sentiment: 'neutral', // Indicators are neutral unless analyzed
                sentimentScore: 0,
                impact: 'medium',
                metadata: {
                    value: record.value,
                    unit: record.unit,
                    area: record.area
                }
            };
        });

        // 2. Persist to generic feed
        const stats = await this.upsertItems(feedItems);
        this.logger.log(`Synced ${source} indicators: ${stats.created} created, ${stats.updated} updated.`);

        // 3. Persist to specialized table (optional/future: economy_global_indicators)
        // For now, the Unified Feed is the priority for the user's UI.
    }

    /**
     * Get economy-themed image based on country or source
     */
    private getEconomyImageUrl(area: string): string {
        // Country flag images from FlagCDN (high quality SVGs)
        const countryFlags: Record<string, string> = {
            'USA': 'https://flagcdn.com/w320/us.png',
            'US': 'https://flagcdn.com/w320/us.png',
            'United States': 'https://flagcdn.com/w320/us.png',
            'China': 'https://flagcdn.com/w320/cn.png',
            'CHN': 'https://flagcdn.com/w320/cn.png',
            'Japan': 'https://flagcdn.com/w320/jp.png',
            'JPN': 'https://flagcdn.com/w320/jp.png',
            'Germany': 'https://flagcdn.com/w320/de.png',
            'DEU': 'https://flagcdn.com/w320/de.png',
            'United Kingdom': 'https://flagcdn.com/w320/gb.png',
            'GBR': 'https://flagcdn.com/w320/gb.png',
            'UK': 'https://flagcdn.com/w320/gb.png',
            'France': 'https://flagcdn.com/w320/fr.png',
            'FRA': 'https://flagcdn.com/w320/fr.png',
            'India': 'https://flagcdn.com/w320/in.png',
            'IND': 'https://flagcdn.com/w320/in.png',
            'Italy': 'https://flagcdn.com/w320/it.png',
            'ITA': 'https://flagcdn.com/w320/it.png',
            'Canada': 'https://flagcdn.com/w320/ca.png',
            'CAN': 'https://flagcdn.com/w320/ca.png',
            'South Korea': 'https://flagcdn.com/w320/kr.png',
            'KOR': 'https://flagcdn.com/w320/kr.png',
            'Russia': 'https://flagcdn.com/w320/ru.png',
            'RUS': 'https://flagcdn.com/w320/ru.png',
            'Brazil': 'https://flagcdn.com/w320/br.png',
            'BRA': 'https://flagcdn.com/w320/br.png',
            'Australia': 'https://flagcdn.com/w320/au.png',
            'AUS': 'https://flagcdn.com/w320/au.png',
            'Spain': 'https://flagcdn.com/w320/es.png',
            'ESP': 'https://flagcdn.com/w320/es.png',
            'Mexico': 'https://flagcdn.com/w320/mx.png',
            'MEX': 'https://flagcdn.com/w320/mx.png',
            'Indonesia': 'https://flagcdn.com/w320/id.png',
            'IDN': 'https://flagcdn.com/w320/id.png',
            'Netherlands': 'https://flagcdn.com/w320/nl.png',
            'NLD': 'https://flagcdn.com/w320/nl.png',
            'Switzerland': 'https://flagcdn.com/w320/ch.png',
            'CHE': 'https://flagcdn.com/w320/ch.png',
            'Saudi Arabia': 'https://flagcdn.com/w320/sa.png',
            'SAU': 'https://flagcdn.com/w320/sa.png',
            'Global': 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&q=80&w=600',
        };

        // Return flag if found, else default economy image
        return countryFlags[area] || 'https://images.unsplash.com/photo-1611974765270-ca12586343bb?auto=format&fit=crop&q=80&w=600';
    }
}
