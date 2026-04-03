import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ForecasterInput {
    eventTitle: string;
    description: string;
    horizon: string;
    newsCluster: any[];
    marketSignals?: any[];
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

@Injectable()
export class QwenInferenceService {
    private readonly logger = new Logger(QwenInferenceService.name);
    private readonly HF_API_KEY: string;
    private readonly GROQ_API_KEY: string;

    /**
     * HuggingFace Inference Providers — OpenAI-compatible chat/completions API.
     * Old `api-inference.huggingface.co` is deprecated since 2026.
     * New: `router.huggingface.co/v1/chat/completions`
     */
    private readonly API_URL = 'https://router.huggingface.co/v1/chat/completions';
    private readonly MODEL_ID = 'Qwen/Qwen2.5-7B-Instruct';

    constructor(private readonly configService: ConfigService) {
        this.HF_API_KEY = this.configService.get<string>('HUGGINGFACE_TOKEN') || process.env.HUGGINGFACE_TOKEN || '';
        this.GROQ_API_KEY = this.configService.get<string>('GROQ_API_KEY') || process.env.GROQ_API_KEY || '';
        
        if (!this.HF_API_KEY) {
            this.logger.warn('⚠ HUGGINGFACE_TOKEN not configured — Qwen inference will fail');
        } else {
            this.logger.log(`✅ HuggingFace token loaded (${this.HF_API_KEY.substring(0, 6)}...)`);
        }
        
        if (this.GROQ_API_KEY) {
            this.logger.log(`✅ Groq fallback token loaded (${this.GROQ_API_KEY.substring(0, 6)}...)`);
        }
    }

    /**
     * Calls Qwen 2.5 7B Instruct via HuggingFace Inference Providers
     * to generate a probability curve projection and reasoning.
     */
    async generateForecast(input: ForecasterInput): Promise<ForecasterOutput | null> {
        const { systemPrompt, userPrompt } = this.buildPrompt(input);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.HF_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.MODEL_ID,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 1500,
                    temperature: 0.2, // Low temperature for consistent reasoning
                })
            });
            clearTimeout(timeoutId);

            let generatedText = '';

            if (!response.ok) {
                const errText = await response.text();
                this.logger.warn(`HuggingFace API limits hit: ${response.status}. Attempting Groq fallback...`);
                
                if (!this.GROQ_API_KEY) {
                    this.logger.error(`Groq fallback unavailable: GROQ_API_KEY missing.`);
                    return null;
                }
                
                this.logger.log(`🔄 Routing inference to Groq (llama3-8b-8192)...`);
                const groqController = new AbortController();
                const groqTimeout = setTimeout(() => groqController.abort(), 15000);
                
                const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.GROQ_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    signal: groqController.signal,
                    body: JSON.stringify({
                        model: 'llama3-8b-8192',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt },
                        ],
                        max_tokens: 1500,
                        temperature: 0.2,
                        response_format: { type: 'json_object' }
                    })
                });
                clearTimeout(groqTimeout);
                
                if (!groqResponse.ok) {
                    const groqErrText = await groqResponse.text();
                    this.logger.error(`Groq API Error: ${groqResponse.status} ${groqErrText}`);
                    return null;
                }
                
                const groqData = await groqResponse.json() as any;
                generatedText = groqData?.choices?.[0]?.message?.content || '';
                
                if (!generatedText) return null;
                
                const parsed = this.parseResponse(generatedText);
                if (parsed) {
                    parsed.reasoning = `[Groq] ${parsed.reasoning}`;
                }
                return parsed;
                
            } else {
                const data = await response.json() as any;
                generatedText = data?.choices?.[0]?.message?.content || '';
                
                if (!generatedText) {
                    this.logger.warn('Empty response from Inference API');
                    return null;
                }
    
                return this.parseResponse(generatedText);
            }

        } catch (error: any) {
            this.logger.error(`Inference Pipeline Failed: ${error.message}`);
            return null;
        }
    }

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

Return ONLY a valid JSON object matching this schema:
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
            // Find the first { and last } to extract JSON
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start === -1 || end === -1) return null;

            const jsonStr = text.substring(start, end + 1);
            const parsed = JSON.parse(jsonStr) as ForecasterOutput;

            // Validate and sanitize base probability (avoid extreme predictions)
            // If the model mistakenly outputs a percentage (e.g., 95 instead of 0.95), convert it
            let rawProb = parsed.base_probability || 0.5;
            if (rawProb > 1 && rawProb <= 100) {
                rawProb = rawProb / 100;
            }
            parsed.base_probability = Math.max(0.01, Math.min(0.99, rawProb));

            // Constrain curve
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
            this.logger.error(`Failed to parse Qwen response: ${e.message}. Raw text: ${text.substring(0, 200)}...`);
            return null;
        }
    }
}
