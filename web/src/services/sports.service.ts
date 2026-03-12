/**
 * Sports Service
 * 
 * Frontend API client for sports data endpoints.
 * Provides methods to fetch leagues, teams, events, and markets
 * with proper error handling and caching.
 */

import { API_URL } from '../config';

const API_BASE_URL = API_URL;

// ========================
// Types
// ========================

export type SportType =
    | 'afl'
    | 'baseball'
    | 'basketball'
    | 'football'
    | 'formula1'
    | 'handball'
    | 'hockey'
    | 'mma'
    | 'nba'
    | 'nfl'
    | 'rugby'
    | 'volleyball';

export type EventStatus =
    | 'scheduled'
    | 'live'
    | 'halftime'
    | 'finished'
    | 'postponed'
    | 'cancelled'
    | 'suspended';

export interface SportsLeague {
    id: string;
    externalId: string;
    sport: SportType;
    name: string;
    nameAlternate?: string;
    country?: string;
    countryCode?: string;
    logoUrl?: string;
    bannerUrl?: string;
    isActive: boolean;
    isFeatured: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SportsTeam {
    id: string;
    externalId: string;
    leagueId?: string;
    sport: SportType;
    name: string;
    nameShort?: string;
    country?: string;
    city?: string;
    stadium?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SportsEvent {
    id: string;
    externalId: string;
    leagueId?: string;
    homeTeamId?: string;
    awayTeamId?: string;
    sport: SportType;
    season?: string;
    round?: string;
    name?: string;
    venue?: string;
    startTime: string;
    status: EventStatus;
    statusDetail?: string;
    elapsedTime?: number;
    homeScore?: number;
    awayScore?: number;
    thumbnailUrl?: string;
    hasMarket: boolean;
    isFeatured: boolean;
    createdAt: string;
    updatedAt: string;
    homeTeam?: SportsTeam;
    awayTeam?: SportsTeam;
    league?: SportsLeague;
    metadata?: any;
}

export interface SportsMarket {
    id: string;
    eventId: string;
    marketType: string;
    title: string;
    description?: string;
    question: string;
    outcomes: string[];
    outcomePrices: number[];
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
    resolved: boolean;
    outcome?: boolean;
    opensAt?: string;
    closesAt?: string;
    isActive: boolean;
    isFeatured: boolean;
    createdAt: string;
    updatedAt: string;
    event?: SportsEvent;
}

export interface SportCategory {
    id: SportType;
    name: string;
    icon: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface SportsEventsQuery {
    sport?: SportType;
    leagueId?: string;
    status?: EventStatus;
    startDate?: string;
    endDate?: string;
    hasMarket?: boolean;
    isFeatured?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'startTime' | 'createdAt' | 'volume';
    sortOrder?: 'asc' | 'desc';
}

// ========================
// API Client
// ========================

interface CacheEntry {
    data: unknown;
    expires: number;
}

interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

class SportsApiService {
    private baseUrl: string;

    // Request caching with TTL
    private cache = new Map<string, CacheEntry>();



    // Retry configuration
    private retryConfig: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
    };

    // Rate limiting state
    private requestCount = 0;
    private lastRequestTime = 0;
    private readonly requestsPerSecond = 10;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;

        // Cleanup expired cache entries every minute
        setInterval(() => this.cleanupCache(), 60000);
    }

    /**
     * Clean up expired cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expires < now) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Rate limit check
     */
    private async checkRateLimit(): Promise<void> {
        const now = Date.now();
        const minInterval = 1000 / this.requestsPerSecond;
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < minInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, minInterval - timeSinceLastRequest)
            );
        }

        this.lastRequestTime = Date.now();
        this.requestCount++;
    }

    /**
     * Get retry delay with jitter
     */
    private getRetryDelay(attempt: number): number {
        const baseDelay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs,
        );
        // Add 0-30% jitter
        const jitter = Math.random() * 0.3 * baseDelay;
        return Math.floor(baseDelay + jitter);
    }



    /**
     * Make request with retry logic
     */
    public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                await this.checkRateLimit();

                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers,
                    },
                });

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`API Error: ${response.status} - ${error}`);
                }

                return response.json();
            } catch (error) {
                lastError = error as Error;
                console.warn(
                    `Sports API request attempt ${attempt + 1} failed: ${lastError.message}`
                );

                // Don't retry on 4xx errors (client errors)
                if (lastError.message.includes('4')) {
                    throw lastError;
                }

                if (attempt < this.retryConfig.maxRetries) {
                    const delay = this.getRetryDelay(attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error(`Sports API request failed: ${endpoint}`, lastError);
        throw lastError || new Error('Request failed after retries');
    }

    /**
     * Clear cache for specific key or all
     */
    public clearCache(key?: string): void {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get cache stats
     */
    public getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }

    // ========================
    // Sport Categories
    // ========================

    async getSportCategories(): Promise<SportCategory[]> {
        return this.request<SportCategory[]>('/sports/categories');
    }

    // ========================
    // Leagues
    // ========================

    async getLeagues(params?: {
        sport?: SportType;
        country?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<SportsLeague>> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    // Anti-hack: Skip invalid sport values
                    if (key === 'sport') {
                        const validSports = SPORT_CATEGORIES.map(s => s.id);
                        if (!validSports.includes(value as SportType)) {
                            return;
                        }
                    }
                    queryParams.append(key, String(value));
                }
            });
        }
        const query = queryParams.toString();
        return this.request<PaginatedResponse<SportsLeague>>(`/sports/leagues${query ? `?${query}` : ''}`);
    }

    async getLeague(id: string): Promise<SportsLeague> {
        return this.request<SportsLeague>(`/sports/leagues/${id}`);
    }

    // ========================
    // Teams
    // ========================

    async getTeamsByLeague(leagueId: string): Promise<SportsTeam[]> {
        return this.request<SportsTeam[]>(`/sports/leagues/${leagueId}/teams`);
    }

    async searchTeams(query: string, sport?: SportType): Promise<SportsTeam[]> {
        const params = new URLSearchParams({ q: query });
        if (sport) params.append('sport', sport);
        return this.request<SportsTeam[]>(`/sports/teams/search?${params}`);
    }

    async getTeam(id: string): Promise<SportsTeam> {
        return this.request<SportsTeam>(`/sports/teams/${id}`);
    }

    // ========================
    // Events
    // ========================

    async getEvents(params?: SportsEventsQuery): Promise<PaginatedResponse<SportsEvent>> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    // Anti-hack: Skip invalid sport values
                    if (key === 'sport') {
                        const validSports = SPORT_CATEGORIES.map(s => s.id);
                        if (!validSports.includes(value as SportType)) {
                            return;
                        }
                    }
                    queryParams.append(key, String(value));
                }
            });
        }
        const query = queryParams.toString();
        return this.request<PaginatedResponse<SportsEvent>>(`/sports/events${query ? `?${query}` : ''}`);
    }

    async getLiveEvents(sport?: SportType): Promise<SportsEvent[]> {
        const query = sport ? `?sport=${sport}` : '';
        return this.request<SportsEvent[]>(`/sports/events/live${query}`);
    }

    async getUpcomingEvents(sport?: SportType, limit: number = 20): Promise<SportsEvent[]> {
        const params = new URLSearchParams({ limit: String(limit) });
        if (sport) params.append('sport', sport);
        return this.request<SportsEvent[]>(`/sports/events/upcoming?${params}`);
    }

    async getEvent(id: string): Promise<SportsEvent> {
        return this.request<SportsEvent>(`/sports/events/${id}`);
    }

    // ========================
    // Markets
    // ========================

    async getMarkets(params?: {
        sport?: SportType;
        eventId?: string;
        resolved?: boolean;
        isActive?: boolean;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<SportsMarket>> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    // Anti-hack: Skip invalid sport values to prevent API validation errors
                    if (key === 'sport') {
                        const validSports = SPORT_CATEGORIES.map(s => s.id);
                        if (!validSports.includes(value as SportType)) {
                            return; // Skip invalid sport parameter
                        }
                    }
                    queryParams.append(key, String(value));
                }
            });
        }
        const query = queryParams.toString();
        return this.request<PaginatedResponse<SportsMarket>>(`/sports/markets${query ? `?${query}` : ''}`);
    }

    async getMarket(id: string): Promise<SportsMarket> {
        return this.request<SportsMarket>(`/sports/markets/${id}`);
    }

    // ========================
    // Utility Methods
    // ========================

    /**
     * Format event status for display
     */
    formatEventStatus(status: EventStatus): string {
        const statusMap: Record<EventStatus, string> = {
            scheduled: 'Upcoming',
            live: 'LIVE',
            halftime: 'Half Time',
            finished: 'Finished',
            postponed: 'Postponed',
            cancelled: 'Cancelled',
            suspended: 'Suspended',
        };
        return statusMap[status] || status;
    }

    /**
     * Get status color class
     */
    getStatusColor(status: EventStatus): string {
        const colorMap: Record<EventStatus, string> = {
            scheduled: 'text-blue-500',
            live: 'text-red-500',
            halftime: 'text-yellow-500',
            finished: 'text-gray-500',
            postponed: 'text-orange-500',
            cancelled: 'text-gray-400',
            suspended: 'text-orange-600',
        };
        return colorMap[status] || 'text-gray-500';
    }

    /**
     * Check if event is live
     */
    isLiveEvent(event: SportsEvent): boolean {
        return event.status === 'live' || event.status === 'halftime';
    }

    /**
     * Format odds as percentage
     */
    formatOdds(price: number): string {
        return `${(price * 100).toFixed(1)}%`;
    }

    /**
     * Format odds as cents
     */
    formatOddsCents(price: number): string {
        return `${(price * 100).toFixed(0)}¢`;
    }
}

