/**
 * Realtime Competition Seeder Service
 * 
 * Automatically creates and maintains 5 live competitions per category
 * using real-time ETL data. Runs as a cron job every 5 minutes.
 * 
 * Flow:
 *   1. Check each category for available competition slots
 *   2. Query ETL data (market_data_items, market_signals, trending_topics)
 *   3. Generate competition titles from top newsworthy events
 *   4. Create competitions with varied time horizons
 *   5. Settle/expire completed competitions
 *   6. Notify curve engine to start streams for new competitions
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../database/supabase.service.js';
import { CompetitionManagerService } from './competition-manager.service.js';

const CATEGORIES = ['politics', 'finance', 'crypto', 'tech', 'economy', 'science', 'sports'] as const;

const HORIZON_OPTIONS = ['2h', '7h', '12h', '24h', '3d'] as const;

// Category-specific event templates for generating realistic competition titles
const CATEGORY_EVENT_TEMPLATES: Record<string, string[]> = {
    politics: [
        'Will {entity} announce new policy on {topic}?',
        '{topic}: Government decision outcome prediction',
        'Regulatory approval for {topic} within horizon?',
        'Political consensus on {topic} — likelihood assessment',
        'Will {entity} statement shift market sentiment on {topic}?',
    ],
    finance: [
        'Will {topic} index exceed target by end of horizon?',
        '{entity} earnings beat analyst consensus?',
        'Interest rate movement prediction: {topic}',
        'Bond yield direction for {topic} period',
        '{topic}: Market correction probability assessment',
    ],
    crypto: [
        'Will {entity} break resistance level within horizon?',
        '{topic}: DeFi protocol adoption milestone prediction',
        'Crypto regulatory news impact on {entity}',
        '{entity} price direction: {topic} catalyst',
        'Will {topic} trigger market-wide sentiment shift?',
    ],
    tech: [
        'Will {entity} product launch meet expectations?',
        '{topic}: Tech adoption rate prediction',
        '{entity} earnings vs analyst consensus',
        'Will {topic} regulation impact tech sector?',
        '{entity}: AI/ML milestone achievement probability',
    ],
    economy: [
        '{topic} economic indicator direction prediction',
        'GDP growth rate for {topic} quarter',
        'Unemployment data: {topic} forecast accuracy',
        'Inflation trend prediction: {topic}',
        'Trade balance shift: {topic} assessment',
    ],
    science: [
        'Will {topic} research achieve breakthrough milestone?',
        '{entity}: Clinical trial outcome prediction',
        '{topic} publication impact factor assessment',
        'Scientific consensus shift on {topic}?',
        '{entity}: Research funding approval probability',
    ],
    sports: [
        '{entity} match outcome prediction',
        'Will {entity} win by margin of 2+ goals?',
        '{topic}: Tournament progression prediction',
        '{entity} vs rival — draw probability',
        'Season points total: {entity} over/under prediction',
    ],
};

@Injectable()
export class RealtimeCompetitionSeederService {
    private readonly logger = new Logger(RealtimeCompetitionSeederService.name);
    private isSeeding = false;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly compManager: CompetitionManagerService,
    ) {}

    /**
     * Called on module init — initial seeding
     */
    async onModuleInit() {
        this.logger.log('🌱 RealtimeCompetitionSeeder initialized — will auto-seed competitions');
        // Delay initial seed to let other services start
        setTimeout(() => this.seedAllCategories(), 5000);
    }

    /**
     * Run every 5 minutes to maintain competition slots
     */
    @Cron('*/5 * * * *')
    async handleCron() {
        await this.seedAllCategories();
    }

    /**
     * Settle expired competitions every minute
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async settleExpired() {
        await this.settleExpiredCompetitions();
    }

    /**
     * Main seeding loop — ensures 5 competitions per category
     */
    async seedAllCategories(): Promise<void> {
        if (this.isSeeding) return;
        this.isSeeding = true;

        try {
            for (const category of CATEGORIES) {
                await this.seedCategory(category);
            }
        } catch (err: any) {
            this.logger.error(`Seeding error: ${err.message}`);
        } finally {
            this.isSeeding = false;
        }
    }

    /**
     * Seed a single category to fill up to 5 competition slots
     */
    private async seedCategory(category: string): Promise<void> {
        const slots = await this.compManager.getAvailableSlots(category);
        if (slots <= 0) return;

        this.logger.log(`🌱 Seeding ${slots} competition(s) for [${category}]`);

        // Fetch real-time data to generate competition topics
        const topics = await this.fetchTopicsFromETL(category, slots);

        for (let i = 0; i < Math.min(slots, topics.length); i++) {
            const topic = topics[i];
            const horizon = this.determineEventHorizon(topic.title, topic.description);

            try {
                const comp = await this.compManager.createCompetition(
                    category,
                    topic.title,
                    topic.description,
                    horizon,
                    topic.baseProbability,
                );

                if (comp) {
                    this.logger.log(`  ✅ Created: "${topic.title}" (${horizon}) in ${category}`);
                }
            } catch (err: any) {
                this.logger.warn(`  ❌ Failed to create competition: ${err.message}`);
            }
        }
    }

    /**
     * Intelligently analyze the event context to assign an appropriate duration automatically.
     * Matches the required time scale depending on urgency / horizon keywords.
     */
    private determineEventHorizon(title: string, desc: string): string {
        const text = (title + ' ' + desc).toLowerCase();
        
        // 1. Multi-day / Long-term signals (up to Max 7 Days)
        if (text.match(/\b(election|month|policy|bill|quarter|season|legislation|long-term|annual|weekly|tour|championship|campaign)\b/)) {
            const options = ['3d', '5d', '7d'];
            return options[Math.floor(Math.random() * options.length)];
        }

        // 2. Medium-term / Next Day signals 
        if (text.match(/\b(tomorrow|weekend|week|earnings|report|meeting|summit|conference|hearing|trial)\b/)) {
            const options = ['12h', '24h', '3d'];
            return options[Math.floor(Math.random() * options.length)];
        }

        // 3. Short-term / Breaking / Urgent signals
        if (text.match(/\b(tonight|today|breaking|urgent|live|match|game|speech|address|press|ongoing|immediate)\b/)) {
            const options = ['2h', '7h', '12h'];
            return options[Math.floor(Math.random() * options.length)];
        }

        // 4. Default automatic baseline for uncategorized news
        const defaults = ['7h', '12h', '24h', '3d'];
        return defaults[Math.floor(Math.random() * defaults.length)];
    }

    /**
     * Fetch top newsworthy topics from ETL data for competition generation
     */
    private async fetchTopicsFromETL(category: string, count: number): Promise<Array<{
        title: string;
        description: string;
        baseProbability: number;
    }>> {
        const supabase = this.supabaseService.getAdminClient();
        const topics: Array<{ title: string; description: string; baseProbability: number }> = [];

        try {
            // 1. Fetch recent high-impact market data items
            const { data: marketItems } = await supabase
                .from('market_data_items')
                .select('title, description, sentiment_score, impact, source_name, relevance_score')
                .eq('category', category)
                .eq('is_active', true)
                .in('impact', ['high', 'critical', 'medium'])
                .order('published_at', { ascending: false })
                .limit(15);

            // 2. Fetch market signals
            const { data: signals } = await supabase
                .from('market_signals')
                .select('title, description, signal_strength, sentiment, confidence_score')
                .eq('category', category)
                .eq('is_active', true)
                .order('signal_strength', { ascending: false })
                .limit(10);

            // 3. Fetch trending topics
            const { data: trending } = await supabase
                .from('trending_topics')
                .select('topic, trend_score, mention_count')
                .eq('is_active', true)
                .order('trend_score', { ascending: false })
                .limit(10);

            // Generate competition titles from real data
            const templates = CATEGORY_EVENT_TEMPLATES[category] || CATEGORY_EVENT_TEMPLATES.finance;
            const usedTitles = new Set<string>();

            // Priority 1: From market signals (highest quality)
            if (signals) {
                for (const sig of signals) {
                    if (topics.length >= count) break;
                    if (!sig.title || usedTitles.has(sig.title)) continue;

                    const sentiment = sig.sentiment === 'bullish' ? 0.6 : sig.sentiment === 'bearish' ? 0.4 : 0.5;
                    const confidence = sig.confidence_score || 0.5;
                    const baseProbability = Math.max(0.2, Math.min(0.8, sentiment * 0.6 + confidence * 0.4));

                    topics.push({
                        title: this.cleanTitle(sig.title, category),
                        description: sig.description || `Probability assessment for: ${sig.title}`,
                        baseProbability,
                    });
                    usedTitles.add(sig.title);
                }
            }

            // Priority 2: From market data items
            if (marketItems) {
                for (const item of marketItems) {
                    if (topics.length >= count) break;
                    if (!item.title || usedTitles.has(item.title)) continue;

                    const sentimentScore = item.sentiment_score || 0;
                    const baseProbability = Math.max(0.2, Math.min(0.8, 0.5 + sentimentScore * 0.2));

                    topics.push({
                        title: this.cleanTitle(item.title, category),
                        description: item.description || `Event forecasting: ${item.title}`,
                        baseProbability,
                    });
                    usedTitles.add(item.title);
                }
            }

            // Priority 3: From trending topics (fill remaining slots)
            if (trending) {
                for (const trend of trending) {
                    if (topics.length >= count) break;
                    if (!trend.topic || usedTitles.has(trend.topic)) continue;

                    const template = templates[topics.length % templates.length];
                    const title = template
                        .replace('{topic}', trend.topic)
                        .replace('{entity}', trend.topic);

                    topics.push({
                        title,
                        description: `Trending topic probability assessment: ${trend.topic} (${trend.mention_count || 0} mentions)`,
                        baseProbability: 0.5,
                    });
                    usedTitles.add(trend.topic);
                }
            }

        } catch (err: any) {
            this.logger.debug(`ETL topic fetch error for ${category}: ${err.message}`);
        }

        return topics.slice(0, count);
    }

    /**
     * Clean and shorten title for competition display
     */
    private cleanTitle(rawTitle: string, category: string): string {
        let title = rawTitle.trim();

        // Truncate to 120 chars
        if (title.length > 120) {
            title = title.substring(0, 117) + '...';
        }

        // If title doesn't end with '?', make it a question
        if (!title.endsWith('?')) {
            title = `${title} — outcome prediction?`;
        }

        return title;
    }

    /**
     * Settle competitions that have passed their end time
     */
    private async settleExpiredCompetitions(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();

            const { data: expired, error } = await supabase
                .from('competitions')
                .select('id, title, sector')
                .eq('status', 'active')
                .lt('competition_end', new Date().toISOString());

            if (error || !expired || expired.length === 0) return;

            for (const comp of expired) {
                await supabase
                    .from('competitions')
                    .update({ status: 'settled' })
                    .eq('id', comp.id);

                this.logger.log(`⏹ Settled expired competition: "${comp.title}" (${comp.sector})`);
            }

            // Also update upcoming → active for competitions that have started
            await supabase
                .from('competitions')
                .update({ status: 'active' })
                .eq('status', 'upcoming')
                .lte('competition_start', new Date().toISOString())
                .gt('competition_end', new Date().toISOString());

        } catch (err: any) {
            // Non-critical
            this.logger.debug(`Settle check error: ${err.message}`);
        }
    }

    /**
     * Fallback topic names per category
     */
    private getFallbackTopics(category: string): string[] {
        const fallbacks: Record<string, string[]> = {
            politics: ['US Policy Shift', 'EU Regulation Update', 'Trade Agreement', 'Election Forecast', 'Sanctions Decision'],
            finance: ['S&P 500 Direction', 'Fed Rate Decision', 'Tech Earnings', 'Bond Market', 'IPO Performance'],
            crypto: ['BTC Price Target', 'ETH Upgrade', 'DeFi TVL Growth', 'Regulatory Clarity', 'Stablecoin Dynamics'],
            tech: ['AI Advancement', 'Chip Supply Chain', 'Cloud Revenue', 'Product Launch', 'Tech Layoffs'],
            economy: ['GDP Growth Rate', 'Inflation Data', 'Jobs Report', 'Consumer Spending', 'Manufacturing PMI'],
            science: ['Clinical Trial Results', 'Space Mission', 'Climate Study', 'Quantum Computing', 'Gene Therapy'],
            sports: ['Premier League Match', 'NBA Finals', 'Champions League', 'Tennis Grand Slam', 'World Cup Qualifier'],
        };
        return fallbacks[category] || fallbacks.finance;
    }
}
