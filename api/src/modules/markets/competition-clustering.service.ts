import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiSourceFusionService } from './multi-source-fusion.service.js';
import { CompetitionsService } from '../competitions/competitions.service.js';
import { computeTfIdf, kMeansClustering } from '../../common/utils/clustering.util.js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CompetitionClusteringService {
    private readonly logger = new Logger(CompetitionClusteringService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly fusionService: MultiSourceFusionService,
        private readonly competitionsService: CompetitionsService,
    ) {
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleDailyClustering() {
        this.logger.log('Running daily competition clustering...');
        // Required quotas per category (Total: ~24)
        const categories = [
            { id: 'politics', target: 3 },
            { id: 'finance', target: 4 },
            { id: 'crypto', target: 4 },
            { id: 'tech', target: 3 },
            { id: 'economy', target: 3 },
            { id: 'science', target: 3 },
            { id: 'sports', target: 4 },
        ];
        
        for (const cat of categories) {
            await this.evaluateAndClusterCategory(cat.id, cat.target);
        }
    }

    /**
     * Fetch all sources for a category, cluster them via K-Means,
     * and spawn up to exactly target distinct competitions to isolate their curves.
     */
    async evaluateAndClusterCategory(category: string, targetAllowed: number): Promise<void> {
        this.logger.log(`Evaluating clusters for category: ${category} with target: ${targetAllowed}`);

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

            const activeComps = await this.competitionsService.findActive(category, 50);
            const currentCount = activeComps.length;
            
            if (currentCount >= targetAllowed) {
                this.logger.log(`Category ${category} already has ${currentCount} competitions (target ${targetAllowed}). Skipping new clustering.`);
                return;
            }

            // We need to generate enough to hit at least our target exactly.
            const neededToHitTarget = Math.max(0, targetAllowed - currentCount);
            const availableSlots = neededToHitTarget;

            // Force K clusters to match the required number exactly
            const k = Math.min(availableSlots > 0 ? availableSlots : 3, allIds.length);
            
            this.logger.log(`Clustering ${allIds.length} sources into ${k} clusters for ${category} (Generating: ${availableSlots} competitions)`);

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

            // Group texts by cluster for prompt generation
            const clusterTexts = new Map<number, string[]>();
            for (let i = 0; i < assignments.length; i++) {
                const clusterId = assignments[i];
                if (!clusterTexts.has(clusterId)) {
                    clusterTexts.set(clusterId, []);
                }
                clusterTexts.get(clusterId)!.push(allTexts[i]);
            }

            // Mathematical contexts to force structural distinctness across the 15 clusters
            const MATH_CONTEXTS = [
                'Extreme Short-Term Volatility & Chaos',
                'Strong Mean-Reversion Pressure',
                'Slow Macro-Economic Drift',
                'Asymmetric Risk (Sudden Crashes/Spikes)',
                'Bipolar Regime Switching',
                'High-Frequency Noise & Entropy',
                'Stable Trend-Following Momentum',
                'Structural Market Squeeze',
                'Mathematical Uncertainty & Micro-Structure Shocks'
            ];

            // Possible hours for competition duration strictly mapped: 2h, 7h, 12h, 24h, 3d (72h), 7d (168h)
            const DURATION_HOURS = [2, 7, 12, 24, 72, 168];

            const clusterIdsArray = Array.from(clusters.values());
            const clusterTextsArray = Array.from(clusterTexts.values());

            // Create exactly the required slots to hit the target quota
            let clusterCounter = 1;
            for (let i = 0; i < availableSlots; i++) {
                const clusterIndex = i % clusterIdsArray.length;
                const sourceIds = clusterIdsArray[clusterIndex];
                if (!sourceIds || sourceIds.length === 0) continue;

                // Extract keywords and generate algorithmic title
                const texts = clusterTextsArray[clusterIndex] || [];
                const mathContext = MATH_CONTEXTS[(clusterCounter - 1) % MATH_CONTEXTS.length];
                
                const { title, description } = this.generateAlgorithmicTitle(category, texts, mathContext, clusterCounter);

                // Assign real-time horizon strictly from our required choices
                const baseHours = DURATION_HOURS[Math.floor(Math.random() * DURATION_HOURS.length)];
                
                const start = new Date();
                const end = new Date();
                end.setHours(end.getHours() + baseHours);
                
                // Align to clean boundaries to match update frequencies naturally
                end.setMinutes(0);
                end.setSeconds(0);
                end.setMilliseconds(0);

                try {
                    await this.competitionsService.create({
                        title: `${title} - ${clusterCounter}`, // Ensure uniqueness
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
                            math_context: mathContext, // Important for Curve Engine
                            duration_category: baseHours <= 24 ? 'short-term' : 'long-term'
                        }
                    });
                    this.logger.log(`Created logical cluster competition for ${category}: "${title}" (Duration: ${baseHours}h).`);
                } catch (e: any) {
                    this.logger.error(`Error creating competition for cluster ${clusterCounter}: ${e.message}`);
                }
                
                clusterCounter++;
            }

        } catch (error: any) {
            this.logger.error(`Failed to evaluate clusters for ${category}: ${error.message}`);
        }
    }

    /**
     * Deterministic Algorithmic Title Generator
     * Extracts keywords and uses mathematical templates to forge systematic titles.
     */
    private generateAlgorithmicTitle(category: string, texts: string[], mathContext: string, clusterId: number): { title: string; description: string } {
        // Simple fast keyword extraction using regex (basic TF substitution)
        const wordCounts: Record<string, number> = {};
        const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'have', 'has']);
        
        texts.slice(0, 10).forEach(text => {
            const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
            words.forEach(w => {
                if (w.length > 3 && !stopWords.has(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        });

        const sortedKeywords = Object.entries(wordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(entry => entry[0].charAt(0).toUpperCase() + entry[0].slice(1));

        const keyString = sortedKeywords.length > 0 ? sortedKeywords.join(' - ') : `Data Node ${clusterId}`;
        const catUpper = category.charAt(0).toUpperCase() + category.slice(1);

        const title = `[${catUpper}] ${mathContext.split(' ')[0]} Probability: ${keyString}`;
        const description = `Algorithmic prediction market generated strictly from realtime clustered data. Mathematical Context applied: ${mathContext}. Target signals focus heavily on variables related to: ${keyString}. This curve is fully deterministic, physics-driven, and immune to simple scraping engines.`;

        return { title, description };
    }
}
