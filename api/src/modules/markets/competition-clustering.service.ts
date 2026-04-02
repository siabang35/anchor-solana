import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiSourceFusionService } from './multi-source-fusion.service.js';
import { computeTfIdf, kMeansClustering } from '../../common/utils/clustering.util.js';

/**
 * Competition Clustering Service
 * 
 * NOW a pure utility — no longer creates competitions directly.
 * Called by RealtimeCompetitionSeederService to get clustered topics
 * from the multi-source fusion ETL pipeline.
 * 
 * REMOVED: @Cron daily job (was causing duplicate competitions).
 */

export interface ClusteredTopic {
    title: string;
    description: string;
    keywords: string[];
    sourceIds: string[];
    clusterSize: number;
    urgencyScore: number; // 0-1, higher = more urgent/breaking
}

@Injectable()
export class CompetitionClusteringService {
    private readonly logger = new Logger(CompetitionClusteringService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly fusionService: MultiSourceFusionService,
    ) {}

    /**
     * Fetch raw ETL data for a category, cluster via TF-IDF + K-Means,
     * and return the top clustered topics WITHOUT creating competitions.
     * 
     * The caller (RealtimeCompetitionSeederService) is responsible for
     * assigning horizons and creating competitions.
     */
    async getClusteredTopics(category: string, count: number): Promise<ClusteredTopic[]> {
        this.logger.log(`Clustering topics for category: ${category} (need ${count})`);

        try {
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
                this.logger.debug(`No ETL sources found for ${category}. Returning empty.`);
                return [];
            }

            // Cluster with k slightly larger than needed for better diversity
            const k = Math.min(count + 2, allIds.length);

            this.logger.log(`Clustering ${allIds.length} sources into ${k} clusters for ${category}`);

            const vectors = computeTfIdf(allTexts);
            const assignments = kMeansClustering(vectors, k);

            // Group by cluster
            const clusterMap = new Map<number, { ids: string[], texts: string[] }>();
            for (let i = 0; i < assignments.length; i++) {
                const clusterId = assignments[i];
                if (!clusterMap.has(clusterId)) {
                    clusterMap.set(clusterId, { ids: [], texts: [] });
                }
                const cluster = clusterMap.get(clusterId)!;
                cluster.ids.push(allIds[i]);
                cluster.texts.push(allTexts[i]);
            }

            // Extract best topic per cluster
            const topics: ClusteredTopic[] = [];
            for (const [, cluster] of clusterMap) {
                if (topics.length >= count) break;

                const { title, description, keywords } = this.extractClusterTopic(cluster.texts, category);
                const urgencyScore = this.computeUrgencyScore(cluster.texts);

                topics.push({
                    title,
                    description,
                    keywords,
                    sourceIds: cluster.ids,
                    clusterSize: cluster.ids.length,
                    urgencyScore,
                });
            }

            // Sort by cluster size (larger clusters = more significant topics)
            topics.sort((a, b) => b.clusterSize - a.clusterSize);

            return topics.slice(0, count);

        } catch (error: any) {
            this.logger.error(`Failed to cluster topics for ${category}: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract a representative topic title from cluster texts.
     */
    private extractClusterTopic(texts: string[], category: string): { title: string; description: string; keywords: string[] } {
        const wordCounts: Record<string, number> = {};
        const stopWords = new Set([
            'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were',
            'have', 'has', 'been', 'will', 'would', 'could', 'should', 'about', 'into',
            'than', 'then', 'also', 'just', 'more', 'some', 'other', 'what', 'when',
            'which', 'their', 'there', 'these', 'those', 'after', 'before', 'between',
            'under', 'over', 'such', 'each', 'every', 'both', 'through', 'during',
        ]);

        // Count word frequencies across all texts in the cluster
        texts.slice(0, 15).forEach(text => {
            const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
            words.forEach(w => {
                if (w.length > 3 && !stopWords.has(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        });

        const sortedKeywords = Object.entries(wordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0].charAt(0).toUpperCase() + entry[0].slice(1));

        const keywords = sortedKeywords.slice(0, 3);
        const keyString = keywords.length > 0 ? keywords.join(', ') : `${category} event`;

        // Use the first text (most representative) as the base, truncated
        let baseTitle = texts[0] || keyString;
        if (baseTitle.length > 100) {
            baseTitle = baseTitle.substring(0, 97) + '...';
        }

        // If the base title doesn't end with a question mark, make it a prediction question
        if (!baseTitle.endsWith('?')) {
            baseTitle = `${baseTitle} — outcome prediction?`;
        }

        const description = `AI prediction market: ${keyString}. Cluster of ${texts.length} real-time data sources. Keywords: ${sortedKeywords.join(', ')}.`;

        return { title: baseTitle, description, keywords };
    }

    /**
     * Compute urgency score for a cluster based on keyword presence.
     * Higher score = more urgent/breaking = should get shorter horizon.
     */
    private computeUrgencyScore(texts: string[]): number {
        const combined = texts.join(' ').toLowerCase();

        let score = 0.5; // baseline

        // High-urgency keywords → push toward shorter horizons
        const urgentKeywords = ['breaking', 'urgent', 'live', 'tonight', 'today', 'speech', 'press', 'ongoing', 'immediate', 'crash', 'surge', 'alert'];
        const mediumKeywords = ['tomorrow', 'week', 'earnings', 'report', 'meeting', 'summit', 'conference', 'hearing', 'trial', 'announce'];
        const longKeywords = ['election', 'policy', 'bill', 'quarter', 'season', 'legislation', 'annual', 'campaign', 'long-term', 'monthly', 'yearly'];

        for (const kw of urgentKeywords) {
            if (combined.includes(kw)) score += 0.08;
        }
        for (const kw of mediumKeywords) {
            if (combined.includes(kw)) score -= 0.03;
        }
        for (const kw of longKeywords) {
            if (combined.includes(kw)) score -= 0.08;
        }

        return Math.max(0, Math.min(1, score));
    }
}
