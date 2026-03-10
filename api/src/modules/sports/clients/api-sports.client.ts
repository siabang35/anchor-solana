/**
 * Unified API-Sports Client
 * 
 * A comprehensive client supporting all 11 API-Sports endpoints with:
 * - Centralized authentication (x-apisports-key header)
 * - Global daily rate limiting (100 req/day for free tier)
 * - Per-minute rate limiting with circuit breaker
 * - Sport-specific transformations
 * - Enhanced security measures
 * 
 * Supported Sports:
 * - Football (v3), Basketball (v1), AFL (v1), Formula-1 (v1)
 * - Handball (v1), Hockey (v1), MMA (v1), NBA (v2)
 * - NFL/American-Football (v1), Rugby (v1), Volleyball (v1)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseSportsClient } from './base-sports.client.js';
import {
    DataSource,
    SportType,
    EventStatus,
    SportsLeague,
    SportsTeam,
    SportsEvent,
} from '../types/sports.types.js';

// ========================
// Sport API Configurations
// ========================

export interface SportAPIConfig {
    baseUrl: string;
    version: string;
    sportType: SportType;
    dataSource: DataSource;
    endpoints: {
        status: string;
        leagues: string;
        teams: string;
        games: string;
        live?: string;
        odds?: string;
        standings?: string;
    };
}

/**
 * API-Sports endpoint configurations for all 11 sports
 */
export const SPORT_API_CONFIGS: Record<string, SportAPIConfig> = {
    football: {
        baseUrl: 'https://v3.football.api-sports.io',
        version: 'v3',
        sportType: SportType.FOOTBALL,
        dataSource: DataSource.APIFOOTBALL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/fixtures',
            live: '/fixtures?live=all',
            odds: '/odds',
            standings: '/standings',
        },
    },
    baseball: {
        baseUrl: 'https://v1.baseball.api-sports.io',
        version: 'v1',
        sportType: SportType.BASEBALL,
        dataSource: DataSource.APIBASEBALL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
    basketball: {
        baseUrl: 'https://v1.basketball.api-sports.io',
        version: 'v1',
        sportType: SportType.BASKETBALL,
        dataSource: DataSource.APIBASKETBALL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
            standings: '/standings',
        },
    },
    afl: {
        baseUrl: 'https://v1.afl.api-sports.io',
        version: 'v1',
        sportType: SportType.AFL,
        dataSource: DataSource.APIAFL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
    formula1: {
        baseUrl: 'https://v1.formula-1.api-sports.io',
        version: 'v1',
        sportType: SportType.FORMULA1,
        dataSource: DataSource.APIFORMULA1,
        endpoints: {
            status: '/status',
            leagues: '/competitions',
            teams: '/teams',
            games: '/races',
            standings: '/rankings/drivers',
        },
    },
    handball: {
        baseUrl: 'https://v1.handball.api-sports.io',
        version: 'v1',
        sportType: SportType.HANDBALL,
        dataSource: DataSource.APIHANDBALL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
    hockey: {
        baseUrl: 'https://v1.hockey.api-sports.io',
        version: 'v1',
        sportType: SportType.HOCKEY,
        dataSource: DataSource.APIHOCKEY,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
    mma: {
        baseUrl: 'https://v1.mma.api-sports.io',
        version: 'v1',
        sportType: SportType.MMA,
        dataSource: DataSource.APIMMA,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/fighters',
            games: '/fights',
        },
    },
    nba: {
        baseUrl: 'https://v2.nba.api-sports.io',
        version: 'v2',
        sportType: SportType.NBA,
        dataSource: DataSource.APINBA,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
            standings: '/standings',
        },
    },
    nfl: {
        baseUrl: 'https://v1.american-football.api-sports.io',
        version: 'v1',
        sportType: SportType.NFL,
        dataSource: DataSource.APINFL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
            standings: '/standings',
        },
    },
    rugby: {
        baseUrl: 'https://v1.rugby.api-sports.io',
        version: 'v1',
        sportType: SportType.RUGBY,
        dataSource: DataSource.APIRUGBY,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
    volleyball: {
        baseUrl: 'https://v1.volleyball.api-sports.io',
        version: 'v1',
        sportType: SportType.VOLLEYBALL,
        dataSource: DataSource.APIVOLLEYBALL,
        endpoints: {
            status: '/status',
            leagues: '/leagues',
            teams: '/teams',
            games: '/games',
            live: '/games?live=all',
        },
    },
};

// ========================
// Global Rate Limiter
// ========================

/**
 * Singleton global rate limiter for API-Sports
 * Tracks daily usage across all sport clients
 */
class GlobalRateLimiter {
    private static instance: GlobalRateLimiter;
    private dailyRequestCount = 0;
    private dailyLimit = 100;
    private lastResetDate: string = new Date().toDateString();
    private requestLog: Array<{ timestamp: number; sport: string }> = [];
    private readonly logger = new Logger('GlobalRateLimiter');

    private constructor() { }

    static getInstance(): GlobalRateLimiter {
        if (!GlobalRateLimiter.instance) {
            GlobalRateLimiter.instance = new GlobalRateLimiter();
        }
        return GlobalRateLimiter.instance;
    }

    setDailyLimit(limit: number): void {
        this.dailyLimit = limit;
    }

