import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';
import { CurveGeneratorService, Signal } from './curve-generator.service.js';
import { CompetitionManagerService } from './competition-manager.service.js';

@Injectable()
export class EtlIngestionService {
    private readonly logger = new Logger(EtlIngestionService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly curveGenerator: CurveGeneratorService,
        private readonly compManager: CompetitionManagerService
    ) {}

    /**
     * Process an incoming cluster of news from the ETL pipeline
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

            // 2. Check if there's an active competition matching this event
            // Note: For simplicity, we assume one ongoing event per major cluster title.
            // In a real system, we'd use embedding similarity to match existing competitions.
            let { data: existingComp } = await supabase
                .from('competitions')
                .select('*')
                .eq('title', title)
                .eq('status', 'active')
                .single();

            let competitionId;

            if (existingComp) {
                competitionId = existingComp.id;
            } else {
                // 3. New event: Check category quota
                const slots = await this.compManager.getAvailableSlots(category);
                if (slots <= 0) {
                    this.logger.log(`Category ${category} full. Cannot create competition for: ${title}`);
                    return null;
                }

                // 4. Create new competition
                // Base probability uses Bayesian prior or default 0.5
                const newComp = await this.compManager.createCompetition(category, title, `Event forecasting for ${title}`, horizon, 0.5);
                if (!newComp) return null;
                competitionId = newComp.id;
            }

            // 5. Save the news cluster
            // Hash the articles URLs and content for immutability
            const clusterData = { title, articles: weightedArticles.map(a => a.url) };
            const clusterHash = AntiManipulationUtil.hashSnapshot(clusterData);

            const { data: newCluster, error: clusterError } = await supabase.from('news_clusters').insert({
                competition_id: competitionId,
                cluster_hash: clusterHash,
                article_urls: weightedArticles.map(a => a.url),
                signals,
                sentiment: 0 // Could calculate average sentiment
            }).select('id').single();

            if (clusterError || !newCluster) {
                // Might be a duplicate cluster hash
                this.logger.warn(`Skipping identical cluster update for ${title}`);
                return null;
            }

            // 6. Update probability curve based on new signals
            await this.curveGenerator.generateCurveSnapshot(
                competitionId,
                newCluster.id,
                signals,
                horizon
            );

            this.logger.log(`Successfully processed ETL cluster for: ${title}`);
            return true;

        } catch (error: any) {
            this.logger.error(`Failed to process ETL cluster: ${error.message}`);
            return null;
        }
    }
}
