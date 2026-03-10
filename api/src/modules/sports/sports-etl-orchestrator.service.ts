/**
 * Sports ETL Orchestrator
 * 
 * Comprehensive ETL pipeline that combines data from multiple sources:
 * - TheSportsDB (free tier: 1000 req/day, 30 req/min)
 * - API-Sports (all 11 endpoints)
 * 
 * Features:
 * - Deduplication with API-Sports taking priority
 * - Automatic scheduled sync
 * - Rate limiting and anti-throttling
 * - RabbitMQ streaming
 * - Comprehensive error handling
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service.js';
import { TheSportsDBClient } from './clients/thesportsdb.client.js';
import { APISportsClient, SPORT_API_CONFIGS } from './clients/api-sports.client.js';
import { SportsService } from './sports.service.js';
import { SportsMessagingService } from './sports-messaging.service.js';
import {
    SportType,
    DataSource,
    SyncStatus,
    SyncResult,
    SportsLeague,
    SportsTeam,
    SportsEvent,
} from './types/sports.types.js';

// ========================
// Data Source Priority
// ========================

/**
 * Priority order for data sources (higher = more authoritative)
 * When duplicates are found, higher priority source wins
 */
const DATA_SOURCE_PRIORITY: Record<DataSource, number> = {
    [DataSource.APIFOOTBALL]: 100,
    [DataSource.APIBASEBALL]: 100,
    [DataSource.APIBASKETBALL]: 100,
    [DataSource.APIAFL]: 100,
    [DataSource.APIFORMULA1]: 100,
    [DataSource.APIHANDBALL]: 100,
    [DataSource.APIHOCKEY]: 100,
    [DataSource.APIMMA]: 100,
    [DataSource.APINBA]: 100,
    [DataSource.APINFL]: 100,
    [DataSource.APIRUGBY]: 100,
    [DataSource.APIVOLLEYBALL]: 100,
    [DataSource.THESPORTSDB]: 50,
    [DataSource.MANUAL]: 25,
    [DataSource.ETL_ORCHESTRATOR]: 0,
};

// ========================
// Sync Configuration
// ========================

interface ETLSyncConfig {
    enableTheSportsDB: boolean;
    enableAPISports: boolean;
    syncIntervalMinutes: number;
    batchSize: number;
    delayBetweenBatchesMs: number;
    maxRetries: number;
    deduplicateByName: boolean;
    generateMarkets: boolean;
}

const DEFAULT_CONFIG: ETLSyncConfig = {
    enableTheSportsDB: true,
    enableAPISports: true,
    syncIntervalMinutes: 60,
    batchSize: 10,
    delayBetweenBatchesMs: 2000,
    maxRetries: 3,
    deduplicateByName: true,
    generateMarkets: true,
};

// ========================
// ETL Result Types
// ========================

interface ETLSyncResult {
    success: boolean;
    sport?: SportType;
    syncType: string;
    sources: {
        theSportsDB: {
            fetched: number;
            created: number;
            updated: number;
            errors: string[];
        };
        apiSports: {
            fetched: number;
            created: number;
            updated: number;
            errors: string[];
        };
    };
    deduplication: {
        duplicatesFound: number;
        mergedRecords: number;
    };
    durationMs: number;
    timestamp: Date;
}

interface DeduplicatedData<T> {
    items: T[];
    duplicatesRemoved: number;
    sourcesUsed: DataSource[];
}

// ========================
// Main ETL Orchestrator
// ========================

