/**
 * Agent Runner Service
 * 
 * Autonomous agent loop that periodically feeds real-time data to deployed
 * forecaster agents, calls Qwen for predictions, and stores results.
 * 
 * HORIZON-AWARE SCHEDULING:
 *   2h  competitions → agent predicts every 15s
 *   7h  competitions → agent predicts every 30s
 *   12h competitions → agent predicts every 5 min
 *   24h competitions → agent predicts every ~12.5 min
 * 
 * This eliminates ~90% of LLM token waste for longer competitions.
 * 
 * FREE USER LIMITS:
 *   - Max 3 LLM prompts total per agent
 *   - 1 prompt per competition (user selects which competition to predict on)
 *   - After exhaustion, agent is marked as 'exhausted'
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../../database/supabase.service.js';
import { QwenInferenceService, ForecasterInput } from './qwen-inference.service.js';
import { AgentEvaluationService } from './agent-evaluation.service.js';
import { LeaderboardScoringService } from '../../competitions/services/leaderboard-scoring.service.js';
import { getRefreshConfig } from '../../competitions/services/competition-manager.service.js';

/** Free users: max 3 LLM prompts total per agent, 1 per competition */
const MAX_FREE_PROMPTS = 3;

@Injectable()
export class AgentRunnerService {
    private readonly logger = new Logger(AgentRunnerService.name);
    private isRunning = false;

