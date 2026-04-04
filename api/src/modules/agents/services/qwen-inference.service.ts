import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ForecasterInput {
    eventTitle: string;
    description: string;
    horizon: string;
    newsCluster: any[];
    marketSignals?: any[];
    referenceProbability?: number;
}

export interface ForecasterOutput {
    reasoning: string;
    signals_extracted: Array<{
        title: string;
        strength: string; // "strong", "moderate", "weak"
        sentiment: "positive" | "negative" | "neutral";
    }>;
    base_probability: number;
    projected_curve: Array<{
        timestamp_offset_mins: number;
        probability: number;
    }>;
}

/**
 * Inference Fallback Chain:
 *   1. Qwen 2.5 7B (HuggingFace Router) — primary
 *   2. OpenRouter Qwen 3.6 Plus (FREE) — secondary
 *   3. Groq Llama 3.3 70B — tertiary
 *   4. Local Simulation — deterministic last resort
 */
@Injectable()
export class QwenInferenceService {
    private readonly logger = new Logger(QwenInferenceService.name);
    private readonly HF_API_KEY: string;
    private readonly GROQ_API_KEY: string;
    private readonly OPENROUTER_API_KEY: string;

    private readonly HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
    private readonly HF_MODEL_ID = 'Qwen/Qwen2.5-7B-Instruct';

    private readonly OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    private readonly OPENROUTER_MODEL_ID = 'qwen/qwen-2.5-72b-instruct:free'; // Fixed valid model ID compared to user string

    constructor(private readonly configService: ConfigService) {
        this.HF_API_KEY = this.configService.get<string>('HUGGINGFACE_TOKEN') || process.env.HUGGINGFACE_TOKEN || '';
        this.GROQ_API_KEY = this.configService.get<string>('GROQ_API_KEY') || process.env.GROQ_API_KEY || '';
        this.OPENROUTER_API_KEY = this.configService.get<string>('OPENROUTER_API_KEY') || process.env.OPENROUTER_API_KEY || '';
        
        if (!this.HF_API_KEY) {
            this.logger.warn('⚠ HUGGINGFACE_TOKEN not configured — Qwen primary inference will be skipped');
        } else {
            this.logger.log(`✅ HuggingFace token loaded (${this.HF_API_KEY.substring(0, 6)}...)`);
        }
        
        if (this.GROQ_API_KEY) {
            this.logger.log(`✅ Groq fallback token loaded (${this.GROQ_API_KEY.substring(0, 6)}...)`);
        }

        if (this.OPENROUTER_API_KEY) {
            this.logger.log(`✅ OpenRouter fallback token loaded (${this.OPENROUTER_API_KEY.substring(0, 6)}...)`);
        } else {
            this.logger.warn('⚠ OPENROUTER_API_KEY not configured — OpenRouter fallback disabled');
        }
    }

    /**
     * Main inference entry point — cascades through the fallback chain:
     *   Qwen (HF) → Groq → OpenRouter (Qwen 3.6+ free) → Simulation
     */
    async generateForecast(input: ForecasterInput): Promise<ForecasterOutput | null> {
        const { systemPrompt, userPrompt } = this.buildPrompt(input);

        // === Tier 1: Qwen 2.5 via HuggingFace ===
        if (this.HF_API_KEY) {
            const result = await this.callHuggingFace(systemPrompt, userPrompt);
            if (result) return result;
        }

        // === Tier 2: OpenRouter Qwen 3.6 Plus (FREE) ===
        if (this.OPENROUTER_API_KEY) {
            const result = await this.callOpenRouter(systemPrompt, userPrompt);
            if (result) return result;
        }

        // === Tier 3: Groq Llama 3.3 70B ===
        if (this.GROQ_API_KEY) {
            const result = await this.callGroq(systemPrompt, userPrompt);
            if (result) return result;
        }

        // === Tier 4: Local Simulation Fallback ===
        this.logger.warn(`🔄 All AI engines exhausted. Falling back to local simulation...`);
        return this.generateSimulatedForecast(input);
    }

    // ════════════════════════════════════════════
    // Tier 1: HuggingFace (Qwen 2.5)
    // ════════════════════════════════════════════

