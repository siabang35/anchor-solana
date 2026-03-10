/**
 * World Bank Client
 * 
 * Client for World Bank Open Data API
 * Used for: Economy category
 * 
 * Rate Limits: No strict limits
 */

import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

export interface WorldBankIndicator {
    id: string;
    name: string;
    unit: string;
    sourceNote: string;
}

export interface WorldBankDataPoint {
    countryCode: string;
    countryName: string;
    indicatorId: string;
    indicatorName: string;
    year: number;
    value: number | null;
}

export interface CountryInfo {
    id: string;
    iso2Code: string;
    name: string;
    region: string;
    incomeLevel: string;
    capitalCity?: string;
    longitude?: number;
    latitude?: number;
}

// Key indicators for economy category
export const KEY_INDICATORS = {
    GDP: 'NY.GDP.MKTP.CD', // GDP (current US$)
    GDP_GROWTH: 'NY.GDP.MKTP.KD.ZG', // GDP growth (annual %)
    GDP_PER_CAPITA: 'NY.GDP.PCAP.CD', // GDP per capita (current US$)
    INFLATION: 'FP.CPI.TOTL.ZG', // Inflation, consumer prices (annual %)
    UNEMPLOYMENT: 'SL.UEM.TOTL.ZS', // Unemployment, total (% of total labor force)
    POPULATION: 'SP.POP.TOTL', // Population, total
    TRADE_BALANCE: 'NE.RSB.GNFS.ZS', // External balance on goods and services (% of GDP)
    DEBT_GDP: 'GC.DOD.TOTL.GD.ZS', // Central government debt, total (% of GDP)
};

const WORLDBANK_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    retryAfterMs: 1000,
};

@Injectable()
export class WorldBankClient extends BaseAPIClient {
    constructor() {
        super(
            'WorldBankClient',
            'https://api.worldbank.org/v2',
            undefined,
            WORLDBANK_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get indicator data for a country
     */
    async getIndicatorData(
        countryCode: string,
        indicatorId: string,
        options: {
            startYear?: number;
            endYear?: number;
            perPage?: number;
        } = {}
    ): Promise<WorldBankDataPoint[]> {
        const perPage = options.perPage || 20;
        const dateRange = options.startYear && options.endYear
            ? `date=${options.startYear}:${options.endYear}`
            : '';

        const endpoint = `/country/${countryCode}/indicator/${indicatorId}?format=json&per_page=${perPage}${dateRange ? '&' + dateRange : ''}`;

        try {
            const response = await this.makeRequest<any[]>(endpoint);

            if (!response || response.length < 2 || !response[1]) {
                return [];
            }

            return response[1]
                .filter((item: any) => item.value !== null)
                .map((item: any) => ({
                    countryCode: item.country.id,
                    countryName: item.country.value,
                    indicatorId: item.indicator.id,
                    indicatorName: item.indicator.value,
                    year: parseInt(item.date, 10),
                    value: parseFloat(item.value),
                }));
        } catch (error) {
            this.logger.error(`Failed to get indicator data: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get all key indicators for a country
     */
    async getCountryOverview(countryCode: string): Promise<Record<string, WorldBankDataPoint[]>> {
        const results: Record<string, WorldBankDataPoint[]> = {};
        const currentYear = new Date().getFullYear();

        for (const [key, indicatorId] of Object.entries(KEY_INDICATORS)) {
            try {
                const data = await this.getIndicatorData(countryCode, indicatorId, {
                    startYear: currentYear - 5,
                    endYear: currentYear,
                    perPage: 10,
                });
                results[key] = data;

                // Small delay between requests
                await this.sleep(200);
            } catch (error) {
                this.logger.warn(`Failed to get ${key} for ${countryCode}: ${(error as Error).message}`);
                results[key] = [];
            }
        }

        return results;
    }

    /**
     * Get country information
     */
    async getCountries(region?: string): Promise<CountryInfo[]> {
        const endpoint = region
            ? `/country?format=json&region=${region}&per_page=100`
            : '/country?format=json&per_page=100';

        try {
            const response = await this.makeRequest<any[]>(endpoint);

            if (!response || response.length < 2 || !response[1]) {
                return [];
            }

            return response[1].map((country: any) => ({
                id: country.id,
                iso2Code: country.iso2Code,
                name: country.name,
                region: country.region?.value || 'Unknown',
                incomeLevel: country.incomeLevel?.value || 'Unknown',
                capitalCity: country.capitalCity,
                longitude: country.longitude ? parseFloat(country.longitude) : undefined,
                latitude: country.latitude ? parseFloat(country.latitude) : undefined,
            }));
        } catch (error) {
            this.logger.error(`Failed to get countries: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get indicator comparison across countries
     */
    async compareCountries(
        countryCodes: string[],
        indicatorId: string,
        year?: number
    ): Promise<WorldBankDataPoint[]> {
        const countries = countryCodes.join(';');
        const targetYear = year || new Date().getFullYear() - 1;

        const endpoint = `/country/${countries}/indicator/${indicatorId}?format=json&date=${targetYear}&per_page=100`;

        try {
            const response = await this.makeRequest<any[]>(endpoint);

            if (!response || response.length < 2 || !response[1]) {
                return [];
            }

            return response[1]
                .filter((item: any) => item.value !== null)
                .map((item: any) => ({
                    countryCode: item.country.id,
                    countryName: item.country.value,
                    indicatorId: item.indicator.id,
                    indicatorName: item.indicator.value,
                    year: parseInt(item.date, 10),
                    value: parseFloat(item.value),
                }));
        } catch (error) {
            this.logger.error(`Failed to compare countries: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get major economies data
     */
    async getMajorEconomies(): Promise<Record<string, WorldBankDataPoint[]>> {
        const majorCountries = ['USA', 'CHN', 'JPN', 'DEU', 'GBR', 'FRA', 'IND', 'BRA'];
        const results: Record<string, WorldBankDataPoint[]> = {};

        // Get GDP for all major countries
        try {
            const gdpData = await this.compareCountries(majorCountries, KEY_INDICATORS.GDP);
            for (const item of gdpData) {
                results[item.countryCode] = [item];
            }
        } catch (error) {
            this.logger.error(`Failed to get major economies: ${(error as Error).message}`);
        }

        return results;
    }
}
