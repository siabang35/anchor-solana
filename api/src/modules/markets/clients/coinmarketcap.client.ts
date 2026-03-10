import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// Response Types
export interface CMCQuote {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    cmc_rank: number;
    quote: {
        USD: {
            price: number;
            volume_24h: number;
            volume_change_24h: number;
            percent_change_1h: number;
            percent_change_24h: number;
            percent_change_7d: number;
            percent_change_30d: number;
            market_cap: number;
            market_cap_dominance: number;
            fully_diluted_market_cap: number;
            last_updated: string;
        };
    };
    max_supply: number | null;
    circulating_supply: number;
    total_supply: number;
}

// CoinMarketCap Basic Plan Limits
// 333 requests/day, 30 requests/minute
const CMC_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 30,
    requestsPerDay: 333,
    retryAfterMs: 60000,
};

@Injectable()
export class CoinMarketCapClient extends BaseAPIClient {
    constructor(private readonly configService: ConfigService) {
        super(
            'CoinMarketCapClient',
            'https://pro-api.coinmarketcap.com/v1',
            configService.get<string>('COINMARKETCAP_API_KEY'),
            CMC_RATE_LIMIT
        );

        if (this.apiKey) {
            this.logger.log(`API Key configured: ${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`);
        } else {
            this.logger.warn('COINMARKETCAP_API_KEY not configured or empty');
        }
    }

    protected getAuthHeaders(): Record<string, string> {
        return {
            'X-CMC_PRO_API_KEY': this.apiKey || '',
            'Accept': 'application/json, text/plain, */*',
        };
    }

    /**
     * Get latest listings
     */
    async getLatestListings(limit = 100): Promise<CMCQuote[]> {
        // Skip if API key is not configured
        if (!this.apiKey) {
            this.logger.debug('CoinMarketCap API key not configured, skipping request');
            return [];
        }

        const endpoint = `/cryptocurrency/listings/latest?start=1&limit=${limit}&convert=USD`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (!response || !response.data) {
                return [];
            }

            return response.data;
        } catch (error) {
            const errorMessage = (error as Error).message;

            // Handle 401 gracefully - API key is invalid or expired
            if (errorMessage.includes('401')) {
                this.logger.warn('CoinMarketCap API key is invalid or expired. Crypto prices will not be fetched from CMC.');
                return [];
            }

            this.logger.error(`Failed to fetch latest listings: ${errorMessage}`);
            return [];
        }
    }

    /**
     * Get quotes for specific symbols
     */
    async getQuotes(symbols: string[]): Promise<Map<string, CMCQuote>> {
        if (symbols.length === 0) return new Map();

        // Skip if API key is not configured
        if (!this.apiKey) {
            this.logger.debug('CoinMarketCap API key not configured, skipping request');
            return new Map();
        }

        const sanitizedSymbols = symbols.map(s => this.sanitizeInput(s)).join(',');
        const endpoint = `/cryptocurrency/quotes/latest?symbol=${sanitizedSymbols}&convert=USD`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (!response || !response.data) {
                return new Map();
            }

            const resultMap = new Map<string, CMCQuote>();
            Object.values(response.data).forEach((quote: any) => {
                resultMap.set(quote.symbol, quote);
            });

            return resultMap;
        } catch (error) {
            const errorMessage = (error as Error).message;

            // Handle 401 gracefully - API key is invalid or expired
            if (errorMessage.includes('401')) {
                this.logger.warn('CoinMarketCap API key is invalid or expired');
                return new Map();
            }

            this.logger.error(`Failed to fetch quotes for ${symbols}: ${errorMessage}`);
            return new Map();
        }
    }
}
