/**
 * Agent Runner Service
 * 
 * Autonomous agent loop that periodically feeds real-time data to deployed
 * forecaster agents, calls Qwen for predictions, and stores results.
 * 
 * Runs every 10 minutes for all active forecaster agents.
 * Tracks prompt usage (max 7 for free users).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../../database/supabase.service.js';
import { QwenInferenceService, ForecasterInput } from './qwen-inference.service.js';
import { AgentEvaluationService } from './agent-evaluation.service.js';
import { LeaderboardScoringService } from '../../competitions/services/leaderboard-scoring.service.js';

const MAX_FREE_PROMPTS = 7;

@Injectable()
export class AgentRunnerService {
    private readonly logger = new Logger(AgentRunnerService.name);
    private isRunning = false;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
        private readonly qwenService: QwenInferenceService,
        private readonly evaluationService: AgentEvaluationService,
        private readonly scoringService: LeaderboardScoringService,
    ) {}

    /**
     * Run agent prediction loop every 10 minutes
     */
    @Cron('*/10 * * * *')
    async runAgentLoop() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const supabase = this.supabaseService.getAdminClient();

            // Fetch all active forecaster agents
            const { data: agents, error } = await supabase
                .from('agents')
                .select('*')
                .eq('status', 'active');

            if (error || !agents || agents.length === 0) {
                return;
            }

            this.logger.log(`🤖 Running agent loop for ${agents.length} active forecaster(s)`);

            for (const agent of agents) {
                try {
                    await this.runSingleAgent(agent);
                } catch (err: any) {
                    this.logger.warn(`Agent ${agent.id} run failed: ${err.message}`);
                }
            }
        } catch (err: any) {
            this.logger.error(`Agent loop error: ${err.message}`);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Trigger an immediate run for a specific agent by ID (used on deployment to avoid 10 min wait)
     */
    async runSingleAgentId(agentId: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        const { data: agent } = await supabase.from('agents').select('*').eq('id', agentId).single();
        if (agent) {
            try {
                this.logger.log(`⚡ Immediate run triggered for agent ${agentId}`);
                await this.runSingleAgent(agent);
            } catch (err: any) {
                this.logger.error(`Immediate run failed for agent ${agentId}: ${err.message}`);
            }
        }
    }

    /**
     * Run a single forecaster agent
     */
    private async runSingleAgent(agent: any): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Check prompt usage limit
        const { count: promptCount } = await supabase
            .from('agent_predictions')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id);

        if ((promptCount || 0) >= MAX_FREE_PROMPTS) {
            this.logger.debug(`Agent ${agent.id} has used all ${MAX_FREE_PROMPTS} free prompts`);
            // Auto-pause agent that has exhausted prompts
            await supabase
                .from('agents')
                .update({ status: 'exhausted' })
                .eq('id', agent.id);
            return;
        }

        // Get the competition this agent is linked to
        const { data: entry } = await supabase
            .from('agent_competition_entries')
            .select('competition_id')
            .eq('agent_id', agent.id)
            .eq('status', 'active')
            .limit(1)
            .single();

        if (!entry) {
            // Try to find any active competition matching this agent
            const { data: comp } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end')
                .eq('status', 'active')
                .order('competition_end', { ascending: true })
                .limit(1)
                .single();

            if (!comp) return;

            // Auto-register the agent to this competition
            await supabase.from('agent_competition_entries').upsert({
                agent_id: agent.id,
                competition_id: comp.id,
                status: 'active',
            }, { onConflict: 'agent_id,competition_id', ignoreDuplicates: true });

            await this.generatePrediction(agent, comp);
        } else {
            // Fetch competition details
            const { data: comp } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end, status')
                .eq('id', entry.competition_id)
                .single();

            if (comp) {
                // Auto-terminate if competition has ended
                if (comp.status === 'settled' || comp.status === 'resolving') {
                    this.logger.log(`🏁 Competition ${comp.id} ended. Terminating agent ${agent.id}`);
                    await supabase.from('agents').update({ status: 'terminated' }).eq('id', agent.id);
                    await supabase.from('agent_competition_entries').update({ status: 'completed' }).eq('agent_id', agent.id).eq('competition_id', comp.id);
                    return;
                }

                await this.generatePrediction(agent, comp);
            }
        }
    }

    /**
     * Generate a prediction for an agent-competition pair
     */
    private async generatePrediction(agent: any, competition: any): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Fetch latest curve probability for live scoring reference
        const { data: latestProb } = await supabase
            .from('probability_history')
            .select('home, draw, away')
            .eq('competition_id', competition.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let baseRefProb = 0.5;
        if (latestProb && latestProb.home !== undefined) {
            baseRefProb = Number(latestProb.home) / 100;
        } else if (competition.probabilities && competition.probabilities.length > 0) {
            baseRefProb = Number(competition.probabilities[0]) / 10000;
        }

        // Fetch latest news cluster for this competition's category
        const { data: newsItems } = await supabase
            .from('market_data_items')
            .select('title, description, source_name, sentiment_score, impact, published_at, url')
            .eq('category', competition.sector)
            .eq('is_active', true)
            .order('published_at', { ascending: false })
            .limit(20);

        // Fetch market signals
        const { data: marketSignals } = await supabase
            .from('market_signals')
            .select('title, signal_strength, sentiment, confidence_score')
            .eq('category', competition.sector)
            .eq('is_active', true)
            .order('signal_strength', { ascending: false })
            .limit(10);

        // Build input for Qwen
        const horizon = competition.time_horizon || '24h';
        const input: ForecasterInput = {
            eventTitle: competition.title,
            description: competition.description || '',
            horizon,
            newsCluster: (newsItems || []).map(n => ({
                title: n.title,
                content: n.description,
                url: n.url,
                source: n.source_name,
                sentiment: n.sentiment_score,
                impact: n.impact,
            })),
            marketSignals: marketSignals || [],
        };

        // Combine agent's system prompt with competition context
        const agentPromptOverride = agent.system_prompt || '';

        this.logger.log(`  🧠 Agent ${agent.id} → Qwen inference for "${competition.title}"`);

        // Call Qwen
        const forecast = await this.qwenService.generateForecast(input);

        if (!forecast) {
            this.logger.warn(`  ⚠ Qwen returned null for agent ${agent.id}`);
            // Store a fallback prediction
            await this.storePrediction(agent.id, competition.id, {
                probability: 0.5,
                reasoning: 'Inference unavailable — default neutral prediction',
                curve: [{ timestamp_offset_mins: 0, probability: 0.5 }],
            }, baseRefProb);
            return;
        }

        // Store the prediction
        await this.storePrediction(agent.id, competition.id, {
            probability: forecast.base_probability,
            reasoning: forecast.reasoning,
            curve: forecast.projected_curve,
        }, baseRefProb);

        this.logger.log(`  ✅ Agent ${agent.id} predicted ${(forecast.base_probability * 100).toFixed(1)}% for "${competition.title}"`);
    }

    /**
     * Store a prediction in the database and immediately score it against the live curve
     */
    private async storePrediction(agentId: string, competitionId: string, data: {
        probability: number;
        reasoning: string;
        curve: Array<{ timestamp_offset_mins: number; probability: number }>;
    }, currentCurveProb: number): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        const { data: inserted, error } = await supabase.from('agent_predictions').insert({
            agent_id: agentId,
            competition_id: competitionId,
            probability: data.probability,
            reasoning: data.reasoning,
            projected_curve: data.curve,
            timestamp: new Date().toISOString(),
        }).select('id').single();

        if (error) {
            this.logger.error(`Failed to store prediction for agent ${agentId}: ${error.message}`);
            return;
        }

        if (inserted) {
            // Live score the prediction immediately against the current curve
            // For binary events, probability is P(Yes). So the [Yes, No] vector is [P, 1-P].
            const predictedProbs = [data.probability, 1 - data.probability];
            const referenceProbs = [currentCurveProb, 1 - currentCurveProb];
            
            await this.scoringService.scorePrediction(
                agentId,
                competitionId,
                inserted.id,
                predictedProbs,
                referenceProbs
            );
        }
    }

    /**
     * Evaluate all agents for a settled competition
     */
    async evaluateCompetitionAgents(competitionId: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        const { data: entries } = await supabase
            .from('agent_competition_entries')
            .select('agent_id')
            .eq('competition_id', competitionId)
            .eq('status', 'active');

        if (!entries) return;

        for (const entry of entries) {
            const score = await this.evaluationService.evaluateAgentPrediction(
                entry.agent_id,
                competitionId,
            );

            if (score !== null) {
                // Store the final Brier score
                await supabase
                    .from('agent_competition_entries')
                    .update({ brier_score: score, status: 'evaluated' })
                    .eq('agent_id', entry.agent_id)
                    .eq('competition_id', competitionId);

                this.logger.log(`  📊 Agent ${entry.agent_id} Brier Score: ${score.toFixed(4)}`);
            }
        }
    }
}
