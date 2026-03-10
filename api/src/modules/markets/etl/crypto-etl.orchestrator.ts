/**
 * Crypto ETL Orchestrator
 * 
 * ETL pipeline for cryptocurrency data from CoinGecko, CoinMarketCap, CryptoPanic.
 * Focus: BTC, ETH, SOL, XRP, HYPE
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { CoinGeckoClient, CoinMarketCapClient, CryptoPanicClient, FEATURED_CRYPTO_IDS } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class CryptoETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit, OnModuleDestroy {
    constructor(
        private readonly coinGecko: CoinGeckoClient,
        private readonly coinMarketCap: CoinMarketCapClient,
        private readonly cryptoPanic: CryptoPanicClient,
        private readonly configService: ConfigService,
        private readonly messagingService: MarketMessagingService
    ) {
        super('CryptoETLOrchestrator', 'crypto');
        this.syncInterval = 5 * 60 * 1000; // 5 minutes for crypto
    }

    async onModuleInit() {
        this.logger.log('Crypto ETL Orchestrator initialized');
        // Run initial sync after startup
        setTimeout(() => this.runSync(), 10000);
    }

    async onModuleDestroy() {
        this.logger.log('Crypto ETL Orchestrator shutting down');
    }

    /**
     * Scheduled sync every 5 minutes
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async scheduledSync() {
        await this.runSync();
    }

    /**
     * Main sync implementation
     */
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
            // 1. Fetch crypto prices
            this.logger.debug('Fetching crypto prices...');
            const prices = await this.fetchPrices();
            recordsFetched += prices.length;

            // Update crypto_assets table
            for (const price of prices) {
                await this.updateCryptoAsset(price);
                recordsUpdated++;
            }

            // Store major price updates to the generic feed (market_data_items)
            // This ensures the "Crypto" feed has content beyond just news
            await this.storePriceUpdates(prices);

            // 2. Fetch crypto news
            this.logger.debug('Fetching crypto news...');
            const news = await this.fetchNews();
            recordsFetched += news.length;

            // Transform and upsert news
            const newsItems = news.map(n => this.transformNewsToItem(n));

            // Enrich news items with scraped images
            await this.enrichItemsWithImages(newsItems);

            const newsStats = await this.upsertItems(newsItems);
            recordsCreated += newsStats.created;
            recordsUpdated += newsStats.updated;
            recordsSkipped += newsStats.skipped;
            recordsFailed += newsStats.failed;
            duplicatesFound += newsStats.duplicates;

            // 3. Fetch Fear & Greed Index
            this.logger.debug('Fetching Fear & Greed Index...');
            await this.fetchAndStoreFearGreed();

            // Streaming: Publish signal
            // (Note: signals are also published inside fetchAndStoreFearGreed)

        } catch (error) {
            errors.push((error as Error).message);
            this.logger.error(`Crypto sync error: ${(error as Error).message}`);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'coingecko,cryptopanic',
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

    /**
     * Fetch prices from CoinMarketCap (Primary) or CoinGecko (Fallback)
     */
    private async fetchPrices() {
        try {
            // Try CMC first (Primary source)
            this.logger.debug('Fetching prices from CoinMarketCap...');
            const cmcListings = await this.coinMarketCap.getLatestListings(20);

            if (cmcListings.length > 0) {
                return cmcListings.map(coin => ({
                    symbol: coin.symbol.toLowerCase(),
                    name: coin.name,
                    priceUsd: coin.quote.USD.price,
                    priceChange24h: coin.quote.USD.percent_change_24h,
                    priceChange7d: coin.quote.USD.percent_change_7d,
                    marketCap: coin.quote.USD.market_cap,
                    marketCapRank: coin.cmc_rank,
                    volume24h: coin.quote.USD.volume_24h,
                    circulatingSupply: coin.circulating_supply,
                    totalSupply: coin.total_supply,
                    maxSupply: coin.max_supply,
                    imageUrl: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`, // CMC Image URL pattern
                    atl: 0, // Not available in basic CMC call
                    ath: 0  // Not available in basic CMC call
                }));
            }

            // Fallback to CoinGecko
            this.logger.debug('Fallback to CoinGecko...');
            return await this.coinGecko.getFeaturedPrices();

        } catch (error) {
            this.logger.warn(`Failed to fetch prices: ${(error as Error).message}`);
            // Fallback
            try {
                return await this.coinGecko.getFeaturedPrices();
            } catch (fbError) {
                this.logger.error(`Fallback failed: ${(fbError as Error).message}`);
                return [];
            }
        }
    }

    /**
     * Fetch news from CryptoPanic
     */
    private async fetchNews() {
        try {
            // Fetch important/trending news for our featured currencies
            return await this.cryptoPanic.getNews({
                currencies: FEATURED_CRYPTO_IDS.symbols,
                filter: 'important', // "Berita terbesar"
                pageSize: 20,
            });
        } catch (error) {
            this.logger.warn(`Failed to fetch news: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Update crypto_assets table
     */
    private async updateCryptoAsset(asset: any) {
        try {
            await this.supabase.from('crypto_assets').upsert({
                symbol: asset.symbol,
                name: asset.name,
                source: 'coinmarketcap', // Defaulting to CMC since it's primary now. Ideally passed in asset object.
                price_usd: asset.priceUsd,
                price_change_24h: asset.priceChange24h,
                price_change_7d: asset.priceChange7d,
                market_cap: asset.marketCap,
                market_cap_rank: asset.marketCapRank,
                volume_24h: asset.volume24h,
                circulating_supply: asset.circulatingSupply,
                total_supply: asset.totalSupply,
                max_supply: asset.maxSupply,
                ath: asset.ath,
                ath_date: asset.athDate?.toISOString(),
                atl: asset.atl,
                atl_date: asset.atlDate?.toISOString(),
                image_url: asset.imageUrl,
                last_price_update: new Date().toISOString(),
                is_featured: true,
            }, {
                onConflict: 'symbol,source',
            });
        } catch (error) {
            this.logger.warn(`Failed to update crypto asset ${asset.symbol}: ${(error as Error).message}`);
        }
    }

    /**
     * Fetch and store Fear & Greed Index
     */
    private async fetchAndStoreFearGreed() {
        try {
            const fearGreed = await this.coinGecko.getFearGreedIndex();

            await this.supabase.from('crypto_fear_greed').upsert({
                value: fearGreed.value,
                value_classification: fearGreed.classification,
                timestamp: fearGreed.timestamp.toISOString(),
            }, {
                onConflict: 'timestamp',
            });
        } catch (error) {
            this.logger.warn(`Failed to fetch Fear & Greed: ${(error as Error).message}`);
        }
    }

    /**
     * Transform crypto news to market data item
     */
    private transformNewsToItem(news: any): MarketDataItem {
        // Get the first currency symbol if available for the image
        const primaryCurrency = news.currencies?.[0]?.toLowerCase() || 'btc';
        const fallbackImage = this.getCoinImageUrl(primaryCurrency);

        return {
            externalId: `cp_${news.id}`,
            source: 'cryptopanic',
            category: 'crypto',
            contentType: 'news',
            title: news.title,
            url: news.url,
            imageUrl: news.image || fallbackImage,
            sourceName: news.sourceTitle,
            publishedAt: news.publishedAt,
            tags: news.currencies || [],
            sentiment: news.sentiment,
            impact: news.isHot ? 'high' : 'medium',
            metadata: {
                votes: news.votes,
                isHot: news.isHot,
            },
        };
    }

    /**
     * Store major price updates to the generic market data feed
     */
    private async storePriceUpdates(prices: any[]) {
        if (prices.length === 0) return;

        // Filter for significant coins (BTC, ETH, SOL, XRP, BNB, HYPE) to reduce noise
        const topCoins = prices.filter(p => ['btc', 'eth', 'sol', 'xrp', 'bnb', 'hype'].includes(p.symbol.toLowerCase()));

        const timestamp = new Date();
        const hourKey = timestamp.toISOString().slice(0, 13); // key by hour to avoid spam

        const feedItems: MarketDataItem[] = topCoins.map(coin => {
            const trend = coin.priceChange24h > 0 ? '📈' : '📉';
            const sentiment = coin.priceChange24h > 0 ? 'bullish' : 'bearish';

            // Use coin image from API or fallback to popular coin logos
            const coinImageUrl = coin.imageUrl || this.getCoinImageUrl(coin.symbol.toLowerCase());

            return {
                externalId: this.generateContentHash(`${coin.symbol}-price-${hourKey}`, 'coingecko'),
                source: 'coingecko', // or coinmarketcap
                category: 'crypto',
                contentType: 'price',
                title: `${coin.name} Price Update: $${coin.priceUsd.toLocaleString()}`,
                description: `${coin.name} (${coin.symbol.toUpperCase()}) is trading at $${coin.priceUsd.toLocaleString()}. 24h Change: ${trend} ${coin.priceChange24h.toFixed(2)}%.`,
                sourceName: 'Market Data',
                publishedAt: timestamp,
                imageUrl: coinImageUrl,
                sentiment: sentiment as any,
                sentimentScore: coin.priceChange24h / 100, // Normalized roughly
                impact: Math.abs(coin.priceChange24h) > 5 ? 'high' : 'medium',
                metadata: {
                    symbol: coin.symbol,
                    price: coin.priceUsd,
                    change24h: coin.priceChange24h
                }
            };
        });

        await this.upsertItems(feedItems);
    }

    /**
     * Get coin image URL with fallbacks
     */
    private getCoinImageUrl(symbol: string): string {
        // CoinGecko fallback images for popular coins
        const coinImages: Record<string, string> = {
            'btc': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
            'eth': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
            'sol': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
            'xrp': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
            'bnb': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            'ada': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
            'doge': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
            'avax': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
            'dot': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
            'matic': 'https://assets.coingecko.com/coins/images/4713/large/polygon.png',
            'link': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
            'uni': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-logo.png',
            'atom': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
            'ltc': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
            'hype': 'https://assets.coingecko.com/coins/images/37396/large/hyperliquid.png',
        };
        return coinImages[symbol] || 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&q=80&w=600';
    }
}