@Injectable()
export class SportsETLOrchestrator implements OnModuleInit {
    private readonly logger = new Logger(SportsETLOrchestrator.name);
    private readonly config: ETLSyncConfig;
    private isSyncing = false;
    private lastSyncTime: Date | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        private readonly sportsService: SportsService,
        private readonly sportsMessagingService: SportsMessagingService,
        private readonly theSportsDBClient: TheSportsDBClient,
        private readonly apiSportsClient: APISportsClient,
    ) {
        this.config = {
            ...DEFAULT_CONFIG,
            enableTheSportsDB: this.configService.get('ETL_ENABLE_THESPORTSDB', 'true') === 'true',
            enableAPISports: this.configService.get('ETL_ENABLE_APISPORTS', 'true') === 'true',
            syncIntervalMinutes: parseInt(this.configService.get('ETL_SYNC_INTERVAL', '60'), 10),
            deduplicateByName: this.configService.get('ETL_DEDUPLICATE_BY_NAME', 'true') === 'true',
        };
    }

    async onModuleInit() {
        this.logger.log('ETL Orchestrator initialized');
        this.logger.log(`TheSportsDB enabled: ${this.config.enableTheSportsDB}`);
        this.logger.log(`API-Sports enabled: ${this.config.enableAPISports}`);
        this.logger.log(`Sync interval: ${this.config.syncIntervalMinutes} minutes`);
        this.logger.log(`Deduplication by name: ${this.config.deduplicateByName}`);

        // AUTO-TRIGGER: Trigger a sync on startup to ensure data is available
        // Delay by 5 seconds to allow other services to initialize
        setTimeout(async () => {
            this.logger.log('[AUTO-TRIGGER] Starting initial sports data sync...');
            try {
                // Force API-Sports to be used regardless of config for this initial sync
                // to ensure the user gets the "Time Machine" data for restricted sports
                if (!this.config.enableAPISports) {
                    this.logger.warn('[AUTO-TRIGGER] Forcing API-Sports enabled for initial sync');
                }

                // Priority sports that need Time Machine logic
                const targetSports = [
                    SportType.AFL,
                    SportType.MMA,
                    SportType.HANDBALL,
                    SportType.HOCKEY,
                    SportType.RUGBY,
                    SportType.VOLLEYBALL
                ];

                this.logger.log(`[AUTO-TRIGGER] Starting PRIORITY sync for: ${targetSports.join(', ')}`);

                // STEP 1: Sync leagues FIRST for all target sports
                // This ensures leagues exist in database before fetching games
                this.logger.log('[AUTO-TRIGGER] Step 1: Syncing leagues for target sports...');
                for (const sport of targetSports) {
                    try {
                        await this.syncSport(sport, 'leagues');
                        this.logger.log(`[AUTO-TRIGGER] Leagues synced for ${sport}`);
                    } catch (error) {
                        this.logger.warn(`[AUTO-TRIGGER] League sync failed for ${sport}, will use fallback: ${(error as Error).message}`);
                    }
                }

                // STEP 2: Sync games with Time Machine logic
                this.logger.log('[AUTO-TRIGGER] Step 2: Syncing games (with Time Machine for restricted sports)...');
                for (const sport of targetSports) {
                    try {
                        await this.syncSport(sport, 'games');
                        this.logger.log(`[AUTO-TRIGGER] Games synced for ${sport}`);
                    } catch (error) {
                        this.logger.warn(`[AUTO-TRIGGER] Games sync failed for ${sport}: ${(error as Error).message}`);
                    }
                }

                // STEP 3: Skip live sync initially to preserve API quota
                // await this.syncAllSports('live');

                this.logger.log('[AUTO-TRIGGER] Initial sync completed successfully');
            } catch (error) {
                this.logger.error('[AUTO-TRIGGER] Initial sync failed:', error);
            }
        }, 5000);
    }

    // ========================
    // Scheduled Tasks
    // ========================

    /**
     * Automatic sync every hour (configurable)
     */
    @Cron(CronExpression.EVERY_HOUR)
    async handleScheduledSync() {
        const enableScheduledSync = this.configService.get('ETL_ENABLE_SCHEDULED_SYNC', 'false') === 'true';
        if (!enableScheduledSync) return;

        this.logger.log('Starting scheduled ETL sync...');
        await this.syncAllSports('games');
    }

    /**
     * Sync live scores every 2 minutes (when games are active)
     */
    @Cron('*/2 * * * *') // Every 2 minutes
    async handleLiveScoresSync() {
        const enableLiveSync = this.configService.get('ETL_ENABLE_LIVE_SYNC', 'false') === 'true';
        if (!enableLiveSync) return;

        await this.syncLiveScoresAllSports();
    }

    /**
     * Daily leagues sync at 3 AM
     */
    @Cron('0 3 * * *')
    async handleDailyLeaguesSync() {
        const enableScheduledSync = this.configService.get('ETL_ENABLE_SCHEDULED_SYNC', 'false') === 'true';
        if (!enableScheduledSync) return;

        this.logger.log('Starting daily leagues sync...');
        await this.syncAllSports('leagues');
    }

    // ========================
    // Main Sync Operations
    // ========================

    /**
     * Sync all sports from all sources
     */
    async syncAllSports(
        syncType: 'leagues' | 'games' | 'live' = 'games'
    ): Promise<{ results: Record<string, ETLSyncResult>; totalFetched: number }> {
        if (this.isSyncing) {
            this.logger.warn('Sync already in progress, skipping...');
            return { results: {}, totalFetched: 0 };
        }

        this.isSyncing = true;
        const startTime = Date.now();
        const results: Record<string, ETLSyncResult> = {};
        let totalFetched = 0;

        try {
            // Priority order for sports
            const sportsOrder = [
                SportType.FOOTBALL,
                SportType.NBA,
                SportType.NFL,
                SportType.BASKETBALL,
                SportType.HOCKEY,
                SportType.MMA,
                SportType.FORMULA1,
                SportType.RUGBY,
                SportType.VOLLEYBALL,
                SportType.HANDBALL,
                SportType.AFL,
            ];

            for (const sport of sportsOrder) {
                try {
                    const result = await this.syncSport(sport, syncType);
                    results[sport] = result;
                    totalFetched += result.sources.theSportsDB.fetched + result.sources.apiSports.fetched;

                    // Respect rate limits
                    await this.sleep(this.config.delayBetweenBatchesMs);
                } catch (error) {
                    this.logger.error(`Failed to sync ${sport}:`, error);
                    results[sport] = this.createErrorResult(sport, syncType, (error as Error).message);
                }
            }

            // Publish sync completion event
            await this.sportsMessagingService.publishSyncComplete({
                syncType,
                totalFetched,
                sportsProcessed: Object.keys(results).length,
                durationMs: Date.now() - startTime,
            });

            this.lastSyncTime = new Date();
            this.logger.log(`ETL sync completed. Total fetched: ${totalFetched} (${Date.now() - startTime}ms)`);

            return { results, totalFetched };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync a specific sport from all sources
     */
    async syncSport(
        sport: SportType,
        syncType: 'leagues' | 'games' | 'live' = 'games'
    ): Promise<ETLSyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog(syncType, sport);

        const result: ETLSyncResult = {
            success: false,
            sport,
            syncType,
            sources: {
                theSportsDB: { fetched: 0, created: 0, updated: 0, errors: [] },
                apiSports: { fetched: 0, created: 0, updated: 0, errors: [] },
            },
            deduplication: { duplicatesFound: 0, mergedRecords: 0 },
            durationMs: 0,
            timestamp: new Date(),
        };

        try {
            this.logger.log(`Starting ETL sync for ${sport} (${syncType})...`);

            switch (syncType) {
                case 'leagues':
                    await this.syncLeaguesForSport(sport, result);
                    break;
                case 'games':
                    await this.syncGamesForSport(sport, result);
                    break;
                case 'live':
                    await this.syncLiveScoresForSport(sport, result);
                    break;
            }

            result.success = true;
            result.durationMs = Date.now() - startTime;

            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: result.sources.theSportsDB.fetched + result.sources.apiSports.fetched,
                recordsCreated: result.sources.theSportsDB.created + result.sources.apiSports.created,
                recordsUpdated: result.sources.theSportsDB.updated + result.sources.apiSports.updated,
                durationMs: result.durationMs,
            });

            this.logger.log(
                `ETL sync for ${sport} completed: ` +
                `TheSportsDB=${result.sources.theSportsDB.fetched}, ` +
                `API-Sports=${result.sources.apiSports.fetched}, ` +
                `Duplicates=${result.deduplication.duplicatesFound} ` +
                `(${result.durationMs}ms)`
            );

            return result;
        } catch (error) {
            result.durationMs = Date.now() - startTime;

            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs: result.durationMs,
            });

            throw error;
        }
    }

    // ========================
    // Sync Implementations
    // ========================

    /**
     * Sync leagues for a specific sport from all sources
     */
    private async syncLeaguesForSport(sport: SportType, result: ETLSyncResult): Promise<void> {
        const allLeagues: SportsLeague[] = [];

        // 1. Fetch from TheSportsDB
        if (this.config.enableTheSportsDB) {
            try {
                const leagues = await this.theSportsDBClient.getLeaguesBySport(sport);
                result.sources.theSportsDB.fetched = leagues.length;
                allLeagues.push(...leagues);
            } catch (error) {
                result.sources.theSportsDB.errors.push((error as Error).message);
                this.logger.error(`TheSportsDB leagues fetch failed for ${sport}:`, error);
            }
        }

        // Small delay between sources
        await this.sleep(1000);

        // 2. Fetch from API-Sports
        if (this.config.enableAPISports && this.apiSportsClient.canMakeRequest()) {
            try {
                const sportKey = this.mapSportTypeToAPIKey(sport);
                if (sportKey) {
                    this.apiSportsClient.setSport(sportKey);
                    const leagues = await this.apiSportsClient.getLeagues();
                    result.sources.apiSports.fetched = leagues.length;
                    allLeagues.push(...leagues);
                }
            } catch (error) {
                result.sources.apiSports.errors.push((error as Error).message);
                this.logger.error(`API-Sports leagues fetch failed for ${sport}:`, error);
            }
        }

        // 3. Deduplicate
        const deduplicated = this.deduplicateLeagues(allLeagues);
        result.deduplication.duplicatesFound = allLeagues.length - deduplicated.items.length;
        result.deduplication.mergedRecords = deduplicated.items.length;

        // 4. Upsert to database
        if (deduplicated.items.length > 0) {
            const upsertResult = await this.sportsService.upsertLeagues(deduplicated.items);
            result.sources.apiSports.created = upsertResult.created;
            result.sources.apiSports.updated = upsertResult.updated;
        }
    }

    /**
     * Sync games/events for a specific sport from all sources
     * Improved: Uses league-based fetching for better coverage
     */
    private async syncGamesForSport(sport: SportType, result: ETLSyncResult): Promise<void> {
        const allEvents: SportsEvent[] = [];
        const supabase = this.supabaseService.getAdminClient();

        // 1. Get existing leagues for this sport from database
        const { data: leagues } = await supabase
            .from('sports_leagues')
            .select('id, external_id, name')
            .eq('sport', sport)
            .eq('is_active', true)
            .limit(this.config.batchSize); // Limit leagues to process

        if (!leagues || leagues.length === 0) {
            this.logger.warn(`No leagues found for ${sport}. Using fallback methods...`);

            // Fallback 1: Try date-based fetch from TheSportsDB
            if (this.config.enableTheSportsDB) {
                try {
                    const today = new Date().toISOString().split('T')[0];
                    const events = await this.theSportsDBClient.getEventsByDate(today, sport);
                    result.sources.theSportsDB.fetched = events.length;
                    allEvents.push(...events);
                    this.logger.log(`[Fallback] TheSportsDB date-based: ${events.length} events for ${sport}`);
                } catch (error) {
                    result.sources.theSportsDB.errors.push((error as Error).message);
                    this.logger.warn(`[Fallback] TheSportsDB failed for ${sport}: ${(error as Error).message}`);
                }
            }

            // Fallback 2: ALWAYS try API-Sports Time Machine for restricted sports
            // This is critical for AFL/MMA since they don't have leagues in database
            if (this.config.enableAPISports && this.apiSportsClient.canMakeRequest()) {
                try {
                    const sportKey = this.mapSportTypeToAPIKey(sport);
                    if (sportKey) {
                        this.logger.log(`[Fallback] Trying API-Sports Time Machine for ${sport}...`);
                        this.apiSportsClient.setSport(sportKey);
                        const events = await this.apiSportsClient.getUpcomingGames();
                        result.sources.apiSports.fetched = events.length;
                        allEvents.push(...events);
                        this.logger.log(`[Fallback] API-Sports Time Machine: ${events.length} events for ${sport}`);
                    }
                } catch (error) {
                    result.sources.apiSports.errors.push((error as Error).message);
                    this.logger.error(`[Fallback] API-Sports failed for ${sport}:`, error);
                }
            }
        } else {
            this.logger.log(`Syncing events from ${leagues.length} leagues for ${sport}...`);

            // 2. Fetch events for each league (TheSportsDB)
            if (this.config.enableTheSportsDB) {
                for (const league of leagues) {
                    try {
                        // First sync teams for this league
                        const teams = await this.theSportsDBClient.getTeamsByLeague(league.external_id);
                        if (teams.length > 0) {
                            await this.sportsService.upsertTeams(teams);
                            this.logger.debug(`Synced ${teams.length} teams for ${league.name}`);
                        }

                        // Then get upcoming events
                        const events = await this.theSportsDBClient.getUpcomingEventsByLeague(league.external_id);
                        result.sources.theSportsDB.fetched += events.length;
                        allEvents.push(...events);

                        // Rate limiting between league requests
                        await this.sleep(500);
                    } catch (error) {
                        this.logger.warn(`Failed to sync events for league ${league.name}:`, error);
                        result.sources.theSportsDB.errors.push(`${league.name}: ${(error as Error).message}`);
                    }
                }
            }
        }

        // 3. Fetch from API-Sports (if available)
        if (this.config.enableAPISports && this.apiSportsClient.canMakeRequest()) {
            try {
                const sportKey = this.mapSportTypeToAPIKey(sport);
                if (sportKey) {
                    this.apiSportsClient.setSport(sportKey);
                    const events = await this.apiSportsClient.getUpcomingGames();
                    result.sources.apiSports.fetched = events.length;
                    allEvents.push(...events);
                }
            } catch (error) {
                result.sources.apiSports.errors.push((error as Error).message);
                this.logger.error(`API-Sports events fetch failed for ${sport}:`, error);
            }
        }

        // 4. Deduplicate
        const deduplicated = this.deduplicateEvents(allEvents);
        result.deduplication.duplicatesFound = allEvents.length - deduplicated.items.length;
        result.deduplication.mergedRecords = deduplicated.items.length;

        // 5. Upsert to database and publish updates
        if (deduplicated.items.length > 0) {
            const upsertResult = await this.sportsService.upsertEvents(deduplicated.items);
            result.sources.apiSports.created = upsertResult.created;
            result.sources.apiSports.updated = upsertResult.updated;

            // Publish each event to RabbitMQ
            for (const event of deduplicated.items) {
                await this.sportsMessagingService.publishEventUpdate(event as any);
            }
        }

        // 6. Generate default markets for events
        if (deduplicated.items.length > 0) {
            if (this.config.generateMarkets) {
                try {
                    // Generate markets for pending events (limit 50)
                    const generatedCount = await this.sportsService.generateDefaultMarkets(50);
                    if (generatedCount > 0) {
                        this.logger.log(`Generated ${generatedCount} default markets`);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to generate markets for ${sport}:`, error);
                }
            }
        }
    }

    /**
     * Sync live scores for a specific sport from all sources
     */
    private async syncLiveScoresForSport(sport: SportType, result: ETLSyncResult): Promise<void> {
        const allLiveEvents: SportsEvent[] = [];

        // 1. Fetch from TheSportsDB
        if (this.config.enableTheSportsDB) {
            try {
                const events = await this.theSportsDBClient.getLiveScores(sport);
                result.sources.theSportsDB.fetched = events.length;
                allLiveEvents.push(...events);
            } catch (error) {
                result.sources.theSportsDB.errors.push((error as Error).message);
            }
        }

        // 2. Fetch from API-Sports
        if (this.config.enableAPISports && this.apiSportsClient.canMakeRequest()) {
            try {
                const sportKey = this.mapSportTypeToAPIKey(sport);
                if (sportKey) {
                    this.apiSportsClient.setSport(sportKey);
                    const events = await this.apiSportsClient.getLiveGames();
                    result.sources.apiSports.fetched = events.length;
                    allLiveEvents.push(...events);
                }
            } catch (error) {
                result.sources.apiSports.errors.push((error as Error).message);
            }
        }

        // 3. Deduplicate
        const deduplicated = this.deduplicateEvents(allLiveEvents);
        result.deduplication.duplicatesFound = allLiveEvents.length - deduplicated.items.length;

        // 4. Upsert and publish live updates
        if (deduplicated.items.length > 0) {
            const upsertResult = await this.sportsService.upsertEvents(deduplicated.items);
            result.sources.apiSports.updated = upsertResult.updated;

            // Publish live score updates
            for (const event of deduplicated.items) {
                await this.sportsMessagingService.publishLiveScoreUpdate(event as any);
            }
        }
    }

    /**
     * Sync live scores for all sports
     */
    async syncLiveScoresAllSports(): Promise<ETLSyncResult[]> {
        const results: ETLSyncResult[] = [];

        for (const sport of Object.values(SportType)) {
            try {
                const result = await this.syncSport(sport, 'live');
                results.push(result);

                // Only continue if we found live events
                if (result.sources.theSportsDB.fetched + result.sources.apiSports.fetched === 0) {
                    continue;
                }

                await this.sleep(500);
            } catch (error) {
                this.logger.error(`Live sync failed for ${sport}:`, error);
            }
        }

        return results;
    }

    // ========================
    // Deduplication Logic
    // ========================

    /**
     * Deduplicate leagues from multiple sources
     * API-Sports data takes priority over TheSportsDB
     */
    private deduplicateLeagues(leagues: SportsLeague[]): DeduplicatedData<SportsLeague> {
        const leagueMap = new Map<string, SportsLeague>();
        const sourcesUsed = new Set<DataSource>();
        let duplicatesRemoved = 0;

        // Sort by source priority (higher priority first)
        const sortedLeagues = [...leagues].sort((a, b) => {
            const priorityA = DATA_SOURCE_PRIORITY[a.source] || 0;
            const priorityB = DATA_SOURCE_PRIORITY[b.source] || 0;
            return priorityB - priorityA;
        });

        for (const league of sortedLeagues) {
            sourcesUsed.add(league.source);

            // Create a normalized key for deduplication
            const key = this.normalizeLeagueKey(league);

            if (leagueMap.has(key)) {
                const existing = leagueMap.get(key)!;
                const existingPriority = DATA_SOURCE_PRIORITY[existing.source] || 0;
                const newPriority = DATA_SOURCE_PRIORITY[league.source] || 0;

                // Only replace if new source has higher priority
                if (newPriority > existingPriority) {
                    // Merge metadata from lower priority source
                    const merged = this.mergeLeagueData(league, existing);
                    leagueMap.set(key, merged);
                }
                duplicatesRemoved++;
            } else {
                leagueMap.set(key, league);
            }
        }

        return {
            items: Array.from(leagueMap.values()),
            duplicatesRemoved,
            sourcesUsed: Array.from(sourcesUsed),
        };
    }

    /**
     * Deduplicate events from multiple sources
     */
    private deduplicateEvents(events: SportsEvent[]): DeduplicatedData<SportsEvent> {
        const eventMap = new Map<string, SportsEvent>();
        const sourcesUsed = new Set<DataSource>();
        let duplicatesRemoved = 0;

        // Sort by source priority (higher priority first)
        const sortedEvents = [...events].sort((a, b) => {
            const priorityA = DATA_SOURCE_PRIORITY[a.source] || 0;
            const priorityB = DATA_SOURCE_PRIORITY[b.source] || 0;
            return priorityB - priorityA;
        });

        for (const event of sortedEvents) {
            sourcesUsed.add(event.source);

            // Create a normalized key for deduplication
            const key = this.normalizeEventKey(event);

            if (eventMap.has(key)) {
                const existing = eventMap.get(key)!;
                const existingPriority = DATA_SOURCE_PRIORITY[existing.source] || 0;
                const newPriority = DATA_SOURCE_PRIORITY[event.source] || 0;

                // Only replace if new source has higher priority
                if (newPriority > existingPriority) {
                    // Merge data from lower priority source
                    const merged = this.mergeEventData(event, existing);
                    eventMap.set(key, merged);
                }
                duplicatesRemoved++;
            } else {
                eventMap.set(key, event);
            }
        }

        return {
            items: Array.from(eventMap.values()),
            duplicatesRemoved,
            sourcesUsed: Array.from(sourcesUsed),
        };
    }

    /**
     * Normalize league key for deduplication
     */
    private normalizeLeagueKey(league: SportsLeague): string {
        if (this.config.deduplicateByName) {
            // Use normalized name + country + sport
            const normalizedName = this.normalizeString(league.name);
            const normalizedCountry = this.normalizeString(league.country || '');
            return `${league.sport}:${normalizedCountry}:${normalizedName}`;
        }
        // Use external ID and source as unique key
        return `${league.source}:${league.externalId}`;
    }

    /**
     * Normalize event key for deduplication
     */
    private normalizeEventKey(event: SportsEvent): string {
        if (this.config.deduplicateByName) {
            // Use home team + away team + date
            const homeTeam = this.normalizeString(
                (event.metadata as any)?.homeTeamName || event.homeTeamId || ''
            );
            const awayTeam = this.normalizeString(
                (event.metadata as any)?.awayTeamName || event.awayTeamId || ''
            );
            const date = event.startTime.toISOString().split('T')[0];
            return `${event.sport}:${date}:${homeTeam}:${awayTeam}`;
        }
        return `${event.source}:${event.externalId}`;
    }

    /**
     * Normalize string for comparison
     */
    private normalizeString(str: string): string {
        return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();
    }

    /**
     * Merge league data from two sources (prioritizing higher priority source)
     */
    private mergeLeagueData(primary: SportsLeague, secondary: SportsLeague): SportsLeague {
        return {
            ...primary,
            // Fill in missing data from secondary source
            logoUrl: primary.logoUrl || secondary.logoUrl,
            bannerUrl: primary.bannerUrl || secondary.bannerUrl,
            trophyUrl: primary.trophyUrl || secondary.trophyUrl,
            description: primary.description || secondary.description,
            website: primary.website || secondary.website,
            twitter: primary.twitter || secondary.twitter,
            facebook: primary.facebook || secondary.facebook,
            metadata: {
                ...secondary.metadata,
                ...primary.metadata,
                mergedFrom: secondary.source,
            },
        };
    }

    /**
     * Merge event data from two sources
     */
    private mergeEventData(primary: SportsEvent, secondary: SportsEvent): SportsEvent {
        return {
            ...primary,
            // Fill in missing data from secondary source
            venue: primary.venue || secondary.venue,
            city: primary.city || secondary.city,
            thumbnailUrl: primary.thumbnailUrl || secondary.thumbnailUrl,
            videoUrl: primary.videoUrl || secondary.videoUrl,
            bannerUrl: primary.bannerUrl || secondary.bannerUrl,
            metadata: {
                ...secondary.metadata,
                ...primary.metadata,
                mergedFrom: secondary.source,
            },
        };
    }

    // ========================
    // Utility Functions
    // ========================

    /**
     * Map SportType to API-Sports key
     */
    private mapSportTypeToAPIKey(sport: SportType): string | null {
        const mapping: Record<SportType, string> = {
            [SportType.FOOTBALL]: 'football',
            [SportType.BASKETBALL]: 'basketball',
            [SportType.AFL]: 'afl',
            [SportType.FORMULA1]: 'formula1',
            [SportType.HANDBALL]: 'handball',
            [SportType.HOCKEY]: 'hockey',
            [SportType.MMA]: 'mma',
            [SportType.NBA]: 'nba',
            [SportType.NFL]: 'nfl',
            [SportType.RUGBY]: 'rugby',
            [SportType.VOLLEYBALL]: 'volleyball',
            [SportType.BASEBALL]: 'baseball',
        };
        return mapping[sport] || null;
    }

    /**
     * Create error result
     */
    private createErrorResult(sport: SportType, syncType: string, error: string): ETLSyncResult {
        return {
            success: false,
            sport,
            syncType,
            sources: {
                theSportsDB: { fetched: 0, created: 0, updated: 0, errors: [error] },
                apiSports: { fetched: 0, created: 0, updated: 0, errors: [] },
            },
            deduplication: { duplicatesFound: 0, mergedRecords: 0 },
            durationMs: 0,
            timestamp: new Date(),
        };
    }

    /**
     * Get status information
     */
    getStatus(): {
        isSyncing: boolean;
        lastSyncTime: Date | null;
        config: ETLSyncConfig;
        apiSportsUsage: ReturnType<APISportsClient['getUsageStats']>;
    } {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            config: this.config,
            apiSportsUsage: this.apiSportsClient.getUsageStats(),
        };
    }

    // ========================
    // Sync Log Helpers
    // ========================

    private async createSyncLog(syncType: string, sport?: SportType): Promise<{ id: string }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_sync_logs')
            .insert({
                source: 'etl_orchestrator' as any,
                sync_type: syncType,
                sport,
                status: SyncStatus.RUNNING,
                started_at: new Date().toISOString(),
                triggered_by: 'etl_orchestrator',
                metadata: { sources: ['thesportsdb', 'apisports'] },
            })
            .select('id')
            .single();

        if (error) {
            this.logger.error('Failed to create sync log:', error);
            return { id: 'unknown' };
        }

        return { id: data.id };
    }

    private async updateSyncLog(
        id: string,
        updates: {
            status?: SyncStatus;
            recordsFetched?: number;
            recordsCreated?: number;
            recordsUpdated?: number;
            errorMessage?: string;
            durationMs?: number;
        }
    ): Promise<void> {
        if (id === 'unknown') return;

        const supabase = this.supabaseService.getAdminClient();

        await supabase
            .from('sports_sync_logs')
            .update({
                status: updates.status,
                records_fetched: updates.recordsFetched,
                records_created: updates.recordsCreated,
                records_updated: updates.recordsUpdated,
                error_message: updates.errorMessage,
                duration_ms: updates.durationMs,
                completed_at: new Date().toISOString(),
            })
            .eq('id', id);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