    private resetIfNewDay(): void {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyRequestCount = 0;
            this.lastResetDate = today;
            this.requestLog = [];
            this.logger.log('Daily rate limit counter reset');
        }
    }

    canMakeRequest(): boolean {
        this.resetIfNewDay();
        return this.dailyRequestCount < this.dailyLimit;
    }

    recordRequest(sport: string): void {
        this.resetIfNewDay();
        this.dailyRequestCount++;
        this.requestLog.push({ timestamp: Date.now(), sport });
        this.logger.debug(`Request recorded for ${sport}. Daily count: ${this.dailyRequestCount}/${this.dailyLimit}`);
    }

    getRemainingRequests(): number {
        this.resetIfNewDay();
        return Math.max(0, this.dailyLimit - this.dailyRequestCount);
    }

    getUsageStats(): {
        dailyCount: number;
        dailyLimit: number;
        remaining: number;
        percentUsed: number;
        lastReset: string;
    } {
        this.resetIfNewDay();
        return {
            dailyCount: this.dailyRequestCount,
            dailyLimit: this.dailyLimit,
            remaining: this.getRemainingRequests(),
            percentUsed: (this.dailyRequestCount / this.dailyLimit) * 100,
            lastReset: this.lastResetDate,
        };
    }
}

// ========================
// API Response Types
// ========================

interface APISportsResponse<T> {
    get: string;
    parameters: Record<string, string | number>;
    errors: Record<string, string>[] | Record<string, string>;
    results: number;
    paging?: {
        current: number;
        total: number;
    };
    response: T[];
}

interface APISportsStatusResponse {
    account: {
        firstname: string;
        lastname: string;
        email: string;
    };
    subscription: {
        plan: string;
        end: string;
        active: boolean;
    };
    requests: {
        current: number;
        limit_day: number;
    };
}

// ========================
// Main API-Sports Client
// ========================

@Injectable()
export class APISportsClient extends BaseSportsClient {
    private readonly apiKey: string;
    private readonly globalLimiter = GlobalRateLimiter.getInstance();
    private currentSport: string = 'football';
    private currentConfig: SportAPIConfig;

    constructor(private readonly configService: ConfigService) {
        // Initialize with football as default
        super('APISports', DataSource.APIFOOTBALL, {
            baseUrl: SPORT_API_CONFIGS.football.baseUrl,
            rateLimit: {
                requestsPerMinute: 30,
                requestsPerDay: 100,
            },
            timeout: 30000,
            retry: {
                maxRetries: 3,
                baseDelayMs: 1000,
                maxDelayMs: 10000,
                enableJitter: true,
            },
            circuitBreaker: {
                failureThreshold: 5,
                successThreshold: 2,
                openDurationMs: 30000,
            },
            enableMetrics: true,
        });

        this.apiKey = this.configService.get<string>('APIFOOTBALL_API_KEY') || '535bba4c6e9b1630b1da51d5e4531651';
        this.currentConfig = SPORT_API_CONFIGS.football;

        // Set global daily limit from config
        const dailyLimit = this.configService.get<number>('APISPORTS_REQUESTS_PER_DAY') || 100;
        this.globalLimiter.setDailyLimit(dailyLimit);

        if (!this.apiKey) {
            this.logger.warn('API-Sports API key not configured. Set APIFOOTBALL_API_KEY in environment.');
        } else {
            this.logger.log(`Initialized with API key. Daily limit: ${dailyLimit}`);
        }
    }

    /**
     * Switch to a different sport context
     */
    setSport(sport: string): this {
        const config = SPORT_API_CONFIGS[sport.toLowerCase()];
        if (!config) {
            throw new Error(`Unsupported sport: ${sport}. Available: ${Object.keys(SPORT_API_CONFIGS).join(', ')}`);
        }
        this.currentSport = sport.toLowerCase();
        this.currentConfig = config;
        return this;
    }

    /**
     * Get current sport configuration
     */
    getCurrentConfig(): SportAPIConfig {
        return this.currentConfig;
    }

    /**
     * Get available sports
     */
    getAvailableSports(): string[] {
        return Object.keys(SPORT_API_CONFIGS);
    }

    /**
     * Get usage statistics
     */
    getUsageStats(): ReturnType<typeof GlobalRateLimiter.prototype.getUsageStats> {
        return this.globalLimiter.getUsageStats();
    }

    /**
     * Check if we can make more requests today
     */
    canMakeRequest(): boolean {
        return this.globalLimiter.canMakeRequest();
    }

    /**
     * Get auth headers
     */
    protected override getAuthHeaders(): Record<string, string> {
        return {
            'x-apisports-key': this.apiKey,
        };
    }

    /**
     * Override makeRequest to add global rate limiting
     */
    protected override async makeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
        if (!this.globalLimiter.canMakeRequest()) {
            const stats = this.globalLimiter.getUsageStats();
            throw new Error(
                `Daily API limit reached (${stats.dailyCount}/${stats.dailyLimit}). ` +
                `Resets at midnight. Use TheSportsDB for additional data.`
            );
        }

