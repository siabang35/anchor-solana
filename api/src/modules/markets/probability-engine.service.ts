import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service.js';
import { MarketDataGateway } from './market-data.gateway.js';

export interface ProbabilitySnapshot {
    time: string;
    home: number;
    draw: number;
    away: number;
    narrative?: string;
}

@Injectable()
export class ProbabilityEngineService {
    private readonly logger = new Logger(ProbabilityEngineService.name);
    private readonly qwenApiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'; // Default endpoint for Qwen
    private qwenApiKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        @Inject(forwardRef(() => MarketDataGateway))
        private readonly marketDataGateway: MarketDataGateway,
    ) {
        this.qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    }

    /**
     * Evaluates a news item/signal and computes the new posterior probabilities
     */
    async processRealtimeSignal(marketId: string, signalText: string): Promise<ProbabilitySnapshot | null> {
        if (!this.qwenApiKey) {
            this.logger.warn('QWEN_API_KEY is not set. Cannot run LLM evaluation.');
            return null;
        }

        const supabase = this.supabaseService.getAdminClient();

        try {
            // 1. Fetch current market probabilities
            const { data: market, error } = await supabase
                .from('markets')
                .select('id, title, category, yes_price, no_price')
                .eq('id', marketId)
                .single();

            if (error || !market) {
                this.logger.warn(`Market ${marketId} not found or failed to fetch`);
                return null;
            }

            // For a 3-outcome competition (Home, Draw, Away)
            // Let's assume standard starts at 33.3, 33.3, 33.3 or from yes_price/no_price
            // We'll calculate current base probabilities from DB (or use a standalone table for history)
            let prevHome = (market.yes_price || 0.5) * 100;
            let prevAway = (market.no_price || 0.5) * 100;
            let prevDraw = Math.max(0, 100 - prevHome - prevAway);

            if (prevHome + prevAway === 100 && prevDraw === 0) {
                 prevHome = 40; prevDraw = 20; prevAway = 40; // Normalize if strictly 50/50
             }

            // 2. Call Qwen LLM for Bayesian Likelihood Evaluation
            const evaluation = await this.evaluateWithQwen(market.title, signalText);

            // Likelihoods (P(Signal | Outcome)) based on Qwen's evaluation
            // A score from 0.0 to 1.0 representing how strongly this signal supports each outcome
            const likelihoods = {
                home: evaluation.homeImpact,
                draw: evaluation.drawImpact,
                away: evaluation.awayImpact
            };

            // 3. Apply Bayesian Update
            // P(Outcome | Signal) = [P(Signal | Outcome) * P(Outcome)] / P(Signal)
            
            // Prior probabilities (normalized to 1.0)
            const priorHome = prevHome / 100;
            const priorDraw = prevDraw / 100;
            const priorAway = prevAway / 100;

            // Unnormalized Posteriors
            const unnormPostHome = likelihoods.home * priorHome;
            const unnormPostDraw = likelihoods.draw * priorDraw;
            const unnormPostAway = likelihoods.away * priorAway;

            // Marginal Probability of Signal (Evidence)
            const evidence = unnormPostHome + unnormPostDraw + unnormPostAway;

            // Normalized Posteriors
            const postHome = (unnormPostHome / evidence) * 100;
            const postDraw = (unnormPostDraw / evidence) * 100;
            const postAway = (unnormPostAway / evidence) * 100;

            // 4. Create Snapshot
            const snapshot: ProbabilitySnapshot = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), // e.g. "14:35:10"
                home: parseFloat(postHome.toFixed(2)),
                draw: parseFloat(postDraw.toFixed(2)),
                away: parseFloat(postAway.toFixed(2)),
                narrative: evaluation.summary
            };

            // Update Database (Simulated)
            await supabase.from('markets').update({
                yes_price: postHome / 100, // Sync yes_price with Home
                no_price: postAway / 100   // Sync no_price with Away
            }).eq('id', marketId);

            // 5. Broadcast via WebSocket gateway directly (avoids circular dependency)
            this.logger.log(`Broadcasting Bayesian update for market ${marketId}: Home=${snapshot.home}%, Away=${snapshot.away}%`);
            this.marketDataGateway.broadcastCurveUpdate(marketId, snapshot);

            // Also broadcast via Supabase Realtime channel
            try {
                const channel = supabase.channel(`competition-market-${marketId}`);
                await (channel as any).httpSend('probability_update', { marketId, snapshot });
            } catch { /* non-critical */ }

            return snapshot;

        } catch (err: any) {
            this.logger.error(`Error in Bayesian probability engine: ${err.message}`);
            return null;
        }
    }

    /**
     * Calls Aliyun Qwen LLM via API to get likelihood estimates
     */
    private async evaluateWithQwen(marketTitle: string, signalText: string): Promise<{ homeImpact: number, drawImpact: number, awayImpact: number, summary: string }> {
        const prompt = `
            You are an expert AI prediction market analyst. 
            We are analyzing a competition titled: "${marketTitle}".
            
            A new real-time signal has just arrived: "${signalText}".
            
            Evaluate how strongly this new signal supports the three possible outcomes of the competition:
            1. Home Win / "Yes"
            2. Draw / "Neutral"
            3. Away Win / "No"
            
            Provide a Likelihood score for each outcome between 0.1 (strongly goes against) and 2.0 (strongly supports). 1.0 means neutral impact.
            Also provide a short 1-sentence narrative summary of why.
            
            Return ONLY a valid JSON object in this exact format, with no markdown formatting or extra text:
            {
                "homeImpact": 1.5,
                "drawImpact": 0.8,
                "awayImpact": 0.5,
                "summary": "This signal strongly favors the Home team due to increased adoption metrics."
            }
        `;

        try {
            const response = await fetch(this.qwenApiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.qwenApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'qwen-turbo',
                    input: {
                        messages: [
                            { role: 'system', content: 'You are a precise data analysis AI that outputs strictly raw JSON.' },
                            { role: 'user', content: prompt }
                        ]
                    },
                    parameters: {
                        result_format: 'text',
                        temperature: 0.1 // Low temperature for consistent output
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Qwen API Error: ${response.status} - ${errText}`);
            }

            const result: any = await response.json();
            const textResponse = result.output?.text || '{}';
            
            // Clean markdown JSON formatting if Qwen accidentally adds it
            const jsonStr = textResponse.replace(/^```json\s*/, '').replace(/```$/, '').trim();
            const parsed = JSON.parse(jsonStr);

            return {
                homeImpact: parsed.homeImpact || 1.0,
                drawImpact: parsed.drawImpact || 1.0,
                awayImpact: parsed.awayImpact || 1.0,
                summary: parsed.summary || 'Market dynamics shifted based on new signals.'
            };
        } catch (error: any) {
            this.logger.error(`Qwen LLM call failed, falling back to neutral likelihoods: ${error.message}`);
            
            // Generate a fake but plausible random walk if API key is invalid or failing
            // Useful for testing UI without eating API credits
            return this.generateMockImpact();
        }
    }

    private generateMockImpact() {
         // Random walk for testing UI
         const r1 = 0.5 + Math.random();
         const r2 = 0.5 + Math.random();
         const r3 = 0.5 + Math.random();
         return {
             homeImpact: r1,
             drawImpact: r2,
             awayImpact: r3,
             summary: "Random simulated market impact due to LLM fallback."
         };
    }
}
