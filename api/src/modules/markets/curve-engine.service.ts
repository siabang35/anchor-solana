/**
 * Anti-Prediction Curve Engine Service
 * 
 * Generates probability curves that are extremely difficult for AI agents to predict.
 * Uses multi-layer mathematical perturbations combined with LLM-driven analysis.
 * 
 * Architecture:
 *   RealTimeData → Qwen LLM Evaluation → Bayesian Posterior →
 *   Lorenz Attractor → Hénon Map → HMM Regime Switch →
 *   Fourier Noise → Entropy Injection → Final Probabilities
 * 
 * Each category has unique parameter profiles making curves
 * fundamentally different in character.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service.js';
import { MarketDataGateway } from './market-data.gateway.js';
import { MultiSourceFusionService, FusionResult } from './multi-source-fusion.service.js';
import * as crypto from 'crypto';

// ══════════════════════════════════════════
// Interfaces
// ══════════════════════════════════════════

export interface ProbabilitySnapshot {
    time: string;
    home: number;
    draw: number;
    away: number;
    narrative?: string;
    regime?: string;
}

interface LorenzState {
    x: number;
    y: number;
    z: number;
}

interface HenonState {
    x: number;
    y: number;
}

interface FourierComponent {
    amplitude: number;
    frequency: number;
    phase: number;
    decay: number;      // amplitude decay rate
    modFreq: number;    // modulation frequency
}

type Regime = 'volatile' | 'trending' | 'mean_reverting';

interface CurveState {
    // Bayesian priors (basis points, sum = 10000)
    priors: [number, number, number];
    // Chaotic oscillator states
    lorenz: LorenzState;
    henon: HenonState;
    // HMM regime
    regime: Regime;
    regimeAge: number;           // How many ticks in current regime
    regimeTransitionMatrix: number[][];
    // Fourier noise generators (per outcome)
    fourierHome: FourierComponent[];
    fourierDraw: FourierComponent[];
    fourierAway: FourierComponent[];
    // Time & entropy
    tick: number;
    entropyPool: number[];       // Seeded from real data
    lastEntropySeed: string;
    // Momentum tracking
    momentum: [number, number, number];
    volatility: number;
    // History for mean-reversion
    history: Array<[number, number, number]>;
    // Multi-source fusion (Layer 7-10)
    lastFusion: FusionResult | null;
    lastHmac: string;            // HMAC chain for integrity
    adaptiveComplexity: number;  // 1.0-3.0 scales mathematical complexity
    autocorrelationScore: number;// Detects predictable patterns
    mathContext?: string;        // Structural mathematical context for narratives
}

interface CategoryProfile {
    // Lorenz parameters
    lorenzSigma: number;
    lorenzRho: number;
    lorenzBeta: number;
    lorenzScale: number;         // How much Lorenz affects output
    // Hénon parameters
    henonA: number;
    henonB: number;
    henonScale: number;
    // Regime transition probabilities [volatile→, trending→, meanRev→]
    regimeTransition: number[][];
    // Fourier characteristics
    fourierCount: number;        // Number of frequency components
    fourierMaxAmplitude: number;
    fourierFreqRange: [number, number];
    // Volatility
    baseVolatility: number;
    volatilityRange: [number, number];
    // Mean-reversion strength
    meanReversionStrength: number;
    // Momentum parameters
    momentumDecay: number;
    momentumScale: number;
    // Noise floor
    noiseFloor: number;
    // Initial priors (basis points)
    defaultPriors: [number, number, number];
    // Description
    description: string;
}

// ══════════════════════════════════════════
// Category Profiles — each category has unique mathematical DNA
// ══════════════════════════════════════════

const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
    sports: {
        lorenzSigma: 12, lorenzRho: 28, lorenzBeta: 2.667,
        lorenzScale: 0.08,
        henonA: 1.4, henonB: 0.3, henonScale: 0.05,
        regimeTransition: [
            [0.70, 0.20, 0.10],  // volatile → stays volatile often
            [0.15, 0.70, 0.15],
            [0.20, 0.10, 0.70],
        ],
        fourierCount: 5, fourierMaxAmplitude: 1.2,
        fourierFreqRange: [0.05, 0.4],
        baseVolatility: 0.15, volatilityRange: [0.08, 0.35],
        meanReversionStrength: 0.03,
        momentumDecay: 0.85, momentumScale: 0.6,
        noiseFloor: 0.3,
        defaultPriors: [4200, 2800, 3000],
        description: 'High volatility, momentum-driven with sudden shifts',
    },
    finance: {
        lorenzSigma: 10, lorenzRho: 24, lorenzBeta: 2.5,
        lorenzScale: 0.04,
        henonA: 1.2, henonB: 0.35, henonScale: 0.03,
        regimeTransition: [
            [0.40, 0.25, 0.35],
            [0.20, 0.50, 0.30],
            [0.15, 0.20, 0.65],  // mean-reverting is dominant
        ],
        fourierCount: 7, fourierMaxAmplitude: 0.8,
        fourierFreqRange: [0.02, 0.25],
        baseVolatility: 0.08, volatilityRange: [0.04, 0.20],
        meanReversionStrength: 0.08,
        momentumDecay: 0.92, momentumScale: 0.3,
        noiseFloor: 0.15,
        defaultPriors: [3800, 2500, 3700],
        description: 'Mean-reverting with periodic oscillations',
    },
    crypto: {
        lorenzSigma: 14, lorenzRho: 32, lorenzBeta: 3.0,
        lorenzScale: 0.12,
        henonA: 1.35, henonB: 0.28, henonScale: 0.08,
        regimeTransition: [
            [0.55, 0.30, 0.15],
            [0.25, 0.55, 0.20],
            [0.30, 0.25, 0.45],  // regime switches fast
        ],
        fourierCount: 8, fourierMaxAmplitude: 1.5,
        fourierFreqRange: [0.08, 0.5],
        baseVolatility: 0.25, volatilityRange: [0.12, 0.50],
        meanReversionStrength: 0.02,
        momentumDecay: 0.78, momentumScale: 0.9,
        noiseFloor: 0.5,
        defaultPriors: [3500, 2000, 4500],
        description: 'Extremely volatile with fast regime switches',
    },
    tech: {
        lorenzSigma: 8, lorenzRho: 20, lorenzBeta: 2.0,
        lorenzScale: 0.03,
        henonA: 1.15, henonB: 0.32, henonScale: 0.02,
        regimeTransition: [
            [0.30, 0.50, 0.20],
            [0.10, 0.75, 0.15],  // trending dominates
            [0.15, 0.35, 0.50],
        ],
        fourierCount: 4, fourierMaxAmplitude: 0.6,
        fourierFreqRange: [0.01, 0.15],
        baseVolatility: 0.06, volatilityRange: [0.03, 0.15],
        meanReversionStrength: 0.04,
        momentumDecay: 0.95, momentumScale: 0.4,
        noiseFloor: 0.1,
        defaultPriors: [4000, 2200, 3800],
        description: 'Trend-following with smooth drift',
    },
    economy: {
        lorenzSigma: 7, lorenzRho: 18, lorenzBeta: 1.8,
        lorenzScale: 0.02,
        henonA: 1.1, henonB: 0.38, henonScale: 0.015,
        regimeTransition: [
            [0.25, 0.15, 0.60],
            [0.10, 0.30, 0.60],
            [0.05, 0.10, 0.85],  // strongly mean-reverting
        ],
        fourierCount: 6, fourierMaxAmplitude: 0.5,
        fourierFreqRange: [0.005, 0.08],
        baseVolatility: 0.04, volatilityRange: [0.02, 0.10],
        meanReversionStrength: 0.12,
        momentumDecay: 0.96, momentumScale: 0.2,
        noiseFloor: 0.08,
        defaultPriors: [3400, 3300, 3300],
        description: 'Low volatility with strong mean-reversion and long cycles',
    },
    science: {
        lorenzSigma: 9, lorenzRho: 22, lorenzBeta: 2.2,
        lorenzScale: 0.06,
        henonA: 1.25, henonB: 0.30, henonScale: 0.04,
        regimeTransition: [
            [0.35, 0.15, 0.50],
            [0.40, 0.25, 0.35],  // can jump to volatile
            [0.10, 0.10, 0.80],  // but mostly calm
        ],
        fourierCount: 3, fourierMaxAmplitude: 0.4,
        fourierFreqRange: [0.01, 0.10],
        baseVolatility: 0.05, volatilityRange: [0.02, 0.30],
        meanReversionStrength: 0.06,
        momentumDecay: 0.90, momentumScale: 0.5,
        noiseFloor: 0.12,
        defaultPriors: [3600, 3000, 3400],
        description: 'Step-function jumps with quiet periods',
    },
    politics: {
        lorenzSigma: 11, lorenzRho: 26, lorenzBeta: 2.4,
        lorenzScale: 0.10,
        henonA: 1.30, henonB: 0.25, henonScale: 0.07,
        regimeTransition: [
            [0.60, 0.25, 0.15],  // volatile → stays volatile
            [0.35, 0.45, 0.20],
            [0.30, 0.20, 0.50],
        ],
        fourierCount: 5, fourierMaxAmplitude: 1.0,
        fourierFreqRange: [0.03, 0.35],
        baseVolatility: 0.18, volatilityRange: [0.08, 0.40],
        meanReversionStrength: 0.03,
        momentumDecay: 0.82, momentumScale: 0.7,
        noiseFloor: 0.35,
        defaultPriors: [3800, 2400, 3800],
        description: 'Bipolar regime switching with sudden spikes',
    },
};

// ══════════════════════════════════════════
// CurveEngine Service
// ══════════════════════════════════════════

@Injectable()
export class CurveEngineService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CurveEngineService.name);
    private readonly hmacSecret: string;

    // Active curve states per competition
    private curveStates: Map<string, CurveState> = new Map();

    // Active streaming intervals
    private streamIntervals: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        @Inject(forwardRef(() => MarketDataGateway))
        private readonly marketDataGateway: MarketDataGateway,
        private readonly fusionService: MultiSourceFusionService,
    ) {
        this.hmacSecret = this.configService.get<string>('CURVE_HMAC_SECRET') || crypto.randomBytes(32).toString('hex');
    }

    async onModuleInit() {
        this.logger.log('🎲 CurveEngine initialized — Anti-prediction algorithms active [Algorithmic Gen-Only]');
        this.logger.log(`   Categories: ${Object.keys(CATEGORY_PROFILES).join(', ')}`);

        // Auto-start curves for active competitions
        await this.autoStartActiveCompetitions();
    }

    onModuleDestroy() {
        for (const [id, interval] of this.streamIntervals) {
            clearInterval(interval);
        }
        this.streamIntervals.clear();
        this.curveStates.clear();
        this.logger.log('CurveEngine shut down');
    }

    // ══════════════════════════════════════════
    // Public API
    // ══════════════════════════════════════════

    /**
     * Generate a single curve point for a given category
     */
    generateCurvePoint(category: string, competitionId: string): ProbabilitySnapshot {
        const profile = CATEGORY_PROFILES[category] || CATEGORY_PROFILES.sports;
        let state = this.curveStates.get(competitionId);

        if (!state) {
            state = this.initializeState(category, competitionId);
            this.curveStates.set(competitionId, state);
        }

        // === MULTI-LAYER PIPELINE ===
        const cx = state.adaptiveComplexity;

        // Layer 1: Lorenz attractor perturbation
        const lorenzDelta = this.stepLorenz(state.lorenz, profile);

        // Layer 2: Hénon map injection
        const henonDelta = this.stepHenon(state.henon, profile);

        // Layer 3: HMM Regime switch
        this.stepRegime(state, profile);

        // Layer 4: Fourier noise generation
        const fourierDelta = this.computeFourier(state, profile);

        // Layer 5: Entropy injection from real data
        const entropyDelta = this.computeEntropy(state, profile);

        // Layer 6: Momentum and mean-reversion
        const momentumDelta = this.computeMomentum(state, profile);
        const meanRevDelta = this.computeMeanReversion(state, profile);

        // Layer 7: Multi-source data fusion signal
        const fusionDelta = this.computeFusionSignal(state);

        // Layer 8: Cross-category correlation injection
        const crossDelta = this.computeCrossCategoryNoise(state);

        // === COMBINE ALL LAYERS ===
        let [h, d, a] = state.priors;

        // Apply regime-dependent weighting
        const regimeWeights = this.getRegimeWeights(state.regime);

        // Lorenz (chaotic micro-perturbation) — scaled by adaptive complexity
        h += lorenzDelta[0] * regimeWeights.chaos * profile.lorenzScale * 100 * cx;
        d += lorenzDelta[1] * regimeWeights.chaos * profile.lorenzScale * 100 * cx;
        a += lorenzDelta[2] * regimeWeights.chaos * profile.lorenzScale * 100 * cx;

        // Hénon (secondary chaos)
        h += henonDelta[0] * regimeWeights.chaos * profile.henonScale * 100 * cx;
        d += henonDelta[1] * regimeWeights.chaos * profile.henonScale * 50 * cx;
        a += henonDelta[2] * regimeWeights.chaos * profile.henonScale * 100 * cx;

        // Fourier (periodic noise)
        h += fourierDelta[0] * regimeWeights.noise * 100;
        d += fourierDelta[1] * regimeWeights.noise * 60;
        a += fourierDelta[2] * regimeWeights.noise * 100;

        // Entropy (data-driven randomness)
        h += entropyDelta[0] * regimeWeights.entropy * 80 * cx;
        d += entropyDelta[1] * regimeWeights.entropy * 40 * cx;
        a += entropyDelta[2] * regimeWeights.entropy * 80 * cx;

        // Momentum
        h += momentumDelta[0] * regimeWeights.momentum * 100;
        d += momentumDelta[1] * regimeWeights.momentum * 50;
        a += momentumDelta[2] * regimeWeights.momentum * 100;

        // Mean-reversion
        h += meanRevDelta[0] * regimeWeights.meanRev * 100;
        d += meanRevDelta[1] * regimeWeights.meanRev * 60;
        a += meanRevDelta[2] * regimeWeights.meanRev * 100;

        // Layer 7: Multi-source fusion (real data influence)
        h += fusionDelta[0] * regimeWeights.entropy * 120;
        d += fusionDelta[1] * regimeWeights.entropy * 60;
        a += fusionDelta[2] * regimeWeights.entropy * 120;

        // Layer 8: Cross-category correlation noise
        h += crossDelta[0] * 40 * cx;
        d += crossDelta[1] * 20 * cx;
        a += crossDelta[2] * 40 * cx;

        // Add noise floor
        const nf = profile.noiseFloor;
        h += (this.seededRandom(state) - 0.5) * nf * 100;
        d += (this.seededRandom(state) - 0.5) * nf * 50;
        a += (this.seededRandom(state) - 0.5) * nf * 100;

        // === NORMALIZE ===
        // Clamp to valid ranges (Anti-manipulation limits 0.05 - 0.95 equivalent before sum normalization)
        h = Math.max(500, Math.min(9500, h));
        d = Math.max(500, Math.min(9500, d));
        a = Math.max(500, Math.min(9500, a));

        const total = h + d + a;
        h = Math.round((h / total) * 10000);
        d = Math.round((d / total) * 10000);
        a = 10000 - h - d;
        
        // Final sanity bound after proportion adjustment
        if (h > 9500) { h = 9500; d -= (h - 9500)/2; a -= (h - 9500)/2; }
        if (h < 500) { h = 500; d += (500 - h)/2; a += (500 - h)/2; }
        if (a > 9500) { a = 9500; d -= (a - 9500)/2; h -= (a - 9500)/2; }
        if (a < 500) { a = 500; d += (500 - a)/2; h += (500 - a)/2; }

        // Update state
        state.priors = [h, d, a];
        state.tick++;

        // Track history for mean-reversion
        state.history.push([h, d, a]);
        if (state.history.length > 50) state.history.shift();

        // Update momentum
        state.momentum = [
            state.momentum[0] * profile.momentumDecay + (h - (state.history.length > 1 ? state.history[state.history.length - 2][0] : h)),
            state.momentum[1] * profile.momentumDecay + (d - (state.history.length > 1 ? state.history[state.history.length - 2][1] : d)),
            state.momentum[2] * profile.momentumDecay + (a - (state.history.length > 1 ? state.history[state.history.length - 2][2] : a)),
        ];

        // Layer 9: Adaptive complexity — detect autocorrelation in recent history
        this.updateAdaptiveComplexity(state);

        // Layer 10: HMAC integrity chain
        const hmac = this.computeHmac(state, h, d, a);
        state.lastHmac = hmac;

        // Generate algorithmic narrative
        const momentumStr = `M:[${state.momentum.map(m => m.toFixed(2)).join(',')}]`;
        const vScore = `VolFactor: ${(state.volatility * 10).toFixed(2)}`;
        const cxScore = `Turbulence: ${state.adaptiveComplexity.toFixed(2)}x`;
        const narrativeStr = `Regime: ${state.regime.toUpperCase()} | ${cxScore} | ${vScore} | ${momentumStr} | Logic: ${state.mathContext || 'Systematic Probability'}`;

        // Build snapshot
        const snapshot: ProbabilitySnapshot = {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            home: Math.round(h) / 100,
            draw: Math.round(d) / 100,
            away: Math.round(a) / 100,
            regime: state.regime,
            narrative: narrativeStr
        };

        return snapshot;
    }

    /**
     * Start a continuous curve stream for a competition
     * Generates points every 3 seconds and broadcasts via WebSocket
     */
    async startCurveStream(competitionId: string, category: string): Promise<void> {
        // Don't double-start
        if (this.streamIntervals.has(competitionId)) {
            this.logger.debug(`Stream already active for ${competitionId}`);
            return;
        }

        const profile = CATEGORY_PROFILES[category] || CATEGORY_PROFILES.sports;
        this.logger.log(`🚀 Starting curve stream for ${competitionId} (${category}: ${profile.description})`);

        // Fetch competition dynamically to determine its horizon length
        const supabase = this.supabaseService.getAdminClient();
        const { data: comp } = await supabase
            .from('competitions')
            .select('competition_start, competition_end')
            .eq('id', competitionId)
            .single();

        let updateIntervalMs = 3 * 60 * 1000; // Default 3 minutes
        
        if (comp && comp.competition_start && comp.competition_end) {
            const durationMs = new Date(comp.competition_end).getTime() - new Date(comp.competition_start).getTime();
            const durationHours = durationMs / (1000 * 60 * 60);

            // Mapping based on requirements (2h:10min, 7h:30min, 12h:1h, 24h:2h, 3d:6h, 7d:24h) 
            if (durationHours <= 2) {
                updateIntervalMs = 10 * 60 * 1000;
            } else if (durationHours <= 7) {
                updateIntervalMs = 30 * 60 * 1000;
            } else if (durationHours <= 12) {
                updateIntervalMs = 60 * 60 * 1000;
            } else if (durationHours <= 24) {
                updateIntervalMs = 2 * 60 * 60 * 1000;
            } else if (durationHours <= 72) {
                updateIntervalMs = 6 * 60 * 60 * 1000;
            } else {
                updateIntervalMs = 24 * 60 * 60 * 1000; // 7d mapping
            }
        }

        // Initialize state
        if (!this.curveStates.has(competitionId)) {
            const state = this.initializeState(category, competitionId);
            this.curveStates.set(competitionId, state);
        }

        // Seed entropy from real data
        await this.refreshEntropy(competitionId, category);

        // Start the stream
        const interval = setInterval(async () => {
            try {
                // Periodically refresh entropy from real data (every ~30s)
                const state = this.curveStates.get(competitionId);
                if (state && state.tick % 10 === 0) {
                    await this.refreshEntropy(competitionId, category);
                }

                // Generate curve point algorithmically
                const snapshot = this.generateCurvePoint(category, competitionId);

                // Store in Supabase
                await this.storeSnapshot(competitionId, category, snapshot);

                // Broadcast via WebSocket gateway
                this.marketDataGateway.broadcastCurveUpdate(competitionId, snapshot);

                // Also broadcast via Supabase Realtime channel
                const supabase = this.supabaseService.getAdminClient();
                const channel = supabase.channel(`competition-market-${competitionId}`);
                await (channel as any).httpSend('probability_update', { marketId: competitionId, snapshot });
            } catch (err: any) {
                this.logger.error(`Curve stream error for ${competitionId}: ${err.message}`);
            }
        }, updateIntervalMs); 

        // Generate the 0-tick first snapshot instantly
        setTimeout(() => {
            const state = this.curveStates.get(competitionId);
            if (state && state.tick === 0) {
                 this.generateCurvePoint(category, competitionId);
            }
        }, 1000);

        this.streamIntervals.set(competitionId, interval);
    }

    /**
     * Stop a curve stream
     */
    stopCurveStream(competitionId: string): void {
        const interval = this.streamIntervals.get(competitionId);
        if (interval) {
            clearInterval(interval);
            this.streamIntervals.delete(competitionId);
            this.curveStates.delete(competitionId);
            this.logger.log(`⏹ Stopped curve stream for ${competitionId}`);
        }
    }

    /**
     * Get the current state for debugging/inspection
     */
    getState(competitionId: string): CurveState | undefined {
        return this.curveStates.get(competitionId);
    }

    // ══════════════════════════════════════════
    // Initialization
    // ══════════════════════════════════════════

    private initializeState(category: string, competitionId: string): CurveState {
        const profile = CATEGORY_PROFILES[category] || CATEGORY_PROFILES.sports;

        // Deterministic seed from competitionId for reproducible chaos initialization
        const seed = this.hashToNumbers(competitionId, 10);

        // Initialize Lorenz near its attractor
        const lorenz: LorenzState = {
            x: 1.0 + seed[0] * 0.5,
            y: 1.0 + seed[1] * 0.5,
            z: 1.0 + seed[2] * 0.5,
        };

        // Initialize Hénon
        const henon: HenonState = {
            x: 0.1 + seed[3] * 0.3,
            y: 0.1 + seed[4] * 0.3,
        };

        // Generate Fourier components per outcome
        const genFourier = (offset: number): FourierComponent[] => {
            const components: FourierComponent[] = [];
            for (let i = 0; i < profile.fourierCount; i++) {
                const seedIdx = (offset + i) % seed.length;
                components.push({
                    amplitude: profile.fourierMaxAmplitude * (0.3 + seed[seedIdx] * 0.7),
                    frequency: profile.fourierFreqRange[0] +
                        seed[(seedIdx + 1) % seed.length] * (profile.fourierFreqRange[1] - profile.fourierFreqRange[0]),
                    phase: seed[(seedIdx + 2) % seed.length] * Math.PI * 2,
                    decay: 0.998 + seed[(seedIdx + 3) % seed.length] * 0.002,
                    modFreq: 0.001 + seed[(seedIdx + 4) % seed.length] * 0.01,
                });
            }
            return components;
        };

        return {
            priors: [...profile.defaultPriors] as [number, number, number],
            lorenz,
            henon,
            regime: 'mean_reverting',
            regimeAge: 0,
            regimeTransitionMatrix: profile.regimeTransition.map(row => [...row]),
            fourierHome: genFourier(0),
            fourierDraw: genFourier(3),
            fourierAway: genFourier(6),
            tick: 0,
            entropyPool: seed,
            lastEntropySeed: competitionId,
            momentum: [0, 0, 0],
            volatility: profile.baseVolatility,
            history: [[...profile.defaultPriors] as [number, number, number]],
            lastFusion: null,
            lastHmac: '',
            adaptiveComplexity: 1.0,
            autocorrelationScore: 0,
        };
    }

    // ══════════════════════════════════════════
    // Layer 1: Lorenz Attractor
    // Deterministic chaos — tiny changes in state produce wildly different paths
    // ══════════════════════════════════════════

    private stepLorenz(state: LorenzState, profile: CategoryProfile): [number, number, number] {
        const dt = 0.01;
        const { lorenzSigma: sigma, lorenzRho: rho, lorenzBeta: beta } = profile;

        const dx = sigma * (state.y - state.x) * dt;
        const dy = (state.x * (rho - state.z) - state.y) * dt;
        const dz = (state.x * state.y - beta * state.z) * dt;

        state.x += dx;
        state.y += dy;
        state.z += dz;

        // Normalize to [-1, 1] range using tanh
        return [
            Math.tanh(state.x / 20),
            Math.tanh(state.y / 25),
            Math.tanh(state.z / 30),
        ];
    }

    // ══════════════════════════════════════════
    // Layer 2: Hénon Map
    // Second chaotic system with different dynamics
    // ══════════════════════════════════════════

    private stepHenon(state: HenonState, profile: CategoryProfile): [number, number, number] {
        const { henonA: a, henonB: b } = profile;

        const newX = 1 - a * state.x * state.x + state.y;
        const newY = b * state.x;

        state.x = newX;
        state.y = newY;

        // If Hénon diverges, reset it
        if (Math.abs(state.x) > 10 || Math.abs(state.y) > 10 || isNaN(state.x)) {
            state.x = 0.1;
            state.y = 0.1;
            return [0, 0, 0];
        }

        // Map to 3 outcomes using different projections
        return [
            Math.tanh(state.x),
            Math.tanh(state.y * 2),
            Math.tanh(-state.x + state.y),
        ];
    }

    // ══════════════════════════════════════════
    // Layer 3: Hidden Markov Model Regime Switching
    // The character of the curve fundamentally changes
    // ══════════════════════════════════════════

    private stepRegime(state: CurveState, profile: CategoryProfile): void {
        state.regimeAge++;

        // Minimum regime duration (prevents flickering)
        if (state.regimeAge < 5) return;

        const regimeIdx = state.regime === 'volatile' ? 0 : state.regime === 'trending' ? 1 : 2;
        const transitionProbs = state.regimeTransitionMatrix[regimeIdx];

        // Add entropy-dependent perturbation to transition probabilities
        const entropyFactor = state.entropyPool.length > 0
            ? state.entropyPool[state.tick % state.entropyPool.length]
            : 0.5;

        // Perturbed transition probabilities
        const perturbed = transitionProbs.map((p, i) => {
            const perturbation = (entropyFactor - 0.5) * 0.1;
            return Math.max(0.05, p + (i === regimeIdx ? -perturbation : perturbation / 2));
        });

        // Normalize
        const pTotal = perturbed.reduce((a, b) => a + b, 0);
        const normalized = perturbed.map(p => p / pTotal);

        // Sample from distribution
        const rand = this.seededRandom(state);
        let cumulative = 0;
        let newRegimeIdx = 0;
        for (let i = 0; i < normalized.length; i++) {
            cumulative += normalized[i];
            if (rand < cumulative) {
                newRegimeIdx = i;
                break;
            }
        }

        const regimes: Regime[] = ['volatile', 'trending', 'mean_reverting'];
        const newRegime = regimes[newRegimeIdx];

        if (newRegime !== state.regime) {
            state.regime = newRegime;
            state.regimeAge = 0;

            // Adjust volatility on regime change
            const volRange = profile.volatilityRange;
            switch (newRegime) {
                case 'volatile':
                    state.volatility = volRange[0] + (volRange[1] - volRange[0]) * 0.8;
                    break;
                case 'trending':
                    state.volatility = volRange[0] + (volRange[1] - volRange[0]) * 0.5;
                    break;
                case 'mean_reverting':
                    state.volatility = volRange[0] + (volRange[1] - volRange[0]) * 0.2;
                    break;
            }
        }
    }

    private getRegimeWeights(regime: Regime): {
        chaos: number; noise: number; entropy: number;
        momentum: number; meanRev: number;
    } {
        switch (regime) {
            case 'volatile':
                return { chaos: 1.5, noise: 1.2, entropy: 1.0, momentum: 0.8, meanRev: 0.2 };
            case 'trending':
                return { chaos: 0.6, noise: 0.8, entropy: 0.7, momentum: 1.5, meanRev: 0.3 };
            case 'mean_reverting':
                return { chaos: 0.4, noise: 0.6, entropy: 0.5, momentum: 0.3, meanRev: 1.5 };
        }
    }

    // ══════════════════════════════════════════
    // Layer 4: Multi-Frequency Fourier Noise
    // Periodic but complex overlapping waves
    // ══════════════════════════════════════════

    private computeFourier(state: CurveState, profile: CategoryProfile): [number, number, number] {
        const t = state.tick;

        const sumComponents = (components: FourierComponent[]): number => {
            let sum = 0;
            for (const comp of components) {
                // Amplitude modulation over time
                const modulatedAmp = comp.amplitude * (0.5 + 0.5 * Math.sin(comp.modFreq * t));
                // Decaying amplitude
                const decayedAmp = modulatedAmp * Math.pow(comp.decay, t % 100);
                sum += decayedAmp * Math.sin(comp.frequency * t + comp.phase);
            }
            return sum;
        };

        return [
            sumComponents(state.fourierHome),
            sumComponents(state.fourierDraw),
            sumComponents(state.fourierAway),
        ];
    }

    // ══════════════════════════════════════════
    // Layer 5: Entropy Injection
    // Real data hashes seed the randomness
    // ══════════════════════════════════════════

    private computeEntropy(state: CurveState, profile: CategoryProfile): [number, number, number] {
        if (state.entropyPool.length === 0) {
            return [0, 0, 0];
        }

        const idx = state.tick % state.entropyPool.length;
        const e1 = state.entropyPool[idx] - 0.5;
        const e2 = state.entropyPool[(idx + 1) % state.entropyPool.length] - 0.5;
        const e3 = state.entropyPool[(idx + 2) % state.entropyPool.length] - 0.5;

        // Non-linear transformation to break patterns
        return [
            Math.tanh(e1 * 3) * profile.baseVolatility,
            Math.tanh(e2 * 2) * profile.baseVolatility * 0.6,
            Math.tanh(e3 * 3) * profile.baseVolatility,
        ];
    }

    // ══════════════════════════════════════════
    // Layer 6: Momentum & Mean-Reversion
    // ══════════════════════════════════════════

    private computeMomentum(state: CurveState, profile: CategoryProfile): [number, number, number] {
        return [
            state.momentum[0] * profile.momentumScale * 0.01,
            state.momentum[1] * profile.momentumScale * 0.01,
            state.momentum[2] * profile.momentumScale * 0.01,
        ];
    }

    private computeMeanReversion(state: CurveState, profile: CategoryProfile): [number, number, number] {
        if (state.history.length < 10) return [0, 0, 0];

        // Calculate long-term average
        const recentN = Math.min(30, state.history.length);
        const recent = state.history.slice(-recentN);
        const avg: [number, number, number] = [0, 0, 0];
        for (const h of recent) {
            avg[0] += h[0];
            avg[1] += h[1];
            avg[2] += h[2];
        }
        avg[0] /= recentN;
        avg[1] /= recentN;
        avg[2] /= recentN;

        const current = state.priors;
        const strength = profile.meanReversionStrength;

        return [
            (avg[0] - current[0]) * strength,
            (avg[1] - current[1]) * strength,
            (avg[2] - current[2]) * strength,
        ];
    }

    // ══════════════════════════════════════════
    // External Integration
    // ══════════════════════════════════════════

    /**
     * Refresh entropy pool from ALL available data sources via multi-source fusion
     */
    private async refreshEntropy(competitionId: string, category: string): Promise<void> {
        try {
            // Fetch competition metadata to see if it's cluster-based
            const supabase = this.supabaseService.getAdminClient();
            const { data: comp } = await supabase
                .from('competitions')
                .select('metadata')
                .eq('id', competitionId)
                .single();

            const sourceFilters = comp?.metadata?.source_cluster_ids;

            // Use multi-source fusion to aggregate data sources for this specific cluster (or ALL if undefined)
            const fusion = await this.fusionService.fuseSourcesForCategory(category, competitionId, sourceFilters);

            const state = this.curveStates.get(competitionId);
            if (state && fusion.dataPointCount > 0) {
                // Deep entropy from all sources combined (SHA-512 based)
                state.entropyPool = fusion.entropyPool;
                state.lastEntropySeed = fusion.sourceFingerprint.slice(0, 100);
                state.lastFusion = fusion;

                this.logger.debug(
                    `Entropy refreshed for ${competitionId} (${category}): ` +
                    `${fusion.sourceNames.length} sources, ${fusion.dataPointCount} data points ` +
                    `[${fusion.sourceNames.join(', ')}]`
                );
            } else {
                // Fallback: basic entropy from market_data_items only
                await this.refreshEntropyFallback(competitionId, category);
            }
        } catch (err: any) {
            this.logger.debug(`Fusion entropy refresh failed, using fallback: ${err.message}`);
            await this.refreshEntropyFallback(competitionId, category);
        }
    }

    /**
     * Fallback entropy refresh using only market_data_items (original behavior)
     */
    private async refreshEntropyFallback(competitionId: string, category: string): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('market_data_items')
                .select('title, published_at, sentiment_score')
                .eq('category', category)
                .eq('is_active', true)
                .order('published_at', { ascending: false })
                .limit(20);

            if (data && data.length > 0) {
                const entropySource = data.map(d =>
                    `${d.title}:${d.published_at}:${d.sentiment_score || 0}`
                ).join('|');
                const state = this.curveStates.get(competitionId);
                if (state) {
                    state.entropyPool = this.hashToNumbers(entropySource, 20);
                    state.lastEntropySeed = entropySource.slice(0, 100);
                }
            }
        } catch (err: any) {
            this.logger.debug(`Fallback entropy refresh failed (non-critical): ${err.message}`);
        }
    }

    // ══════════════════════════════════════════
    // Storage & Auto-start
    // ══════════════════════════════════════════

    private async storeSnapshot(competitionId: string, category: string, snapshot: ProbabilitySnapshot): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const state = this.curveStates.get(competitionId);
            const fusion = state?.lastFusion;

            await supabase.from('probability_history').insert({
                competition_id: competitionId,
                time_label: snapshot.time,
                home: snapshot.home,
                draw: snapshot.draw,
                away: snapshot.away,
                narrative: snapshot.narrative || null,
                regime: snapshot.regime || state?.regime || 'neutral',
                entropy_seed: state?.lastEntropySeed?.slice(0, 200) || null,
                category,
                // Enhanced metadata from multi-source fusion
                source_fingerprint: fusion?.sourceFingerprint || null,
                source_count: fusion?.sourceNames.length || 1,
                data_sources: fusion?.sourceNames || [],
                signal_vector: fusion?.signalVector ? { h: fusion.signalVector[0], d: fusion.signalVector[1], a: fusion.signalVector[2] } : null,
                chaos_state: state ? {
                    lorenz: { x: state.lorenz.x, y: state.lorenz.y, z: state.lorenz.z },
                    henon: { x: state.henon.x, y: state.henon.y },
                    regime: state.regime,
                    complexity: state.adaptiveComplexity,
                } : null,
                security_nonce: state?.lastHmac || null,
            });
        } catch (err: any) {
            // Non-critical — don't break the stream
            this.logger.debug(`Failed to store snapshot: ${err.message}`);
        }
    }

    /**
     * Auto-start curve streams for active competitions
     */
    private async autoStartActiveCompetitions(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('competitions')
                .select('id, sector')
                .eq('status', 'active')
                .limit(20);

            if (data && data.length > 0) {
                this.logger.log(`Auto-starting curve streams for ${data.length} active competitions`);
                for (const comp of data) {
                    await this.startCurveStream(comp.id, comp.sector || 'sports');
                }
            } else {
                this.logger.log('No active competitions found — curve streams on standby');
            }
        } catch (err: any) {
            this.logger.warn(`Auto-start failed (non-critical): ${err.message}`);
        }
    }

    /**
     * Periodic health check — restart dead streams
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async healthCheck(): Promise<void> {
        try {
            const supabase = this.supabaseService.getAdminClient();
            const { data } = await supabase
                .from('competitions')
                .select('id, sector')
                .eq('status', 'active')
                .limit(20);

            if (data) {
                for (const comp of data) {
                    if (!this.streamIntervals.has(comp.id)) {
                        this.logger.log(`Restarting dead curve stream for ${comp.id}`);
                        await this.startCurveStream(comp.id, comp.sector || 'sports');
                    }
                }
            }
        } catch {
            // Silent fail for health checks
        }
    }

    // ══════════════════════════════════════════
    // Layer 7: Multi-Source Data Fusion Signal
    // ══════════════════════════════════════════

    private computeFusionSignal(state: CurveState): [number, number, number] {
        if (!state.lastFusion || state.lastFusion.dataPointCount === 0) {
            return [0, 0, 0];
        }

        const sv = state.lastFusion.signalVector;
        const sourceWeight = Math.min(1.0, state.lastFusion.sourceNames.length / 5);

        // Non-linear transformation with tanh to prevent domination
        return [
            Math.tanh(sv[0] * 2) * sourceWeight * state.volatility,
            Math.tanh(sv[1] * 1.5) * sourceWeight * state.volatility * 0.6,
            Math.tanh(sv[2] * 2) * sourceWeight * state.volatility,
        ];
    }

    // ══════════════════════════════════════════
    // Layer 8: Cross-Category Correlation Noise
    // ══════════════════════════════════════════

    private computeCrossCategoryNoise(state: CurveState): [number, number, number] {
        if (!state.lastFusion || state.entropyPool.length < 10) {
            return [0, 0, 0];
        }

        // XOR fusion entropy with chaotic state projections for unpredictable noise
        const lorentzProj = Math.tanh(state.lorenz.x * state.lorenz.z / 100);
        const henonProj = Math.tanh(state.henon.x * state.henon.y);
        const ei = state.tick % state.entropyPool.length;

        const e1 = state.entropyPool[ei];
        const e2 = state.entropyPool[(ei + 3) % state.entropyPool.length];
        const e3 = state.entropyPool[(ei + 7) % state.entropyPool.length];

        return [
            (e1 - 0.5) * lorentzProj * state.volatility,
            (e2 - 0.5) * henonProj * state.volatility * 0.5,
            (e3 - 0.5) * lorentzProj * state.volatility,
        ];
    }

    // ══════════════════════════════════════════
    // Layer 9: Adaptive Complexity Scaling
    // Increases mathematical turbulence when patterns are detected
    // ══════════════════════════════════════════

    private updateAdaptiveComplexity(state: CurveState): void {
        if (state.history.length < 15) return;

        // Compute lag-1 autocorrelation of the home probability
        const recent = state.history.slice(-15).map(h => h[0]);
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        let numerator = 0;
        let denominator = 0;
        for (let i = 1; i < recent.length; i++) {
            numerator += (recent[i] - mean) * (recent[i - 1] - mean);
            denominator += (recent[i] - mean) ** 2;
        }
        const autocorr = denominator > 0 ? Math.abs(numerator / denominator) : 0;
        state.autocorrelationScore = autocorr;

        // High autocorrelation = predictable pattern detected → increase complexity
        if (autocorr > 0.7) {
            state.adaptiveComplexity = Math.min(3.0, state.adaptiveComplexity + 0.1);
        } else if (autocorr < 0.3) {
            state.adaptiveComplexity = Math.max(1.0, state.adaptiveComplexity - 0.05);
        }
    }

    // ══════════════════════════════════════════
    // Layer 10: HMAC Integrity Chain
    // ══════════════════════════════════════════

    private computeHmac(state: CurveState, h: number, d: number, a: number): string {
        const payload = `${state.lastHmac}:${h}:${d}:${a}:${state.tick}:${Date.now()}`;
        return crypto.createHmac('sha256', this.hmacSecret)
            .update(payload)
            .digest('hex');
    }

    // ══════════════════════════════════════════
    // Utility
    // ══════════════════════════════════════════

    /**
     * Deterministic hash-based random number generator
     * Converts a string into N numbers in [0, 1]
     */
    private hashToNumbers(input: string, count: number): number[] {
        const numbers: number[] = [];
        let current = input;

        for (let i = 0; i < Math.ceil(count / 8); i++) {
            const hash = crypto.createHash('sha256').update(current + i.toString()).digest('hex');
            for (let j = 0; j < 8 && numbers.length < count; j++) {
                const hexByte = hash.slice(j * 8, (j + 1) * 8);
                numbers.push(parseInt(hexByte, 16) / 0xFFFFFFFF);
            }
            current = hash;
        }

        return numbers;
    }

    /**
     * Seeded pseudo-random using entropy pool
     * Avoids Math.random() for determinism in testing
     */
    private seededRandom(state: CurveState): number {
        if (state.entropyPool.length === 0) return Math.random();

        // Linear congruential generator seeded from entropy
        const idx = (state.tick * 7 + 13) % state.entropyPool.length;
        const seed = state.entropyPool[idx];

        // Perturb the entropy pool itself (makes sequence non-repeating)
        state.entropyPool[idx] = (seed * 16807 + 0.1) % 1;

        return state.entropyPool[idx];
    }
}