    /**
     * In-memory cooldown tracker: agentId → competitionId → last prediction timestamp.
     * Prevents redundant LLM calls when the horizon-specific interval hasn't elapsed.
     */
    private lastPredictionTimes = new Map<string, Map<string, number>>();

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
        private readonly qwenService: QwenInferenceService,
        private readonly evaluationService: AgentEvaluationService,
        private readonly scoringService: LeaderboardScoringService,
    ) { }

    /**
     * Base tick = 15 seconds (fastest horizon tier = 2h @ 15s).
     * Horizon-aware cooldowns inside runSingleAgent() ensure longer
     * competitions are NOT called on every tick.
     */
    @Cron('*/45 * * * * *')
    async runAgentLoop() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const supabase = this.supabaseService.getAdminClient();

            const { data: agents, error } = await supabase
                .from('agents')
                .select('*')
                .eq('status', 'active');

            if (error || !agents || agents.length === 0) {
                return;
            }

            this.logger.log(`🤖 Running agent loop for ${agents.length} active forecaster(s)`);

            // BEST PRACTICE 1: Serialized Agent Processing
            // Process agents one at a time to prevent thundering herd on LLM APIs.
            // With 3 concurrent agents each hitting multiple competitions,
            // all API tiers get rate-limited within seconds.
            const CONCURRENCY_LIMIT = 1;
            for (let i = 0; i < agents.length; i += CONCURRENCY_LIMIT) {
                const batch = agents.slice(i, i + CONCURRENCY_LIMIT);
                await Promise.allSettled(batch.map(async (agent) => {
                    try {
                        await this.runSingleAgent(agent);
                    } catch (err: any) {
                        this.logger.warn(`Agent ${agent.id} run failed: ${err.message}`);
                    }
                }));
                // Prevent micro-bursts between agents — 3s breathing room
                if (i + CONCURRENCY_LIMIT < agents.length) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        } catch (err: any) {
            this.logger.error(`Agent loop error: ${err.message}`);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Trigger an immediate run for a specific agent by ID (bypass cooldowns)
     */
    async runSingleAgentId(agentId: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        const { data: agent } = await supabase.from('agents').select('*').eq('id', agentId).single();
        if (agent) {
            try {
                this.logger.log(`⚡ Immediate run triggered for agent ${agentId}`);
                // Clear cooldowns so immediate run works
                this.lastPredictionTimes.delete(agentId);
                await this.runSingleAgent(agent);
            } catch (err: any) {
                this.logger.error(`Immediate run failed for agent ${agentId}: ${err.message}`);
            }
        }
    }

    /**
     * Run a single forecaster agent — with horizon-aware cooldowns
     */
    private async runSingleAgent(agent: any): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // ═══════════════════════════════════════════════════════════
        // FREE USER PROMPT BUDGET: Disabled for unlimited testing
        // ═══════════════════════════════════════════════════════════
        const remainingPrompts = 1000; // Allow 1000 predictions for live testing

        // Get ALL active competitions this agent is linked to
        const { data: entries } = await supabase
            .from('agent_competition_entries')
            .select('competition_id')
            .eq('agent_id', agent.id)
            .eq('status', 'active');

        if (!entries || entries.length === 0) {
            // Check if agent has EVER joined any competitions
            const { data: allEntries } = await supabase
                .from('agent_competition_entries')
                .select('id')
                .eq('agent_id', agent.id)
                .limit(1);

            if (allEntries && allEntries.length > 0) {
                // Agent has played, but no active competitions remain. It is officially terminated.
                this.logger.log(`☠ Agent ${agent.id} has no more active competitions (match completed). Auto-terminating.`);
                await supabase.from('agents').update({ status: 'terminated' }).eq('id', agent.id);
                return;
            }

            // Auto-join agent to active competitions (up to remaining prompt budget)
            const { data: comps } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end, time_horizon')
                .eq('status', 'active')
                .limit(remainingPrompts);

            if (!comps || comps.length === 0) return;

            for (const comp of comps) {
                await supabase.from('agent_competition_entries').upsert({
                    agent_id: agent.id,
                    competition_id: comp.id,
                    status: 'active',
                }, { onConflict: 'agent_id,competition_id', ignoreDuplicates: true });
            }
            
            // Generate bootstrap predictions — limit to 2 to avoid exhausting all API tiers at once.
            // Remaining competitions will be predicted on subsequent cron ticks.
            const MAX_BOOTSTRAP_PREDICTIONS = 2;
            let bootstrapCount = 0;
            for (const comp of comps) {
                if (bootstrapCount >= MAX_BOOTSTRAP_PREDICTIONS) break;
                const result = await this.generatePrediction(agent, comp);
                if (result === 'success') {
                    bootstrapCount++;
                    // Breathing room between bootstrap predictions
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            return;
        }

        // Pre-fetch all competition models and predictions to avert N+1 loops
        const activeCompIds = entries.map((e: any) => e.competition_id);
        
        let compsMap = new Map<string, any>();

        if (activeCompIds.length > 0) {
            // 1. Fetch competitions batch
            const { data: compsData } = await supabase
                .from('competitions')
                .select('id, title, description, sector, competition_end, status, time_horizon')
                .in('id', activeCompIds);
            
            if (compsData) {
                for (const c of compsData) compsMap.set(c.id, c);
            }
        }

        // Shuffle entries to ensure fairness
        const shuffledEntries = [...entries].sort(() => 0.5 - Math.random());
        
        let predictionMade = false;

        for (const entry of shuffledEntries) {
            if (predictionMade) break;

            // Fetch competition from cached map instead of N+1 DB hit
            const comp = compsMap.get(entry.competition_id);

            if (comp) {
                // Auto-terminate entry if competition has ended
                if (comp.status === 'settled' || comp.status === 'resolving') {
                    this.logger.log(`🏁 Competition ${comp.id} ended. Completing entry for agent ${agent.id}`);
                    await supabase.from('agent_competition_entries').update({ status: 'completed' }).eq('agent_id', agent.id).eq('competition_id', comp.id);
                    continue;
                }

                // ═══════════════════════════════════════════════
                // HORIZON-AWARE COOLDOWN WITH THUNDERING HERD PROTECTION
                // ═══════════════════════════════════════════════
                const horizon = comp.time_horizon || '24h';
                const refreshConfig = getRefreshConfig(horizon);
                const agentCooldowns = this.lastPredictionTimes.get(agent.id) || new Map<string, number>();
                const lastPredTime = agentCooldowns.get(comp.id) || 0;
                const elapsed = Date.now() - lastPredTime;

                // BEST PRACTICE 2: Execution Jittering
                // Add +/- 15% random time fluctuation. If 10 agents predicted at 10:00, they won't all perfectly
                // sync up again at exactly 10:05. They will naturally drift, flattening the API curve over time.
                const baseInterval = refreshConfig.agentPredictionIntervalMs;
                const jitter = baseInterval * 0.15 * (Math.random() - 0.5); 
                const actualInterval = baseInterval + jitter;

                if (lastPredTime > 0 && elapsed < actualInterval) {
                    continue;
                }

                const result = await this.generatePrediction(agent, comp);
                if (result === 'success') {
                    predictionMade = true;
                    agentCooldowns.set(comp.id, Date.now());
                    this.lastPredictionTimes.set(agent.id, agentCooldowns);
                    this.logger.log(`📊 Agent ${agent.id} generated prediction on competition ${comp.id}`);
                    // Inter-prediction breathing room to avoid exhausting all API tiers at once
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                // On failure, do NOT set predictionMade — let the agent try another competition this tick
            }
        }
    }

    /**
     * Generate a prediction for an agent-competition pair
     */
    private async generatePrediction(agent: any, competition: any): Promise<'skipped' | 'failed' | 'success'> {
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
            referenceProbability: baseRefProb,
            agentId: agent.id,
        };

        this.logger.log(`  🧠 Agent ${agent.id} → Qwen inference for "${competition.title}" [${horizon}]`);

        // Call Qwen
        let forecast: any = await this.qwenService.generateForecast(input);

        if (!forecast) {
            this.logger.warn(`  ⚠ Inference engine returned null for agent ${agent.id} (Limits reached for both Qwen & Groq). Skipping.`);
            return 'failed';
        }

        // Store the prediction
        await this.storePrediction(agent.id, competition.id, {
            probability: forecast.base_probability,
            reasoning: forecast.reasoning,
            curve: forecast.projected_curve,
        }, baseRefProb);

        this.logger.log(`  ✅ Agent ${agent.id} predicted ${(forecast.base_probability * 100).toFixed(1)}% for "${competition.title}" [${horizon}]`);
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
            if (error.message?.includes('Anti-chunking')) {
                this.logger.debug(`Supabase blocked concurrent prediction for agent ${agentId} (Anti-chunking guard)`);
            } else {
                this.logger.error(`Failed to store prediction for agent ${agentId}: ${error.message}`);
            }
            return;
        }

        if (inserted) {
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
            // Fetch any agent entries (even if active or completed) for settlement
            .in('status', ['active', 'completed', 'paused']);

        if (!entries || entries.length === 0) return;

        for (const entry of entries) {
            const score = await this.evaluationService.evaluateAgentPrediction(
                entry.agent_id,
                competitionId,
            );

            if (score !== null) {
                await supabase
                    .from('agent_competition_entries')
                    .update({ brier_score: score, status: 'evaluated' })
                    .eq('agent_id', entry.agent_id)
                    .eq('competition_id', competitionId);

                this.logger.log(`  📊 Agent ${entry.agent_id} Brier Score: ${score.toFixed(4)}`);
            }
        }

        // Write Final Ranks (Trophies) 🥇🥈🥉
        // Must fetch via the weighted leaderboard RPC
        const { data: leaderboard, error } = await supabase.rpc('get_weighted_leaderboard', {
            p_competition_id: competitionId,
            p_limit: 100
        });

        if (!error && leaderboard && leaderboard.length > 0) {
            for (let i = 0; i < leaderboard.length; i++) {
                const rankPos = leaderboard[i].rank_position;
                const agentId = leaderboard[i].agent_id;

                await supabase
                    .from('agent_competition_entries')
                    .update({ final_rank: rankPos })
                    .eq('agent_id', agentId)
                    .eq('competition_id', competitionId);
                    
                if (rankPos <= 3) {
                    this.logger.log(`  🏆 Agent ${agentId} ranked #${rankPos} in competition ${competitionId}`);
                }
            }
        }
    }
}
