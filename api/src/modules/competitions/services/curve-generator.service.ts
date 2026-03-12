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
     * Calculates the new probability using Bayesian Inference
     * P(H|E) = [P(E|H) * P(H)] / P(E)
     * Simplified approach: Log-odds update based on signals
     */
    calculateProbability(currentProb: number, signals: Signal[]): number {
        // Convert current probability to log-odds
        let logOdds = Math.log(currentProb / (1 - currentProb));

        let strongConfirmation = false;
        let strongSignalCount = 0;

        for (const signal of signals) {
            if (signal.direction === 0) continue;
            
            // Weight the evidence based on source credibility and signal strength
            const evidenceWeight = signal.strength * signal.sourceCredibility;
            
            // Adjust log-odds (direction * weight)
            logOdds += signal.direction * evidenceWeight;

            if (evidenceWeight > 1.0) {
                strongSignalCount++;
            }
        }

        if (strongSignalCount >= 2) {
            strongConfirmation = true;
        }

        // Convert back to probability
        let newProb = Math.exp(logOdds) / (1 + Math.exp(logOdds));

        // Smooth and clamp
        newProb = AntiManipulationUtil.clampProbability(newProb, strongConfirmation);
        
        // Prevent extreme jumps without strong signals (max 15% jump per update unless strong)
        const maxJump = strongConfirmation ? 0.3 : 0.15;
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

        // Get latest snapshot for this competition
        const { data: latestSnapshot } = await supabase
            .from('curve_snapshots')
            .select('probability')
            .eq('competition_id', competitionId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        // Get competition base probability if no snapshot
        let currentProb = 0.5;
        if (latestSnapshot) {
            currentProb = Number(latestSnapshot.probability);
        } else {
            const { data: comp } = await supabase.from('competitions').select('base_probability').eq('id', competitionId).single();
            if (comp && comp.base_probability) {
                currentProb = Number(comp.base_probability);
            }
        }

        const newProb = this.calculateProbability(currentProb, signals);

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
