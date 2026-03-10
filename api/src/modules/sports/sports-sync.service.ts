/**
 * Sports Sync Service
 * 
 * Orchestrates data synchronization from external APIs.
 * Handles scheduled syncs, incremental updates, and error recovery.
 * Supports multi-sport sync via APISportsClient.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service.js';
import { TheSportsDBClient } from './clients/thesportsdb.client.js';
import { APIFootballClient } from './clients/api-football.client.js';
import { APISportsClient, SPORT_API_CONFIGS } from './clients/api-sports.client.js';
import { SportsService } from './sports.service.js';
import {
    SportType,
    DataSource,
    SyncStatus,
    SyncResult,
} from './types/sports.types.js';

@Injectable()
export class SportsSyncService implements OnModuleInit {
    private readonly logger = new Logger(SportsSyncService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        private readonly sportsService: SportsService,
        private readonly theSportsDBClient: TheSportsDBClient,
        private readonly apiFootballClient: APIFootballClient,
        private readonly apiSportsClient: APISportsClient,
    ) { }

    async onModuleInit() {
        this.logger.log('Initializing Sports Sync Service...');

        const enableScheduledSync = this.configService.get('SPORTS_ENABLE_SCHEDULED_SYNC', 'false');
        if (enableScheduledSync === 'true') {
            this.logger.log('Scheduled syncs enabled via Cron.');
        } else {
            this.logger.log('Scheduled syncs disabled. Use manual sync endpoints.');
        }
    }

    // ========================
    // Scheduled Tasks
    // ========================

    /**
     * Sync live scores (default: every 5 minutes)
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleLiveSync() {
        if (!this.shouldRunSync()) return;

        try {
            await this.syncLiveScores();
        } catch (err) {
            this.logger.error('Live sync failed:', err);
        }
    }

    /**
     * Sync upcoming events (default: every hour)
     */
    @Cron(CronExpression.EVERY_HOUR)
    async handleUpcomingSync() {
        if (!this.shouldRunSync()) return;

        try {
            await this.syncUpcomingEvents();
        } catch (err) {
            this.logger.error('Upcoming sync failed:', err);
        }
    }

    /**
     * Sync leagues (default: daily at midnight)
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleLeaguesSync() {
        if (!this.shouldRunSync()) return;

        try {
            await this.syncAllLeagues();
        } catch (err) {
            this.logger.error('Leagues sync failed:', err);
        }
    }

    /**
     * Sync odds (default: every 2 hours)
     */
    @Cron(CronExpression.EVERY_2_HOURS)
    async handleOddsSync() {
        if (!this.shouldRunSync()) return;

        try {
            await this.syncOdds();
        } catch (err) {
            this.logger.error('Odds sync failed:', err);
        }
    }

    /**
     * Sync multi-sport data (API-Sports)
     * Scheduled to run every 6 hours to respect the 100 req/day limit.
     * Use this to sync AFL, MMA, and other sports not covered by TheSportsDB.
     */
    @Cron(CronExpression.EVERY_6_HOURS)
    async handleMultiSportSync() {
        if (!this.shouldRunSync()) return;

        try {
            this.logger.log('Starting scheduled multi-sport sync (AFL, MMA, etc.)...');
            await this.syncMultipleSports('games');
        } catch (err) {
            this.logger.error('Multi-sport sync failed:', err);
        }
    }

    private shouldRunSync(): boolean {
        return this.configService.get('SPORTS_ENABLE_SCHEDULED_SYNC', 'false') === 'true';
    }

    // ========================
    // Sync Operations
    // ========================

    /**
     * Sync all leagues from all sources
     */
    async syncAllLeagues(sport?: SportType): Promise<SyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog('leagues', DataSource.THESPORTSDB, sport);

        try {
            this.logger.log(`Starting leagues sync${sport ? ` for ${sport}` : ''}...`);

            let totalFetched = 0;
            let totalCreated = 0;
            let totalUpdated = 0;

            // Sync from TheSportsDB
            // If sport is provided, sync only that sport. Otherwise sync all supported sports.
            const sports = sport ? [sport] : Object.values(SportType);

            for (const s of sports) {
                try {
                    const leagues = await this.theSportsDBClient.getLeaguesBySport(s);
                    totalFetched += leagues.length;

                    if (leagues.length > 0) {
                        const result = await this.sportsService.upsertLeagues(leagues);
                        totalCreated += result.created;
                        totalUpdated += result.updated;
                    }

                    // Small delay between sports to respect rate limits
                    if (sports.length > 1) {
                        await this.sleep(1000);
                    }
                } catch (error) {
                    this.logger.error(`Failed to sync leagues for ${s}:`, error);
                }
            }

            // Sync from API-Football (football/soccer only)
            if (!sport || sport === SportType.FOOTBALL) {
                try {
                    const footballLeagues = await this.apiFootballClient.getLeagues();
                    totalFetched += footballLeagues.length;

                    if (footballLeagues.length > 0) {
                        const result = await this.sportsService.upsertLeagues(footballLeagues);
                        totalCreated += result.created;
                        totalUpdated += result.updated;
                    }
                } catch (error) {
                    this.logger.error('Failed to sync leagues from API-Football:', error);
                }
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            this.logger.log(`Leagues sync completed: ${totalFetched} fetched, ${totalCreated} created, ${totalUpdated} updated (${durationMs}ms)`);

            return {
                success: true,
                source: DataSource.THESPORTSDB,
                syncType: 'leagues',
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs,
            });

            throw error;
        }
    }

    /**
     * Sync upcoming events
     */
    async syncUpcomingEvents(sport?: SportType, date?: Date): Promise<SyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog('events', DataSource.THESPORTSDB, sport);

        try {
            const targetDate = date || new Date();
            const dateStr = targetDate.toISOString().split('T')[0];

            this.logger.log(`Starting upcoming events sync for ${dateStr}${sport ? ` (${sport})` : ''}...`);

            let totalFetched = 0;
            let totalCreated = 0;
            let totalUpdated = 0;

            // Sync from TheSportsDB
            const events = await this.theSportsDBClient.getEventsByDate(dateStr, sport);
            totalFetched += events.length;

            if (events.length > 0) {
                const result = await this.sportsService.upsertEvents(events);
                totalCreated += result.created;
                totalUpdated += result.updated;
            }

            // Sync from API-Football (football only)
            if (!sport || sport === SportType.FOOTBALL) {
                try {
                    const footballEvents = await this.apiFootballClient.getUpcomingFixtures();
                    totalFetched += footballEvents.length;

                    if (footballEvents.length > 0) {
                        const result = await this.sportsService.upsertEvents(footballEvents);
                        totalCreated += result.created;
                        totalUpdated += result.updated;
                    }
                } catch (error) {
                    this.logger.error('Failed to sync events from API-Football:', error);
                }
            }

            // Generate default markets (Simulator)
            // Fetch fresh events from DB to ensure we have IDs
            const queryEndDate = new Date(dateStr);
            queryEndDate.setDate(queryEndDate.getDate() + 1);

            const { data: dbEvents } = await this.sportsService.getEvents({
                startDate: new Date(dateStr),
                endDate: queryEndDate,
            } as any);

            if (dbEvents && dbEvents.length > 0) {
                // Generate markets for new events
                await this.sportsService.generateDefaultMarkets(50);

                // Also try to sync odds for these events
                try {
                    await this.syncOdds(dateStr);
                } catch (err) {
                    this.logger.warn('Initial odds sync failed, will be retried by scheduler');
                }
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            this.logger.log(`Events sync completed: ${totalFetched} fetched.`);

            return {
                success: true,
                source: DataSource.THESPORTSDB,
                syncType: 'events',
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs,
            });

            throw error;
        }
    }
    /**
     * Sync live scores
     */
    async syncLiveScores(sport?: SportType): Promise<SyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog('live', DataSource.THESPORTSDB, sport);

        try {
            this.logger.log(`Starting live scores sync${sport ? ` for ${sport}` : ''}...`);

            let totalFetched = 0;
            let totalUpdated = 0;

            // Sync from TheSportsDB
            const liveEvents = await this.theSportsDBClient.getLiveScores(sport);
            totalFetched += liveEvents.length;

            if (liveEvents.length > 0) {
                const result = await this.sportsService.upsertEvents(liveEvents);
                totalUpdated += result.updated;
            }

            // Sync from API-Football (football only)
            if (!sport || sport === SportType.FOOTBALL) {
                try {
                    const footballLive = await this.apiFootballClient.getLiveFixtures();
                    totalFetched += footballLive.length;

                    if (footballLive.length > 0) {
                        const result = await this.sportsService.upsertEvents(footballLive);
                        totalUpdated += result.updated;
                    }
                } catch (error) {
                    this.logger.error('Failed to sync live from API-Football:', error);
                }
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            this.logger.log(`Live sync completed: ${totalFetched} fetched, ${totalUpdated} updated (${durationMs}ms)`);

            return {
                success: true,
                source: DataSource.THESPORTSDB,
                syncType: 'live',
                recordsFetched: totalFetched,
                recordsCreated: 0,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs,
            });

            throw error;
        }
    }

    /**
     * Sync teams by league
     */
    async syncTeamsByLeague(leagueExternalId: string, source: DataSource = DataSource.THESPORTSDB): Promise<SyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog('teams', source);

        try {
            this.logger.log(`Starting teams sync for league ${leagueExternalId}...`);

            let totalFetched = 0;
            let totalCreated = 0;
            let totalUpdated = 0;

            if (source === DataSource.THESPORTSDB) {
                const teams = await this.theSportsDBClient.getTeamsByLeague(leagueExternalId);
                totalFetched = teams.length;

                if (teams.length > 0) {
                    const result = await this.sportsService.upsertTeams(teams);
                    totalCreated = result.created;
                    totalUpdated = result.updated;
                }
            } else if (source === DataSource.APIFOOTBALL) {
                const currentYear = new Date().getFullYear();
                const teams = await this.apiFootballClient.getTeamsByLeague(
                    parseInt(leagueExternalId),
                    currentYear,
                );
                totalFetched = teams.length;

                if (teams.length > 0) {
                    const result = await this.sportsService.upsertTeams(teams);
                    totalCreated = result.created;
                    totalUpdated = result.updated;
                }
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            return {
                success: true,
                source,
                syncType: 'teams',
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs,
            });

            throw error;
        }
    }

    /**
     * Sync odds for a specific date
     */
    async syncOdds(date?: string): Promise<SyncResult> {
        const startTime = Date.now();
        const syncLog = await this.createSyncLog('odds', DataSource.APIFOOTBALL);

        try {
            const dateStr = date || new Date().toISOString().split('T')[0];
            this.logger.log(`Starting odds sync for ${dateStr}...`);

            let totalFetched = 0;
            let totalUpdated = 0;

            // Fetch odds (page 1 only for now, can implement pagination loop if needed)
            const odds = await this.apiFootballClient.getOddsByDate(dateStr);
            totalFetched = odds.length;

            if (odds.length > 0) {
                const result = await this.sportsService.upsertMarkets(odds);
                totalUpdated = result.updated;
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            this.logger.log(`Odds sync completed: ${totalFetched} fetched, ${totalUpdated} upserted (${durationMs}ms)`);

            return {
                success: true,
                source: DataSource.APIFOOTBALL,
                syncType: 'odds',
                recordsFetched: totalFetched,
                recordsCreated: 0,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage: (error as Error).message,
                durationMs,
            });
            throw error;
        }
    }

    // ========================
    // Multi-Sport Sync (API-Sports)
    // ========================

    /**
     * Get API-Sports usage statistics
     */
    getAPISportsUsage(): {
        dailyCount: number;
        dailyLimit: number;
        remaining: number;
        percentUsed: number;
        lastReset: string;
    } {
        return this.apiSportsClient.getUsageStats();
    }

    /**
     * Sync data from a specific sport using APISportsClient
     * This uses the unified multi-sport client for all non-football sports
     */
    async syncFromAPISports(
        sport: string,
        syncType: 'leagues' | 'games' | 'live' = 'games'
    ): Promise<SyncResult> {
        const startTime = Date.now();

        // Check quota before proceeding
        if (!this.apiSportsClient.canMakeRequest()) {
            const usage = this.apiSportsClient.getUsageStats();
            this.logger.warn(`Daily API limit exhausted (${usage.dailyCount}/${usage.dailyLimit}). Skipping ${sport} sync.`);
            return {
                success: false,
                source: DataSource.APIFOOTBALL,
                syncType,
                recordsFetched: 0,
                recordsCreated: 0,
                recordsUpdated: 0,
                recordsFailed: 0,
                durationMs: 0,
                errors: ['Daily API limit exhausted'],
            };
        }

        // Get sport config
        const sportConfig = SPORT_API_CONFIGS[sport.toLowerCase()];
        if (!sportConfig) {
            throw new Error(`Unsupported sport: ${sport}`);
        }

        const syncLog = await this.createSyncLog(syncType, sportConfig.dataSource, sportConfig.sportType);

        try {
            this.logger.log(`Starting ${syncType} sync for ${sport} via API-Sports...`);

            // Set the sport context
            this.apiSportsClient.setSport(sport);

            let totalFetched = 0;
            let totalCreated = 0;
            let totalUpdated = 0;

            switch (syncType) {
                case 'leagues': {
                    const leagues = await this.apiSportsClient.getLeagues();
                    totalFetched = leagues.length;

                    if (leagues.length > 0) {
                        const result = await this.sportsService.upsertLeagues(leagues);
                        totalCreated = result.created;
                        totalUpdated = result.updated;
                    }
                    break;
                }
                case 'games': {
                    const games = await this.apiSportsClient.getUpcomingGames();
                    totalFetched = games.length;

                    if (games.length > 0) {
                        const result = await this.sportsService.upsertEvents(games);
                        totalCreated = result.created;
                        totalUpdated = result.updated;
                    }
                    break;
                }
                case 'live': {
                    const liveGames = await this.apiSportsClient.getLiveGames();
                    totalFetched = liveGames.length;

                    if (liveGames.length > 0) {
                        const result = await this.sportsService.upsertEvents(liveGames);
                        totalUpdated = result.updated;
                    }
                    break;
                }
            }

            const durationMs = Date.now() - startTime;
            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.COMPLETED,
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                durationMs,
            });

            this.logger.log(`API-Sports ${sport} ${syncType} sync completed: ${totalFetched} fetched (${durationMs}ms)`);

            return {
                success: true,
                source: sportConfig.dataSource,
                syncType,
                recordsFetched: totalFetched,
                recordsCreated: totalCreated,
                recordsUpdated: totalUpdated,
                recordsFailed: 0,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = (error as Error).message;

            await this.updateSyncLog(syncLog.id, {
                status: SyncStatus.FAILED,
                errorMessage,
                durationMs,
            });

            this.logger.error(`API-Sports ${sport} ${syncType} sync failed: ${errorMessage}`);

            return {
                success: false,
                source: sportConfig.dataSource,
                syncType,
                recordsFetched: 0,
                recordsCreated: 0,
                recordsUpdated: 0,
                recordsFailed: 1,
                durationMs,
                errors: [errorMessage],
            };
        }
    }

    /**
     * Sync multiple sports with priority-based scheduling
     * Prioritizes Football, NBA, NFL, then others
     * Respects daily API limits
     */
    async syncMultipleSports(
        syncType: 'leagues' | 'games' | 'live' = 'games'
    ): Promise<{ results: Record<string, SyncResult>; totalFetched: number }> {
        const prioritizedSports = [
            'football', 'nba', 'mma', 'afl', 'nfl', 'basketball',
            'hockey', 'formula1', 'rugby',
            'volleyball', 'handball'
        ];

        const results: Record<string, SyncResult> = {};
        let totalFetched = 0;

        for (const sport of prioritizedSports) {
            // Check remaining quota
            const usage = this.apiSportsClient.getUsageStats();
            if (usage.remaining < 2) {
                this.logger.warn(`Stopping multi-sport sync. Only ${usage.remaining} requests remaining.`);
                break;
            }

            try {
                const result = await this.syncFromAPISports(sport, syncType);
                results[sport] = result;
                totalFetched += result.recordsFetched;

                // Add delay between sports to be nice to the API
                await this.sleep(1500);
            } catch (error) {
                this.logger.error(`Failed to sync ${sport}:`, error);
                results[sport] = {
                    success: false,
                    source: DataSource.APIFOOTBALL,
                    syncType,
                    recordsFetched: 0,
                    recordsCreated: 0,
                    recordsUpdated: 0,
                    recordsFailed: 1,
                    durationMs: 0,
                    errors: [(error as Error).message],
                };
            }
        }

        this.logger.log(`Multi-sport sync completed. Total fetched: ${totalFetched}`);
        return { results, totalFetched };
    }

    /**
     * Full sync - sync all data types
     */
    async fullSync(sport?: SportType): Promise<{ leagues: SyncResult; events: SyncResult; live: SyncResult }> {
        this.logger.log(`Starting full sync${sport ? ` for ${sport}` : ''}...`);

        const leagues = await this.syncAllLeagues(sport);
        await this.sleep(2000); // Respect rate limits

        const events = await this.syncUpcomingEvents(sport);
        await this.sleep(2000);

        const live = await this.syncLiveScores(sport);

        this.logger.log('Full sync completed');

        return { leagues, events, live };
    }

    // ========================
    // Sync Log Helpers
    // ========================

    private async createSyncLog(
        syncType: string,
        source: DataSource,
        sport?: SportType,
    ): Promise<{ id: string }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('sports_sync_logs')
            .insert({
                source,
                sync_type: syncType,
                sport,
                status: SyncStatus.RUNNING,
                started_at: new Date().toISOString(),
                triggered_by: 'system',
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
            recordsFailed?: number;
            errorMessage?: string;
            durationMs?: number;
        },
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
                records_failed: updates.recordsFailed,
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
