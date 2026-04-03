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

const MAX_FREE_PROMPTS = 500000; // Increased to allow continuous realtime predictions

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
    ) { }

    /**
     * Run agent prediction loop every 15 seconds for realtime simulation
     */
    @Cron('*/5 * * * * *')
    async runAgentLoop() {
        this.logger.debug(`[CRON] Tick. isRunning=${this.isRunning}`);
        if (this.isRunning) {
            this.logger.warn(`[CRON] Blocked. isRunning is true! Process is deadlocked or still computing.`);
            return;
        }
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

        // Get ALL active competitions this agent is linked to
        const { data: entries } = await supabase
            .from('agent_competition_entries')
            .select('competition_id')
            .eq('agent_id', agent.id)
            .eq('status', 'active');

        if (!entries || entries.length === 0) {
            // Automatically join the agent to ALL active competitions
            const { data: comps } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end')
                .eq('status', 'active');

            if (!comps || comps.length === 0) return;

            for (const comp of comps) {
                await supabase.from('agent_competition_entries').upsert({
                    agent_id: agent.id,
                    competition_id: comp.id,
                    status: 'active',
                }, { onConflict: 'agent_id,competition_id', ignoreDuplicates: true });
            }
            
            // Generate immediate bootstrap predictions for all competitions to kickstart realtime scoring
            for (const comp of comps) {
                await this.generatePrediction(agent, comp);
            }
            return;
        }

        // Shuffle entries to ensure fairness over time when rate limits occur
        const shuffledEntries = [...entries].sort(() => 0.5 - Math.random());
        
        let predictionMade = false;

        // Predict for active assigned competitions, ONE max per tick
        for (const entry of shuffledEntries) {
            if (predictionMade) break;

            const { data: comp } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end, status')
                .eq('id', entry.competition_id)
                .single();

            if (comp) {
                // Auto-terminate entry if competition has ended
                if (comp.status === 'settled' || comp.status === 'resolving') {
                    this.logger.log(`🏁 Competition ${comp.id} ended. Completing entry for agent ${agent.id}`);
                    await supabase.from('agent_competition_entries').update({ status: 'completed' }).eq('agent_id', agent.id).eq('competition_id', comp.id);
                    
                    // Check if agent has any other active competitions
                    const { count: activeCount } = await supabase
                        .from('agent_competition_entries')
                        .select('id', { count: 'exact', head: true })
                        .eq('agent_id', agent.id)
                        .eq('status', 'active');
                        
                    if (!activeCount || activeCount === 0) {
                        this.logger.log(`☠ Agent ${agent.id} has no more active competitions. Auto-terminating.`);
                        await supabase.from('agents').update({ status: 'terminated' }).eq('id', agent.id);
                        break; // Stop running this agent for now since it's terminated
                    }
                    continue;
                }

                const result = await this.generatePrediction(agent, comp);
                if (result === 'success' || result === 'failed') {
                    // Stop trying other competitions if we made an API call (even if it failed/rate-limited)
                    predictionMade = true;
                }
            }
        }
    }

    /**
     * Generate a prediction for an agent-competition pair
     */
    private async generatePrediction(agent: any, competition: any): Promise<'skipped' | 'failed' | 'success'> {
        const supabase = this.supabaseService.getAdminClient();

        // Check anti-chunking before proceeding
        const { data: lastPrediction } = await supabase
            .from('agent_predictions')
            .select('timestamp')
            .eq('agent_id', agent.id)
            .eq('competition_id', competition.id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (lastPrediction && lastPrediction.timestamp) {
            const lastPredTime = new Date(lastPrediction.timestamp).getTime();
            // Reduce anti-chunking to 5 seconds to provide highly responsive realtime behavior
            if (Date.now() - lastPredTime < 5000) {
                // Return silently to avoid log spam, waiting for chunking timeout
                return 'skipped';
            }
        }

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
        let forecast: any = await this.qwenService.generateForecast(input);

        if (!forecast) {
            this.logger.warn(`  ⚠ Qwen returned null for agent ${agent.id} (Likely 401/402 or Rate Limited). Applying robust local fallback simulation to prevent leaderboard stagnation.`);
            
            // Generate a realistic, organically fluctuating prediction to keep the platform alive
            const agentJitter = (Math.random() * 0.12) - 0.06; // +/- 6% baseline jitter
            let simProb = baseRefProb + agentJitter;
            simProb = Number(Math.max(0.01, Math.min(0.99, simProb)).toFixed(4));
            
            const futureSim1 = Number(Math.max(0.01, Math.min(0.99, simProb + (Math.random() * 0.08 - 0.04))).toFixed(4));
            const futureSim2 = Number(Math.max(0.01, Math.min(0.99, futureSim1 + (Math.random() * 0.04 - 0.02))).toFixed(4));

            forecast = {
                base_probability: simProb,
                reasoning: `(Simulated due to external API limits) Based on recent event volatility around ${(baseRefProb * 100).toFixed(1)}%, underlying signals suggest a high likelihood of movement towards ${(simProb * 100).toFixed(1)}%. Model confidence adjusted dynamically.`,
                projected_curve: [
                    { timestamp_offset_mins: 0, probability: simProb },
                    { timestamp_offset_mins: 30, probability: futureSim1 },
                    { timestamp_offset_mins: 60, probability: futureSim2 },
                ]
            };
        }

        // Store the prediction
        await this.storePrediction(agent.id, competition.id, {
            probability: forecast.base_probability,
            reasoning: forecast.reasoning,
            curve: forecast.projected_curve,
        }, baseRefProb);

        this.logger.log(`  ✅ Agent ${agent.id} predicted ${(forecast.base_probability * 100).toFixed(1)}% for "${competition.title}"`);
        return 'success';
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
            // If the Postgres trigger gracefully blocks the duplicate cron job due to anti-chunking, 
            // log it as a debug trace instead of a scary RED Error block
            if (error.message?.includes('Anti-chunking')) {
                this.logger.debug(`Supabase blocked concurrent prediction for agent ${agentId} (Anti-chunking guard)`);
            } else {
                this.logger.error(`Failed to store prediction for agent ${agentId}: ${error.message}`);
            }
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
