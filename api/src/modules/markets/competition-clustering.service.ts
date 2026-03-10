import { Injectable, Logger } from '@nestjs/common';
import { MultiSourceFusionService } from './multi-source-fusion.service.js';
import { CompetitionsService } from '../competitions/competitions.service.js';
import { computeTfIdf, kMeansClustering } from '../../common/utils/clustering.util.js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CompetitionClusteringService {
    private readonly logger = new Logger(CompetitionClusteringService.name);

    constructor(
        private readonly fusionService: MultiSourceFusionService,
        private readonly competitionsService: CompetitionsService,
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleDailyClustering() {
        this.logger.log('Running daily competition clustering...');
        const categories = ['finance', 'crypto', 'tech', 'politics', 'science', 'economy', 'sports', 'signals'];
        for (const cat of categories) {
            await this.evaluateAndClusterCategory(cat);
        }
    }

    /**
     * Fetch all sources for a category, cluster them via K-Means,
     * and spawn up to 15 distinct competitions to isolate their curves.
     */
    async evaluateAndClusterCategory(category: string): Promise<void> {
        this.logger.log(`Evaluating clusters for category: ${category}`);

        try {
            // Fetch raw collectors to get individual items
            const collectors = await this.fusionService.fetchRawCollectors(category);
            
            const allIds: string[] = [];
            const allTexts: string[] = [];
            
            for (const c of collectors) {
                for (let i = 0; i < c.ids.length; i++) {
                    allIds.push(c.ids[i]);
                    allTexts.push(c.texts[i]);
                }
            }

            if (allIds.length === 0) {
                this.logger.debug(`No sources found for ${category}. Skipping clustering.`);
                return;
            }

            // Determine K: Max 15 clusters, or roughly 1 cluster per 3-5 items
            const k = Math.min(15, Math.max(1, Math.ceil(allIds.length / 4)));
            this.logger.log(`Clustering ${allIds.length} sources into ${k} clusters for ${category}`);

            // Compute TF-IDF
            const vectors = computeTfIdf(allTexts);
            
            // Run K-Means
            const assignments = kMeansClustering(vectors, k);

            // Group IDs by cluster
            const clusters = new Map<number, string[]>();
            for (let i = 0; i < assignments.length; i++) {
                const clusterId = assignments[i];
                if (!clusters.has(clusterId)) {
                    clusters.set(clusterId, []);
                }
                clusters.get(clusterId)!.push(allIds[i]);
            }

            // Create competitions for each cluster
            let clusterCounter = 1;
            for (const [clusterId, sourceIds] of clusters.entries()) {
                if (sourceIds.length === 0) continue;

                // Attempt to generate a plausible name
                const title = `AI Agent Evaluation: ${category.charAt(0).toUpperCase() + category.slice(1)} Cluster ${clusterCounter}`;
                const description = `Dynamic probability market isolating ${sourceIds.length} specific data sources within the ${category} sector.`;

                // Set duration to 7 days
                const start = new Date();
                const end = new Date();
                end.setDate(end.getDate() + 7);

                try {
                    await this.competitionsService.create({
                        title,
                        description,
                        sector: category,
                        competition_start: start.toISOString(),
                        competition_end: end.toISOString(),
                        outcomes: ['Bullish', 'Neutral', 'Bearish'], // Default generic
                        probabilities: [3333, 3334, 3333],
                        prize_pool: Math.round(Math.random() * 10) + 1, // Random prize pool 1-10 SOL
                        tags: [category, 'ai-cluster', `cluster-${clusterCounter}`],
                        metadata: {
                            source_cluster_ids: sourceIds,
                            cluster_size: sourceIds.length,
                            auto_generated: true,
                        }
                    });
                    this.logger.log(`Created cluster-based competition for ${category} (Cluster ${clusterCounter}) with ${sourceIds.length} sources.`);
                } catch (e: any) {
                    this.logger.error(`Error creating competition for cluster ${clusterCounter}: ${e.message}`);
                }
                
                clusterCounter++;
            }

        } catch (error: any) {
            this.logger.error(`Failed to evaluate clusters for ${category}: ${error.message}`);
        }
    }
}
