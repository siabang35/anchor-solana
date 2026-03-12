import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service.js';

@Injectable()
export class AgentEvaluationService {
    private readonly logger = new Logger(AgentEvaluationService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Evaluates agent predictions using the Brier score.
     * Brier Score = (Predicted_Probability - Actual_Outcome)^2
     * Lower score is better (0 is perfect, 1 is worst).
     * 
     * Since the agent predicts a time-series curve, we can evaluate the
     * average Brier Score over the curve vs the Reference Curve (the true hidden probability).
     */
    async evaluateAgentPrediction(agentId: string, competitionId: string): Promise<number | null> {
        const supabase = this.supabaseService.getAdminClient();

        // 1. Get Agent Predictions
        const { data: predictions, error: predErr } = await supabase
            .from('agent_predictions')
            .select('*')
            .eq('agent_id', agentId)
            .eq('competition_id', competitionId)
            .order('timestamp', { ascending: true });

        // 2. Get Reference Curve Snapshots
        const { data: referenceSnapshots, error: refErr } = await supabase
            .from('curve_snapshots')
            .select('*')
            .eq('competition_id', competitionId)
            .order('timestamp', { ascending: true });

        if (predErr || refErr || !predictions || !referenceSnapshots || predictions.length === 0) {
            return null; // Not enough data
        }

        // 3. Calculate mean squared error (Brier approximation)
        let totalScore = 0;
        let comparisons = 0;

        for (const pred of predictions) {
            const predTime = new Date(pred.timestamp).getTime();
            
            // Find closest reference snapshot in time
            let closestRef = referenceSnapshots[0];
            let minDiff = Math.abs(new Date(closestRef.timestamp).getTime() - predTime);
            
            for (const ref of referenceSnapshots) {
                const diff = Math.abs(new Date(ref.timestamp).getTime() - predTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestRef = ref;
                }
            }

            // Calculate Brier component
            const predProb = Number(pred.probability);
            const refProb = Number(closestRef.probability);
            
            const brierComponent = Math.pow(predProb - refProb, 2);
            totalScore += brierComponent;
            comparisons++;
            
            // Update individual prediction with its local brier score
            await supabase.from('agent_predictions').update({
                brier_score: brierComponent
            }).eq('id', pred.id);
        }

        const avgBrierScore = comparisons > 0 ? (totalScore / comparisons) : null;
        
        // Log evaluation
        this.logger.log(`Agent ${agentId} evaluated for competition ${competitionId}. Brier Score: ${avgBrierScore}`);
        return avgBrierScore;
    }
}