        this.globalLimiter.recordRequest(this.currentSport);
        return super.makeRequest<T>(url, options);
    }

    /**
     * Test API connection for current sport
     */
    async testConnection(): Promise<boolean> {
        try {
            const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.status}`;
            await this.makeRequest(url);
            return true;
        } catch (error) {
            this.logger.error(`Connection test failed for ${this.currentSport}:`, error);
            return false;
        }
    }

    /**
     * Get account status for current sport
     */
    async getAccountStatus(): Promise<APISportsStatusResponse | null> {
        try {
            const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.status}`;
            const response = await this.makeRequest<{ response: APISportsStatusResponse }>(url);
            return response.response;
        } catch (error) {
            this.logger.error(`Failed to get account status for ${this.currentSport}:`, error);
            return null;
        }
    }

    // ========================
    // Leagues
    // ========================

    /**
     * Get all leagues for current sport
     */
    async getLeagues(params?: Record<string, string | number>): Promise<SportsLeague[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const query = queryParams.toString();
        const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.leagues}${query ? '?' + query : ''}`;

        try {
            const response = await this.makeRequest<APISportsResponse<any>>(url);
            this.logSync('getLeagues', this.currentSport, response.results);
            return response.response.map(league => this.transformLeague(league));
        } catch (error) {
            this.logger.error(`Failed to get leagues for ${this.currentSport}:`, error);
            return [];
        }
    }

    // ========================
    // Teams
    // ========================

    /**
     * Get teams for current sport
     */
    async getTeams(params?: Record<string, string | number>): Promise<SportsTeam[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const query = queryParams.toString();
        const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.teams}${query ? '?' + query : ''}`;

        try {
            const response = await this.makeRequest<APISportsResponse<any>>(url);
            this.logSync('getTeams', this.currentSport, response.results);
            return response.response.map(team => this.transformTeam(team));
        } catch (error) {
            this.logger.error(`Failed to get teams for ${this.currentSport}:`, error);
            return [];
        }
    }

    // ========================
    // Games/Events
    // ========================

    /**
     * Get games/fixtures for current sport
     */
    async getGames(params?: Record<string, string | number>): Promise<SportsEvent[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const query = queryParams.toString();
        const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.games}${query ? '?' + query : ''}`;

        try {
            const response = await this.makeRequest<APISportsResponse<any>>(url);
            this.logSync('getGames', this.currentSport, response.results);
            return response.response.map(game => this.transformGame(game));
        } catch (error) {
            this.logger.error(`Failed to get games for ${this.currentSport}:`, error);
            return [];
        }
    }

    /**
     * Get live games for current sport
     */
    async getLiveGames(): Promise<SportsEvent[]> {
        if (!this.currentConfig.endpoints.live) {
            this.logger.warn(`Live endpoint not available for ${this.currentSport}`);
            return [];
        }

        const url = `${this.currentConfig.baseUrl}${this.currentConfig.endpoints.live}`;

        try {
            const response = await this.makeRequest<APISportsResponse<any>>(url);
            this.logSync('getLiveGames', this.currentSport, response.results);
            return response.response.map(game => this.transformGame(game));
        } catch (error) {
            this.logger.error(`Failed to get live games for ${this.currentSport}:`, error);
            return [];
        }
    }

    /**
     * Get games by date for current sport
     */
    async getGamesByDate(date: string): Promise<SportsEvent[]> {
        return this.getGames({ date });
    }

    /**
     * Get upcoming games (next 7 days)
     */
    /**
     * Get upcoming games (Fetched for TODAY only to respect Free Tier limits)
     * 
     * ENHANCEMENT: For restricted sports (NBA, F1, etc.), fetch 2024 data and time-shift it
     * to appear as "Upcoming" in 2026. This ensures the demo has rich data.
     */
    async getUpcomingGames(leagueId?: number): Promise<SportsEvent[]> {
        // 1. Check if sport is restricted (Free Tier limits)
        const restrictedSports = [
            SportType.BASKETBALL, SportType.NBA, SportType.FORMULA1,
            SportType.AFL, SportType.HANDBALL, SportType.HOCKEY,
            SportType.MMA, SportType.RUGBY, SportType.VOLLEYBALL,
            SportType.BASEBALL
        ];

        const isRestricted = restrictedSports.includes(this.currentConfig.sportType);

        if (isRestricted) {
            this.logger.log(`[Time Machine] Fetching historical data for ${this.currentSport} and time-shifting...`);

            // Different sports might have data in different seasons depending on the time of year
            // We try the current simulation target (2024) first, then fallback to 2023 or 2025
            const candidateSeasons = [2024, 2023, 2025];

            // Comprehensive demo league IDs for each sport
            const demoLeagues: Record<string, (string | number)[]> = {
                [SportType.BASKETBALL]: [12, 1, 2, 5], // Spain ACB, EuroLeague, etc.
                [SportType.AFL]: [1], // Focus on main Premiership to save requests
                [SportType.HANDBALL]: [39, 3, 1, 2], // Bundesliga, EHF Champions League
                [SportType.HOCKEY]: [57, 1, 33], // NHL, KHL
                [SportType.RUGBY]: [16, 1, 13, 44], // Six Nations, World Cup, Super Rugby
                [SportType.VOLLEYBALL]: [140, 97, 88, 237, 13, 179], // Poland, Italy, Russia, Asian, Brazil
                [SportType.MMA]: [], // MMA doesn't use league param for 'fights' endpoint
                [SportType.BASEBALL]: [1, 12], // MLB, NPB
                [SportType.FORMULA1]: [1], // F1 World Championship
            };

            const targetLeagues = leagueId ? [leagueId] : (demoLeagues[this.currentConfig.sportType] || []);

            // NBA fallback to standard league
            if (this.currentConfig.sportType === SportType.NBA && !leagueId) {
                targetLeagues.push('standard');
            }

            let games: SportsEvent[] = [];

            // Try seasons until we find data
            for (const seasonValue of candidateSeasons) {
                if (games.length >= 20) break;

                // Adjust season format if needed
                let formattedSeason: string | number = seasonValue;
                if (this.currentConfig.sportType === SportType.BASKETBALL) {
                    formattedSeason = `${seasonValue}-${seasonValue + 1}`;
                }

                // Special handling for MMA: Do not iterate leagues, just fetch by season
                if (this.currentConfig.sportType === SportType.MMA) {
                    try {
                        const params: Record<string, string | number> = { season: formattedSeason };
                        this.logger.log(`[Time Machine] Fetching MMA for season ${formattedSeason}...`);
                        const result = await this.getGames(params);
                        if (result && result.length > 0) {
                            games = result;
                            this.logger.log(`[Time Machine] Found ${result.length} fights for MMA Season ${formattedSeason}`);
                            break; // Found data, stop looking
                        }
                    } catch (e) {
                        this.logger.error(`[Time Machine] Failed to fetch MMA data for ${formattedSeason}: ${(e as Error).message}`);
                    }
                } else {
                    // Standard league iteration for other sports
                    for (const targetLeague of targetLeagues) {
                        const params: Record<string, string | number> = {
                            season: formattedSeason,
                            league: targetLeague
                        };

                        try {
                            const result = await this.getGames(params);
                            if (result && result.length > 0) {
                                games = [...games, ...result];
                                this.logger.log(`[Time Machine] Found ${result.length} games for ${this.currentConfig.sportType} (League ${targetLeague}, Season ${formattedSeason})`);

                                if (games.length >= 20) break;
                            }
                        } catch (e) {
                            this.logger.debug(`[Time Machine] No data for league ${targetLeague} season ${formattedSeason}: ${(e as Error).message}`);
                            continue;
                        }
                    }
                }

                // If we found games in this season, good enough. Don't fetch other seasons to avoid mixing too much.
                if (games.length > 0) break;
            }

            if (games.length === 0) {
                this.logger.warn(`[Time Machine] No historical data found for ${this.currentConfig.sportType} in seasons ${candidateSeasons.join(', ')}`);
                // Final fallback: Try to return ANYTHING from live if possible? No, stick to historical.
                return [];
            }

            // Take up to 30 games (more variety for display)
            // Use random slice to vary data if we have many results (like MMA)
            const maxGames = 30;
            let recentGames = games;

            if (games.length > maxGames) {
                const startIndex = Math.floor(Math.random() * (games.length - maxGames));
                recentGames = games.slice(startIndex, startIndex + maxGames);
            }

            // Time-shift to "Upcoming" (Today + X hours)
            const now = new Date();
            return recentGames.map((game, index) => {
                const shiftHours = (index + 1) * 2; // Spread out every 2 hours
                const newDate = new Date(now.getTime() + shiftHours * 60 * 60 * 1000);

                return {
                    ...game,
                    status: EventStatus.SCHEDULED,
                    startTime: newDate,
                };
            });
        }

        // 2. Standard Logic for Football (Unrestricted)
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const to = from;

        const params: Record<string, string | number> = { from, to };
        if (leagueId) {
            params.league = leagueId;
            params.season = today.getFullYear();
        }

        return this.getGames(params);
    }

    // ========================
    // Transformers
    // ========================

    /**
     * Transform API league response to our format
     * Handles different response structures per sport
     */
    private transformLeague(data: any): SportsLeague {
        // NBA returns simple strings for leagues (e.g. "standard", "africa")
        if (this.currentSport === 'nba' && typeof data === 'string') {
            const leagueName = data.charAt(0).toUpperCase() + data.slice(1);
            return {
                id: '',
                externalId: data, // Use slug as external ID
                source: this.currentConfig.dataSource,
                sport: this.currentConfig.sportType,
                name: `NBA ${leagueName}`, // e.g. "NBA Standard"
                nameAlternate: undefined,
                country: 'USA', // Default to USA for NBA
                countryCode: 'US',
                logoUrl: 'https://media.api-sports.io/nba/leagues/standard.png', // Generic fallback
                bannerUrl: undefined,
                trophyUrl: undefined,
                description: undefined,
                firstEventDate: undefined,
                website: undefined,
                twitter: undefined,
                facebook: undefined,
                isActive: true,
                isFeatured: data === 'standard', // Feature standard league
                displayOrder: data === 'standard' ? 1 : 10,
                metadata: { type: 'League' },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        // Football has nested league/country structure
        if (this.currentSport === 'football') {
            return {
                id: '',
                externalId: String(data.league?.id || data.id),
                source: this.currentConfig.dataSource,
                sport: this.currentConfig.sportType,
                name: data.league?.name || data.name,
                nameAlternate: undefined,
                country: data.country?.name || data.country,
                countryCode: data.country?.code,
                logoUrl: data.league?.logo || data.logo,
                bannerUrl: undefined,
                trophyUrl: undefined,
                description: undefined,
                firstEventDate: undefined,
                website: undefined,
                twitter: undefined,
                facebook: undefined,
                isActive: true,
                isFeatured: false,
                displayOrder: 0,
                metadata: {
                    type: data.league?.type,
                    countryFlag: data.country?.flag,
                    seasons: data.seasons,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        // Generic structure for other sports
        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            sport: this.currentConfig.sportType,
            name: data.name,
            nameAlternate: data.name_alternate,
            country: data.country?.name || data.country,
            countryCode: data.country?.code,
            logoUrl: data.logo,
            bannerUrl: undefined,
            trophyUrl: undefined,
            description: undefined,
            firstEventDate: undefined,
            website: undefined,
            twitter: undefined,
            facebook: undefined,
            isActive: true,
            isFeatured: false,
            displayOrder: 0,
            metadata: { raw: data },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform API team response to our format
     */
    private transformTeam(data: any): SportsTeam {
        // Football has nested team/venue structure
        if (this.currentSport === 'football') {
            return {
                id: '',
                externalId: String(data.team?.id || data.id),
                source: this.currentConfig.dataSource,
                leagueId: undefined,
                sport: this.currentConfig.sportType,
                name: data.team?.name || data.name,
                nameShort: data.team?.code || data.code,
                nameAlternate: undefined,
                country: data.team?.country || data.country,
                city: data.venue?.city,
                stadium: data.venue?.name,
                stadiumCapacity: data.venue?.capacity,
                logoUrl: data.team?.logo || data.logo,
                jerseyUrl: undefined,
                bannerUrl: undefined,
                primaryColor: undefined,
                secondaryColor: undefined,
                foundedYear: data.team?.founded || data.founded,
                website: undefined,
                twitter: undefined,
                facebook: undefined,
                instagram: undefined,
                description: undefined,
                isActive: true,
                metadata: {
                    national: data.team?.national,
                    venue: data.venue,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        // MMA uses fighters instead of teams
        if (this.currentSport === 'mma') {
            return {
                id: '',
                externalId: String(data.id),
                source: this.currentConfig.dataSource,
                leagueId: undefined,
                sport: this.currentConfig.sportType,
                name: data.name,
                nameShort: data.nickname,
                nameAlternate: undefined,
                country: data.country,
                city: undefined,
                stadium: undefined,
                stadiumCapacity: undefined,
                logoUrl: data.image,
                jerseyUrl: undefined,
                bannerUrl: undefined,
                primaryColor: undefined,
                secondaryColor: undefined,
                foundedYear: undefined,
                website: undefined,
                twitter: undefined,
                facebook: undefined,
                instagram: undefined,
                description: undefined,
                isActive: true,
                metadata: {
                    weight_class: data.weight_class,
                    record: data.record,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        // Generic structure for other sports
        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: undefined,
            sport: this.currentConfig.sportType,
            name: data.name,
            nameShort: data.code,
            nameAlternate: undefined,
            country: data.country?.name || data.country,
            city: data.city,
            stadium: data.arena?.name,
            stadiumCapacity: data.arena?.capacity,
            logoUrl: data.logo,
            jerseyUrl: undefined,
            bannerUrl: undefined,
            primaryColor: undefined,
            secondaryColor: undefined,
            foundedYear: data.founded,
            website: undefined,
            twitter: undefined,
            facebook: undefined,
            instagram: undefined,
            description: undefined,
            isActive: true,
            metadata: { raw: data },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform API game response to our format
     */
    private transformGame(data: any): SportsEvent {
        // Football has fixture structure
        if (this.currentSport === 'football') {
            return this.transformFootballFixture(data);
        }

        // Formula 1 has race structure
        if (this.currentSport === 'formula1') {
            return this.transformF1Race(data);
        }

        // NBA has specific structure (visitors vs away)
        if (this.currentSport === 'nba') {
            return this.transformNBAGame(data);
        }

        // AFL (Australian Football League) specific structure
        if (this.currentSport === 'afl') {
            return this.transformAFLGame(data);
        }

        // MMA uses fighters instead of teams
        if (this.currentSport === 'mma') {
            return this.transformMMAFight(data);
        }

        // Volleyball has sets/points structure
        if (this.currentSport === 'volleyball') {
            return this.transformVolleyballGame(data);
        }

        // Generic game structure for basketball, hockey, etc.
        return this.transformGenericGame(data);
    }

    /**
     * Transform NBA Game/Event (v2 structure uses 'visitors' instead of 'away')
     */
    private transformNBAGame(data: any): SportsEvent {
        // Map 'visitors' to 'away' standard
        const homeTeam = data.teams.home;
        const awayTeam = data.teams.visitors;

        // NBA status structure is object: { short: 3, long: "Finished", ... }
        // Map to our EventStatus enum
        let status = EventStatus.SCHEDULED;
        const statusShort = data.status?.short;

        if (statusShort === 3) status = EventStatus.FINISHED;
        else if (statusShort === 1 || statusShort === 2) status = EventStatus.LIVE;
        else if (data.status?.long === "Scheduled" || data.status?.long === "Pre-season") status = EventStatus.SCHEDULED;

        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: undefined, // NBA doesn't really have numeric league IDs in same way
            sport: this.currentConfig.sportType,
            name: `${awayTeam.name} @ ${homeTeam.name}`,
            venue: data.arena?.name,
            city: data.arena?.city,
            country: data.arena?.country || 'USA',
            startTime: new Date(data.date.start),
            endTime: data.date.end ? new Date(data.date.end) : undefined,
            timezone: 'UTC',
            status: status,
            statusDetail: String(data.status?.long || ''),
            homeScore: data.scores.home.points,
            awayScore: data.scores.visitors.points,
            homeScoreHalftime: undefined, // NBA doesn't standardly provide this in summary
            awayScoreHalftime: undefined,
            homeTeamId: undefined,
            awayTeamId: undefined,
            referee: undefined,
            thumbnailUrl: undefined, // Could use team logos
            videoUrl: undefined,
            bannerUrl: undefined,
            hasMarket: false, // Default
            isFeatured: false,
            stats: {
                periods: data.periods,
                scores: data.scores
            },
            metadata: { raw: data },
            // Populate joined objects for immediate use if needed
            homeTeam: {
                id: '',
                externalId: String(homeTeam.id),
                name: homeTeam.name,
                nameShort: homeTeam.code,
                logoUrl: homeTeam.logo,
                source: this.currentConfig.dataSource,
                sport: this.currentConfig.sportType,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: {}
            },
            awayTeam: {
                id: '',
                externalId: String(awayTeam.id),
                name: awayTeam.name,
                nameShort: awayTeam.code,
                logoUrl: awayTeam.logo,
                source: this.currentConfig.dataSource,
                sport: this.currentConfig.sportType,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: {}
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform Football fixture
     */
    private transformFootballFixture(data: any): SportsEvent {
        return {
            id: '',
            externalId: String(data.fixture?.id || data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.league?.id),
            homeTeamId: String(data.teams?.home?.id),
            awayTeamId: String(data.teams?.away?.id),
            sport: this.currentConfig.sportType,
            season: String(data.league?.season),
            round: data.league?.round,
            matchDay: undefined,
            name: `${data.teams?.home?.name || 'Home'} vs ${data.teams?.away?.name || 'Away'}`,
            venue: data.fixture?.venue?.name,
            city: data.fixture?.venue?.city,
            country: data.league?.country,
            startTime: new Date(data.fixture?.date || data.date),
            endTime: undefined,
            timezone: data.fixture?.timezone || 'UTC',
            status: this.mapStatus(data.fixture?.status?.short || data.status),
            statusDetail: data.fixture?.status?.long,
            elapsedTime: data.fixture?.status?.elapsed,
            homeScore: data.goals?.home ?? undefined,
            awayScore: data.goals?.away ?? undefined,
            homeScoreHalftime: data.score?.halftime?.home ?? undefined,
            awayScoreHalftime: data.score?.halftime?.away ?? undefined,
            homeScoreExtra: data.score?.extratime?.home ?? undefined,
            awayScoreExtra: data.score?.extratime?.away ?? undefined,
            homeScorePenalty: data.score?.penalty?.home ?? undefined,
            awayScorePenalty: data.score?.penalty?.away ?? undefined,
            referee: data.fixture?.referee,
            attendance: undefined,
            thumbnailUrl: undefined,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {},
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: data.teams?.home?.name,
                homeTeamLogo: data.teams?.home?.logo,
                awayTeamName: data.teams?.away?.name,
                awayTeamLogo: data.teams?.away?.logo,
                leagueName: data.league?.name,
                leagueLogo: data.league?.logo,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform F1 race
     */
    private transformF1Race(data: any): SportsEvent {
        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.competition?.id),
            homeTeamId: undefined,
            awayTeamId: undefined,
            sport: this.currentConfig.sportType,
            season: String(data.season),
            round: String(data.round),
            matchDay: undefined,
            name: data.competition?.name || data.name,
            venue: data.circuit?.name,
            city: data.circuit?.city,
            country: data.competition?.country?.name || data.country,
            startTime: new Date(data.date),
            endTime: undefined,
            timezone: data.timezone || 'UTC',
            status: this.mapStatus(data.status),
            statusDetail: undefined,
            elapsedTime: undefined,
            homeScore: undefined,
            awayScore: undefined,
            homeScoreHalftime: undefined,
            awayScoreHalftime: undefined,
            homeScoreExtra: undefined,
            awayScoreExtra: undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: undefined,
            attendance: undefined,
            thumbnailUrl: data.circuit?.image,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {},
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                circuit: data.circuit,
                laps: data.laps,
                distance: data.distance,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform generic game (basketball, hockey, etc.)
     */
    private transformGenericGame(data: any): SportsEvent {
        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.league?.id),
            homeTeamId: String(data.teams?.home?.id),
            awayTeamId: String(data.teams?.away?.id),
            sport: this.currentConfig.sportType,
            season: String(data.season || data.league?.season),
            round: data.week || data.round,
            matchDay: undefined,
            name: `${data.teams?.home?.name || 'Home'} vs ${data.teams?.away?.name || 'Away'}`,
            venue: data.arena?.name || data.venue,
            city: data.arena?.city || data.city,
            country: data.country?.name || data.country,
            startTime: new Date(data.date || data.timestamp * 1000),
            endTime: undefined,
            timezone: data.timezone || 'UTC',
            status: this.mapStatus(data.status?.short || data.status),
            statusDetail: data.status?.long,
            elapsedTime: data.status?.timer || data.timer,
            homeScore: data.scores?.home?.total ?? data.scores?.home ?? undefined,
            awayScore: data.scores?.away?.total ?? data.scores?.away ?? undefined,
            homeScoreHalftime: data.scores?.home?.half ?? undefined,
            awayScoreHalftime: data.scores?.away?.half ?? undefined,
            homeScoreExtra: data.scores?.home?.overtime ?? undefined,
            awayScoreExtra: data.scores?.away?.overtime ?? undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: undefined,
            attendance: undefined,
            thumbnailUrl: undefined,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {},
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: data.teams?.home?.name,
                homeTeamLogo: data.teams?.home?.logo,
                awayTeamName: data.teams?.away?.name,
                awayTeamLogo: data.teams?.away?.logo,
                leagueName: data.league?.name,
                leagueLogo: data.league?.logo,
                periods: data.scores?.home ? Object.keys(data.scores?.home).filter(k => k.startsWith('quarter') || k.startsWith('period')) : [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform AFL (Australian Football League) game
     * AFL uses quarters (Q1-Q4), different scoring (goals + behinds)
     */
    private transformAFLGame(data: any): SportsEvent {
        // AFL has teams.home and teams.away structure
        const homeTeam = data.teams?.home;
        const awayTeam = data.teams?.away;

        return {
            id: '',
            externalId: String(data.game?.id || data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.league?.id),
            homeTeamId: String(homeTeam?.id),
            awayTeamId: String(awayTeam?.id),
            sport: this.currentConfig.sportType,
            season: String(data.season || data.league?.season),
            round: data.week || data.round,
            matchDay: undefined,
            name: `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`,
            venue: data.venue?.name || data.venue,
            city: data.venue?.city,
            country: data.country?.name || 'Australia',
            startTime: new Date(data.date || data.timestamp * 1000),
            endTime: undefined,
            timezone: data.timezone || 'Australia/Melbourne',
            status: this.mapStatus(data.status?.short || data.status),
            statusDetail: data.status?.long,
            elapsedTime: data.status?.timer || data.time?.elapsed,
            homeScore: data.scores?.home?.score ?? data.scores?.home?.total ?? data.scores?.home ?? undefined,
            awayScore: data.scores?.away?.score ?? data.scores?.away?.total ?? data.scores?.away ?? undefined,
            homeScoreHalftime: data.scores?.home?.halftime ?? undefined,
            awayScoreHalftime: data.scores?.away?.halftime ?? undefined,
            homeScoreExtra: undefined,
            awayScoreExtra: undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: undefined,
            attendance: data.attendance,
            thumbnailUrl: undefined,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {
                quarters: data.periods || data.quarters,
            },
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: homeTeam?.name,
                homeTeamLogo: homeTeam?.logo,
                awayTeamName: awayTeam?.name,
                awayTeamLogo: awayTeam?.logo,
                leagueName: data.league?.name,
                leagueLogo: data.league?.logo,
                // AFL specific: goals and behinds
                homeGoals: data.scores?.home?.goals,
                homeBehinds: data.scores?.home?.behinds,
                awayGoals: data.scores?.away?.goals,
                awayBehinds: data.scores?.away?.behinds,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform MMA fight
     * MMA uses fighters instead of teams, weight classes, and rounds
     */
    private transformMMAFight(data: any): SportsEvent {
        // MMA structure: data.fighters can be an array OR an object { first: ..., second: ... }
        let fighter1: any;
        let fighter2: any;

        if (Array.isArray(data.fighters)) {
            fighter1 = data.fighters[0];
            fighter2 = data.fighters[1];
        } else if (data.fighters) {
            fighter1 = data.fighters.first;
            fighter2 = data.fighters.second;
        }

        // Fallback to teams if fighters missing
        if (!fighter1) fighter1 = data.teams?.home;
        if (!fighter2) fighter2 = data.teams?.away;

        // Build fight name from fighter names
        const getFighterName = (f: any) => {
            if (!f) return 'Unknown Fighter';
            if (f.name) return f.name;
            return `${f.firstname || ''} ${f.lastname || ''}`.trim();
        };

        const fighter1Name = getFighterName(fighter1);
        const fighter2Name = getFighterName(fighter2);

        // Normalize league/category
        let leagueName = data.league?.name || data.slug;
        if (!leagueName && data.category) {
            leagueName = data.category; // e.g. "Bantamweight" if league missing
        }

        // Ensure we have a valid status
        const status = (data.status?.long === "Finished" || data.status?.short === "FT")
            ? EventStatus.FINISHED
            : (this.mapStatus(data.status?.short || data.status));

        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.league?.id || ''),
            // Map fighters to home/away for database compatibility
            homeTeamId: String(fighter1?.id || ''),
            awayTeamId: String(fighter2?.id || ''),
            sport: this.currentConfig.sportType,
            season: String(data.season || new Date().getFullYear()),
            round: data.fight_number ? `Fight ${data.fight_number}` : undefined,
            matchDay: undefined,
            name: `${fighter1Name} vs ${fighter2Name}`,
            venue: data.venue?.name || data.location?.venue || data.venue, // Handle venue string
            city: data.location?.city || data.venue?.city,
            country: data.location?.country || data.country,
            startTime: new Date(data.date || data.timestamp * 1000),
            endTime: undefined,
            timezone: data.timezone || 'UTC',
            status: status,
            statusDetail: data.status?.long || data.result?.method,
            elapsedTime: data.status?.elapsed || data.result?.time_seconds,
            homeScore: undefined,
            awayScore: undefined,
            homeScoreHalftime: undefined,
            awayScoreHalftime: undefined,
            homeScoreExtra: undefined,
            awayScoreExtra: undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: data.referee?.name,
            attendance: undefined,
            thumbnailUrl: fighter1?.image || fighter2?.image,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {
                rounds: data.rounds,
                weightClass: data.weight?.name || data.weight_class || data.category,
                result: data.result,
            },
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: data.main_event || data.title_fight || data.is_main || false,
            metadata: {
                // Fighter 1 (mapped to home)
                homeTeamName: fighter1Name,
                homeTeamLogo: fighter1?.image || fighter1?.logo,
                fighter1: {
                    id: fighter1?.id,
                    name: fighter1Name,
                    nickname: fighter1?.nickname,
                    country: fighter1?.country,
                    record: fighter1?.record,
                    image: fighter1?.image,
                    winner: fighter1?.winner
                },
                // Fighter 2 (mapped to away)
                awayTeamName: fighter2Name,
                awayTeamLogo: fighter2?.image || fighter2?.logo,
                fighter2: {
                    id: fighter2?.id,
                    name: fighter2Name,
                    nickname: fighter2?.nickname,
                    country: fighter2?.country,
                    record: fighter2?.record,
                    image: fighter2?.image,
                    winner: fighter2?.winner
                },
                leagueName: leagueName,
                category: data.category,
                isMainEvent: data.main_event || false,
                isTitleFight: data.title_fight || false,
                winner: data.result?.winner,
                method: data.result?.method,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform Volleyball game
     * Volleyball uses sets (best of 3 or 5), points per set
     */
    private transformVolleyballGame(data: any): SportsEvent {
        const homeTeam = data.teams?.home;
        const awayTeam = data.teams?.away;

        return {
            id: '',
            externalId: String(data.id),
            source: this.currentConfig.dataSource,
            leagueId: String(data.league?.id),
            homeTeamId: String(homeTeam?.id),
            awayTeamId: String(awayTeam?.id),
            sport: this.currentConfig.sportType,
            season: String(data.season || data.league?.season),
            round: data.week || data.round,
            matchDay: undefined,
            name: `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`,
            venue: data.venue?.name || data.venue,
            city: data.venue?.city,
            country: data.country?.name || data.country,
            startTime: new Date(data.date || data.timestamp * 1000),
            endTime: undefined,
            timezone: data.timezone || 'UTC',
            status: this.mapStatus(data.status?.short || data.status),
            statusDetail: data.status?.long,
            elapsedTime: data.status?.set_in_progress,
            // For volleyball, total sets won
            homeScore: data.scores?.home?.total ?? data.scores?.home ?? undefined,
            awayScore: data.scores?.away?.total ?? data.scores?.away ?? undefined,
            homeScoreHalftime: undefined,
            awayScoreHalftime: undefined,
            homeScoreExtra: undefined,
            awayScoreExtra: undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: undefined,
            attendance: undefined,
            thumbnailUrl: undefined,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {
                sets: data.periods || data.sets,
                currentSet: data.status?.set_in_progress,
            },
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: homeTeam?.name,
                homeTeamLogo: homeTeam?.logo,
                awayTeamName: awayTeam?.name,
                awayTeamLogo: awayTeam?.logo,
                leagueName: data.league?.name,
                leagueLogo: data.league?.logo,
                // Set-by-set scores
                set1: { home: data.scores?.home?.set1, away: data.scores?.away?.set1 },
                set2: { home: data.scores?.home?.set2, away: data.scores?.away?.set2 },
                set3: { home: data.scores?.home?.set3, away: data.scores?.away?.set3 },
                set4: { home: data.scores?.home?.set4, away: data.scores?.away?.set4 },
                set5: { home: data.scores?.home?.set5, away: data.scores?.away?.set5 },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Map API status to EventStatus
     */
    private mapStatus(status?: string): EventStatus {
        if (!status) return EventStatus.SCHEDULED;

        const statusLower = status.toLowerCase();

        // Scheduled
        if (['ns', 'tbd', 'scheduled', 'not started'].includes(statusLower)) {
            return EventStatus.SCHEDULED;
        }

        // Live
        if (['1h', '2h', 'ht', 'et', 'bt', 'p', 'live', 'in progress', 'inplay',
            'q1', 'q2', 'q3', 'q4', 'ot', 'ongoing'].includes(statusLower)) {
            return EventStatus.LIVE;
        }

        // Halftime
        if (['ht', 'halftime', 'half time', 'break'].includes(statusLower)) {
            return EventStatus.HALFTIME;
        }

        // Finished
        if (['ft', 'aet', 'pen', 'finished', 'ended', 'final', 'complete', 'completed'].includes(statusLower)) {
            return EventStatus.FINISHED;
        }

        // Postponed
        if (['pst', 'post', 'postponed', 'susp', 'suspended', 'int', 'interrupted'].includes(statusLower)) {
            return EventStatus.POSTPONED;
        }

        // Cancelled
        if (['canc', 'cancelled', 'canceled', 'abd', 'abandoned', 'awd', 'wo', 'walkover'].includes(statusLower)) {
            return EventStatus.CANCELLED;
        }

        return EventStatus.SCHEDULED;
    }
}