// Export singleton instance
export const SportsService = new SportsApiService();

// Export class for custom instances
export { SportsApiService };

// Sport categories with icons
export const SPORT_CATEGORIES: SportCategory[] = [
    { id: 'afl', name: 'AFL', icon: '🏉' },
    { id: 'baseball', name: 'Baseball', icon: '⚾' },
    { id: 'basketball', name: 'Basketball', icon: '🏀' },
    { id: 'football', name: 'Football', icon: '⚽' },
    { id: 'formula1', name: 'Formula 1', icon: '🏎️' },
    { id: 'handball', name: 'Handball', icon: '🤾' },
    { id: 'hockey', name: 'Hockey', icon: '🏒' },
    { id: 'mma', name: 'MMA', icon: '🥊' },
    { id: 'nba', name: 'NBA', icon: '🏀' },
    { id: 'nfl', name: 'NFL', icon: '🏈' },
    { id: 'rugby', name: 'Rugby', icon: '🏉' },
    { id: 'volleyball', name: 'Volleyball', icon: '🏐' },
];

// Get sport category by ID
export function getSportById(id: string): SportCategory | undefined {
    return SPORT_CATEGORIES.find(sport => sport.id === id);
}

// Get sport icon by ID
export function getSportIcon(id: string): string {
    return getSportById(id)?.icon || '🏆';
}

// Get sport name by ID
export function getSportName(id: string): string {
    return getSportById(id)?.name || id.toUpperCase();
}
