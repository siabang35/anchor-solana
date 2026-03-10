/**
 * Alpha Vantage Client
 * 
 * Client for financial market data from Alpha Vantage API
 * Used for: Finance category (stocks, economic indicators)
 * 
 * Rate Limits (Free tier):
 * - 5 requests per minute
 * - 500 requests per day
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// Response Types
export interface StockQuote {
    symbol: string;
    open: number;
    high: number;
    low: number;
    price: number;
    volume: number;
    latestTradingDay: string;
    previousClose: number;
    change: number;
    changePercent: number;
}

export interface EconomicIndicator {
    name: string;
    interval: string;
    unit: string;
    data: {
        date: string;
        value: number;
    }[];
}

const ALPHA_VANTAGE_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 5,
    requestsPerDay: 500,
    retryAfterMs: 60000,
};

@Injectable()
export class AlphaVantageClient extends BaseAPIClient {
    constructor(private readonly configService: ConfigService) {
        super(
            'AlphaVantageClient',
            'https://www.alphavantage.co',
            configService.get<string>('ALPHA_VANTAGE_API_KEY'),
            ALPHA_VANTAGE_RATE_LIMIT
        );

        if (!this.apiKey) {
            this.logger.warn('ALPHA_VANTAGE_API_KEY not configured');
        }
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get stock quote
     */
    async getStockQuote(symbol: string): Promise<StockQuote | null> {
        const sanitizedSymbol = this.sanitizeInput(symbol).toUpperCase();
        const endpoint = `/query?function=GLOBAL_QUOTE&symbol=${sanitizedSymbol}&apikey=${this.apiKey}`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (response['Note'] || response['Information']) {
                this.logger.warn('Alpha Vantage rate limit or info message received');
                return null;
            }

            const quote = response['Global Quote'];
            if (!quote || Object.keys(quote).length === 0) {
                return null;
            }

            return {
                symbol: quote['01. symbol'],
                open: parseFloat(quote['02. open']),
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                price: parseFloat(quote['05. price']),
                volume: parseInt(quote['06. volume'], 10),
                latestTradingDay: quote['07. latest trading day'],
                previousClose: parseFloat(quote['08. previous close']),
                change: parseFloat(quote['09. change']),
                changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
            };
        } catch (error) {
            this.logger.error(`Failed to fetch stock quote for ${symbol}: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Federal Funds Rate
     */
    async getFederalFundsRate(): Promise<EconomicIndicator | null> {
        const endpoint = `/query?function=FEDERAL_FUNDS_RATE&interval=monthly&apikey=${this.apiKey}`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (response['Note'] || !response.data) {
                return null;
            }

            return {
                name: response.name || 'Federal Funds Rate',
                interval: response.interval || 'monthly',
                unit: response.unit || 'percent',
                data: response.data.slice(0, 24).map((item: any) => ({
                    date: item.date,
                    value: parseFloat(item.value),
                })),
            };
        } catch (error) {
            this.logger.error(`Failed to fetch Federal Funds Rate: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Real GDP
     */
    async getRealGDP(): Promise<EconomicIndicator | null> {
        const endpoint = `/query?function=REAL_GDP&interval=quarterly&apikey=${this.apiKey}`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (response['Note'] || !response.data) {
                return null;
            }

            return {
                name: response.name || 'Real GDP',
                interval: response.interval || 'quarterly',
                unit: response.unit || 'billions of dollars',
                data: response.data.slice(0, 20).map((item: any) => ({
                    date: item.date,
                    value: parseFloat(item.value),
                })),
            };
        } catch (error) {
            this.logger.error(`Failed to fetch Real GDP: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Inflation Rate (CPI)
     */
    async getInflationRate(): Promise<EconomicIndicator | null> {
        const endpoint = `/query?function=INFLATION&apikey=${this.apiKey}`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (response['Note'] || !response.data) {
                return null;
            }

            return {
                name: response.name || 'Inflation',
                interval: response.interval || 'annual',
                unit: response.unit || 'percent',
                data: response.data.slice(0, 10).map((item: any) => ({
                    date: item.date,
                    value: parseFloat(item.value),
                })),
            };
        } catch (error) {
            this.logger.error(`Failed to fetch Inflation Rate: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Unemployment Rate
     */
    async getUnemploymentRate(): Promise<EconomicIndicator | null> {
        const endpoint = `/query?function=UNEMPLOYMENT&apikey=${this.apiKey}`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (response['Note'] || !response.data) {
                return null;
            }

            return {
                name: response.name || 'Unemployment',
                interval: response.interval || 'monthly',
                unit: response.unit || 'percent',
                data: response.data.slice(0, 24).map((item: any) => ({
                    date: item.date,
                    value: parseFloat(item.value),
                })),
            };
        } catch (error) {
            this.logger.error(`Failed to fetch Unemployment Rate: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get all major economic indicators
     */
    async getAllIndicators(): Promise<Record<string, EconomicIndicator | null>> {
        // Fetch sequentially due to rate limits
        const results: Record<string, EconomicIndicator | null> = {};

        try {
            results.federalFundsRate = await this.getFederalFundsRate();
            await this.sleep(15000); // Wait 15s between requests (5/min limit)

            results.realGDP = await this.getRealGDP();
            await this.sleep(15000);

            results.inflation = await this.getInflationRate();
            await this.sleep(15000);

            results.unemployment = await this.getUnemploymentRate();
        } catch (error) {
            this.logger.error(`Failed to fetch all indicators: ${(error as Error).message}`);
        }

        return results;
    }
}
