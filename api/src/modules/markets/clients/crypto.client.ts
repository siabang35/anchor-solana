/**
 * Crypto API Client
 * 
 * Unified client for cryptocurrency data from multiple sources:
 * - CoinGecko (free, primary for prices)
 * - CoinMarketCap (with API key, for market data)
 * - CryptoPanic (with API key, for news)
 * 
 * Focus: BTC, ETH, SOL, XRP, HYPE
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';
import { CoinMarketCapClient, CMCQuote } from './coinmarketcap.client.js';

// ========================
// Type Definitions
// ========================

export interface CryptoAsset {
    id: string;
    symbol: string;
    name: string;
    priceUsd: number;
    priceBtc?: number;
    priceChange24h: number;
    priceChange7d?: number;
    marketCap: number;
    marketCapRank: number;
    volume24h: number;
    circulatingSupply?: number;
    totalSupply?: number;
    maxSupply?: number;
    ath?: number;
    athDate?: Date;
    atl?: number;
    atlDate?: Date;
    imageUrl?: string;
    lastUpdated: Date;
}

export interface CryptoNews {
    id: string;
    title: string;
    url: string;
    sourceDomain: string;
    sourceTitle: string;
    publishedAt: Date;
    currencies: string[];
    sentiment?: 'bullish' | 'bearish' | 'neutral';
    isHot?: boolean;
    votes?: {
        positive: number;
        negative: number;
        important: number;
    };
}

export interface FearGreedIndex {
    value: number;
    classification: string;
    timestamp: Date;
}

// Featured crypto IDs
export const FEATURED_CRYPTO_IDS = {
    coingecko: ['bitcoin', 'ethereum', 'solana', 'ripple', 'hyperliquid', 'binancecoin'],
    symbols: ['BTC', 'ETH', 'SOL', 'XRP', 'HYPE', 'BNB'],
};

// ========================
// CoinGecko Client
// ========================

const COINGECKO_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 30, // Free tier: 10-50 calls/min
    requestsPerDay: 10000,
    retryAfterMs: 60000,
};

@Injectable()
export class CoinGeckoClient extends BaseAPIClient {
    constructor() {
        super(
            'CoinGeckoClient',
            'https://api.coingecko.com/api/v3',
            undefined, // No API key needed for free tier
            COINGECKO_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get prices for featured cryptocurrencies
     */
    async getFeaturedPrices(): Promise<CryptoAsset[]> {
        const ids = FEATURED_CRYPTO_IDS.coingecko.join(',');
        const endpoint = `/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d`;

        try {
            const response = await this.makeRequest<any[]>(endpoint);
            return response.map(coin => this.transformCoinGeckoData(coin));
        } catch (error) {
            this.logger.error(`Failed to fetch featured prices: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get single coin data
     */
    async getCoinData(coinId: string): Promise<CryptoAsset> {
        const endpoint = `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;

        try {
            const response = await this.makeRequest<any>(endpoint);
            return this.transformCoinGeckoDetailData(response);
        } catch (error) {
            this.logger.error(`Failed to fetch coin data for ${coinId}: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Fear & Greed Index (alternative.me)
     * Uses curl as fallback since Node.js https has DNS issues on some systems
     * Falls back to calculated sentiment if API fails
     */
    async getFearGreedIndex(): Promise<FearGreedIndex> {
        // Try using curl (works better than Node.js https on some systems)
        try {
            const result = await this.fetchWithCurl('https://api.alternative.me/fng/?limit=1');
            const parsed = JSON.parse(result) as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };

            if (parsed.data && parsed.data.length > 0) {
                const latest = parsed.data[0];
                return {
                    value: parseInt(latest.value, 10),
                    classification: latest.value_classification,
                    timestamp: new Date(parseInt(latest.timestamp, 10) * 1000),
                };
            }
        } catch (error) {
            this.logger.warn(`alternative.me API failed, calculating sentiment from market data: ${(error as Error).message}`);
        }

        // Fallback: Calculate sentiment from BTC price change
        return this.calculateMarketSentiment();
    }

    /**
     * Fetch URL using curl (more reliable on some systems)
     */
    private fetchWithCurl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            const timeout = 10000; // 10 seconds

            exec(`curl -s --max-time 10 "${url}"`, { timeout }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    reject(new Error(`curl failed: ${error.message}`));
                    return;
                }
                if (stderr && !stdout) {
                    reject(new Error(`curl error: ${stderr}`));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    /**
     * Calculate market sentiment based on BTC price change (fallback)
     */
    private async calculateMarketSentiment(): Promise<FearGreedIndex> {
        try {
            // Get BTC data
            const btcData = await this.getCoinData('bitcoin');
            const priceChange = btcData.priceChange24h;

            // Simple sentiment calculation based on 24h price change
            // -10% or worse = Extreme Fear (10-20)
            // -5% to -10% = Fear (21-40)
            // -2% to -5% = Neutral-Fear (41-50)
            // -2% to +2% = Neutral (45-55)
            // +2% to +5% = Neutral-Greed (51-60)
            // +5% to +10% = Greed (61-80)
            // +10% or more = Extreme Greed (81-100)

            let value: number;
            let classification: string;

            if (priceChange <= -10) {
                value = Math.max(10, 20 + Math.floor(priceChange));
                classification = 'Extreme Fear';
            } else if (priceChange <= -5) {
                value = 25 + Math.floor((priceChange + 10) * 3);
                classification = 'Fear';
            } else if (priceChange <= -2) {
                value = 40 + Math.floor((priceChange + 5) * 3);
                classification = 'Fear';
            } else if (priceChange <= 2) {
                value = 50;
                classification = 'Neutral';
            } else if (priceChange <= 5) {
                value = 55 + Math.floor((priceChange - 2) * 2);
                classification = 'Greed';
            } else if (priceChange <= 10) {
                value = 65 + Math.floor((priceChange - 5) * 3);
                classification = 'Greed';
            } else {
                value = Math.min(95, 80 + Math.floor((priceChange - 10) * 1.5));
                classification = 'Extreme Greed';
            }

            this.logger.debug(`Calculated sentiment: ${value} (${classification}) based on BTC 24h change: ${priceChange.toFixed(2)}%`);

            return {
                value: Math.max(0, Math.min(100, value)),
                classification,
                timestamp: new Date(),
            };
        } catch (error) {
            // Ultimate fallback: return neutral sentiment
            this.logger.warn(`Failed to calculate sentiment, returning neutral: ${(error as Error).message}`);
            return {
                value: 50,
                classification: 'Neutral',
                timestamp: new Date(),
            };
        }
    }

    /**
     * Get price history for charts
     */
    async getPriceHistory(
        coinId: string,
        days: number = 7
    ): Promise<{ timestamp: Date; price: number }[]> {
        const endpoint = `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;

        try {
            const response = await this.makeRequest<{ prices: [number, number][] }>(endpoint);
            return response.prices.map(([timestamp, price]) => ({
                timestamp: new Date(timestamp),
                price,
            }));
        } catch (error) {
            this.logger.error(`Failed to fetch price history for ${coinId}: ${(error as Error).message}`);
            throw error;
        }
    }

    private transformCoinGeckoData(coin: any): CryptoAsset {
        return {
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            priceUsd: coin.current_price,
            priceChange24h: coin.price_change_percentage_24h || 0,
            priceChange7d: coin.price_change_percentage_7d_in_currency,
            marketCap: coin.market_cap,
            marketCapRank: coin.market_cap_rank,
            volume24h: coin.total_volume,
            circulatingSupply: coin.circulating_supply,
            totalSupply: coin.total_supply,
            maxSupply: coin.max_supply,
            ath: coin.ath,
            athDate: coin.ath_date ? new Date(coin.ath_date) : undefined,
            atl: coin.atl,
            atlDate: coin.atl_date ? new Date(coin.atl_date) : undefined,
            imageUrl: coin.image,
            lastUpdated: new Date(coin.last_updated),
        };
    }

    private transformCoinGeckoDetailData(coin: any): CryptoAsset {
        const market = coin.market_data;
        return {
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            priceUsd: market?.current_price?.usd || 0,
            priceBtc: market?.current_price?.btc,
            priceChange24h: market?.price_change_percentage_24h || 0,
            priceChange7d: market?.price_change_percentage_7d,
            marketCap: market?.market_cap?.usd || 0,
            marketCapRank: coin.market_cap_rank,
            volume24h: market?.total_volume?.usd || 0,
            circulatingSupply: market?.circulating_supply,
            totalSupply: market?.total_supply,
            maxSupply: market?.max_supply,
            ath: market?.ath?.usd,
            athDate: market?.ath_date?.usd ? new Date(market.ath_date.usd) : undefined,
            atl: market?.atl?.usd,
            atlDate: market?.atl_date?.usd ? new Date(market.atl_date.usd) : undefined,
            imageUrl: coin.image?.large,
            lastUpdated: new Date(market?.last_updated || Date.now()),
        };
    }
}

// ========================
// CoinMarketCap Client
// ========================



// ========================
// CryptoPanic Client
// ========================

const CRYPTOPANIC_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    retryAfterMs: 60000,
};

@Injectable()
export class CryptoPanicClient extends BaseAPIClient {
    private cryptoPanicApiKey?: string;

    constructor(private readonly configService: ConfigService) {
        super(
            'CryptoPanicClient',
            'https://cryptopanic.com/api/v1', // Free tier API endpoint
            undefined, // Don't pass API key here, use lazy loading
            CRYPTOPANIC_RATE_LIMIT
        );

        // Try to get API key from config
        this.cryptoPanicApiKey = configService.get<string>('CRYPTOPANIC_API_KEY');

        if (this.cryptoPanicApiKey) {
            this.logger.log(`CryptoPanic API key configured (${this.cryptoPanicApiKey.substring(0, 8)}...)`);
        } else {
            this.logger.warn('CRYPTOPANIC_API_KEY not found in config');
        }
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get crypto news for featured currencies
     */
    async getNews(options: {
        currencies?: string[];
        filter?: 'rising' | 'hot' | 'bullish' | 'bearish' | 'important';
        pageSize?: number;
    } = {}): Promise<CryptoNews[]> {
        // Lazy load API key if not set during construction
        if (!this.cryptoPanicApiKey) {
            this.cryptoPanicApiKey = this.configService.get<string>('CRYPTOPANIC_API_KEY');
        }

        if (!this.cryptoPanicApiKey) {
            this.logger.warn('CryptoPanic API key not configured');
            return [];
        }

        // Build query params - v1 API format
        const params = new URLSearchParams();
        params.set('auth_token', this.cryptoPanicApiKey);
        params.set('public', 'true');
        params.set('kind', 'news'); // Specify news only

        if (options.currencies && options.currencies.length > 0) {
            params.set('currencies', options.currencies.join(','));
        } else {
            params.set('currencies', FEATURED_CRYPTO_IDS.symbols.join(','));
        }

        if (options.filter) {
            params.set('filter', options.filter);
        }

        // v1 API endpoint path
        const endpoint = `/posts/?${params.toString()}`;

        try {
            const response = await this.makeRequest<any>(endpoint, { timeout: 10000, retries: 1 });

            if (!response.results) {
                return [];
            }

            return response.results
                .slice(0, options.pageSize || 20)
                .map((item: any) => this.transformCryptoPanicData(item));
        } catch (error) {
            const msg = (error as Error).message;
            // Handle 404 and network errors gracefully
            if (msg.includes('404')) {
                this.logger.debug('CryptoPanic API endpoint not found - API may have changed');
            } else if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
                this.logger.debug('CryptoPanic unavailable - network issue');
            } else if (msg.includes('401') || msg.includes('403')) {
                this.logger.warn('CryptoPanic API key invalid or expired');
            } else if (msg.includes('400')) {
                this.logger.debug('CryptoPanic API bad request - check parameters');
            } else {
                this.logger.warn(`CryptoPanic fetch failed: ${msg}`);
            }
            return []; // Return empty instead of throwing
        }
    }

    private transformCryptoPanicData(item: any): CryptoNews {
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (item.votes) {
            if (item.votes.positive > item.votes.negative) {
                sentiment = 'bullish';
            } else if (item.votes.negative > item.votes.positive) {
                sentiment = 'bearish';
            }
        }

        // v2 API uses 'instruments' instead of 'currencies', and source is an object
        const currencies = (item.instruments || item.currencies || []).map((c: any) => c.code);
        const sourceDomain = item.source?.domain || item.domain || '';

        return {
            id: String(item.id),
            title: item.title,
            url: item.original_url || item.url, // v2 uses original_url
            sourceDomain,
            sourceTitle: item.source?.title || sourceDomain,
            publishedAt: new Date(item.published_at),
            currencies,
            sentiment,
            isHot: item.votes?.important > 5 || item.panic_score > 50,
            votes: item.votes ? {
                positive: item.votes.positive || 0,
                negative: item.votes.negative || 0,
                important: item.votes.important || 0,
            } : undefined,
        };
    }
}

// ========================
// Unified Crypto Client
// ========================

@Injectable()
export class CryptoClient {
    constructor(
        private readonly coinGecko: CoinGeckoClient,
        private readonly coinMarketCap: CoinMarketCapClient,
        private readonly cryptoPanic: CryptoPanicClient
    ) { }

    /**
     * Get featured crypto assets (primary: CoinGecko, fallback: CMC)
     */
    async getFeaturedAssets(): Promise<CryptoAsset[]> {
        try {
            return await this.coinGecko.getFeaturedPrices();
        } catch (error) {
            // Fallback to CoinMarketCap
            try {
                const quotesMap = await this.coinMarketCap.getQuotes(FEATURED_CRYPTO_IDS.symbols);
                return Array.from(quotesMap.values()).map(q => ({
                    id: String(q.id),
                    symbol: q.symbol,
                    name: q.name,
                    priceUsd: q.quote.USD.price,
                    priceChange24h: q.quote.USD.percent_change_24h,
                    priceChange7d: q.quote.USD.percent_change_7d,
                    marketCap: q.quote.USD.market_cap,
                    marketCapRank: q.cmc_rank,
                    volume24h: q.quote.USD.volume_24h,
                    circulatingSupply: q.circulating_supply,
                    totalSupply: q.total_supply,
                    maxSupply: q.max_supply || 0,
                    lastUpdated: new Date(q.quote.USD.last_updated)
                }));
            } catch {
                throw error;
            }
        }
    }

    /**
     * Get crypto news
     */
    async getNews(options?: { filter?: string }): Promise<CryptoNews[]> {
        return this.cryptoPanic.getNews(options as any);
    }

    /**
     * Get Fear & Greed Index
     */
    async getFearGreedIndex(): Promise<FearGreedIndex> {
        return this.coinGecko.getFearGreedIndex();
    }

    /**
     * Get price history for a coin
     */
    async getPriceHistory(coinId: string, days: number = 7): Promise<{ timestamp: Date; price: number }[]> {
        return this.coinGecko.getPriceHistory(coinId, days);
    }

    /**
     * Check if any client can make requests
     */
    canMakeRequest(): boolean {
        return this.coinGecko.canMakeRequest() || this.coinMarketCap.canMakeRequest();
    }
}
