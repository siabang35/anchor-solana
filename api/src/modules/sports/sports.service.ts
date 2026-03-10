/**
 * Sports Service
 * 
 * Core business logic for sports data management.
 * Handles CRUD operations for leagues, teams, events, and markets.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    SportType,
    EventStatus,
    DataSource,
    SportsLeague,
    SportsTeam,
    SportsEvent,
    SportsMarket,
    SportsEventsQuery,
    SportsMarketsQuery,
    PaginatedResult,
} from './types/sports.types.js';
import { SportsMessagingService } from './sports-messaging.service.js';
import {
    SportsLeagueResponseDto,
    SportsTeamResponseDto,
    SportsEventResponseDto,
    SportsMarketResponseDto,
    SportsLeaguesQueryDto,
    SportsEventsQueryDto,
    SportsMarketsQueryDto,
    CreateSportsMarketDto,
} from './dto/index.js';

@Injectable()
export class SportsService {
    private readonly logger = new Logger(SportsService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly sportsMessagingService: SportsMessagingService,
    ) { }

    // ========================
    // Leagues
    // ========================

    /**
     * Get all leagues with filters
     */
    async getLeagues(query: SportsLeaguesQueryDto): Promise<PaginatedResult<SportsLeagueResponseDto>> {
        // Use admin client for public sports data (avoid RLS restrictions)
        const supabase = this.supabaseService.getAdminClient();
        const page = query.page || 1;
        const limit = query.limit || 50;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('sports_leagues')
            .select('*', { count: 'exact' });

        if (query.sport) {
            queryBuilder = queryBuilder.eq('sport', query.sport);
        }
        if (query.country) {
            queryBuilder = queryBuilder.ilike('country', `%${query.country}%`);
        }
        if (query.isActive !== undefined) {
            queryBuilder = queryBuilder.eq('is_active', query.isActive);
        }
        if (query.isFeatured !== undefined) {
            queryBuilder = queryBuilder.eq('is_featured', query.isFeatured);
        }
        if (query.search) {
            queryBuilder = queryBuilder.ilike('name', `%${query.search}%`);
        }

        queryBuilder = queryBuilder
            .order('display_order', { ascending: true })
            .order('name', { ascending: true })
            .range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to get leagues: ${error.message}`);
            throw new Error(`Failed to get leagues: ${error.message}`);
        }

        return {
            data: (data || []).map(item => this.toLeagueDto(item)),
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Get league by ID
     */
    async getLeagueById(id: string): Promise<SportsLeagueResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_leagues')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`League not found: ${id}`);
        }

        return this.toLeagueDto(data);
    }

    /**
     * Upsert leagues - OPTIMIZED with batch processing
     */
    async upsertLeagues(leagues: Partial<SportsLeague>[]): Promise<{ created: number; updated: number }> {
        if (leagues.length === 0) {
            return { created: 0, updated: 0 };
        }

        const supabase = this.supabaseService.getAdminClient();
        let created = 0;
        let updated = 0;

        this.logger.log(`Starting batch upsert of ${leagues.length} leagues...`);

        // 1. Pre-fetch all existing leagues for bulk comparison
        const externalIds = leagues.map(l => l.externalId).filter(Boolean);
        const existingMap = new Map<string, string>();

        if (externalIds.length > 0) {
            const { data: existing } = await supabase
                .from('sports_leagues')
                .select('id, external_id, source')
                .in('external_id', externalIds as string[]);

            if (existing) {
                existing.forEach(e => {
                    existingMap.set(`${e.source}:${e.external_id}`, e.id);
                });
            }
        }

        // 2. Categorize leagues
        const leaguesToInsert: any[] = [];
        const leaguesToUpdate: { id: string; data: any }[] = [];

        for (const league of leagues) {
            const leagueData = {
                name: league.name || 'Unknown League',
                name_alternate: league.nameAlternate || null,
                country: league.country || null,
                country_code: league.countryCode || null,
                logo_url: league.logoUrl || null,
                banner_url: league.bannerUrl || null,
                trophy_url: league.trophyUrl || null,
                description: league.description || null,
                website: league.website || null,
                twitter: league.twitter || null,
                facebook: league.facebook || null,
                metadata: league.metadata || {},
                updated_at: new Date().toISOString(),
            };

            const existingKey = `${league.source}:${league.externalId}`;
            const existingId = existingMap.get(existingKey);

            if (existingId) {
                leaguesToUpdate.push({ id: existingId, data: leagueData });
            } else {
                leaguesToInsert.push({
                    external_id: league.externalId,
                    source: league.source,
                    sport: league.sport,
                    ...leagueData,
                    is_active: true,
                    is_featured: false,
                    display_order: 0,
                    created_at: new Date().toISOString(),
                });
            }
        }

        // 3. Batch insert/upsert new leagues (use upsert to handle race conditions)
        const BATCH_SIZE = 50;
        if (leaguesToInsert.length > 0) {
            for (let i = 0; i < leaguesToInsert.length; i += BATCH_SIZE) {
                const batch = leaguesToInsert.slice(i, i + BATCH_SIZE);
                // Use upsert with onConflict to handle duplicate key errors
                const { error } = await supabase
                    .from('sports_leagues')
                    .upsert(batch, {
                        onConflict: 'external_id,source',
                        ignoreDuplicates: false // Update existing records
                    });

                if (error) {
                    this.logger.error(`Batch upsert leagues failed: ${error.message}`);
                    // Fallback to individual upserts
                    for (const item of batch) {
                        const { error: singleError } = await supabase
                            .from('sports_leagues')
                            .upsert(item, { onConflict: 'external_id,source' });
                        if (!singleError) created++;
                    }
                } else {
                    created += batch.length;
                }
            }
        }

        // 4. Update existing leagues
        for (const { id, data } of leaguesToUpdate) {
            const { error } = await supabase
                .from('sports_leagues')
                .update(data)
                .eq('id', id);

            if (!error) updated++;
        }

        this.logger.log(`Upsert leagues complete: ${created} created, ${updated} updated`);
        return { created, updated };
    }

    // ========================
    // Teams
    // ========================

    /**
     * Get teams by league
     */
    async getTeamsByLeague(leagueId: string): Promise<SportsTeamResponseDto[]> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_teams')
            .select('*')
            .eq('league_id', leagueId)
            .eq('is_active', true)
            .order('name');

        if (error) {
            this.logger.error(`Failed to get teams: ${error.message}`);
            return [];
        }

        return (data || []).map(item => this.toTeamDto(item));
    }

    /**
     * Get team by ID
     */
    async getTeamById(id: string): Promise<SportsTeamResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_teams')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Team not found: ${id}`);
        }

        return this.toTeamDto(data);
    }

    /**
     * Search teams
     */
    async searchTeams(query: string, sport?: SportType): Promise<SportsTeamResponseDto[]> {
        const supabase = this.supabaseService.getAdminClient();

        let queryBuilder = supabase
            .from('sports_teams')
            .select('*')
            .ilike('name', `%${query}%`)
            .eq('is_active', true)
            .limit(20);

        if (sport) {
            queryBuilder = queryBuilder.eq('sport', sport);
        }

        const { data, error } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to search teams: ${error.message}`);
            return [];
        }

        return (data || []).map(item => this.toTeamDto(item));
    }

    /**
     * Upsert teams - OPTIMIZED with batch processing
     */
    async upsertTeams(teams: Partial<SportsTeam>[]): Promise<{ created: number; updated: number }> {
        if (teams.length === 0) {
            return { created: 0, updated: 0 };
        }

        const supabase = this.supabaseService.getAdminClient();
        let created = 0;
        let updated = 0;

        this.logger.log(`Starting batch upsert of ${teams.length} teams...`);

        // 1. Pre-fetch existing teams
        const externalIds = teams.map(t => t.externalId).filter(Boolean);
        const existingMap = new Map<string, string>();

        if (externalIds.length > 0) {
            const { data: existing } = await supabase
                .from('sports_teams')
                .select('id, external_id, source')
                .in('external_id', externalIds as string[]);

            if (existing) {
                existing.forEach(e => {
                    existingMap.set(`${e.source}:${e.external_id}`, e.id);
                });
            }
        }

        // 2. Pre-fetch league mappings
        const leagueExternalIds = [...new Set(teams.map(t => t.leagueId).filter(Boolean))];
        const leagueMap = new Map<string, string>();

        if (leagueExternalIds.length > 0) {
            const { data: leagues } = await supabase
                .from('sports_leagues')
                .select('id, external_id')
                .in('external_id', leagueExternalIds as string[]);

            if (leagues) {
                leagues.forEach(l => leagueMap.set(l.external_id, l.id));
            }
        }

        // 3. Categorize teams
        const teamsToInsert: any[] = [];
        const teamsToUpdate: { id: string; data: any }[] = [];

        for (const team of teams) {
            const leagueId = team.leagueId ? leagueMap.get(team.leagueId) : null;

            const teamData = {
                name: team.name || 'Unknown Team',
                name_short: team.nameShort || null,
                name_alternate: team.nameAlternate || null,
                country: team.country || null,
                city: team.city || null,
                stadium: team.stadium || null,
                stadium_capacity: team.stadiumCapacity || null,
                logo_url: team.logoUrl || null,
                jersey_url: team.jerseyUrl || null,
                banner_url: team.bannerUrl || null,
                primary_color: team.primaryColor || null,
                secondary_color: team.secondaryColor || null,
                founded_year: team.foundedYear || null,
                website: team.website || null,
                metadata: team.metadata || {},
                updated_at: new Date().toISOString(),
            };

            const existingKey = `${team.source}:${team.externalId}`;
            const existingId = existingMap.get(existingKey);

            if (existingId) {
                teamsToUpdate.push({ id: existingId, data: teamData });
            } else {
                teamsToInsert.push({
                    external_id: team.externalId,
                    source: team.source,
                    league_id: leagueId || null,
                    sport: team.sport,
                    ...teamData,
                    is_active: true,
                    created_at: new Date().toISOString(),
                });
            }
        }

        // 4. Batch insert/upsert new teams (use upsert to handle race conditions)
        const BATCH_SIZE = 50;
        if (teamsToInsert.length > 0) {
            for (let i = 0; i < teamsToInsert.length; i += BATCH_SIZE) {
                const batch = teamsToInsert.slice(i, i + BATCH_SIZE);
                // Use upsert with onConflict to handle duplicate key errors
                const { error } = await supabase
                    .from('sports_teams')
                    .upsert(batch, {
                        onConflict: 'external_id,source',
                        ignoreDuplicates: false
                    });

                if (error) {
                    this.logger.error(`Batch upsert teams failed: ${error.message}`);
                    // Fallback to individual upserts
                    for (const item of batch) {
                        const { error: singleError } = await supabase
                            .from('sports_teams')
                            .upsert(item, { onConflict: 'external_id,source' });
                        if (!singleError) created++;
                    }
                } else {
                    created += batch.length;
                }
            }
        }

        // 5. Update existing teams
        for (const { id, data } of teamsToUpdate) {
            const { error } = await supabase
                .from('sports_teams')
                .update(data)
                .eq('id', id);

            if (!error) updated++;
        }

        this.logger.log(`Upsert teams complete: ${created} created, ${updated} updated`);
        return { created, updated };
    }

    // ========================
    // Events
    // ========================

    /**
     * Get events with filters
     */
    async getEvents(query: SportsEventsQueryDto): Promise<PaginatedResult<SportsEventResponseDto>> {
        // Use admin client for public sports data (avoid RLS restrictions)
        const supabase = this.supabaseService.getAdminClient();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('sports_events')
            .select(`
                *,
                home_team:sports_teams!sports_events_home_team_id_fkey(*),
                away_team:sports_teams!sports_events_away_team_id_fkey(*),
                league:sports_leagues!sports_events_league_id_fkey(*)
            `, { count: 'exact' });

        if (query.sport) {
            queryBuilder = queryBuilder.eq('sport', query.sport);
        }
        if (query.leagueId) {
            queryBuilder = queryBuilder.eq('league_id', query.leagueId);
        }
        if (query.status) {
            queryBuilder = queryBuilder.eq('status', query.status);
        }
        if (query.startDate) {
            queryBuilder = queryBuilder.gte('start_time', query.startDate.toISOString());
        }
        if (query.endDate) {
            queryBuilder = queryBuilder.lte('start_time', query.endDate.toISOString());
        }
        if (query.hasMarket !== undefined) {
            queryBuilder = queryBuilder.eq('has_market', query.hasMarket);
        }
        if (query.isFeatured !== undefined) {
            queryBuilder = queryBuilder.eq('is_featured', query.isFeatured);
        }
        if (query.search) {
            queryBuilder = queryBuilder.ilike('name', `%${query.search}%`);
        }

        // Sorting
        const sortField = query.sortBy === 'createdAt' ? 'created_at' :
            query.sortBy === 'volume' ? 'has_market' : 'start_time';
        queryBuilder = queryBuilder
            .order(sortField, { ascending: query.sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to get events: ${error.message}`);
            throw new Error(`Failed to get events: ${error.message}`);
        }

        return {
            data: (data || []).map(item => this.toEventDto(item)),
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Get live events
     */
    async getLiveEvents(sport?: SportType): Promise<SportsEventResponseDto[]> {
        const supabase = this.supabaseService.getAdminClient();

        let queryBuilder = supabase
            .from('sports_events')
            .select(`
                *,
                home_team:sports_teams!sports_events_home_team_id_fkey(*),
                away_team:sports_teams!sports_events_away_team_id_fkey(*),
                league:sports_leagues!sports_events_league_id_fkey(*)
            `)
            .eq('status', EventStatus.LIVE);

        if (sport) {
            queryBuilder = queryBuilder.eq('sport', sport);
        }

        const { data, error } = await queryBuilder.order('start_time', { ascending: false });

        if (error) {
            this.logger.error(`Failed to get live events: ${error.message}`);
            return [];
        }

        return (data || []).map(item => this.toEventDto(item));
    }

    /**
     * Get upcoming events
     */
    async getUpcomingEvents(sport?: SportType, limit: number = 20): Promise<SportsEventResponseDto[]> {
        const supabase = this.supabaseService.getAdminClient();

        let queryBuilder = supabase
            .from('sports_events')
            .select(`
                *,
                home_team:sports_teams!sports_events_home_team_id_fkey(*),
                away_team:sports_teams!sports_events_away_team_id_fkey(*),
                league:sports_leagues!sports_events_league_id_fkey(*)
            `)
            .eq('status', EventStatus.SCHEDULED)
            .gt('start_time', new Date().toISOString());

        if (sport) {
            queryBuilder = queryBuilder.eq('sport', sport);
        }

        const { data, error } = await queryBuilder
            .order('start_time', { ascending: true })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to get upcoming events: ${error.message}`);
            return [];
        }

        return (data || []).map(item => this.toEventDto(item));
    }

    /**
     * Get event by ID
     */
    async getEventById(id: string): Promise<SportsEventResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_events')
            .select(`
                *,
                home_team:sports_teams!sports_events_home_team_id_fkey(*),
                away_team:sports_teams!sports_events_away_team_id_fkey(*),
                league:sports_leagues!sports_events_league_id_fkey(*)
            `)
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Event not found: ${id}`);
        }

        return this.toEventDto(data);
    }

    /**
     * Upsert events - OPTIMIZED with batch processing and cached FK lookups
     * Anti-throttling: Uses batch queries to reduce DB calls
     * Comprehensive: Stores all event data with proper FK resolution
     */
    async upsertEvents(events: Partial<SportsEvent>[]): Promise<{ created: number; updated: number }> {
        if (events.length === 0) {
            return { created: 0, updated: 0 };
        }

        const supabase = this.supabaseService.getAdminClient();
        let created = 0;
        let updated = 0;
        let errors = 0;

        this.logger.log(`Starting batch upsert of ${events.length} events...`);

        // 1. Pre-fetch all league mappings (external_id OR name -> internal_id)
        // 1. Pre-fetch all league mappings with SPORT/SOURCE awareness
        const leagueExternalIds = [...new Set(events.map(e => e.leagueId).filter(Boolean))];
        const leagueNames = [...new Set(events.map(e => (e.metadata?.leagueName as string)).filter(Boolean))];

        const leagueMap = new Map<string, string>();
        const leagueNameMap = new Map<string, string>();

        if (leagueExternalIds.length > 0 || leagueNames.length > 0) {
            this.logger.debug(`Processing league resolution for ${events.length} events`);

            // Fetch by IDs - scoped to the events' sources if possible, but simplest is to fetch id, external_id, sport
            if (leagueExternalIds.length > 0) {
                const { data: leaguesById } = await supabase
                    .from('sports_leagues')
                    .select('id, external_id, sport')
                    .in('external_id', leagueExternalIds);

                if (leaguesById) {
                    leaguesById.forEach(l => {
                        // Key includes sport to avoid collisions (e.g. Formula1 vs Baseball both having league 17)
                        leagueMap.set(`${l.external_id}:${l.sport}`, l.id);
                        // Also keep a generic map if needed, but sport-specific is safer
                        leagueMap.set(l.external_id, l.id);
                    });
                }
            }

            // Fetch by Names
            if (leagueNames.length > 0) {
                const { data: leaguesByName } = await supabase
                    .from('sports_leagues')
                    .select('id, name')
                    .in('name', leagueNames);

                if (leaguesByName) {
                    leaguesByName.forEach(l => leagueNameMap.set(l.name.toLowerCase().trim(), l.id));
                }
            }

            // Re-map ensuring sport matches
            // (done inside the loop below)

            this.logger.debug(`Mapped leagues for resolution`);
        }

        // 2. Pre-fetch all team mappings (external_id -> internal_id)
        const teamExternalIds = [
            ...new Set([
                ...events.map(e => e.homeTeamId).filter(Boolean),
                ...events.map(e => e.awayTeamId).filter(Boolean),
            ])
        ];
        const teamMap = new Map<string, string>();

        if (teamExternalIds.length > 0) {
            const { data: teams } = await supabase
                .from('sports_teams')
                .select('id, external_id')
                .in('external_id', teamExternalIds);

            if (teams) {
                teams.forEach(t => teamMap.set(t.external_id, t.id));
            }
            this.logger.debug(`Cached ${teamMap.size}/${teamExternalIds.length} team mappings`);
        }

        // 3. Pre-fetch existing events for bulk check
        const eventExternalIds = events.map(e => e.externalId).filter(Boolean);
        const existingEventMap = new Map<string, string>();

        if (eventExternalIds.length > 0) {
            const { data: existingEvents } = await supabase
                .from('sports_events')
                .select('id, external_id, source')
                .in('external_id', eventExternalIds as string[]);

            if (existingEvents) {
                existingEvents.forEach(e => {
                    existingEventMap.set(`${e.source}:${e.external_id}`, e.id);
                });
            }
            this.logger.debug(`Found ${existingEventMap.size} existing events for comparison`);
        }

        // 4. Process events in batches
        const BATCH_SIZE = 50;
        const eventsToInsert: any[] = [];
        const eventsToUpdate: { id: string; data: any }[] = [];

        for (const event of events) {
            try {
                // Resolve foreign keys from cache
                // Resolve foreign keys from cache - with fallback to name map with SPORT priority
                let leagueId: string | null = null;
                if (event.leagueId) {
                    leagueId = leagueMap.get(`${event.leagueId}:${event.sport}`) || leagueMap.get(event.leagueId) || null;
                }

                if (!leagueId && event.metadata?.leagueName) {
                    leagueId = leagueNameMap.get((event.metadata.leagueName as string).toLowerCase().trim()) || null;
                }
                const homeTeamId = event.homeTeamId ? teamMap.get(event.homeTeamId) : null;
                const awayTeamId = event.awayTeamId ? teamMap.get(event.awayTeamId) : null;

                // Build event data object
                const eventData: any = {
                    league_id: leagueId || null,
                    home_team_id: homeTeamId || null,
                    away_team_id: awayTeamId || null,
                    sport: event.sport,
                    season: event.season || null,
                    round: event.round || null,
                    match_day: event.matchDay || null,
                    name: event.name || 'Unknown Match',
                    venue: event.venue || null,
                    city: event.city || null,
                    country: event.country || null,
                    start_time: event.startTime instanceof Date
                        ? event.startTime.toISOString()
                        : (event.startTime || new Date().toISOString()),
                    timezone: event.timezone || 'UTC',
                    status: event.status || 'scheduled',
                    status_detail: event.statusDetail || null,
                    elapsed_time: event.elapsedTime || null,
                    home_score: event.homeScore ?? null,
                    away_score: event.awayScore ?? null,
                    home_score_halftime: event.homeScoreHalftime || null,
                    away_score_halftime: event.awayScoreHalftime || null,
                    referee: event.referee || null,
                    attendance: event.attendance || null,
                    thumbnail_url: event.thumbnailUrl || null,
                    video_url: event.videoUrl || null,
                    banner_url: event.bannerUrl || null,
                    stats: event.stats || {},
                    metadata: {
                        ...event.metadata,
                        homeTeamName: (event.metadata as any)?.homeTeamName || null,
                        awayTeamName: (event.metadata as any)?.awayTeamName || null,
                        leagueName: (event.metadata as any)?.leagueName || null,
                    },
                    updated_at: new Date().toISOString(),
                };

                // Check if exists
                const existingKey = `${event.source}:${event.externalId}`;
                const existingId = existingEventMap.get(existingKey);

                if (existingId) {
                    eventsToUpdate.push({ id: existingId, data: eventData });
                } else {
                    eventsToInsert.push({
                        external_id: event.externalId,
                        source: event.source,
                        ...eventData,
                        has_market: false,
                        is_featured: false,
                        created_at: new Date().toISOString(),
                    });
                }
            } catch (err) {
                errors++;
                this.logger.error(`Failed to process event ${event.externalId}: ${(err as Error).message}`);
            }
        }

        // 5. Batch insert/upsert new events (use upsert to handle race conditions)
        if (eventsToInsert.length > 0) {
            for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
                const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
                // Use upsert with onConflict to handle duplicate key errors
                const { error, count } = await supabase
                    .from('sports_events')
                    .upsert(batch, {
                        onConflict: 'external_id,source',
                        ignoreDuplicates: false
                    });

                if (error) {
                    this.logger.error(`Batch upsert failed: ${error.message}`);
                    // Try upserting one by one as fallback
                    for (const item of batch) {
                        const { error: singleError } = await supabase
                            .from('sports_events')
                            .upsert(item, { onConflict: 'external_id,source' });
                        if (!singleError) {
                            created++;
                        } else {
                            this.logger.warn(`Single upsert failed for ${item.external_id}: ${singleError.message}`);
                            errors++;
                        }
                    }
                } else {
                    created += batch.length;
                }
            }
        }

        // 6. Batch update existing events
        for (const { id, data } of eventsToUpdate) {
            const { error } = await supabase
                .from('sports_events')
                .update(data)
                .eq('id', id);

            if (error) {
                this.logger.warn(`Update failed for event ${id}: ${error.message}`);
                errors++;
            } else {
                updated++;
            }
        }

        // 7. Publish bulk update to RabbitMQ (batch publish for efficiency)
        if (created + updated > 0) {
            try {
                await this.sportsMessagingService.publishSyncComplete({
                    syncType: 'events',
                    totalFetched: events.length,
                    sportsProcessed: 1,
                    durationMs: 0,
                });
            } catch (err) {
                this.logger.warn('Failed to publish sync complete:', err);
            }
        }

        this.logger.log(`Upsert complete: ${created} created, ${updated} updated, ${errors} errors`);
        return { created, updated };
    }

    /**
     * Upsert markets and outcomes from API odds
     */
    async upsertMarkets(oddsList: any[]): Promise<{ created: number; updated: number }> {
        const supabase = this.supabaseService.getClient();
        let created = 0; // We don't distinguish easily with upsert, treating all as created/updated
        let updated = 0;
        const processedMarkets = new Set<string>();

        for (const odd of oddsList) {
            // Find event
            const { data: event } = await supabase
                .from('sports_events')
                .select('id')
                .eq('external_id', odd.fixture.id.toString())
                .eq('source', 'api_football')
                .single();

            if (!event) continue;

            const bookmaker = odd.bookmakers[0];
            if (!bookmaker) continue;

            // 1 = Match Winner (1x2)
            const matchWinnerBet = bookmaker.bets.find((b: any) => b.id === 1);
            if (!matchWinnerBet) continue;

            const marketId = `${odd.fixture.id}-${matchWinnerBet.id}`;
            if (processedMarkets.has(marketId)) continue;
            processedMarkets.add(marketId);

            const outcomes = matchWinnerBet.values.map((v: any) => v.value);
            const outcomePrices = matchWinnerBet.values.map((v: any) => parseFloat(v.odd));
            const yesPrice = 0.5; // Placeholder

            const { data: market, error } = await supabase
                .from('sports_markets')
                .upsert({
                    event_id: event.id,
                    market_id: marketId,
                    market_type: '1x2',
                    title: matchWinnerBet.name,
                    question: 'Full Time Result',
                    description: `Bookmaker: ${bookmaker.name}`,
                    outcomes: outcomes,
                    outcome_prices: outcomePrices,
                    yes_price: yesPrice,
                    no_price: 1 - yesPrice,
                    volume: 0,
                    liquidity: 0,
                    resolved: false,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'market_id' })
                .select()
                .single();

            if (error) {
                this.logger.error(`Failed to upsert market ${marketId}: ${error.message}`);
            } else {
                updated++;
                await supabase.from('sports_events').update({ has_market: true }).eq('id', event.id);
            }
        }
        return { created, updated };
    }



    /**
     * Generate default markets (Simulator)
     * Creates realistic 1x2 markets for events
     */
    /**
     * Generate default markets (Simulator)
     * Creates realistic 1x2 markets for events that don't have them
     */
    async generateDefaultMarkets(limit: number = 50): Promise<number> {
        const supabase = this.supabaseService.getAdminClient();

        // Fetch events that need markets
        const { data: events, error } = await supabase
            .from('sports_events')
            .select('*')
            .eq('has_market', false)
            .eq('status', 'scheduled')
            .gt('start_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Allow recent past (last 24h)
            .limit(limit);

        if (error || !events || events.length === 0) {
            this.logger.log(`No pending events found for market generation.`);
            return 0;
        }

        let generated = 0;
        this.logger.log(`Generating default markets for ${events.length} pending events...`);

        for (const event of events) {
            // Check if market really doesn't exist (double check)
            const { count } = await supabase
                .from('sports_markets')
                .select('id', { count: 'exact', head: true })
                .eq('event_id', event.id);

            if (count && count > 0) {
                // Update flag if it was out of sync
                await supabase.from('sports_events').update({ has_market: true }).eq('id', event.id);
                continue;
            }

            const homeTeamId = event.home_team_id;
            const awayTeamId = event.away_team_id;

            const homeTeam = homeTeamId ? await this.getTeamById(homeTeamId).catch(() => null) : null;
            const awayTeam = awayTeamId ? await this.getTeamById(awayTeamId).catch(() => null) : null;

            let homeName = homeTeam?.name;
            let awayName = awayTeam?.name;

            // Fallback: Parse from event name (e.g., "Home vs Away" or "Home v Away")
            if (!homeName || !awayName) {
                const name = event.name || '';
                const parts = name.split(/ vs | v /i);
                if (parts.length === 2) {
                    homeName = homeName || parts[0].trim();
                    awayName = awayName || parts[1].trim();
                } else {
                    homeName = homeName || 'Home Team';
                    awayName = awayName || 'Away Team';
                }
            }

            // Simulate odds
            // Favor home team slightly (random 0.4 - 0.6)
            const homeProb = 0.45 + (Math.random() * 0.2);
            const drawProb = 0.15 + (Math.random() * 0.1);

            const homePrice = Number(homeProb.toFixed(2));
            const drawPrice = Number(drawProb.toFixed(2));
            const awayPrice = Number((1 - homePrice - drawPrice).toFixed(2)); // Ensure sums to 1

            const { error } = await supabase.from('sports_markets').insert({
                event_id: event.id,
                market_type: 'match_winner',
                title: 'Match Winner',
                question: 'Who will win the match?',
                description: 'Full Time Result (Simulated)',
                outcomes: [homeName, 'Draw', awayName],
                outcome_prices: [homePrice, drawPrice, awayPrice],
                yes_price: 0,
                no_price: 0,
                volume: Math.floor(Math.random() * 50000) + 1000, // Random volume
                liquidity: Math.floor(Math.random() * 20000) + 500,
                resolved: false,
                is_active: true,
                updated_at: new Date().toISOString(),
            });

            if (error) {
                this.logger.error(`Failed to create simulated market for event ${event.id}: ${error.message}`);
            } else {
                await supabase.from('sports_events').update({ has_market: true }).eq('id', event.id);
                generated++;
            }
        }

        this.logger.log(`Generated ${generated} simulated markets.`);
        return generated;
    }



    // ========================
    // Markets
    // ========================

    /**
     * Get sports markets with filters
     */
    async getMarkets(query: SportsMarketsQueryDto): Promise<PaginatedResult<SportsMarketResponseDto>> {
        // Use admin client for public sports data (avoid RLS restrictions)
        const supabase = this.supabaseService.getAdminClient();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('sports_markets')
            .select(`
                *,
                event:sports_events${query.sport ? '!inner' : ''}(
                    *,
                    home_team:sports_teams!sports_events_home_team_id_fkey(*),
                    away_team:sports_teams!sports_events_away_team_id_fkey(*)
                )
            `, { count: 'exact' });

        if (query.sport) {
            queryBuilder = queryBuilder.eq('sports_events.sport', query.sport);
        }

        if (query.eventId) {
            queryBuilder = queryBuilder.eq('event_id', query.eventId);
        }
        if (query.marketType) {
            queryBuilder = queryBuilder.eq('market_type', query.marketType);
        }
        if (query.resolved !== undefined) {
            queryBuilder = queryBuilder.eq('resolved', query.resolved);
        }
        if (query.isActive !== undefined) {
            queryBuilder = queryBuilder.eq('is_active', query.isActive);
        }
        if (query.isFeatured !== undefined) {
            queryBuilder = queryBuilder.eq('is_featured', query.isFeatured);
        }

        if (query.search) {
            // Multi-field search
            // We need to join relations first if we want to search them, or use the event inner join we already have?
            // The query already joins 'event'!inner' if sport is present, otherwise just 'event'.
            // Note: Supabase/PostgREST doesn't easily support OR across joined tables with simple syntax in one go perfectly without embedding.
            // But we are using the JS client.
            // We can stringify the OR condition.

            const searchTerm = `%${query.search}%`;
            queryBuilder = queryBuilder.or(
                `title.ilike.${searchTerm},description.ilike.${searchTerm},question.ilike.${searchTerm}`
            );
        }

        const sortField = query.sortBy === 'volume' ? 'volume' :
            query.sortBy === 'createdAt' ? 'created_at' : 'closes_at';
        queryBuilder = queryBuilder
            .order(sortField, { ascending: query.sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to get markets: ${error.message}`);
            throw new Error(`Failed to get markets: ${error.message}`);
        }

        return {
            data: (data || []).map(item => this.toMarketDto(item)),
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Get market by ID
     */
    async getMarketById(id: string): Promise<SportsMarketResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_markets')
            .select(`
                *,
                event:sports_events(*)
            `)
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Market not found: ${id}`);
        }

        return this.toMarketDto(data);
    }

    /**
     * Create a sports market
     */
    async createMarket(dto: CreateSportsMarketDto): Promise<SportsMarketResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        // Verify event exists
        await this.getEventById(dto.eventId);

        const initialPrice = 0.5;
        const { data, error } = await supabase
            .from('sports_markets')
            .insert({
                event_id: dto.eventId,
                market_type: dto.marketType,
                title: dto.title,
                description: dto.description,
                question: dto.question,
                outcomes: dto.outcomes,
                outcome_prices: dto.outcomes.map(() => initialPrice),
                yes_price: initialPrice,
                no_price: initialPrice,
                volume: 0,
                liquidity: 0,
                resolved: false,
                opens_at: dto.opensAt?.toISOString(),
                closes_at: dto.closesAt.toISOString(),
                is_active: true,
                is_featured: false,
                auto_resolve: dto.autoResolve ?? true,
                metadata: {},
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to create market: ${error.message}`);
            throw new Error(`Failed to create market: ${error.message}`);
        }

        // Update event to indicate it has a market
        await supabase
            .from('sports_events')
            .update({ has_market: true, market_created_at: new Date().toISOString() })
            .eq('id', dto.eventId);

        // Publish market created event
        await this.sportsMessagingService.publishMarketCreated({
            ...data,
            eventId: data.event_id,
            outcomePrices: data.outcome_prices,
            yesPrice: data.yes_price,
            noPrice: data.no_price,
            opensAt: data.opens_at ? new Date(data.opens_at) : undefined,
            closesAt: new Date(data.closes_at),
        } as any);

        return this.toMarketDto(data);
    }

    // ========================
    // Transformers
    // ========================

    private toLeagueDto = (data: any): SportsLeagueResponseDto => {
        return {
            id: data.id,
            externalId: data.external_id,
            sport: data.sport,
            name: data.name,
            nameAlternate: data.name_alternate,
            country: data.country,
            countryCode: data.country_code,
            logoUrl: data.logo_url,
            bannerUrl: data.banner_url,
            isActive: data.is_active,
            isFeatured: data.is_featured,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
        };
    }

    private toTeamDto = (data: any): SportsTeamResponseDto => {
        return {
            id: data.id,
            externalId: data.external_id,
            leagueId: data.league_id,
            sport: data.sport,
            name: data.name,
            nameShort: data.name_short,
            country: data.country,
            city: data.city,
            stadium: data.stadium,
            logoUrl: data.logo_url,
            primaryColor: data.primary_color,
            secondaryColor: data.secondary_color,
            isActive: data.is_active,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
        };
    }

    private toEventDto = (data: any): SportsEventResponseDto => {
        return {
            id: data.id,
            externalId: data.external_id,
            leagueId: data.league_id,
            homeTeamId: data.home_team_id,
            awayTeamId: data.away_team_id,
            sport: data.sport,
            season: data.season,
            round: data.round,
            name: data.name,
            venue: data.venue,
            startTime: new Date(data.start_time),
            status: data.status,
            statusDetail: data.status_detail,
            elapsedTime: data.elapsed_time,
            homeScore: data.home_score,
            awayScore: data.away_score,
            thumbnailUrl: data.thumbnail_url,
            hasMarket: data.has_market,
            isFeatured: data.is_featured,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
            homeTeam: data.home_team ? this.toTeamDto(data.home_team) : undefined,
            awayTeam: data.away_team ? this.toTeamDto(data.away_team) : undefined,
            league: data.league ? this.toLeagueDto(data.league) : undefined,
            metadata: data.metadata,
        };
    }

    private toMarketDto = (data: any): SportsMarketResponseDto => {
        return {
            id: data.id,
            eventId: data.event_id,
            marketId: data.market_id,
            marketType: data.market_type,
            title: data.title,
            description: data.description,
            question: data.question,
            outcomes: data.outcomes,
            outcomePrices: data.outcome_prices,
            yesPrice: parseFloat(data.yes_price),
            noPrice: parseFloat(data.no_price),
            volume: parseFloat(data.volume),
            liquidity: parseFloat(data.liquidity),
            resolved: data.resolved,
            outcome: data.outcome,
            opensAt: data.opens_at ? new Date(data.opens_at) : undefined,
            closesAt: data.closes_at ? new Date(data.closes_at) : undefined,
            isActive: data.is_active,
            isFeatured: data.is_featured,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
            event: data.event ? this.toEventDto(data.event) : undefined,
        };
    }
}
