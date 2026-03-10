import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// IMF API Structure (simplified SDMX-JSON)
export interface IMFDataStructure {
    Structure: {
        Dimensions: {
            Series: {
                id: string;
                values: { id: string; name: string }[];
            }[];
        };
    };
    DataSet: {
        Series: {
            [key: string]: {
                Obs: {
                    [key: string]: string | number | null; // TIME_PERIOD -> Value
                }[];
            };
        };
    };
}

export interface IMFIndicator {
    id: string;
    name: string;
    description?: string;
}

export interface IMFDataPoint {
    indicatorId: string;
    date: string;
    value: number;
    area: string; // Country or Region
}

// IMF Rate Limits are public and generous but we self-limit
const IMF_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 5000,
    retryAfterMs: 5000,
};

@Injectable()
export class IMFClient extends BaseAPIClient {
    constructor() {
        super(
            'IMFClient',
            'https://dataservices.imf.org/REST/SDMX_JSON.svc',
            undefined,
            IMF_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get Compact Data for an indicator and area
     * Example: IFS/Q.US.PMP_IX (US Import Price Index, Quarterly)
     */
    async getData(databaseId: string, frequency: string, area: string, indicator: string): Promise<IMFDataPoint[]> {
        // Construct SDMX dimension string: Frequency.Area.Indicator
        const dimensionString = `${frequency}.${area}.${indicator}`;
        const endpoint = `/CompactData/${databaseId}/${dimensionString}?startPeriod=2020`;

        try {
            // Use shorter timeout and fewer retries for IMF (known to be slow/unreliable)
            const response = await this.makeRequest<any>(endpoint, { timeout: 15000, retries: 1 });

            if (!response || !response.CompactData || !response.CompactData.DataSet || !response.CompactData.DataSet.Series) {
                return [];
            }

            const series = response.CompactData.DataSet.Series;
            // Handle both single object and array responses
            const seriesArray = Array.isArray(series) ? series : [series];

            const results: IMFDataPoint[] = [];

            seriesArray.forEach((s: any) => {
                if (!s.Obs) return;

                const obsArray = Array.isArray(s.Obs) ? s.Obs : [s.Obs];

                obsArray.forEach((obs: any) => {
                    const value = parseFloat(obs['@OBS_VALUE']);
                    if (!isNaN(value)) {
                        results.push({
                            indicatorId: indicator,
                            area: area,
                            date: obs['@TIME_PERIOD'],
                            value: value
                        });
                    }
                });
            });

            return results.sort((a, b) => b.date.localeCompare(a.date)); // Newest first

        } catch (error) {
            const msg = (error as Error).message;
            // Only log debug for network failures (expected in some environments)
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
                this.logger.debug(`IMF API unavailable for ${dimensionString} - network issue, will retry next sync`);
                // Reset circuit breaker for network issues (not API failures)
                this.consecutiveFailures = 0;
            } else {
                this.logger.warn(`IMF data fetch failed for ${dimensionString}: ${msg}`);
            }
            return [];
        }
    }

    /**
     * Get Key Economic Indicators
     * Uses International Financial Statistics (IFS)
     */
    async getMajorEconomicIndicators(area: string): Promise<IMFDataPoint[]> {
        const indicators = [
            'PCPI_IX', // Consumer Price Index (Inflation proxy)
            'NGDP_XDC' // GDP in domestic currency
        ];

        let allData: IMFDataPoint[] = [];

        for (const ind of indicators) {
            const data = await this.getData('IFS', 'M', area, ind); // Monthly data
            allData = [...allData, ...data];
            await this.sleep(200);
        }

        return allData;
    }
}
