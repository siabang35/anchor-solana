import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ForecasterInput {
    eventTitle: string;
    description: string;
    horizon: string;
    newsCluster: any[];
    marketSignals?: any[];
    referenceProbability?: number;
    agentId?: string;
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

interface TierCooldown {
    until: number;   // epoch ms when cooldown expires
    reason: string;  // e.g. "HuggingFace 402"
}

/**
 * Inference Fallback Chain with Auto-Recovery:
 *   1. Qwen 2.5 7B (HuggingFace Router) — primary
 *   2. OpenRouter Qwen 2.5 72B (FREE) — secondary
 *   3. Groq Llama 3.3 70B — tertiary
 *   4. Local Simulation — deterministic last resort (temporary)
 *
 * Rate-limited tiers enter a 60s cooldown. Once the cooldown expires,
 * the next inference attempt automatically re-probes the tier.
 * Recovery is seamless and logged clearly.
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
    private readonly OPENROUTER_MODEL_ID = 'meta-llama/llama-3.3-70b-instruct:free';

    /** Default cooldown duration when a tier hits rate limit (ms) */
    private readonly COOLDOWN_MS = 30_000;

    /**
     * Per-tier cooldown tracker.
     * When a tier returns 429/402/5xx, it enters cooldown and is skipped
     * until the cooldown expires — preventing wasted HTTP calls.
     * Once expired, the tier is automatically retried (auto-recovery).
     */
    private tierCooldowns: Map<string, TierCooldown> = new Map();

    /** Cache of latest valid predictions per agent to maintain state continuity */
    private agentSimState: Map<string, number> = new Map();

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

    // ════════════════════════════════════════════
    // Cooldown Management
    // ════════════════════════════════════════════

    /**
     * Set a cooldown for a tier after a rate-limit or payment error.
     * The tier will be skipped until the cooldown expires.
     */
    private setCooldown(tier: string, durationMs: number, reason: string): void {
        const until = Date.now() + durationMs;
        this.tierCooldowns.set(tier, { until, reason });
        const secs = Math.round(durationMs / 1000);
        this.logger.warn(`⏸ [${tier}] On cooldown for ${secs}s — reason: ${reason}`);
    }

    /**
     * Check if a tier is currently on cooldown.
     * If the cooldown has expired, it is automatically cleared (auto-recovery).
     */
    private isTierOnCooldown(tier: string): boolean {
        const cooldown = this.tierCooldowns.get(tier);
        if (!cooldown) return false;

        if (Date.now() >= cooldown.until) {
            // Cooldown expired — clear it and let the tier be retried
            this.tierCooldowns.delete(tier);
            this.logger.log(`🔓 [${tier}] Cooldown expired — probing for recovery...`);
            return false;
        }

        // Still on cooldown — skip silently
        return true;
    }

    /**
     * Called when a previously-cooled-down tier successfully returns a result.
     */
    private logRecovery(tier: string): void {
        this.logger.log(`✅ [${tier}] Recovered — resuming live inference`);
    }

    /**
     * Get the current status of all tiers (for observability/debugging).
     */
    getStatus(): Record<string, { status: 'live' | 'cooldown'; reason?: string; resumesIn?: number }> {
        const tiers = ['huggingface', 'openrouter', 'groq'];
        const result: Record<string, any> = {};

        for (const tier of tiers) {
            const cooldown = this.tierCooldowns.get(tier);
            if (!cooldown || Date.now() >= cooldown.until) {
                result[tier] = { status: 'live' };
            } else {
                result[tier] = {
                    status: 'cooldown',
                    reason: cooldown.reason,
                    resumesIn: Math.round((cooldown.until - Date.now()) / 1000),
                };
            }
        }

        return result;
    }

    // ════════════════════════════════════════════
    // Main Inference Entry Point
    // ════════════════════════════════════════════

    /**
     * Main inference entry point — cascades through the fallback chain
     * with cooldown-aware routing:
     *   Qwen (HF) → OpenRouter → Groq → Simulation
     *
     * Tiers on cooldown are skipped (no wasted HTTP calls).
     * Once cooldown expires, the tier is automatically re-probed.
     */
    async generateForecast(input: ForecasterInput): Promise<ForecasterOutput | null> {
        const { systemPrompt, userPrompt } = this.buildPrompt(input);

        // === Tier 1: Qwen 2.5 via HuggingFace ===
        if (this.HF_API_KEY && !this.isTierOnCooldown('huggingface')) {
            this.logger.log(`🔄 [Tier1] Routing to HuggingFace (${this.HF_MODEL_ID})...`);
            const wasCooledDown = this.tierCooldowns.has('huggingface'); // check before call deletes it
            const result = await this.callHuggingFace(systemPrompt, userPrompt);
            if (result) {
                if (wasCooledDown) this.logRecovery('huggingface');
                if (input.agentId) this.agentSimState.set(`${input.agentId}-${input.eventTitle}`, result.base_probability);
                return result;
            }
        }

        // === Tier 2: OpenRouter Qwen 2.5 72B (FREE) ===
        if (this.OPENROUTER_API_KEY && !this.isTierOnCooldown('openrouter')) {
            const wasCooledDown = this.tierCooldowns.has('openrouter');
            const result = await this.callOpenRouter(systemPrompt, userPrompt);
            if (result) {
                if (wasCooledDown) this.logRecovery('openrouter');
                if (input.agentId) this.agentSimState.set(`${input.agentId}-${input.eventTitle}`, result.base_probability);
                return result;
            }
        }

        // === Tier 3: Groq Llama 3.3 70B ===
        if (this.GROQ_API_KEY && !this.isTierOnCooldown('groq')) {
            const wasCooledDown = this.tierCooldowns.has('groq');
            const result = await this.callGroq(systemPrompt, userPrompt);
            if (result) {
                if (wasCooledDown) this.logRecovery('groq');
                if (input.agentId) this.agentSimState.set(`${input.agentId}-${input.eventTitle}`, result.base_probability);
                return result;
            }
        }

        // === Tier 4: Local Simulation Fallback (temporary) ===
        const activeCooldowns = ['huggingface', 'openrouter', 'groq']
            .filter(t => this.tierCooldowns.has(t))
            .map(t => {
                const cd = this.tierCooldowns.get(t)!;
                const resumesIn = Math.round((cd.until - Date.now()) / 1000);
                return `${t}(${resumesIn}s)`;
            });

        if (activeCooldowns.length > 0) {
            this.logger.warn(`🔄 All AI engines on cooldown [${activeCooldowns.join(', ')}]. Using simulation — will auto-recover when cooldowns expire.`);
        } else {
            this.logger.warn(`🔄 All AI engines exhausted. Falling back to local simulation...`);
        }

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
                // 402 = payment/billing — won't recover on its own, use longer cooldown
                if (response.status === 402) {
                    this.setCooldown('huggingface', 5 * 60_000, `HuggingFace 402 (billing)`);
                } else if (response.status === 429 || response.status === 503) {
                    this.setCooldown('huggingface', this.COOLDOWN_MS, `HuggingFace ${response.status}`);
                } else {
                    this.logger.warn(`[Tier1] HuggingFace ${response.status} — cascading...`);
                }
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
    // Tier 2: OpenRouter (Qwen 2.5 72B FREE)
    // ════════════════════════════════════════════

    private async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<ForecasterOutput | null> {
        try {
            this.logger.log(`🔄 [Tier2] Routing to OpenRouter (${this.OPENROUTER_MODEL_ID})...`);
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
                    model: this.OPENROUTER_MODEL_ID,
                    messages: [
                        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}\n\nRespond with a parsable JSON object only.` }
                    ],
                    max_tokens: 2000,
                    temperature: 0.2,
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                // Rate-limit, payment, or deprecation → cooldown
                if (response.status === 429 || response.status === 402 || response.status === 503) {
                    this.setCooldown('openrouter', this.COOLDOWN_MS, `OpenRouter ${response.status}`);
                } else if (response.status === 404) {
                    // Model deprecated — longer cooldown (5 min) to avoid hammering
                    this.setCooldown('openrouter', 5 * 60_000, `OpenRouter model deprecated (404)`);
                } else {
                    this.logger.warn(`[Tier2] OpenRouter Failed - Status: ${response.status} Error: ${errText.substring(0, 150)} — cascading...`);
                }
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
                parsed.reasoning = `[OpenRouter/Llama-70B] ${parsed.reasoning}${reasonSuffix}`;
                return parsed;
            }
            this.logger.warn('[Tier2] Failed to parse OpenRouter response — cascading...');
            return null;
        } catch (err: any) {
            this.logger.warn(`[Tier2] OpenRouter error: ${err.message} — cascading...`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Tier 3: Groq (Llama 3.3 70B -> Llama 3.1 8B fallback)
    // ════════════════════════════════════════════

    private async callGroq(systemPrompt: string, userPrompt: string, useFallbackModel = false): Promise<ForecasterOutput | null> {
        const modelId = useFallbackModel ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
        try {
            this.logger.log(`🔄 [Tier3] Routing to Groq (${modelId})...`);
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
                    this.logger.warn(`[Tier3] Groq 70B Rate Limit Exceeded. Retrying with Llama 3.1 8B fallback...`);
                    return await this.callGroq(systemPrompt, userPrompt, true);
                }
                // Both models rate-limited → set cooldown
                if (response.status === 429 || response.status === 402 || response.status === 503) {
                    this.setCooldown('groq', this.COOLDOWN_MS, `Groq ${response.status} (${modelId})`);
                } else {
                    this.logger.warn(`[Tier3] Groq Failed - Status: ${response.status} Error: ${errText.substring(0, 150)} — cascading...`);
                }
                return null;
            }

            const data = await response.json() as any;
            const text = data?.choices?.[0]?.message?.content || '';
            if (!text) {
                this.logger.warn('[Tier3] Empty Groq response — cascading...');
                return null;
            }

            const parsed = this.parseResponse(text);
            if (parsed) {
                parsed.reasoning = `[Groq${useFallbackModel ? '-8B' : ''}] ${parsed.reasoning}`;
                return parsed;
            }
            this.logger.warn('[Tier3] Failed to parse Groq response — cascading...');
            return null;
        } catch (err: any) {
            this.logger.warn(`[Tier3] Groq network timeout/error: ${err.message} — cascading...`);
            return null;
        }
    }

    // ════════════════════════════════════════════
    // Tier 4: Local Simulation (Deterministic)
    // ════════════════════════════════════════════

    private generateSimulatedForecast(input: ForecasterInput): ForecasterOutput {
        const agentKey = input.agentId ? `${input.agentId}-${input.eventTitle}` : null;
        let anchorProb = input.referenceProbability !== undefined ? input.referenceProbability : 0.5;
        
        if (agentKey && this.agentSimState.has(agentKey)) {
            anchorProb = this.agentSimState.get(agentKey)!;
        }

        let sentimentOffset = 0;
        let pos = 0, neg = 0;
        input.newsCluster.forEach(n => {
            if (n.sentiment > 0) pos++;
            else if (n.sentiment < 0) neg++;
        });

        if (pos > neg) sentimentOffset = 0.02 + (Math.random() * 0.02);
        if (neg > pos) sentimentOffset = -0.02 - (Math.random() * 0.02);

        // Agent-specific persistent noise component to ensure multiple agents diverge
        let agentHash = 0;
        if (input.agentId) {
            for (let i = 0; i < input.agentId.length; i++) {
                agentHash = ((agentHash << 5) - agentHash) + input.agentId.charCodeAt(i);
                agentHash |= 0; 
            }
        }
        const deterministicNoise = ((Math.abs(agentHash) % 100) / 100) * 0.04 - 0.02; // -0.02 to +0.02

        const baseProb = Math.max(0.01, Math.min(0.99, anchorProb + sentimentOffset + deterministicNoise + (Math.random() * 0.02 - 0.01)));
        
        if (agentKey) {
            this.agentSimState.set(agentKey, baseProb);
        }
        
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
            // Strip markdown code fences (```json ... ```) that some models wrap their output in
            let cleaned = text;
            const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
            if (fenceMatch) {
                cleaned = fenceMatch[1].trim();
            }

            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) return null;

            const jsonStr = cleaned.substring(start, end + 1);
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