    private async callHuggingFace(systemPrompt: string, userPrompt: string): Promise<ForecasterOutput | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(this.HF_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.HF_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.HF_MODEL_ID,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 1500,
                    temperature: 0.2,
                })
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                this.logger.warn(`[Tier1] HuggingFace ${response.status} — cascading to Groq...`);
                return null;
            }
            
            const data = await response.json() as any;
            const text = data?.choices?.[0]?.message?.content || '';
            if (!text) {
                this.logger.warn('[Tier1] Empty HuggingFace response — cascading...');
                return null;
            }

            const parsed = this.parseResponse(text);
            if (!parsed) {
                this.logger.warn('[Tier1] Failed to parse HuggingFace response — cascading...');
                return null;
            }
            parsed.reasoning = `[Qwen] ${parsed.reasoning}`;
            return parsed;
        } catch (err: any) {
            this.logger.warn(`[Tier1] HuggingFace error: ${err.message} — cascading...`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Tier 2: Groq (Llama 3.3 70B -> Llama 3.1 8B fallback)
    // ════════════════════════════════════════════

    private async callGroq(systemPrompt: string, userPrompt: string, useFallbackModel = false): Promise<ForecasterOutput | null> {
        const modelId = useFallbackModel ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
        try {
            this.logger.log(`🔄 [Tier2] Routing to Groq (${modelId})...`);
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 1500,
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                // If 429 Rate Limit on 70B, try the 8B instant model once!
                if (response.status === 429 && !useFallbackModel) {
                    this.logger.warn(`[Tier2] Groq 70B Rate Limit Exceeded. Retrying with Llama 3.1 8B fallback...`);
                    return await this.callGroq(systemPrompt, userPrompt, true);
                }
                this.logger.warn(`[Tier2] Groq Failed - Status: ${response.status} Error: ${errText.substring(0, 150)} — cascading to OpenRouter...`);
                return null;
            }

            const data = await response.json() as any;
            const text = data?.choices?.[0]?.message?.content || '';
            if (!text) {
                this.logger.warn('[Tier2] Empty Groq response — cascading...');
                return null;
            }

            const parsed = this.parseResponse(text);
            if (parsed) {
                parsed.reasoning = `[Groq${useFallbackModel ? '-8B' : ''}] ${parsed.reasoning}`;
                return parsed;
            }
            this.logger.warn('[Tier2] Failed to parse Groq response — cascading...');
            return null;
        } catch (err: any) {
            this.logger.warn(`[Tier2] Groq network timeout/error: ${err.message} — cascading to OpenRouter...`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Tier 3: OpenRouter (Qwen 3.6 Plus FREE with reasoning payload)
    // ════════════════════════════════════════════

    private async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<ForecasterOutput | null> {
        try {
            this.logger.log(`🔄 [Tier3] Routing to OpenRouter (qwen/qwen3.6-plus:free)...`);
            const response = await fetch(this.OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Exoduze AI',
                },
                signal: AbortSignal.timeout(20000),
                body: JSON.stringify({
                    model: 'qwen/qwen3.6-plus:free',
                    messages: [
                        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}\n\nThink carefully using reasoning before responding. Make sure to respond with a parsable JSON string at the very end.` }
                    ],
                    max_tokens: 2000,
                    temperature: 0.2,
                    reasoning: { enabled: true }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                this.logger.warn(`[Tier3] OpenRouter Failed - Status: ${response.status} Error: ${errText.substring(0, 150)} — cascading to simulation...`);
                return null;
            }

            const data = await response.json() as any;
            const msg = data?.choices?.[0]?.message;
            let text = msg?.content || '';
            const reasoningDetails = msg?.reasoning_details;
            
            // Explicitly accommodate qwen that might bundle response into reasoning
            if (!text && msg) text = JSON.stringify(msg);

            const parsed = this.parseResponse(text);
            if (parsed) {
                let reasonSuffix = '';
                if (reasoningDetails && reasoningDetails.length > 0) {
                    reasonSuffix = ' (Reasoning Details Included)';
                }
                parsed.reasoning = `[OpenRouter/Qwen3.6+] ${parsed.reasoning}${reasonSuffix}`;
                return parsed;
            }
            this.logger.warn('[Tier3] Failed to parse OpenRouter response — cascading to simulation...');
            return null;
        } catch (err: any) {
            this.logger.warn(`[Tier3] OpenRouter error: ${err.message} — cascading to simulation...`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Tier 4: Local Simulation (Deterministic)
    // ════════════════════════════════════════════

    private generateSimulatedForecast(input: ForecasterInput): ForecasterOutput {
        let sentimentOffset = 0;
        let pos = 0, neg = 0;
        input.newsCluster.forEach(n => {
            if (n.sentiment > 0) pos++;
            else if (n.sentiment < 0) neg++;
        });

        if (pos > neg) sentimentOffset = 0.02 + (Math.random() * 0.02);
        if (neg > pos) sentimentOffset = -0.02 - (Math.random() * 0.02);

        const anchorProb = input.referenceProbability !== undefined ? input.referenceProbability : 0.5;
        const baseProb = Math.max(0.01, Math.min(0.99, anchorProb + sentimentOffset + (Math.random() * 0.02 - 0.01)));
        
        const curve: Array<{ timestamp_offset_mins: number; probability: number }> = [];
        let currentProb = baseProb;
        for (let i = 0; i <= 1440; i += 60) {
            curve.push({
                timestamp_offset_mins: i,
                probability: Number(currentProb.toFixed(3))
            });
            const step = (Math.random() * 0.04) - 0.02;
            currentProb = Math.max(0.01, Math.min(0.99, currentProb + step));
        }

        return {
            reasoning: `[LOCAL-SIM] All upstream APIs exhausted (HF/Groq/OpenRouter). Simulated from ${input.newsCluster.length} signals. Bias: ${sentimentOffset > 0 ? 'Bullish' : (sentimentOffset < 0 ? 'Bearish' : 'Neutral')}.`,
            signals_extracted: [
                { title: "Synthetic Signal", strength: "moderate", sentiment: sentimentOffset >= 0 ? "positive" : "negative" }
            ],
            base_probability: Number(baseProb.toFixed(3)),
            projected_curve: curve
        };
    }

    // ════════════════════════════════════════════
    // Prompt Builder & Response Parser
    // ════════════════════════════════════════════

    private buildPrompt(input: ForecasterInput): { systemPrompt: string; userPrompt: string } {
        const newsSummary = input.newsCluster.map((n, i) => `[Article ${i + 1}] ${n.title || n.url}: ${n.content || 'N/A'}`).join('\n');

        const systemPrompt = `You are an elite Autonomous Forecasting Agent competing in the Exoduze AI Competition.
Your goal is to predict the probability of an event occurring over a specific time horizon.
You must use structured reasoning:
1. Extract signals from the news cluster.
2. Classify sentiment (positive, negative, neutral).
3. Assess signal strength based on source credibility and consensus.
4. Calculate a prior base probability using Bayesian principles.
5. Project a rational probability curve (time-series) for the duration. Avoid extreme jumps without strong evidence.

Return ONLY a valid json object matching this schema:
{
  "reasoning": "brief explanation",
  "signals_extracted": [{"title": "...", "strength": "strong|moderate|weak", "sentiment": "positive|negative|neutral"}],
  "base_probability": 0.55,
  "projected_curve": [
    {"timestamp_offset_mins": 0, "probability": 0.55},
    {"timestamp_offset_mins": 60, "probability": 0.58}
  ]
}`;

        const userPrompt = `Event: ${input.eventTitle}
Description: ${input.description}
Time Horizon: ${input.horizon}
News Cluster:
${newsSummary}

Compute the probability and curve.`;

        return { systemPrompt, userPrompt };
    }

    private parseResponse(text: string): ForecasterOutput | null {
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start === -1 || end === -1) return null;

            const jsonStr = text.substring(start, end + 1);
            const parsed = JSON.parse(jsonStr) as ForecasterOutput;

            let rawProb = parsed.base_probability || 0.5;
            if (rawProb > 1 && rawProb <= 100) {
                rawProb = rawProb / 100;
            }
            parsed.base_probability = Math.max(0.01, Math.min(0.99, rawProb));

            parsed.projected_curve = (parsed.projected_curve || []).map(p => {
                let pProb = p.probability;
                if (pProb > 1 && pProb <= 100) {
                    pProb = pProb / 100;
                }
                return {
                    timestamp_offset_mins: p.timestamp_offset_mins,
                    probability: Math.max(0.01, Math.min(0.99, pProb))
                };
            });

            return parsed;
        } catch (e: any) {
            this.logger.error(`Failed to parse LLM response: ${e.message}. Raw: ${text.substring(0, 200)}...`);
            return null;
        }
    }
}

