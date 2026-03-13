import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';
import { AntiManipulationUtil } from '../utils/anti-manipulation.util.js';

export interface Signal {
    type: 'official_statement' | 'regulatory_change' | 'market_price' | 'analyst_consensus' | 'historical_precedent';
    strength: number; // 0.1 to 1.0
    direction: 1 | -1 | 0; // 1 for Yes, -1 for No, 0 for Neutral
    sourceCredibility: number; // 0.1 to 1.5
}

export interface HorizonConfig {
    label: string;
    durationHours: number;
    resolutionMinutes: number;
}

const HORIZONS: Record<string, HorizonConfig> = {
    '2h': { label: '2h', durationHours: 2, resolutionMinutes: 10 },
    '7h': { label: '7h', durationHours: 7, resolutionMinutes: 30 },
    '12h': { label: '12h', durationHours: 12, resolutionMinutes: 60 },
    '24h': { label: '24h', durationHours: 24, resolutionMinutes: 120 },
    '3d': { label: '3d', durationHours: 72, resolutionMinutes: 360 },
    '7d': { label: '7d', durationHours: 168, resolutionMinutes: 1440 },
};

@Injectable()
export class CurveGeneratorService {
    private readonly logger = new Logger(CurveGeneratorService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Calculates the new probability using an advanced Time-Decayed Bayesian Inference
     * merged with Merton Jump Diffusion and OU Mean-Reversion.
     */
    calculateProbability(
        currentProb: number,
        signals: Signal[],
        timeRemainingMs: number,
        recentSnapshots: number[] = []
    ): number {
        // Convert current probability to log-odds for summation
        let logOdds = Math.log(currentProb / (1 - currentProb));

        let strongConfirmation = false;
        let strongSignalCount = 0;
        let driftDirection = 0;

        // 1. Bayesian Update with Credibility Weights
        for (const signal of signals) {
            if (signal.direction === 0) continue;
            
            // Weight the evidence based on source credibility and signal strength
            const evidenceWeight = signal.strength * signal.sourceCredibility;
            
            // Adjust log-odds (direction * weight)
            logOdds += signal.direction * evidenceWeight;
            driftDirection += signal.direction * evidenceWeight;

            if (evidenceWeight > 1.0) {
                strongSignalCount++;
            }
        }

        if (strongSignalCount >= 2) {
            strongConfirmation = true;
        }

        // Convert back to base probability
        let newProb = Math.exp(logOdds) / (1 + Math.exp(logOdds));

        // 2. Volatility Scaling based on Time To Expiry
        // Further out = higher base volatility allowed. Closer to expiry = rigid convergence
        const hoursRemaining = timeRemainingMs / (1000 * 60 * 60);
        const timeFactor = Math.min(1.0, Math.max(0.1, hoursRemaining / 72)); // normalize against 3 days
        
        // 3. Merton Jump Diffusion (Brownian Motion Micro-Volatility)
        // Adds tiny non-deterministic noise to deter sniper bots trying to mathematically deduce exact shifts
        const noiseStandardDev = 0.02 * timeFactor; // +-2% max base noise
        // Box-Muller transform for normal distribution
        const u1 = 1.0 - Math.random(); 
        const u2 = 1.0 - Math.random();
        const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
        
        const stochasticVolatilityDelta = randStdNormal * noiseStandardDev;
        newProb += stochasticVolatilityDelta;

        // 4. Ornstein-Uhlenbeck Mean Reversion (Anti-Spoofing/Anti-Manipulation)
        // If the curve was artificially pumped by a sudden influx of low-credibility signals,
        // it generates an elastic pull back towards the TWAP.
        if (recentSnapshots.length > 5 && !strongConfirmation) {
            const twap = AntiManipulationUtil.calculateTWAP(recentSnapshots);
            const dt = 1.0; // Assume t=1 tick per analysis run
            
            // The further it strays from TWAP without strong news, the harder it is pulled back
            const reversionSpeed = 0.15; // $\theta$ 
            newProb = AntiManipulationUtil.applyMeanReversion(newProb, twap, reversionSpeed, dt);
        }

        // Smooth and clamp (max bounds)
        newProb = AntiManipulationUtil.clampProbability(newProb, strongConfirmation);
        
        // Limit explicit rate of change jump velocity (max allowed delta per cycle) to kill exploit cascading
        const maxJump = strongConfirmation ? 0.35 : 0.12 * timeFactor;
        if (Math.abs(newProb - currentProb) > maxJump) {
            newProb = currentProb + Math.sign(newProb - currentProb) * maxJump;
        }

        return newProb;
    }

    /**
     * Builds and saves a smooth time-series curve snapshot for a competition
     */
    async generateCurveSnapshot(competitionId: string, newsClusterId: string, signals: Signal[], horizonKey: string): Promise<number | null> {
        const supabase = this.supabaseService.getAdminClient();

        // Get latest snapshots for this competition to compute TWAP Mean Reversion
        const { data: latestSnapshots } = await supabase
            .from('curve_snapshots')
            .select('probability')
            .eq('competition_id', competitionId)
            .order('timestamp', { ascending: false })
            .limit(10);

        let currentProb = 0.5;
        let recentProbs: number[] = [];
        
        if (latestSnapshots && latestSnapshots.length > 0) {
            currentProb = Number(latestSnapshots[0].probability);
            recentProbs = latestSnapshots.map(s => Number(s.probability));
        } else {
            const { data: comp } = await supabase.from('competitions').select('base_probability, competition_end').eq('id', competitionId).single();
            if (comp && comp.base_probability) {
                currentProb = Number(comp.base_probability);
            }
        }

        // Get competition end time to determine Time Remaining Ms (Decaying Volatility logic)
        const { data: compMeta } = await supabase.from('competitions').select('competition_end').eq('id', competitionId).single();
        let timeRemainingMs = 24 * 60 * 60 * 1000; // fallback 24h
        if (compMeta?.competition_end) {
            timeRemainingMs = Math.max(0, new Date(compMeta.competition_end).getTime() - Date.now());
        }

        const newProb = this.calculateProbability(currentProb, signals, timeRemainingMs, recentProbs);

        // Generate reasoning summary
        const reasoning = `Probability updated from ${(currentProb * 100).toFixed(1)}% to ${(newProb * 100).toFixed(1)}% based on ${signals.length} new signals.`;

        // Hash the snapshot for immutability
        const snapshotData = {
            competitionId,
            newsClusterId,
            probability: newProb,
            timestamp: new Date().toISOString()
        };
        const snapshotHash = AntiManipulationUtil.hashSnapshot(snapshotData);

        // Save new curve snapshot
        const { error } = await supabase.from('curve_snapshots').insert({
            competition_id: competitionId,
            news_cluster_id: newsClusterId,
            probability: newProb,
            snapshot_hash: snapshotHash,
            reasoning
        });

        if (error) {
            this.logger.error(`Failed to save curve snapshot: ${error.message}`);
            return null;
        }
        
        // Update competition probabilities (assuming 2 outcomes for now, Yes/No, formatted as 0-10000 basis points)
        const probBP = Math.round(newProb * 10000);
        await supabase.from('competitions').update({
            probabilities: [probBP, 10000 - probBP]
        }).eq('id', competitionId);

        // Broadcast the real snapshot data for smooth client frontend chart updates
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        await supabase.channel(`competition-market-${competitionId}`).send({
            type: 'broadcast',
            event: 'probability_update',
            payload: {
                marketId: competitionId,
                snapshot: {
                    time: `${timeStr}'`,
                    home: newProb * 100,
                    draw: 0,
                    away: (1 - newProb) * 100,
                    narrative: reasoning,
                }
            }
        });

        return newProb;
    }
    
    getResolutionMinutes(horizonKey: string): number {
        return HORIZONS[horizonKey]?.resolutionMinutes || 60;
    }
}
