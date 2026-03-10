/**
 * Signals ETL Orchestrator
 * 
 * Aggregates signals from all other ETL pipelines.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BaseETLOrchestrator, ETLResult } from './base-etl.orchestrator.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class SignalsETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    constructor(private readonly messagingService: MarketMessagingService) {
        super('SignalsETLOrchestrator', 'signals');
        this.syncInterval = 5 * 60 * 1000; // 5 minutes
    }

    async onModuleInit() {
        this.logger.log('Signals ETL Orchestrator initialized');
        setTimeout(() => this.runSync(), 60000);
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async scheduledSync() {
        await this.runSync();
    }

    async sync(): Promise<ETLResult> {
        const startedAt = new Date();
        const errors: string[] = [];
        let recordsFetched = 0;
        let recordsCreated = 0;
        let recordsUpdated = 0;

        try {
            // Generate signals from high-impact items across all categories
            this.logger.debug('Generating signals from market data...');

            const signals = await this.generateSignals();
            recordsFetched = signals.length;

            for (const signal of signals) {
                try {
                    await this.supabase.from('market_signals').upsert({
                        signal_type: signal.type,
                        title: signal.title,
                        description: signal.description,
                        category: signal.category,
                        source_type: signal.source,
                        source_item_id: signal.sourceItemId,
                        signal_strength: signal.strength,
                        confidence_score: signal.confidence,
                        impact: signal.impact,
                        sentiment: signal.sentiment,
                        tags: signal.tags,
                    });
                    recordsCreated++;
                } catch (error) {
                    this.logger.warn(`Failed to insert signal: ${(error as Error).message}`);
                }
            }

            // Stream signals
            if (signals.length > 0) {
                await this.messagingService.publishMessage('signals', signals, 'signal_update');
            }

            // Update trending topics
            await this.updateTrendingTopics();

        } catch (error) {
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: 'signals',
            source: 'aggregator',
            startedAt,
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            recordsFetched,
            recordsCreated,
            recordsUpdated,
            recordsSkipped: 0,
            recordsFailed: 0,
            duplicatesFound: 0,
            errors,
        };
    }

    private async generateSignals(): Promise<any[]> {
        const signals: any[] = [];

        // Get high-impact items from last 24 hours
        const { data: items } = await this.supabase
            .from('market_data_items')
            .select('*')
            .in('impact', ['high', 'critical'])
            .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('published_at', { ascending: false })
            .limit(50);

        if (!items) return signals;

        for (const item of items) {
            signals.push({
                type: 'trend',
                title: item.title,
                description: item.description,
                category: item.category,
                source: item.source,
                sourceItemId: item.id,
                strength: item.relevance_score || 0.5,
                confidence: 0.7,
                impact: item.impact,
                sentiment: item.sentiment,
                tags: item.tags,
            });
        }

        return signals;
    }

    private async updateTrendingTopics() {
        try {
            // Get tag frequency from last 24 hours
            const { data: items } = await this.supabase
                .from('market_data_items')
                .select('tags, category')
                .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (!items) return;

            const topicCounts: Record<string, { count: number; categories: Set<string> }> = {};

            for (const item of items) {
                for (const tag of item.tags || []) {
                    if (!topicCounts[tag]) {
                        topicCounts[tag] = { count: 0, categories: new Set() };
                    }
                    topicCounts[tag].count++;
                    topicCounts[tag].categories.add(item.category);
                }
            }

            const now = new Date();
            const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            for (const [topic, data] of Object.entries(topicCounts)) {
                if (data.count >= 3) {
                    await this.supabase.from('trending_topics').upsert({
                        topic,
                        normalized_topic: topic.toLowerCase().replace(/[^a-z0-9]/g, ''),
                        categories: Array.from(data.categories),
                        primary_category: Array.from(data.categories)[0],
                        mention_count: data.count,
                        trend_score: Math.min(1, data.count / 50),
                        window_start: windowStart.toISOString(),
                        window_end: now.toISOString(),
                        window_type: '24h',
                    }, {
                        onConflict: 'normalized_topic,window_start,window_type',
                    });
                }
            }
        } catch (error) {
            this.logger.warn(`Failed to update trending topics: ${(error as Error).message}`);
        }
    }
}
