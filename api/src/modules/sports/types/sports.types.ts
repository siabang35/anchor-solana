/**
 * Sports Types and Interfaces
 * 
 * Comprehensive type definitions for sports data scraping system
 */

import { z } from 'zod';

// ========================
// Enums
// ========================

export enum SportType {
    AFL = 'afl',
    BASEBALL = 'baseball',
    BASKETBALL = 'basketball',
    FOOTBALL = 'football',
    FORMULA1 = 'formula1',
    HANDBALL = 'handball',
    HOCKEY = 'hockey',
    MMA = 'mma',
    NBA = 'nba',
    NFL = 'nfl',
    RUGBY = 'rugby',
    VOLLEYBALL = 'volleyball',
}

export enum EventStatus {
    SCHEDULED = 'scheduled',
    LIVE = 'live',
    HALFTIME = 'halftime',
    FINISHED = 'finished',
    POSTPONED = 'postponed',
    CANCELLED = 'cancelled',
    SUSPENDED = 'suspended',
}

export enum DataSource {
    THESPORTSDB = 'thesportsdb',
    APIFOOTBALL = 'apifootball',
    APIBASEBALL = 'apibaseball',
    APIBASKETBALL = 'apibasketball',
    APIAFL = 'apiafl',
    APIFORMULA1 = 'apiformula1',
    APIHANDBALL = 'apihandball',
    APIHOCKEY = 'apihockey',
    APIMMA = 'apimma',
    APINBA = 'apinba',
    APINFL = 'apinfl',
    APIRUGBY = 'apirugby',
    APIVOLLEYBALL = 'apivolleyball',
    MANUAL = 'manual',
    ETL_ORCHESTRATOR = 'etl_orchestrator',
}

export enum SyncStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

export enum SportsMarketType {
    MATCH_WINNER = 'match_winner',
    OVER_UNDER = 'over_under',
    BOTH_TEAMS_SCORE = 'both_teams_score',
    CORRECT_SCORE = 'correct_score',
    FIRST_SCORER = 'first_scorer',
    HANDICAP = 'handicap',
    CUSTOM = 'custom',
}

// ========================
// Base Interfaces
// ========================

