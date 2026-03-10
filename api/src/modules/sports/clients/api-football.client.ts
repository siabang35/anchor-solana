/**
 * API-Football Client
 * 
 * Client for API-Football v3 - comprehensive football/soccer data.
 * Provides enhanced data for Football including fixtures, standings, odds.
 * 
 * API Documentation: https://www.api-football.com/documentation-v3
 * Authentication: x-apisports-key header
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseSportsClient } from './base-sports.client.js';
import {
    DataSource,
    SportType,
    EventStatus,
    APIFootballLeague,
    APIFootballTeam,
    APIFootballFixture,
    APIFootballOdds,
    SportsLeague,
    SportsTeam,
    SportsEvent,
} from '../types/sports.types.js';

// API Response wrapper
interface APIFootballResponse<T> {
    get: string;
    parameters: Record<string, string | number>;
    errors: Record<string, string>[] | Record<string, string>;
    results: number;
    paging: {
        current: number;
        total: number;
    };
    response: T[];
}

// Fixture query parameters
export interface FixtureParams {
    id?: number;
    ids?: string; // comma-separated IDs
    live?: 'all' | string; // 'all' for all live
    date?: string; // YYYY-MM-DD
    league?: number;
    season?: number;
    team?: number;
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
    round?: string;
    status?: string;
    timezone?: string;
}

@Injectable()
export class APIFootballClient extends BaseSportsClient {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://v3.football.api-sports.io';

    constructor(private readonly configService: ConfigService) {
        // API-Football rate limits depend on plan
        // Free: 100 requests/day
        // Basic to Pro: higher limits
        super('APIFootball', DataSource.APIFOOTBALL, {
            baseUrl: 'https://v3.football.api-sports.io',
            rateLimit: {
                requestsPerMinute: 30,
                requestsPerDay: 100, // Free tier limit
            },
            timeout: 30000,
        });

        this.apiKey = this.configService.get<string>('APIFOOTBALL_API_KEY') || '';

        if (!this.apiKey) {
            this.logger.warn('API-Football API key not configured');
        } else {
            this.logger.log('Initialized with API key');
        }
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
     * Test API connection
     */
    async testConnection(): Promise<boolean> {
        try {
            const url = `${this.baseUrl}/status`;
            await this.makeRequest(url);
            return true;
        } catch (error) {
            this.logger.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Check API account status
     */
    async getAccountStatus(): Promise<{
        account: { firstname: string; lastname: string; email: string };
        subscription: { plan: string; end: string; active: boolean };
        requests: { current: number; limit_day: number };
    } | null> {
        try {
            const url = `${this.baseUrl}/status`;
            const response = await this.makeRequest<{
                response: {
                    account: { firstname: string; lastname: string; email: string };
                    subscription: { plan: string; end: string; active: boolean };
                    requests: { current: number; limit_day: number };
                };
            }>(url);
            return response.response;
        } catch (error) {
            this.logger.error('Failed to get account status:', error);
            return null;
        }
    }

    // ========================
    // Leagues
    // ========================

    /**
     * Get all available leagues
     */
    async getLeagues(params?: {
        id?: number;
        name?: string;
        country?: string;
        code?: string;
        season?: number;
        current?: boolean;
        search?: string;
    }): Promise<SportsLeague[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const url = `${this.baseUrl}/leagues${queryParams.toString() ? '?' + queryParams : ''}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<APIFootballLeague>>(url);

            this.logSync('getLeagues', 'football', response.results);
            return response.response.map(league => this.transformLeague(league));
        } catch (error) {
            this.logger.error('Failed to get leagues:', error);
            return [];
        }
    }

    /**
     * Get leagues by country
     */
    async getLeaguesByCountry(countryCode: string): Promise<SportsLeague[]> {
        return this.getLeagues({ code: countryCode });
    }

    /**
     * Search leagues
     */
    async searchLeagues(query: string): Promise<SportsLeague[]> {
        return this.getLeagues({ search: query });
    }

    // ========================
    // Teams
    // ========================

    /**
     * Get teams
     */
    async getTeams(params?: {
        id?: number;
        name?: string;
        league?: number;
        season?: number;
        country?: string;
        code?: string;
        venue?: number;
        search?: string;
    }): Promise<SportsTeam[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const url = `${this.baseUrl}/teams${queryParams.toString() ? '?' + queryParams : ''}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<APIFootballTeam>>(url);

            this.logSync('getTeams', 'football', response.results);
            return response.response.map(team => this.transformTeam(team));
        } catch (error) {
            this.logger.error('Failed to get teams:', error);
            return [];
        }
    }

    /**
     * Get teams by league
     */
    async getTeamsByLeague(leagueId: number, season: number): Promise<SportsTeam[]> {
        return this.getTeams({ league: leagueId, season });
    }

    /**
     * Search teams
     */
    async searchTeams(query: string): Promise<SportsTeam[]> {
        return this.getTeams({ search: query });
    }

    // ========================
    // Fixtures (Events/Matches)
    // ========================

    /**
     * Get fixtures with various filters
     */
    async getFixtures(params: FixtureParams): Promise<SportsEvent[]> {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.append(key, String(value));
            }
        });

        const url = `${this.baseUrl}/fixtures?${queryParams}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<APIFootballFixture>>(url);

            this.logSync('getFixtures', 'football', response.results);
            return response.response.map(fixture => this.transformFixture(fixture));
        } catch (error) {
            this.logger.error('Failed to get fixtures:', error);
            return [];
        }
    }

    /**
     * Get live fixtures
     */
    async getLiveFixtures(): Promise<SportsEvent[]> {
        return this.getFixtures({ live: 'all' });
    }

    /**
     * Get fixtures by date
     */
    async getFixturesByDate(date: string): Promise<SportsEvent[]> {
        return this.getFixtures({ date });
    }

    /**
     * Get fixtures by league and season
     */
    async getFixturesByLeague(
        leagueId: number,
        season: number,
        params?: { from?: string; to?: string; round?: string },
    ): Promise<SportsEvent[]> {
        return this.getFixtures({
            league: leagueId,
            season,
            ...params,
        });
    }

    /**
     * Get fixture by ID
     */
    async getFixtureById(fixtureId: number): Promise<SportsEvent | null> {
        const fixtures = await this.getFixtures({ id: fixtureId });
        return fixtures.length > 0 ? fixtures[0] : null;
    }

    /**
     * Get upcoming fixtures (next 7 days)
     */
    async getUpcomingFixtures(leagueId?: number): Promise<SportsEvent[]> {
        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const from = today.toISOString().split('T')[0];
        const to = nextWeek.toISOString().split('T')[0];

        return this.getFixtures({
            from,
            to,
            league: leagueId,
            season: today.getFullYear(),
        });
    }

    // ========================
    // Standings
    // ========================

    /**
     * Get league standings
     */
    async getStandings(
        leagueId: number,
        season: number,
    ): Promise<Array<{
        rank: number;
        team: { id: number; name: string; logo: string };
        points: number;
        played: number;
        win: number;
        draw: number;
        lose: number;
        goalsFor: number;
        goalsAgainst: number;
        goalsDiff: number;
    }>> {
        const url = `${this.baseUrl}/standings?league=${leagueId}&season=${season}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<{
                league: {
                    id: number;
                    name: string;
                    standings: Array<Array<{
                        rank: number;
                        team: { id: number; name: string; logo: string };
                        points: number;
                        all: {
                            played: number;
                            win: number;
                            draw: number;
                            lose: number;
                            goals: { for: number; against: number };
                        };
                        goalsDiff: number;
                    }>>;
                };
            }>>(url);

            if (response.results === 0) {
                return [];
            }

            const standings = response.response[0]?.league?.standings?.[0] || [];
            return standings.map(s => ({
                rank: s.rank,
                team: s.team,
                points: s.points,
                played: s.all.played,
                win: s.all.win,
                draw: s.all.draw,
                lose: s.all.lose,
                goalsFor: s.all.goals.for,
                goalsAgainst: s.all.goals.against,
                goalsDiff: s.goalsDiff,
            }));
        } catch (error) {
            this.logger.error('Failed to get standings:', error);
            return [];
        }
    }

    // ========================
    // Odds
    // ========================

    /**
     * Get odds for a fixture
     */
    async getOdds(fixtureId: number): Promise<{
        fixture: { id: number };
        bookmakers: Array<{
            id: number;
            name: string;
            bets: Array<{
                id: number;
                name: string;
                values: Array<{ value: string; odd: string }>;
            }>;
        }>;
    } | null> {
        const url = `${this.baseUrl}/odds?fixture=${fixtureId}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<APIFootballOdds>>(url);

            if (response.results === 0) {
                return null;
            }

            const odds = response.response[0];
            return {
                fixture: { id: odds.fixture.id },
                bookmakers: odds.bookmakers,
            };
        } catch (error) {
            this.logger.error('Failed to get odds:', error);
            return null;
        }
    }

    /**
     * Get odds by date (bulk fetch)
     */
    async getOddsByDate(date: string, page: number = 1): Promise<APIFootballOdds[]> {
        const url = `${this.baseUrl}/odds?date=${date}&page=${page}`;

        try {
            const response = await this.makeRequest<APIFootballResponse<APIFootballOdds>>(url);

            if (response.results === 0) {
                return [];
            }

            // Handle pagination if needed in future, for now just return current page
            // The sync service should handle iterating pages if response.paging.total > 1

            return response.response;
        } catch (error) {
            this.logger.error(`Failed to get odds for date ${date}:`, error);
            return [];
        }
    }

    // ========================
    // Transformers
    // ========================

    /**
     * Transform API-Football league to our format
     */
    private transformLeague(data: APIFootballLeague): SportsLeague {
        const currentSeason = data.seasons.find(s => s.current);

        return {
            id: '',
            externalId: String(data.league.id),
            source: DataSource.APIFOOTBALL,
            sport: SportType.FOOTBALL,
            name: data.league.name,
            nameAlternate: undefined,
            country: data.country.name,
            countryCode: data.country.code,
            logoUrl: data.league.logo,
            bannerUrl: undefined,
            trophyUrl: undefined,
            description: undefined,
            firstEventDate: currentSeason ? new Date(currentSeason.start) : undefined,
            website: undefined,
            twitter: undefined,
            facebook: undefined,
            isActive: true,
            isFeatured: false,
            displayOrder: 0,
            metadata: {
                type: data.league.type,
                countryFlag: data.country.flag,
                seasons: data.seasons.map(s => ({
                    year: s.year,
                    start: s.start,
                    end: s.end,
                    current: s.current,
                })),
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform API-Football team to our format
     */
    private transformTeam(data: APIFootballTeam): SportsTeam {
        return {
            id: '',
            externalId: String(data.team.id),
            source: DataSource.APIFOOTBALL,
            leagueId: undefined,
            sport: SportType.FOOTBALL,
            name: data.team.name,
            nameShort: data.team.code,
            nameAlternate: undefined,
            country: data.team.country,
            city: data.venue?.city,
            stadium: data.venue?.name,
            stadiumCapacity: data.venue?.capacity,
            logoUrl: data.team.logo,
            jerseyUrl: undefined,
            bannerUrl: undefined,
            primaryColor: undefined,
            secondaryColor: undefined,
            foundedYear: data.team.founded,
            website: undefined,
            twitter: undefined,
            facebook: undefined,
            instagram: undefined,
            description: undefined,
            isActive: true,
            metadata: {
                national: data.team.national,
                venue: data.venue ? {
                    id: data.venue.id,
                    name: data.venue.name,
                    address: data.venue.address,
                    city: data.venue.city,
                    capacity: data.venue.capacity,
                    surface: data.venue.surface,
                    image: data.venue.image,
                } : undefined,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform API-Football fixture to our format
     */
    private transformFixture(data: APIFootballFixture): SportsEvent {
        return {
            id: '',
            externalId: String(data.fixture.id),
            source: DataSource.APIFOOTBALL,
            leagueId: String(data.league.id),
            homeTeamId: String(data.teams.home.id),
            awayTeamId: String(data.teams.away.id),
            sport: SportType.FOOTBALL,
            season: String(data.league.season),
            round: data.league.round,
            matchDay: undefined,
            name: `${data.teams.home.name} vs ${data.teams.away.name}`,
            venue: data.fixture.venue?.name,
            city: data.fixture.venue?.city,
            country: data.league.country,
            startTime: new Date(data.fixture.date),
            endTime: undefined,
            timezone: data.fixture.timezone,
            status: this.mapFixtureStatus(data.fixture.status.short),
            statusDetail: data.fixture.status.long,
            elapsedTime: data.fixture.status.elapsed,
            homeScore: data.goals.home ?? undefined,
            awayScore: data.goals.away ?? undefined,
            homeScoreHalftime: data.score.halftime.home ?? undefined,
            awayScoreHalftime: data.score.halftime.away ?? undefined,
            homeScoreExtra: data.score.extratime.home ?? undefined,
            awayScoreExtra: data.score.extratime.away ?? undefined,
            homeScorePenalty: data.score.penalty.home ?? undefined,
            awayScorePenalty: data.score.penalty.away ?? undefined,
            referee: data.fixture.referee,
            attendance: undefined,
            thumbnailUrl: undefined,
            videoUrl: undefined,
            bannerUrl: undefined,
            stats: {},
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: data.teams.home.name,
                homeTeamLogo: data.teams.home.logo,
                homeTeamWinner: data.teams.home.winner,
                awayTeamName: data.teams.away.name,
                awayTeamLogo: data.teams.away.logo,
                awayTeamWinner: data.teams.away.winner,
                leagueName: data.league.name,
                leagueLogo: data.league.logo,
                leagueFlag: data.league.flag,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Map API-Football status to our EventStatus
     */
    private mapFixtureStatus(status: string): EventStatus {
        switch (status) {
            // Scheduled
            case 'TBD':
            case 'NS':
                return EventStatus.SCHEDULED;

            // Live
            case '1H':
            case '2H':
            case 'ET':
            case 'BT':
            case 'P':
            case 'LIVE':
                return EventStatus.LIVE;

            // Halftime
            case 'HT':
                return EventStatus.HALFTIME;

            // Finished
            case 'FT':
            case 'AET':
            case 'PEN':
                return EventStatus.FINISHED;

            // Postponed
            case 'PST':
            case 'SUSP':
            case 'INT':
                return EventStatus.POSTPONED;

            // Cancelled
            case 'CANC':
            case 'ABD':
            case 'AWD':
            case 'WO':
                return EventStatus.CANCELLED;

            default:
                return EventStatus.SCHEDULED;
        }
    }
}
