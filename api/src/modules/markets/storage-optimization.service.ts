/**
 * Storage Optimization Service
 * 
 * Handles automated archival of old probability_history and agent_predictions
 * data to Supabase Storage, then cleans up the database to prevent disk bloat.
 * 
 * ARCHITECTURE:
 *   1. Every 6 hours: Archive old probability_history metadata to Storage as JSON
 *   2. Every 6 hours: Run DB cleanup functions (strip columns, delete old rows)
 *   3. Daily: Monitor storage health and log warnings if approaching limits
 * 
 * STORAGE LAYOUT (Supabase Storage bucket: data-archives):
 *   /probability_history/YYYY-MM/batch_{competition_id}_{date}.json.gz
 *   /agent_predictions/YYYY-MM/batch_{competition_id}_{date}.json.gz
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service.js';

interface StorageHealthRow {
    table_name: string;
    total_size: string;
    data_size: string;
    index_size: string;
    live_rows: number;
    dead_rows: number;
    dead_row_pct: number;
    prob_history_daily_growth: number;
}

interface OptimizationResult {
    prob_rows_stripped: number;
    prob_strip_savings_mb: number;
    prob_rows_deleted: number;
    prob_delete_savings_mb: number;
    pred_rows_cleaned: number;
    pred_savings_mb: number;
    audit_rows_deleted: number;
    rate_limit_rows_deleted: number;
    total_estimated_savings_mb: number;
}

@Injectable()
export class StorageOptimizationService implements OnModuleInit {
    private readonly logger = new Logger(StorageOptimizationService.name);

    // Configuration — tune these for your plan
    private readonly PROB_HISTORY_STRIP_HOURS = 48;       // Strip metadata older than 48h
    private readonly PROB_HISTORY_DELETE_DAYS = 7;         // Delete rows older than 7 days (settled comps)
    private readonly PRED_CLEANUP_DAYS = 7;                // Strip agent_predictions older than 7 days
    private readonly KEEP_PER_COMPETITION = 120;           // Always keep last 120 points per comp
    private readonly ARCHIVE_BATCH_SIZE = 1000;            // Rows per archive batch file
    private readonly STORAGE_BUCKET = 'data-archives';

    constructor(private readonly supabaseService: SupabaseService) {}

    async onModuleInit() {
        // Log initial storage health on startup
        setTimeout(() => this.logStorageHealth(), 10_000);
    }

    // ════════════════════════════════════════════
    // Cron: Run full optimization every 6 hours
    // ════════════════════════════════════════════

    @Cron('0 */6 * * *') // Every 6 hours at minute 0
    async runScheduledOptimization(): Promise<void> {
        this.logger.log('🔧 Running scheduled storage optimization...');

        try {
            // Step 1: Archive old data to Supabase Storage (before deleting from DB)
            await this.archiveOldProbabilityHistory();

            // Step 2: Run DB cleanup via stored functions
            const result = await this.runDatabaseCleanup();

            if (result) {
                this.logger.log(
                    `✅ Storage optimization complete: ` +
                    `prob_stripped=${result.prob_rows_stripped} (~${result.prob_strip_savings_mb}MB), ` +
                    `prob_deleted=${result.prob_rows_deleted} (~${result.prob_delete_savings_mb}MB), ` +
                    `preds_cleaned=${result.pred_rows_cleaned} (~${result.pred_savings_mb}MB), ` +
                    `total_savings=~${result.total_estimated_savings_mb}MB`
                );
            }
        } catch (err: any) {
            this.logger.error(`Storage optimization failed: ${err.message}`);
        }
    }

    // ════════════════════════════════════════════
    // Cron: Daily storage health check
    // ════════════════════════════════════════════

    @Cron('0 3 * * *') // 3 AM daily
    async logStorageHealth(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();

            const { data, error } = await supabase
                .from('storage_health_dashboard')
                .select('*');

            if (error || !data) {
                this.logger.warn(`Storage health check failed: ${error?.message || 'no data'}`);
                return;
            }

            const rows = data as StorageHealthRow[];
            let totalWarnings = 0;

            this.logger.log('📊 Storage Health Dashboard:');
            for (const row of rows) {
                const deadPct = row.dead_row_pct || 0;
                const warning = deadPct > 20 ? ' ⚠️ HIGH DEAD ROWS — needs VACUUM' : '';
                this.logger.log(
                    `  ${row.table_name}: ${row.total_size} ` +
                    `(data: ${row.data_size}, idx: ${row.index_size}) ` +
                    `rows: ${row.live_rows}, dead: ${row.dead_rows} (${deadPct}%)${warning}`
                );
                if (deadPct > 20) totalWarnings++;
            }

            // Log daily growth rate
            const probRow = rows.find(r => r.table_name === 'probability_history');
            if (probRow) {
                const dailyGrowth = probRow.prob_history_daily_growth || 0;
                this.logger.log(`  📈 probability_history daily growth: ~${dailyGrowth} rows/day`);

                // Warn if growing faster than expected
                // 28 competitions × 1 point/3s = ~28 × 28800/day = ~806,400 rows/day MAX
                // With 15s intervals on 24h comps: ~28 × 5760/day = ~161,280 rows/day
                if (dailyGrowth > 200_000) {
                    this.logger.warn(
                        `⚠️ probability_history is growing at ${dailyGrowth} rows/day. ` +
                        `At ~700 bytes/row, that's ~${Math.round(dailyGrowth * 700 / (1024 * 1024))} MB/day. ` +
                        `Consider reducing curve engine tick frequency.`
                    );
                }
            }

            if (totalWarnings > 0) {
                this.logger.warn(`${totalWarnings} table(s) have high dead row percentages. Consider running VACUUM.`);
            }
        } catch (err: any) {
            this.logger.warn(`Storage health check error: ${err.message}`);
        }
    }

    // ════════════════════════════════════════════
    // Archive to Supabase Storage
    // ════════════════════════════════════════════

    /**
     * Archives old probability_history rows (with full metadata) to Supabase Storage
     * as JSON files before they get stripped/deleted from the database.
     * 
     * This preserves the full audit trail in cheap Storage (100 GB on Pro)
     * instead of expensive database disk (8 GB on Pro).
     */
    async archiveOldProbabilityHistory(): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        const cutoff = new Date(Date.now() - this.PROB_HISTORY_STRIP_HOURS * 60 * 60 * 1000);

        try {
            // Find settled competitions with unarchived data
            const { data: competitions } = await supabase
                .from('competitions')
                .select('id, sector, title')
                .in('status', ['settled', 'resolving']);

            if (!competitions || competitions.length === 0) return;

            for (const comp of competitions) {
                // Check if we already archived this competition's data
                const batchKey = `prob_history_${comp.id}_settled`;
                const { count } = await supabase
                    .from('archive_batches')
                    .select('id', { count: 'exact', head: true })
                    .eq('batch_key', batchKey);

                if (count && count > 0) continue; // Already archived

                // Fetch all probability_history for this settled competition
                // that still has metadata (hasn't been stripped yet)
                const { data: rows, error } = await supabase
                    .from('probability_history')
                    .select('*')
                    .eq('competition_id', comp.id)
                    .not('chaos_state', 'is', null)
                    .order('created_at', { ascending: true })
                    .limit(this.ARCHIVE_BATCH_SIZE);

                if (error || !rows || rows.length === 0) continue;

                // Create archive JSON
                const archiveData = {
                    competition_id: comp.id,
                    competition_title: comp.title,
                    sector: comp.sector,
                    archived_at: new Date().toISOString(),
                    row_count: rows.length,
                    data: rows.map(r => ({
                        id: r.id,
                        time_label: r.time_label,
                        home: r.home,
                        draw: r.draw,
                        away: r.away,
                        narrative: r.narrative,
                        regime: r.regime,
                        chaos_state: r.chaos_state,
                        signal_vector: r.signal_vector,
                        entropy_seed: r.entropy_seed,
                        source_fingerprint: r.source_fingerprint,
                        security_nonce: r.security_nonce,
                        data_sources: r.data_sources,
                        source_count: r.source_count,
                        created_at: r.created_at,
                    })),
                };

                const jsonStr = JSON.stringify(archiveData);
                const now = new Date();
                const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const storagePath = `probability_history/${yearMonth}/${comp.id}.json`;

                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from(this.STORAGE_BUCKET)
                    .upload(storagePath, jsonStr, {
                        contentType: 'application/json',
                        upsert: true,
                    });

                if (uploadError) {
                    this.logger.warn(`Failed to archive ${comp.id}: ${uploadError.message}`);
                    continue;
                }

                // Record the archive batch
                await supabase.from('archive_batches').insert({
                    table_name: 'probability_history',
                    batch_key: batchKey,
                    storage_path: storagePath,
                    row_count: rows.length,
                    original_size_bytes: Buffer.byteLength(jsonStr, 'utf8'),
                    date_range_start: rows[0].created_at,
                    date_range_end: rows[rows.length - 1].created_at,
                    status: 'completed',
                });

                this.logger.log(
                    `📦 Archived ${rows.length} probability_history rows for competition ${comp.id} ` +
                    `(${comp.sector}) → ${storagePath} (${Math.round(Buffer.byteLength(jsonStr, 'utf8') / 1024)} KB)`
                );
            }
        } catch (err: any) {
            this.logger.error(`Archive process failed: ${err.message}`);
        }
    }

    // ════════════════════════════════════════════
    // Database Cleanup (calls stored functions)
    // ════════════════════════════════════════════

    /**
     * Calls the master run_storage_optimization() PostgreSQL function
     * which handles all cleanup in a single DB round-trip.
     */
    async runDatabaseCleanup(): Promise<OptimizationResult | null> {
        const supabase = this.supabaseService.getAdminClient();

        try {
            const { data, error } = await supabase.rpc('run_storage_optimization', {
                p_prob_strip_hours: this.PROB_HISTORY_STRIP_HOURS,
                p_prob_delete_days: this.PROB_HISTORY_DELETE_DAYS,
                p_pred_cleanup_days: this.PRED_CLEANUP_DAYS,
                p_keep_per_competition: this.KEEP_PER_COMPETITION,
                p_run_vacuum: false,
            });

            if (error) {
                this.logger.error(`Database cleanup RPC failed: ${error.message}`);
                return null;
            }

            // RPC returns array of single row
            const result = Array.isArray(data) ? data[0] : data;
            return result as OptimizationResult;
        } catch (err: any) {
            this.logger.error(`Database cleanup failed: ${err.message}`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Manual Controls (for admin API)
    // ════════════════════════════════════════════

    /**
     * Trigger optimization manually (e.g., from admin dashboard)
     */
    async triggerOptimization(): Promise<OptimizationResult | null> {
        this.logger.log('⚡ Manual optimization triggered');
        await this.archiveOldProbabilityHistory();
        return await this.runDatabaseCleanup();
    }

    /**
     * Get current storage health status
     */
    async getStorageHealth(): Promise<StorageHealthRow[]> {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('storage_health_dashboard')
            .select('*');

        if (error || !data) return [];
        return data as StorageHealthRow[];
    }
}