export interface SportsLeague {
    id: string;
    externalId: string;
    source: DataSource;
    sport: SportType;
    name: string;
    nameAlternate?: string;
    country?: string;
    countryCode?: string;
    logoUrl?: string;
    bannerUrl?: string;
    trophyUrl?: string;
    description?: string;
    firstEventDate?: Date;
    website?: string;
    twitter?: string;
    facebook?: string;
    isActive: boolean;
    isFeatured: boolean;
    displayOrder: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface SportsTeam {
    id: string;
    externalId: string;
    source: DataSource;
    leagueId?: string;
    sport: SportType;
    name: string;
    nameShort?: string;
    nameAlternate?: string;
    country?: string;
    city?: string;
    stadium?: string;
    stadiumCapacity?: number;
    logoUrl?: string;
    jerseyUrl?: string;
    bannerUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    foundedYear?: number;
    website?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    description?: string;
    isActive: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface SportsEvent {
    id: string;
    externalId: string;
    source: DataSource;
    leagueId?: string;
    homeTeamId?: string;
    awayTeamId?: string;
    sport: SportType;
    season?: string;
    round?: string;
    matchDay?: number;
    name?: string;
    venue?: string;
    city?: string;
    country?: string;
    startTime: Date;
    endTime?: Date;
    timezone: string;
    status: EventStatus;
    statusDetail?: string;
    elapsedTime?: number;
    homeScore?: number;
    awayScore?: number;
    homeScoreHalftime?: number;
    awayScoreHalftime?: number;
    homeScoreExtra?: number;
    awayScoreExtra?: number;
    homeScorePenalty?: number;
    awayScorePenalty?: number;
    referee?: string;
    attendance?: number;
    thumbnailUrl?: string;
    videoUrl?: string;
    bannerUrl?: string;
    stats: Record<string, unknown>;
    hasMarket: boolean;
    marketCreatedAt?: Date;
    isFeatured: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    homeTeam?: SportsTeam;
    awayTeam?: SportsTeam;
    league?: SportsLeague;
}

export interface SportsMarket {
    id: string;
    eventId: string;
    marketId?: string;
    marketType: SportsMarketType;
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
    resolutionSource?: string;
    resolutionProof?: string;
    resolvedAt?: Date;
    opensAt?: Date;
    closesAt?: Date;
    isActive: boolean;
    isFeatured: boolean;
    autoResolve: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    event?: SportsEvent;
}

export interface SportsSyncLog {
    id: string;
    source: DataSource;
    syncType: string;
    sport?: SportType;
    status: SyncStatus;
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;
    recordsFetched: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errorMessage?: string;
    errorDetails?: Record<string, unknown>;
    retryCount: number;
    requestUrl?: string;
    requestParams?: Record<string, unknown>;
    responseStatus?: number;
    triggeredBy: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
}

// ========================
// API Response Types
// ========================

// TheSportsDB Types
export interface TheSportsDBLeague {
    idLeague: string;
    strLeague: string;
    strLeagueAlternate?: string;
    strSport: string;
    strCountry?: string;
    strBadge?: string;
    strBanner?: string;
    strTrophy?: string;
    strDescriptionEN?: string;
    dateFirstEvent?: string;
    strWebsite?: string;
    strTwitter?: string;
    strFacebook?: string;
}

export interface TheSportsDBTeam {
    idTeam: string;
    strTeam: string;
    strTeamShort?: string;
    strTeamAlternate?: string;
    strLeague?: string;
    idLeague?: string;
    strSport: string;
    strCountry?: string;
    strStadium?: string;
    intStadiumCapacity?: string;
    strTeamBadge?: string;
    strTeamJersey?: string;
    strTeamBanner?: string;
    strColour1?: string;
    strColour2?: string;
    intFormedYear?: string;
    strWebsite?: string;
    strTwitter?: string;
    strFacebook?: string;
    strInstagram?: string;
    strDescriptionEN?: string;
}

export interface TheSportsDBEvent {
    idEvent: string;
    strEvent: string;
    strEventAlternate?: string;
    strSport: string;
    idLeague?: string;
    strLeague?: string;
    strSeason?: string;
    intRound?: string;
    idHomeTeam?: string;
    strHomeTeam?: string;
    idAwayTeam?: string;
    strAwayTeam?: string;
    dateEvent?: string;
    strTime?: string;
    strTimeLocal?: string;
    strVenue?: string;
    strCity?: string;
    strCountry?: string;
    strStatus?: string;
    intHomeScore?: string;
    intAwayScore?: string;
    intSpectators?: string;
    strThumb?: string;
    strVideo?: string;
    strBanner?: string;
    strPostponed?: string;
}

export interface TheSportsDBLiveScore {
    idEvent: string;
    strEvent: string;
    strSport: string;
    idLeague?: string;
    strLeague?: string;
    idHomeTeam?: string;
    strHomeTeam?: string;
    idAwayTeam?: string;
    strAwayTeam?: string;
    intHomeScore?: string;
    intAwayScore?: string;
    strProgress?: string;
    strStatus?: string;
    strEventTime?: string;
}

// API-Football Types
export interface APIFootballLeague {
    league: {
        id: number;
        name: string;
        type: string;
        logo: string;
    };
    country: {
        name: string;
        code: string;
        flag: string;
    };
    seasons: Array<{
        year: number;
        start: string;
        end: string;
        current: boolean;
    }>;
}

export interface APIFootballTeam {
    team: {
        id: number;
        name: string;
        code: string;
        country: string;
        founded: number;
        national: boolean;
        logo: string;
    };
    venue: {
        id: number;
        name: string;
        address: string;
        city: string;
        capacity: number;
        surface: string;
        image: string;
    };
}

export interface APIFootballFixture {
    fixture: {
        id: number;
        referee: string;
        timezone: string;
        date: string;
        timestamp: number;
        periods: {
            first: number;
            second: number;
        };
        venue: {
            id: number;
            name: string;
            city: string;
        };
        status: {
            long: string;
            short: string;
            elapsed: number;
        };
    };
    league: {
        id: number;
        name: string;
        country: string;
        logo: string;
        flag: string;
        season: number;
        round: string;
    };
    teams: {
        home: {
            id: number;
            name: string;
            logo: string;
            winner: boolean | null;
        };
        away: {
            id: number;
            name: string;
            logo: string;
            winner: boolean | null;
        };
    };
    goals: {
        home: number | null;
        away: number | null;
    };
    score: {
        halftime: {
            home: number | null;
            away: number | null;
        };
        fulltime: {
            home: number | null;
            away: number | null;
        };
        extratime: {
            home: number | null;
            away: number | null;
        };
        penalty: {
            home: number | null;
            away: number | null;
        };
    };
}

export interface APIFootballOdds {
    league: {
        id: number;
        name: string;
        country: string;
        logo: string;
        flag: string;
        season: number;
    };
    fixture: {
        id: number;
        timezone: string;
        date: string;
        timestamp: number;
    };
    update: string;
    bookmakers: Array<{
        id: number;
        name: string;
        bets: Array<{
            id: number;
            name: string;
            values: Array<{
                value: string;
                odd: string;
            }>;
        }>;
    }>;
}

// ========================
// Zod Validation Schemas
// ========================

export const SportTypeSchema = z.nativeEnum(SportType);
export const EventStatusSchema = z.nativeEnum(EventStatus);
export const DataSourceSchema = z.nativeEnum(DataSource);

export const SportsLeagueCreateSchema = z.object({
    externalId: z.string().min(1),
    source: DataSourceSchema,
    sport: SportTypeSchema,
    name: z.string().min(1).max(200),
    nameAlternate: z.string().max(200).optional(),
    country: z.string().max(100).optional(),
    countryCode: z.string().max(10).optional(),
    logoUrl: z.string().url().optional(),
    bannerUrl: z.string().url().optional(),
    trophyUrl: z.string().url().optional(),
    description: z.string().optional(),
    website: z.string().url().optional(),
    twitter: z.string().optional(),
    facebook: z.string().optional(),
});

export const SportsTeamCreateSchema = z.object({
    externalId: z.string().min(1),
    source: DataSourceSchema,
    leagueId: z.string().uuid().optional(),
    sport: SportTypeSchema,
    name: z.string().min(1).max(200),
    nameShort: z.string().max(50).optional(),
    nameAlternate: z.string().max(200).optional(),
    country: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    stadium: z.string().max(200).optional(),
    stadiumCapacity: z.number().int().positive().optional(),
    logoUrl: z.string().url().optional(),
    jerseyUrl: z.string().url().optional(),
    bannerUrl: z.string().url().optional(),
    primaryColor: z.string().max(20).optional(),
    secondaryColor: z.string().max(20).optional(),
    foundedYear: z.number().int().min(1800).max(2030).optional(),
    website: z.string().url().optional(),
});

export const SportsEventCreateSchema = z.object({
    externalId: z.string().min(1),
    source: DataSourceSchema,
    leagueId: z.string().uuid().optional(),
    homeTeamId: z.string().uuid().optional(),
    awayTeamId: z.string().uuid().optional(),
    sport: SportTypeSchema,
    season: z.string().max(20).optional(),
    round: z.string().max(50).optional(),
    matchDay: z.number().int().optional(),
    name: z.string().max(300).optional(),
    venue: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    startTime: z.date(),
    endTime: z.date().optional(),
    timezone: z.string().default('UTC'),
    status: EventStatusSchema.default(EventStatus.SCHEDULED),
    statusDetail: z.string().max(100).optional(),
});

// ========================
// Query/Filter Types
// ========================

export interface SportsEventsQuery {
    sport?: SportType;
    leagueId?: string;
    status?: EventStatus;
    startDate?: Date;
    endDate?: Date;
    hasMarket?: boolean;
    isFeatured?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'startTime' | 'createdAt' | 'volume';
    sortOrder?: 'asc' | 'desc';
}

export interface SportsMarketsQuery {
    sport?: SportType;
    eventId?: string;
    marketType?: SportsMarketType;
    resolved?: boolean;
    isActive?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'closesAt' | 'volume' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
}

// ========================
// Utility Types
// ========================

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface SyncResult {
    success: boolean;
    source: DataSource;
    syncType: string;
    recordsFetched: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    durationMs: number;
    errors?: string[];
}

// ========================
// Sport to TheSportsDB mapping
// ========================

export const SPORT_TO_THESPORTSDB: Record<SportType, string> = {
    [SportType.AFL]: 'Australian Football',
    [SportType.BASEBALL]: 'Baseball',
    [SportType.BASKETBALL]: 'Basketball',
    [SportType.FOOTBALL]: 'Soccer',
    [SportType.FORMULA1]: 'Motorsport',
    [SportType.HANDBALL]: 'Handball',
    [SportType.HOCKEY]: 'Ice Hockey',
    [SportType.MMA]: 'Fighting',
    [SportType.NBA]: 'Basketball',
    [SportType.NFL]: 'American Football',
    [SportType.RUGBY]: 'Rugby',
    [SportType.VOLLEYBALL]: 'Volleyball',
};

export const THESPORTSDB_TO_SPORT: Record<string, SportType> = {
    'Australian Football': SportType.AFL,
    'Baseball': SportType.BASEBALL,
    'Basketball': SportType.BASKETBALL,
    'Soccer': SportType.FOOTBALL,
    'Motorsport': SportType.FORMULA1,
    'Handball': SportType.HANDBALL,
    'Ice Hockey': SportType.HOCKEY,
    'Hockey': SportType.HOCKEY,
    'Fighting': SportType.MMA,
    'American Football': SportType.NFL,
    'Rugby': SportType.RUGBY,
    'Volleyball': SportType.VOLLEYBALL,
};
