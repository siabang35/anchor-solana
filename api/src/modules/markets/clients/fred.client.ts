import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAPIClient } from './base-api.client.js';

@Injectable()
export class FREDClient extends BaseAPIClient {
    constructor(configService: ConfigService) {
        super(
            'FREDClient',
            'https://api.stlouisfed.org/fred/series',
            configService.get<string>('FRED_API_KEY'),
            {
                requestsPerMinute: 120,
                requestsPerDay: 1000,
                retryAfterMs: 1000
            }
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Fetch GDP Data
     */
    async getGDP() {
        return this.fetchSeries('GDP');
    }

    /**
     * Fetch CPI (Inflation) Data
     */
    async getCPI() {
        return this.fetchSeries('CPIAUCSL');
    }

    /**
     * Fetch Unemployment Rate
     */
    async getUnemployment() {
        return this.fetchSeries('UNRATE');
    }

    /**
     * Generic fetch series
     */
    private async fetchSeries(seriesId: string) {
        if (!this.apiKey) {
            this.logger.warn('FRED_API_KEY not found. Returning empty data.');
            return [];
        }

        try {
            const endpoint = `/observations?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json&sort_order=desc&limit=10`;
            const response = await this.makeRequest<any>(endpoint);

            if (response?.observations) {
                return response.observations.map((obs: any) => ({
                    date: obs.date,
                    value: parseFloat(obs.value),
                    indicator: seriesId
                }));
            }
            return [];
        } catch (error) {
            this.logger.warn(`Failed to fetch FRED series ${seriesId}: ${(error as Error).message}`);
            return [];
        }
    }
}
