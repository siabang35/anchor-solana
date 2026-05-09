import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';
import { CurveGeneratorService, Signal } from './curve-generator.service.js';

@Injectable()
export class EtlIngestionService {
    private readonly logger = new Logger(EtlIngestionService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly curveGenerator: CurveGeneratorService,
    ) {}

    /**
     * Process an incoming cluster of news from the ETL pipeline.
     * UPDATED: This service no longer creates competitions independently.
     * It only updates existing competitions created by the Seeder.
     */
    async processCluster(category: string, articles: any[], title: string, signals: Signal[], horizon: string = '24h') {
        try {
            // 1. Anti-manipulation: Deduplicate and weight articles
            const uniqueArticles = AntiManipulationUtil.deduplicateCluster(articles);
            const weightedArticles = AntiManipulationUtil.filterAndWeightSignals(uniqueArticles);

            if (weightedArticles.length < 3) {
                this.logger.warn(`Cluster for ${title} has too few valid articles. Skipping.`);
                return null;
            }

            const supabase = this.supabaseService.getAdminClient();

            // 2. Find the active competition matching this title dynamically.
            // Since the seeder appends suffixes like "— outcome prediction?", we cannot exact match.
            const { data: activeComps } = await supabase
                .from('competitions')
                .select('id, title')
                .eq('sector', category.toLowerCase())
                .eq('status', 'active');

            let competitionId = null;

            if (activeComps && activeComps.length > 0) {
                const normalizedEtlTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const comp of activeComps) {
                    const normalizedDbTitle = comp.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (normalizedDbTitle.includes(normalizedEtlTitle) || normalizedEtlTitle.includes(normalizedDbTitle)) {
                        competitionId = comp.id;
                        break;
                    }
                }
            }

            if (!competitionId) {
                this.logger.debug(`No active competition matches ETL cluster "${title}". Skipping update.`);
                return null;
            }

            // 3. Save the news cluster
            const clusterData = { title, articles: weightedArticles.map(a => a.url) };
            const clusterHash = AntiManipulationUtil.hashSnapshot(clusterData);

            // Calculate dynamic sentiment from ACTUAL NLP signals
            let avgSentiment = 0;
            if (signals && signals.length > 0) {
                const totalSentiment = (signals as any[]).reduce((sum, s) => {
                    if (s.sentiment !== undefined) return sum + s.sentiment;
                    // fallback derivation if no sentiment is provided
                    if (s.impact === 'high') return sum + 0.5;
                    if (s.impact === 'low') return sum - 0.3;
                    return sum + ((Math.random() * 0.4) - 0.2);
                }, 0);
                avgSentiment = totalSentiment / signals.length;
            }

            const { data: newCluster, error: clusterError } = await supabase.from('news_clusters').insert({
                competition_id: competitionId,
                cluster_hash: clusterHash,
                article_urls: weightedArticles.map(a => a.url),
                signals,
                sentiment: avgSentiment
            }).select('id').single();

            if (clusterError || !newCluster) {
                this.logger.warn(`Skipping identical cluster update for ${title}`);
                return null;
            }

            // 4. Update probability curve based on new signals
            await this.curveGenerator.generateCurveSnapshot(
                competitionId,
                newCluster.id,
                signals,
                horizon
            );

            this.logger.log(`✅ Successfully attached ETL cluster updates to existing event: ${title}`);
            return true;

        } catch (error: any) {
            this.logger.error(`Failed to process ETL cluster: ${error.message}`);
            return null;
        }
    }
}
