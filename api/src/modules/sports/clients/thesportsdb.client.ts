/**
 * TheSportsDB API Client
 * 
 * Client for TheSportsDB API v1 (free tier) and v2 (premium).
 * Supports: AFL, Baseball, Basketball, Football, F1, Handball, Hockey, MMA, NBA, NFL, Rugby, Volleyball
 * 
 * API Documentation: https://www.thesportsdb.com/docs_api_examples
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseSportsClient } from './base-sports.client.js';
import {
    DataSource,
    SportType,
    EventStatus,
    TheSportsDBLeague,
    TheSportsDBTeam,
    TheSportsDBEvent,
    TheSportsDBLiveScore,
    SportsLeague,
    SportsTeam,
    SportsEvent,
    SPORT_TO_THESPORTSDB,
    THESPORTSDB_TO_SPORT,
} from '../types/sports.types.js';

// API Response interfaces
// NOTE: TheSportsDB search_all_leagues returns data in 'countries' key, not 'leagues'
interface SearchLeaguesResponse {
    countries: TheSportsDBLeague[] | null;
}

interface AllLeaguesResponse {
    leagues: TheSportsDBLeague[] | null;
}

interface TeamsResponse {
    teams: TheSportsDBTeam[] | null;
}

interface EventsResponse {
    events: TheSportsDBEvent[] | null;
}

interface LiveScoresResponse {
    events: TheSportsDBLiveScore[] | null;
}

@Injectable()
export class TheSportsDBClient extends BaseSportsClient {
    private readonly apiKey: string;
    private readonly baseUrlV1: string;
    private readonly baseUrlV2: string;
    private readonly isPremium: boolean;

    constructor(private readonly configService: ConfigService) {
        // Free tier: 30 requests/minute, 1000 requests/day
        super('TheSportsDB', DataSource.THESPORTSDB, {
            baseUrl: 'https://www.thesportsdb.com/api',
            rateLimit: {
                requestsPerMinute: 30,
                requestsPerDay: 1000,
            },
            timeout: 30000,
        });

        this.apiKey = this.configService.get<string>('THESPORTSDB_API_KEY') || '3';
        this.isPremium = this.apiKey !== '3' && this.apiKey.length > 5;

        // V1 for free tier, V2 for premium
        this.baseUrlV1 = `https://www.thesportsdb.com/api/v1/json/${this.apiKey}`;
        this.baseUrlV2 = `https://www.thesportsdb.com/api/v2/json`;

        this.logger.log(`Initialized with ${this.isPremium ? 'premium' : 'free'} tier`);
    }

    /**
     * Get auth headers for V2 API (premium)
     */
    protected override getAuthHeaders(): Record<string, string> {
        if (this.isPremium) {
            return { 'X-API-KEY': this.apiKey };
        }
        return {};
    }

    /**
     * Test API connection
     */
    async testConnection(): Promise<boolean> {
        try {
            const url = `${this.baseUrlV1}/all_sports.php`;
            await this.makeRequest(url);
            return true;
        } catch (error) {
            this.logger.error('Connection test failed:', error);
            return false;
        }
    }

    // ========================
    // Leagues
    // ========================

    /**
     * Get all leagues for a sport
     */
    /**
     * Get all leagues for a sport
     */
    async getLeaguesBySport(sport: SportType): Promise<SportsLeague[]> {
        const sportName = SPORT_TO_THESPORTSDB[sport];
        const url = `${this.baseUrlV1}/search_all_leagues.php?s=${encodeURIComponent(sportName)}`;

        try {
            // Note: API returns data in 'countries' key for this endpoint
            const response = await this.makeRequest<SearchLeaguesResponse>(url);
            const leagues = response.countries || [];

            this.logSync('getLeaguesBySport', sport, leagues.length);
            return leagues.map(league => this.transformLeague(league, sport));
        } catch (error) {
            this.logger.error(`Failed to get leagues for ${sport}:`, error);
            return [];
        }
    }

    /**
     * Get all leagues for all supported sports
     */
    async getAllLeagues(): Promise<SportsLeague[]> {
        const allLeagues: SportsLeague[] = [];

        for (const sport of Object.values(SportType)) {
            try {
                const leagues = await this.getLeaguesBySport(sport);
                allLeagues.push(...leagues);
                // Small delay between requests to avoid rate limits
                await this.sleep(500);
            } catch (error) {
                this.logger.error(`Error fetching leagues for ${sport}:`, error);
            }
        }

        return allLeagues;
    }

    /**
     * Search leagues by name
     */
    async searchLeagues(query: string): Promise<SportsLeague[]> {
        // Note: TheSportsDB doesn't have a direct league search endpoint in V1 free tier
        // We return empty array to avoid errors. 
        // Logic: client should strictly use getLeaguesBySport or known allowed IDs.
        this.logger.debug('searchLeagues is not supported in V1 free tier, returning empty.');
        return [];
    }
    // ========================
    // Teams
    // ========================

    /**
     * Get teams by league ID
     */
    async getTeamsByLeague(leagueId: string): Promise<SportsTeam[]> {
        const url = `${this.baseUrlV1}/lookup_all_teams.php?id=${leagueId}`;

        try {
            const response = await this.makeRequest<TeamsResponse>(url);
            const teams = response.teams || [];

            this.logSync('getTeamsByLeague', undefined, teams.length);
            return teams.map(team => this.transformTeam(team));
        } catch (error) {
            this.logger.error(`Failed to get teams for league ${leagueId}:`, error);
            return [];
        }
    }

    /**
     * Search teams by name
     */
    async searchTeams(query: string): Promise<SportsTeam[]> {
        const url = `${this.baseUrlV1}/searchteams.php?t=${encodeURIComponent(query)}`;

        try {
            const response = await this.makeRequest<TeamsResponse>(url);
            const teams = response.teams || [];
            return teams.map(t => this.transformTeam(t));
        } catch (error) {
            this.logger.error(`Failed to search teams:`, error);
            return [];
        }
    }

    /**
     * Get team by ID
     */
    async getTeamById(teamId: string): Promise<SportsTeam | null> {
        const url = `${this.baseUrlV1}/lookupteam.php?id=${teamId}`;

        try {
            const response = await this.makeRequest<TeamsResponse>(url);
            const teams = response.teams || [];
            return teams.length > 0 ? this.transformTeam(teams[0]) : null;
        } catch (error) {
            this.logger.error(`Failed to get team ${teamId}:`, error);
            return null;
        }
    }

    // ========================
    // Events
    // ========================

    /**
     * Get events for a specific date
     */
    async getEventsByDate(date: string, sport?: SportType): Promise<SportsEvent[]> {
        // Format: YYYY-MM-DD
        const sportParam = sport ? `&s=${encodeURIComponent(SPORT_TO_THESPORTSDB[sport])}` : '';
        const url = `${this.baseUrlV1}/eventsday.php?d=${date}${sportParam}`;

        try {
            const response = await this.makeRequest<EventsResponse>(url);
            const events = response.events || [];

            this.logSync('getEventsByDate', sport, events.length);
            return events.map(event => this.transformEvent(event));
        } catch (error) {
            this.logger.error(`Failed to get events for ${date}:`, error);
            return [];
        }
    }

    /**
     * Get events for next 7 days by league
     */
    async getUpcomingEventsByLeague(leagueId: string): Promise<SportsEvent[]> {
        const url = `${this.baseUrlV1}/eventsnextleague.php?id=${leagueId}`;

        try {
            const response = await this.makeRequest<EventsResponse>(url);
            const events = response.events || [];

            this.logSync('getUpcomingEventsByLeague', undefined, events.length);
            return events.map(event => this.transformEvent(event));
        } catch (error) {
            this.logger.error(`Failed to get upcoming events for league ${leagueId}:`, error);
            return [];
        }
    }

    /**
     * Get past 15 events by league
     */
    async getPastEventsByLeague(leagueId: string): Promise<SportsEvent[]> {
        const url = `${this.baseUrlV1}/eventspastleague.php?id=${leagueId}`;

        try {
            const response = await this.makeRequest<EventsResponse>(url);
            const events = response.events || [];
            return events.map(event => this.transformEvent(event));
        } catch (error) {
            this.logger.error(`Failed to get past events for league ${leagueId}:`, error);
            return [];
        }
    }

    /**
     * Get event by ID
     */
    async getEventById(eventId: string): Promise<SportsEvent | null> {
        const url = `${this.baseUrlV1}/lookupevent.php?id=${eventId}`;

        try {
            const response = await this.makeRequest<EventsResponse>(url);
            const events = response.events || [];
            return events.length > 0 ? this.transformEvent(events[0]) : null;
        } catch (error) {
            this.logger.error(`Failed to get event ${eventId}:`, error);
            return null;
        }
    }

    /**
     * Get events by round
     */
    async getEventsByRound(
        leagueId: string,
        round: number,
        season: string,
    ): Promise<SportsEvent[]> {
        const url = `${this.baseUrlV1}/eventsround.php?id=${leagueId}&r=${round}&s=${season}`;

        try {
            const response = await this.makeRequest<EventsResponse>(url);
            const events = response.events || [];
            return events.map(event => this.transformEvent(event));
        } catch (error) {
            this.logger.error(`Failed to get events for round:`, error);
            return [];
        }
    }

    // ========================
    // Live Scores (Premium V2 API or limited free)
    // ========================

    /**
     * Get live scores for a sport
     * Note: Limited in free tier, full access in premium
     */
    async getLiveScores(sport?: SportType): Promise<SportsEvent[]> {
        if (this.isPremium) {
            // V2 API for premium
            const sportPath = sport ? SPORT_TO_THESPORTSDB[sport].toLowerCase() : 'all';
            const url = `${this.baseUrlV2}/livescore/${sportPath}`;

            try {
                const response = await this.makeRequest<LiveScoresResponse>(url);
                const events = response.events || [];

                this.logSync('getLiveScores', sport, events.length);
                return events.map(event => this.transformLiveScore(event));
            } catch (error) {
                this.logger.error(`Failed to get live scores:`, error);
                return [];
            }
        } else {
            // Free tier - use Soccer live endpoint
            const url = `${this.baseUrlV1}/latestsoccer.php`;

            try {
                const response = await this.makeRequest<EventsResponse>(url);
                const events = response.events || [];
                return events.map(event => this.transformEvent(event));
            } catch (error) {
                this.logger.error(`Failed to get live scores (free tier):`, error);
                return [];
            }
        }
    }

    // ========================
    // Transformers
    // ========================

    /**
     * Transform TheSportsDB league to our format
     */
    private transformLeague(
        league: TheSportsDBLeague,
        sport?: SportType,
    ): SportsLeague {
        const detectedSport = sport || this.detectSport(league.strSport);

        return {
            id: '', // Will be set by database
            externalId: league.idLeague,
            source: DataSource.THESPORTSDB,
            sport: detectedSport,
            name: league.strLeague,
            nameAlternate: league.strLeagueAlternate,
            country: league.strCountry,
            countryCode: undefined,
            logoUrl: league.strBadge,
            bannerUrl: league.strBanner,
            trophyUrl: league.strTrophy,
            description: league.strDescriptionEN,
            firstEventDate: league.dateFirstEvent ? new Date(league.dateFirstEvent) : undefined,
            website: league.strWebsite,
            twitter: league.strTwitter,
            facebook: league.strFacebook,
            isActive: true,
            isFeatured: false,
            displayOrder: 0,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform TheSportsDB team to our format
     */
    private transformTeam(team: TheSportsDBTeam): SportsTeam {
        return {
            id: '', // Will be set by database
            externalId: team.idTeam,
            source: DataSource.THESPORTSDB,
            leagueId: team.idLeague,
            sport: this.detectSport(team.strSport),
            name: team.strTeam,
            nameShort: team.strTeamShort,
            nameAlternate: team.strTeamAlternate,
            country: team.strCountry,
            city: undefined,
            stadium: team.strStadium,
            stadiumCapacity: team.intStadiumCapacity ? parseInt(team.intStadiumCapacity) : undefined,
            logoUrl: team.strTeamBadge,
            jerseyUrl: team.strTeamJersey,
            bannerUrl: team.strTeamBanner,
            primaryColor: team.strColour1,
            secondaryColor: team.strColour2,
            foundedYear: team.intFormedYear ? parseInt(team.intFormedYear) : undefined,
            website: team.strWebsite,
            twitter: team.strTwitter,
            facebook: team.strFacebook,
            instagram: team.strInstagram,
            description: team.strDescriptionEN,
            isActive: true,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform TheSportsDB event to our format
     */
    private transformEvent(event: TheSportsDBEvent): SportsEvent {
        const startTime = this.parseEventDateTime(event.dateEvent, event.strTime);

        return {
            id: '', // Will be set by database
            externalId: event.idEvent,
            source: DataSource.THESPORTSDB,
            leagueId: event.idLeague,
            homeTeamId: event.idHomeTeam,
            awayTeamId: event.idAwayTeam,
            sport: this.detectSport(event.strSport),
            season: event.strSeason,
            round: event.intRound,
            matchDay: event.intRound ? parseInt(event.intRound) : undefined,
            name: event.strEvent,
            venue: event.strVenue,
            city: event.strCity,
            country: event.strCountry,
            startTime,
            endTime: undefined,
            timezone: 'UTC',
            status: this.parseEventStatus(event.strStatus, event.strPostponed),
            statusDetail: event.strStatus,
            elapsedTime: undefined,
            homeScore: event.intHomeScore ? parseInt(event.intHomeScore) : undefined,
            awayScore: event.intAwayScore ? parseInt(event.intAwayScore) : undefined,
            homeScoreHalftime: undefined,
            awayScoreHalftime: undefined,
            homeScoreExtra: undefined,
            awayScoreExtra: undefined,
            homeScorePenalty: undefined,
            awayScorePenalty: undefined,
            referee: undefined,
            attendance: event.intSpectators ? parseInt(event.intSpectators) : undefined,
            thumbnailUrl: event.strThumb,
            videoUrl: event.strVideo,
            bannerUrl: event.strBanner,
            stats: {},
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: event.strHomeTeam,
                awayTeamName: event.strAwayTeam,
                leagueName: event.strLeague,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Transform live score to event format
     */
    private transformLiveScore(score: TheSportsDBLiveScore): SportsEvent {
        return {
            id: '',
            externalId: score.idEvent,
            source: DataSource.THESPORTSDB,
            leagueId: score.idLeague,
            homeTeamId: score.idHomeTeam,
            awayTeamId: score.idAwayTeam,
            sport: this.detectSport(score.strSport),
            season: undefined,
            round: undefined,
            matchDay: undefined,
            name: score.strEvent,
            venue: undefined,
            city: undefined,
            country: undefined,
            startTime: new Date(),
            endTime: undefined,
            timezone: 'UTC',
            status: EventStatus.LIVE,
            statusDetail: score.strStatus,
            elapsedTime: score.strEventTime ? parseInt(score.strEventTime) : undefined,
            homeScore: score.intHomeScore ? parseInt(score.intHomeScore) : undefined,
            awayScore: score.intAwayScore ? parseInt(score.intAwayScore) : undefined,
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
            stats: { progress: score.strProgress },
            hasMarket: false,
            marketCreatedAt: undefined,
            isFeatured: false,
            metadata: {
                homeTeamName: score.strHomeTeam,
                awayTeamName: score.strAwayTeam,
                leagueName: score.strLeague,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    // ========================
    // Utilities
    // ========================

    /**
     * Detect sport type from string
     */
    private detectSport(sportName: string): SportType {
        return THESPORTSDB_TO_SPORT[sportName] || SportType.FOOTBALL;
    }

    /**
     * Parse event date and time
     */
    private parseEventDateTime(dateStr?: string, timeStr?: string): Date {
        if (!dateStr) return new Date();

        try {
            // Clean up time string (remove whitespace coverage etc)
            const cleanTime = timeStr ? timeStr.split(' ')[0] : '00:00';
            // Safe fallback if timeStr is totally invalid/missing
            const finalTime = cleanTime.includes(':') ? cleanTime : '00:00';
            const dateTimStr = `${dateStr}T${finalTime}:00Z`;

            const date = new Date(dateTimStr);
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return new Date();
            }
            return date;
        } catch {
            return new Date();
        }
    }

    /**
     * Parse event status
     */
    private parseEventStatus(status?: string, postponed?: string): EventStatus {
        if (postponed === 'yes') return EventStatus.POSTPONED;

        switch (status?.toLowerCase()) {
            case 'match finished':
            case 'ft':
            case 'aet':
            case 'pen':
                return EventStatus.FINISHED;
            case 'not started':
            case 'ns':
            case 'tbd':
                return EventStatus.SCHEDULED;
            case 'in progress':
            case 'live':
            case '1h':
            case '2h':
                return EventStatus.LIVE;
            case 'ht':
            case 'half time':
                return EventStatus.HALFTIME;
            case 'postponed':
            case 'pst':
            case 'pp':
                return EventStatus.POSTPONED;
            case 'cancelled':
            case 'canc':
                return EventStatus.CANCELLED;
            case 'suspended':
            case 'susp':
                return EventStatus.SUSPENDED;
            default:
                return EventStatus.SCHEDULED;
        }
    }
}
