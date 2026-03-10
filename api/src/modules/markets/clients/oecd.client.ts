import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// OECD API Rate Limits
const OECD_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 5000,
    retryAfterMs: 5000,
};

export interface OECDDataPoint {
    location: string;
    subject: string;
    date: string;
    value: number;
}

@Injectable()
export class OECDClient extends BaseAPIClient {
    constructor() {
        super(
            'OECDClient',
            'https://stats.oecd.org/SDMX-JSON/data',
            undefined,
            OECD_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get Main Economic Indicators (MEI)
     * e.g. https://stats.oecd.org/SDMX-JSON/data/MEI/USA.LORSGP.STSA.M/all?startTime=2023
     */
    async getMEI(location: string, subject: string): Promise<OECDDataPoint[]> {
        // MEI Dataset structure: LOCATION.SUBJECT.MEASURE.FREQUENCY
        // Example: USA.LORSGP (GDP).STSA (Standardised).M (Monthly)
        const endpoint = `/MEI/${location}.${subject}.STSA.M/all?startTime=2023&contentType=json`;

        try {
            const response = await this.makeRequest<any>(endpoint);

            if (!response || !response.structure || !response.dataSets || response.dataSets.length === 0) {
                return [];
            }

            const observations = response.dataSets[0].observations;
            const timeDimensions = response.structure.dimensions.observation.find((d: any) => d.id === 'TIME_PERIOD')?.values;

            if (!observations || !timeDimensions) return [];

            const results: OECDDataPoint[] = [];

            // Iterate through observations object "0:0:0:0": [value, ...]
            // Key format depends on dimension order. Assuming Flat format isn't default, we parse simple keys.
            // Simplified parsing strategy since we fix other dimensions in the query

            Object.keys(observations).forEach(key => {
                // The key index mapping is tricky without a parser library. 
                // For now, we will rely on key mapping to time dimension index if it's the last dimension.
                // SDMX-JSON structure is complex. We will try a simpler CSV approach if JSON fails in testing, 
                // but for now let's try to map the last index.

                const indices = key.split(':').map(Number);
                const timeIndex = indices[indices.length - 1]; // Time is usually the observation dimension

                if (timeIndex < timeDimensions.length) {
                    const date = timeDimensions[timeIndex].id;
                    const value = observations[key][0];

                    if (value !== null && value !== undefined) {
                        results.push({
                            location,
                            subject,
                            date,
                            value
                        });
                    }
                }
            });

            return results.sort((a, b) => b.date.localeCompare(a.date));

        } catch (error) {
            const msg = (error as Error).message;
            // Only log debug for network failures
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
                this.logger.debug(`OECD API unavailable for ${location}/${subject} - network issue`);
            } else {
                this.logger.warn(`OECD data fetch failed for ${location}/${subject}: ${msg}`);
            }
            return [];
        }
    }
}
