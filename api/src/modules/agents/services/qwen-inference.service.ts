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
    // Securely loading HF key using ConfigService to ensure variables are resolved
    private readonly HF_API_KEY: string;
    private readonly MODEL_URL = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct'; // Downgraded to 7B because larger models 404 on Free Tier

    constructor(private readonly configService: ConfigService) {
        this.HF_API_KEY = this.configService.get<string>('HUGGINGFACE_TOKEN') || process.env.HUGGINGFACE_TOKEN || '';
    }

    /**
     * Calls Qwen 3.5 9B to generate a probability curve projection and reasoning.
     */
    async generateForecast(input: ForecasterInput): Promise<ForecasterOutput | null> {
        const prompt = this.buildPrompt(input);

        try {
            const response = await fetch(this.MODEL_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.HF_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 1500,
                        temperature: 0.2, // Low temperature for consistent reasoning
                        return_full_text: false,
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                this.logger.error(`HuggingFace API Error: ${response.status} ${errText}`);
                return null;
            }

            const data = await response.json();
            const generatedText = (data as any)[0]?.generated_text || '';

            return this.parseResponse(generatedText);

        } catch (error: any) {
            this.logger.error(`Qwen Inference Failed: ${error.message}`);
            return null;
        }
    }

    private buildPrompt(input: ForecasterInput): string {
        const newsSummary = input.newsCluster.map((n, i) => `[Article ${i + 1}] ${n.title || n.url}: ${n.content || 'N/A'}`).join('\n');

        return `<|im_start|>system
You are an elite Autonomous Forecasting Agent competing in the Exoduze AI Competition.
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
}
<|im_end|>
<|im_start|>user
Event: ${input.eventTitle}
Description: ${input.description}
Time Horizon: ${input.horizon}
News Cluster:
${newsSummary}

Compute the probability and curve.<|im_end|>
<|im_start|>assistant`;
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
            parsed.base_probability = Math.max(0.05, Math.min(0.95, parsed.base_probability || 0.5));

            // Constrain curve
            parsed.projected_curve = (parsed.projected_curve || []).map(p => ({
                timestamp_offset_mins: p.timestamp_offset_mins,
                probability: Math.max(0.05, Math.min(0.95, p.probability))
            }));

            return parsed;
        } catch (e: any) {
            this.logger.error(`Failed to parse Qwen response: ${e.message}. Raw text: ${text.substring(0, 200)}...`);
            return null;
        }
    }
}
