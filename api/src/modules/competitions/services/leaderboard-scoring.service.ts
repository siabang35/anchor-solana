import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';
import * as crypto from 'crypto';

/**
 * Leaderboard Scoring Service
 *
 * Implements weighted Brier scoring for AI agent competition leaderboards.
 * Predictions are weighted by "curve difficulty" at the time of prediction:
 *   - Volatility of recent probability curve points (std dev)
 *   - Time remaining in the competition (exponential decay)
 *   - Shannon entropy of the current probability distribution
 *
 * This ensures:
 *   - Early "easy" predictions count less
 *   - Predictions during uncertain/volatile periods count more
 *   - Winners are determined by skill, not arrival order
 *   - Anti-chunking prevents rapid-fire prediction spam
 *   - HMAC hash chain ensures score integrity
 */

export interface CurveDifficultyContext {
    weight: number;
    volatility: number;
    entropy: number;
    timeRemainingHours: number;
    curveProbability: number;
}

export interface ScoredPrediction {
    rawBrier: number;
    curveDifficultyWeight: number;
    weightedBrier: number;
    cumulativeWeightedScore: number;
    predictionCount: number;
    snapshotHash: string;
}

export interface WeightedLeaderboardEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    model: string;
    agent_status: string;
    weighted_score: number | null;
    raw_brier_avg: number | null;
    prediction_count: number;
    last_scored_at: string | null;
    rank_trend: number;
    deployed_at: string;
    has_min_predictions: boolean;
    competition_id: string;
}

@Injectable()
export class LeaderboardScoringService {
    private readonly logger = new Logger(LeaderboardScoringService.name);

    // Server-side secret for HMAC chain (should come from env in production)
    private readonly HMAC_SECRET: string;

    constructor(private readonly supabaseService: SupabaseService) {
        this.HMAC_SECRET = process.env.LEADERBOARD_HMAC_SECRET || 'exoduze-leaderboard-hmac-default-key-changeme';
    }

    // ========================
    // Curve Difficulty Weight
    // ========================

    /**
     * Calculates the curve difficulty weight for a given competition at a given time.
     * Weight ranges from 0.5 (easy prediction) to 2.0 (very hard prediction).
     *
     * Components:
     *   40% — Time remaining (quadratic: closer to end = harder = higher weight)
     *   35% — Volatility (std dev of recent probability history)
     *   25% — Entropy (Shannon entropy of current probability distribution)
     */
    async calculateCurveDifficultyWeight(
        competitionId: string,
        atTime: Date = new Date(),
    ): Promise<CurveDifficultyContext> {
        const supabase = this.supabaseService.getAdminClient();

        // Get competition timing
        const { data: comp } = await supabase
            .from('competitions')
            .select('competition_start, competition_end')
            .eq('id', competitionId)
            .single();

        if (!comp) {
            return { weight: 1.0, volatility: 0, entropy: 0, timeRemainingHours: 0, curveProbability: 0.5 };
        }

        const compStart = new Date(comp.competition_start).getTime();
        const compEnd = new Date(comp.competition_end).getTime();
        const now = atTime.getTime();

        // 1. Time remaining weight (exponential: closer to end = higher)
        const totalHours = Math.max((compEnd - compStart) / (1000 * 60 * 60), 1);
        const hoursRemaining = Math.max((compEnd - now) / (1000 * 60 * 60), 0);
        const timeRatio = 1.0 - (hoursRemaining / totalHours);
        const timeWeight = 0.5 + (timeRatio * timeRatio * 1.0);

        // Get config
        const { data: config } = await supabase
            .from('leaderboard_score_config')
            .select('volatility_lookback, min_weight, max_weight')
            .eq('competition_id', competitionId)
            .single();

        const lookback = config?.volatility_lookback || 20;
        const minWeight = Number(config?.min_weight) || 0.5;
        const maxWeight = Number(config?.max_weight) || 2.0;

        // 2. Volatility weight (std dev of recent probability history)
        const { data: historyPoints } = await supabase
            .from('probability_history')
            .select('home, draw, away')
            .eq('competition_id', competitionId)
            .lte('created_at', atTime.toISOString())
            .order('created_at', { ascending: false })
            .limit(lookback);

        let volatility = 0;
        let curveProbability = 0.5;
        let entropy = 0;

        if (historyPoints && historyPoints.length >= 3) {
            const homeValues = historyPoints.map(p => Number(p.home));
            curveProbability = homeValues[0] / 100; // latest

            // Standard deviation
            const mean = homeValues.reduce((a, b) => a + b, 0) / homeValues.length;
            const squaredDiffs = homeValues.map(v => Math.pow(v - mean, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b, 0) / homeValues.length;
            volatility = Math.sqrt(variance);
        }

        // Normalize volatility (max ~15 percentage points)
        const normalizedVolatility = Math.min(volatility / 15.0, 1.0);

        // 3. Shannon entropy of the latest probability distribution
        if (historyPoints && historyPoints.length > 0) {
            const latest = historyPoints[0];
            const probs = [
                Number(latest.home) / 100,
                Number(latest.draw) / 100,
                Number(latest.away) / 100,
            ].filter(p => p > 0.001);

            entropy = probs.reduce((sum, p) => sum - (p * Math.log(p)), 0);
            // Normalize: max entropy for 3 outcomes = ln(3) ≈ 1.099
            entropy = Math.min(entropy / 1.099, 1.0);
        }

        // Combine: 40% time, 35% volatility, 25% entropy
        let rawWeight = (timeWeight * 0.4) + (normalizedVolatility * 0.35 * 2.0) + (entropy * 0.25 * 2.0);

        // Clamp to configured bounds
        rawWeight = Math.max(minWeight, Math.min(maxWeight, rawWeight));

        return {
            weight: Number(rawWeight.toFixed(4)),
            volatility: Number(volatility.toFixed(4)),
            entropy: Number(entropy.toFixed(4)),
            timeRemainingHours: Number(hoursRemaining.toFixed(2)),
            curveProbability: Number(curveProbability.toFixed(4)),
        };
    }

    // ========================
    // Score a Prediction
    // ========================

    /**
     * Scores a single prediction by an agent against the actual curve state.
     *
     * Brier Score = Σ (predicted_probability - actual_outcome)²
     *   - For binary: (predicted - actual)²
     *   - Lower is better (0 = perfect, 1 = worst)
     *
     * Weighted Brier = raw_brier × curve_difficulty_weight
     * Cumulative = weighted average of all predictions
     */
    async scorePrediction(
        agentId: string,
        competitionId: string,
        predictionId: string,
        predictedProbabilities: number[], // e.g., [0.6, 0.4] for binary
        referenceProbabilities: number[], // e.g., [0.65, 0.35] (the current live curve)
    ): Promise<ScoredPrediction | null> {
        const supabase = this.supabaseService.getAdminClient();

        // 1. Calculate raw Brier score against the LIVE reference curve
        const rawBrier = this.calculateBrierScore(predictedProbabilities, referenceProbabilities);

        // 2. Get curve difficulty weight at current time
        const difficultyCtx = await this.calculateCurveDifficultyWeight(competitionId);

        // 3. Calculate weighted brier for this prediction
        const weightedBrier = rawBrier * difficultyCtx.weight;

        // 4. Get current entry state
        const { data: entry } = await supabase
            .from('agent_competition_entries')
            .select('weighted_score, prediction_count, score_hash')
            .eq('agent_id', agentId)
            .eq('competition_id', competitionId)
            .single();

        const prevCount = entry?.prediction_count || 0;
        const prevWeightedScore = entry?.weighted_score ? Number(entry.weighted_score) : 0;
        const prevHash = entry?.score_hash || '';

        // 5. Calculate new cumulative weighted score (running weighted average)
        //    cumulative = (prevScore * prevCount + weightedBrier) / (prevCount + 1)
        const newCount = prevCount + 1;
        const newCumulativeScore = (prevWeightedScore * prevCount + weightedBrier) / newCount;

        // 6. Generate HMAC hash for integrity chain
        const snapshotData = {
            agentId,
            competitionId,
            predictionId,
            rawBrier,
            weightedBrier,
            cumulativeScore: newCumulativeScore,
            predictionCount: newCount,
            timestamp: new Date().toISOString(),
        };
        const serverNonce = crypto.randomBytes(16).toString('hex');
        const snapshotHash = this.generateHmacHash(prevHash, snapshotData, serverNonce);

        // 7. Insert leaderboard snapshot (append-only)
        const { error: snapError } = await supabase
            .from('leaderboard_snapshots')
            .insert({
                agent_id: agentId,
                competition_id: competitionId,
                prediction_id: predictionId,
                raw_brier: rawBrier,
                curve_difficulty_weight: difficultyCtx.weight,
                weighted_brier: weightedBrier,
                cumulative_weighted_score: newCumulativeScore,
                prediction_count: newCount,
                curve_probability_at_prediction: difficultyCtx.curveProbability,
                curve_volatility_at_prediction: difficultyCtx.volatility,
                time_remaining_hours: difficultyCtx.timeRemainingHours,
                snapshot_hash: snapshotHash,
                previous_hash: prevHash || null,
                server_nonce: serverNonce,
            });

        if (snapError) {
            this.logger.error(`Failed to insert leaderboard snapshot: ${snapError.message}`);
            return null;
        }

        // 8. Calculate rank trend (save old ranks, compare after update)
        const oldRanks = await this.getRankMap(competitionId);

        // 9. Update agent_competition_entries with new weighted score
        const { error: updateError } = await supabase
            .from('agent_competition_entries')
            .update({
                weighted_score: newCumulativeScore,
                brier_score: rawBrier,
                prediction_count: newCount,
                last_scored_at: new Date().toISOString(),
                score_hash: snapshotHash,
            })
            .eq('agent_id', agentId)
            .eq('competition_id', competitionId);

        if (updateError) {
            this.logger.error(`Failed to update competition entry: ${updateError.message}`);
            return null;
        }

        // 10. Update rank trends for all agents in this competition
        await this.updateRankTrends(competitionId, oldRanks);

        // 11. Broadcast live update via Supabase realtime
        await this.broadcastLeaderboardUpdate(competitionId, agentId);

        this.logger.log(
            `Scored prediction for agent ${agentId} in competition ${competitionId}: ` +
            `raw=${rawBrier.toFixed(4)}, weight=${difficultyCtx.weight}, ` +
            `weighted=${weightedBrier.toFixed(4)}, cumulative=${newCumulativeScore.toFixed(4)} ` +
            `(prediction #${newCount})`
        );

        return {
            rawBrier,
            curveDifficultyWeight: difficultyCtx.weight,
            weightedBrier,
            cumulativeWeightedScore: newCumulativeScore,
            predictionCount: newCount,
            snapshotHash,
        };
    }

    // ========================
    // Weighted Leaderboard
    // ========================

    /**
     * Returns the weighted leaderboard for a competition.
     * Uses the DB function for optimal performance, with additional metadata.
     */
    async getWeightedLeaderboard(
        competitionId: string,
        limit: number = 50,
    ): Promise<{ entries: WeightedLeaderboardEntry[]; competition: any; timeRemaining: number }> {
        const supabase = this.supabaseService.getAdminClient();

        // Get competition metadata
        const { data: comp } = await supabase
            .from('competitions')
            .select('id, title, sector, competition_start, competition_end, status, probabilities')
            .eq('id', competitionId)
            .single();

        const timeRemaining = comp
            ? Math.max(0, new Date(comp.competition_end).getTime() - Date.now())
            : 0;

        // Use the DB function for ranked results
        const { data, error } = await supabase.rpc('get_weighted_leaderboard', {
            p_competition_id: competitionId,
            p_limit: Math.min(Math.max(1, limit), 100),
        });

        if (error) {
            this.logger.error(`Failed to get weighted leaderboard: ${error.message}`);
            return { entries: [], competition: comp, timeRemaining };
        }

        const entries: WeightedLeaderboardEntry[] = (data || []).map((row: any) => ({
            rank: row.rank_position,
            agent_id: row.agent_id,
            agent_name: row.agent_name,
            model: row.model,
            agent_status: row.agent_status,
            weighted_score: row.weighted_score ? Number(row.weighted_score) : null,
            raw_brier_avg: row.raw_brier_avg ? Number(row.raw_brier_avg) : null,
            prediction_count: row.prediction_count || 0,
            last_scored_at: row.last_scored_at,
            rank_trend: row.rank_trend || 0,
            deployed_at: row.deployed_at,
            has_min_predictions: row.has_min_predictions,
            competition_id: competitionId,
        }));

        return { entries, competition: comp, timeRemaining };
    }

    // ========================
    // Score Integrity Verification
    // ========================

    /**
     * Verifies the HMAC hash chain for a competition's leaderboard snapshots.
     * Returns true if all hashes are valid (no tampering detected).
     */
    async validateScoreIntegrity(competitionId: string): Promise<{
        valid: boolean;
        totalSnapshots: number;
        invalidSnapshots: number;
        details: string[];
    }> {
        const supabase = this.supabaseService.getAdminClient();

        const { data: snapshots, error } = await supabase
            .from('leaderboard_snapshots')
            .select('*')
            .eq('competition_id', competitionId)
            .order('id', { ascending: true });

        if (error || !snapshots) {
            return { valid: false, totalSnapshots: 0, invalidSnapshots: 0, details: ['Failed to load snapshots'] };
        }

        const details: string[] = [];
        let invalidCount = 0;

        for (let i = 0; i < snapshots.length; i++) {
            const snap = snapshots[i];

            // Reconstruct the hash
            const snapshotData = {
                agentId: snap.agent_id,
                competitionId: snap.competition_id,
                predictionId: snap.prediction_id,
                rawBrier: Number(snap.raw_brier),
                weightedBrier: Number(snap.weighted_brier),
                cumulativeScore: Number(snap.cumulative_weighted_score),
                predictionCount: snap.prediction_count,
                timestamp: snap.created_at,
            };

            const expectedHash = this.generateHmacHash(
                snap.previous_hash || '',
                snapshotData,
                snap.server_nonce,
            );

            if (expectedHash !== snap.snapshot_hash) {
                invalidCount++;
                details.push(`Snapshot #${snap.id}: hash mismatch (agent=${snap.agent_id})`);
            }
        }

        return {
            valid: invalidCount === 0,
            totalSnapshots: snapshots.length,
            invalidSnapshots: invalidCount,
            details,
        };
    }

    // ========================
    // Private Helpers
    // ========================

    /**
     * Brier Score calculation against a reference probability curve.
     * Lower is better: 0 = perfect match, 2 = worst possible.
     */
    private calculateBrierScore(predictedProbs: number[], referenceProbs: number[]): number {
        let brierSum = 0;
        const length = Math.max(predictedProbs.length, referenceProbs.length);
        for (let i = 0; i < length; i++) {
            const pred = predictedProbs[i] || 0;
            const ref = referenceProbs[i] || 0;
            brierSum += Math.pow(pred - ref, 2);
        }
        // Normalize by number of outcomes
        return length > 0 ? brierSum / length : 0;
    }

    /**
     * HMAC-SHA256 hash chain for score integrity.
     * hash = HMAC(previousHash + JSON(data) + nonce, secret)
     */
    private generateHmacHash(previousHash: string, data: any, nonce: string): string {
        const payload = `${previousHash}|${JSON.stringify(data)}|${nonce}`;
        return crypto.createHmac('sha256', this.HMAC_SECRET).update(payload).digest('hex');
    }

    /**
     * Get current rank map for all agents in a competition (before update).
     */
    private async getRankMap(competitionId: string): Promise<Map<string, number>> {
        const supabase = this.supabaseService.getAdminClient();
        const { data } = await supabase
            .from('agent_competition_entries')
            .select('agent_id, weighted_score')
            .eq('competition_id', competitionId)
            .in('status', ['active', 'paused'])
            .order('weighted_score', { ascending: true, nullsFirst: false });

        const rankMap = new Map<string, number>();
        (data || []).forEach((entry: any, i: number) => {
            rankMap.set(entry.agent_id, i + 1);
        });
        return rankMap;
    }

    /**
     * Update rank_trend for all agents after a score change.
     * +1 = moved up, -1 = moved down, 0 = no change
     */
    private async updateRankTrends(competitionId: string, oldRanks: Map<string, number>): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        const newRanks = await this.getRankMap(competitionId);

        for (const [agentId, newRank] of newRanks) {
            const oldRank = oldRanks.get(agentId) || newRank;
            let trend = 0;
            if (newRank < oldRank) trend = 1;   // moved up (lower rank number = better)
            else if (newRank > oldRank) trend = -1; // moved down

            if (trend !== 0) {
                await supabase
                    .from('agent_competition_entries')
                    .update({ rank_trend: trend })
                    .eq('agent_id', agentId)
                    .eq('competition_id', competitionId);
            }
        }
    }

    /**
     * Broadcast a leaderboard update via Supabase realtime channel.
     */
    private async broadcastLeaderboardUpdate(competitionId: string, changedAgentId: string): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();

            // Get the updated leaderboard (top 20 for broadcast efficiency)
            const { entries } = await this.getWeightedLeaderboard(competitionId, 20);

            await supabase.channel(`leaderboard-${competitionId}`).send({
                type: 'broadcast',
                event: 'leaderboard_update',
                payload: {
                    competition_id: competitionId,
                    changed_agent_id: changedAgentId,
                    leaderboard: entries,
                    updated_at: new Date().toISOString(),
                },
            });
        } catch (err: any) {
            this.logger.warn(`Failed to broadcast leaderboard update: ${err.message}`);
        }
    }
}
