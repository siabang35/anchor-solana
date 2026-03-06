// =============================================
// DeJaVu NLP Pipeline Simulation Engine
// =============================================
// Pipeline: Input → LLM/NLP → Feature Engineering → Probabilistic Engine → ΔP
// S(t) = normalized sentiment | M(t) = momentum (dS/dt) | V(t) = volatility

export interface ProbabilityPoint {
    time: string;
    home: number;
    draw: number;
    away: number;
}

export interface SentimentSource {
    name: string;
    icon: string;
    bullish: number;
    bearish: number;
    neutral: number;
    signal: string;
}

export interface FeedItem {
    id: string;
    source: string;
    icon: string;
    text: string;
    impact: 'high' | 'medium' | 'low';
    timestamp: number;
    sentiment: number; // -1 to 1
    entity: string;
}

export interface LeaderboardPlayer {
    rank: number;
    address: string;
    totalReturn: number;
    accuracy: number;
    trades: number;
}

export interface AgentPosition {
    outcome: string;
    direction: 'UP' | 'DOWN';
    entryProb: number;
    currentProb: number;
    amount: number;
    unrealizedPnl: number;
}

export interface NLPPipelineState {
    sentimentRaw: number;       // Raw sentiment from LLM
    sentimentNorm: number;      // S(t) normalized
    momentum: number;           // M(t) = dS/dt
    volatility: number;         // V(t) = rolling variance
    bayesianPrior: [number, number, number]; // Prior probabilities
    regime: 'bullish' | 'neutral' | 'bearish';
    timeDecayFactor: number;
    lastUpdate: number;
}

export interface DeployedAgent {
    id: string;
    name: string;
    strategy: string;
    targetOutcome: number;
    direction: 'UP' | 'DOWN';
    riskLevel: number;
    status: 'deploying' | 'analyzing' | 'trading' | 'active';
    createdAt: number;
    trades: AgentTrade[];
    accuracy: number;
    totalPnl: number;
    logs: AgentLog[];
}

export interface AgentTrade {
    id: string;
    outcome: string;
    direction: 'UP' | 'DOWN';
    entryProb: number;
    exitProb: number;
    amount: number;
    pnl: number;
    timestamp: number;
}

export interface AgentLog {
    timestamp: number;
    type: 'info' | 'analysis' | 'trade' | 'signal';
    message: string;
}

// ===== NLP PIPELINE ENGINE =====

const OUTCOMES = ['Home Win', 'Draw', 'Away Win'];

class NLPEngine {
    private state: NLPPipelineState;
    private sentimentHistory: number[] = [];
    private feedQueue: FeedItem[] = [];

    constructor() {
        this.state = {
            sentimentRaw: 0.2,
            sentimentNorm: 0.2,
            momentum: 0,
            volatility: 0.05,
            bayesianPrior: [4500, 2800, 2700],
            regime: 'bullish',
            timeDecayFactor: 0.95,
            lastUpdate: Date.now(),
        };
        this.sentimentHistory = [0.2, 0.18, 0.22, 0.19, 0.21];
    }

    // Step 1: Ingest data & extract sentiment via simulated LLM
    ingestFeed(feed: FeedItem): void {
        this.feedQueue.push(feed);
        // LLM extracts sentiment score
        const sentimentDelta = feed.sentiment * this.impactMultiplier(feed.impact);
        this.state.sentimentRaw += sentimentDelta;
        this.state.sentimentRaw = Math.max(-1, Math.min(1, this.state.sentimentRaw));
    }

    // Step 2: Normalize sentiment S(t)
    private normalizeSentiment(): number {
        // Sigmoid normalization with history context
        const raw = this.state.sentimentRaw;
        const norm = 2 / (1 + Math.exp(-3 * raw)) - 1;
        this.sentimentHistory.push(norm);
        if (this.sentimentHistory.length > 20) this.sentimentHistory.shift();
        return norm;
    }

    // Step 3: Calculate momentum M(t) = dS/dt
    private calcMomentum(): number {
        if (this.sentimentHistory.length < 2) return 0;
        const recent = this.sentimentHistory.slice(-5);
        const older = this.sentimentHistory.slice(-10, -5);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
        return recentAvg - olderAvg;
    }

    // Step 4: Calculate volatility V(t) = rolling variance
    private calcVolatility(): number {
        if (this.sentimentHistory.length < 3) return 0.05;
        const recent = this.sentimentHistory.slice(-10);
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        const variance = recent.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / recent.length;
        return Math.sqrt(variance);
    }

    // Step 5: Regime detection
    private detectRegime(): 'bullish' | 'neutral' | 'bearish' {
        const s = this.state.sentimentNorm;
        const m = this.state.momentum;
        if (s > 0.15 && m > 0.02) return 'bullish';
        if (s < -0.15 && m < -0.02) return 'bearish';
        return 'neutral';
    }

    // Step 6: Bayesian update with time-decay
    updateProbabilities(): [number, number, number] {
        this.state.sentimentNorm = this.normalizeSentiment();
        this.state.momentum = this.calcMomentum();
        this.state.volatility = this.calcVolatility();
        this.state.regime = this.detectRegime();

        const s = this.state.sentimentNorm;
        const m = this.state.momentum;
        const v = this.state.volatility;
        const decay = this.state.timeDecayFactor;

        let [home, draw, away] = this.state.bayesianPrior;

        // Bayesian update: shift probabilities based on NLP signals
        const homeShift = (s * 80 + m * 200) * (1 + v * 2);
        const drawShift = (-Math.abs(s) * 30 + v * 100) * (s > 0 ? 0.3 : 0.5);
        const awayShift = (-s * 60 - m * 150) * (1 + v * 1.5);

        // Add regime-specific noise for realism
        const noise = () => (Math.random() - 0.5) * 40;

        home = home * decay + homeShift + noise();
        draw = draw * (decay * 0.98) + drawShift + noise() * 0.5;
        away = away * decay + awayShift + noise();

        // Clamp and normalize to 10000 bps
        home = Math.max(1000, Math.min(7000, home));
        draw = Math.max(800, Math.min(4000, draw));
        away = Math.max(800, Math.min(7000, away));

        const total = home + draw + away;
        home = Math.round((home / total) * 10000);
        draw = Math.round((draw / total) * 10000);
        away = 10000 - home - draw;

        this.state.bayesianPrior = [home, draw, away];
        this.state.lastUpdate = Date.now();

        return [home, draw, away];
    }

    getState(): NLPPipelineState {
        return { ...this.state };
    }

    private impactMultiplier(impact: 'high' | 'medium' | 'low'): number {
        switch (impact) {
            case 'high': return 2.0;
            case 'medium': return 1.0;
            case 'low': return 0.4;
        }
    }
}

// Singleton engine
export const nlpEngine = new NLPEngine();

// ----- Feed Item Templates -----
const feedTemplates: Omit<FeedItem, 'id' | 'timestamp'>[] = [
    { source: 'RSS News', icon: '📰', text: 'Manchester United confirms Rashford fit for starting XI — team morale boosted', impact: 'high', sentiment: 0.35, entity: 'Manchester United' },
    { source: 'Yahoo Finance', icon: '💹', text: 'Betting odds shift: Home win probability increasing across major bookmakers', impact: 'medium', sentiment: 0.2, entity: 'Market' },
    { source: 'Social Media', icon: '🐦', text: '#MUNLIV trending: 84% positive fan sentiment detected from 50K tweets', impact: 'medium', sentiment: 0.25, entity: 'Social' },
    { source: 'API Football', icon: '⚽', text: 'Historical H2H: Manchester United won 6 of last 10 home games vs Liverpool', impact: 'medium', sentiment: 0.15, entity: 'Statistics' },
    { source: 'RSS News', icon: '📰', text: 'BREAKING: Liverpool missing key midfielder Szoboszlai due to hamstring injury', impact: 'high', sentiment: 0.4, entity: 'Liverpool' },
    { source: 'Social Media', icon: '🐦', text: 'Expert panel prediction: 3 of 5 pundits favor draw scenario — uncertainty rising', impact: 'medium', sentiment: -0.05, entity: 'Experts' },
    { source: 'Yahoo Finance', icon: '💹', text: 'Asian market analysis: Draw odds shortening significantly — smart money detected', impact: 'high', sentiment: -0.15, entity: 'Market' },
    { source: 'API Football', icon: '⚽', text: 'Weather alert: Heavy rain forecast — historically favors defensive low-scoring games', impact: 'low', sentiment: -0.1, entity: 'Environment' },
    { source: 'RSS News', icon: '📰', text: 'Tactical leak: United deploying aggressive 3-5-2 press formation — attacking intent', impact: 'medium', sentiment: 0.2, entity: 'Manchester United' },
    { source: 'Social Media', icon: '🐦', text: 'Sentiment shift detected: Liverpool fans growing confident after training footage leak', impact: 'medium', sentiment: -0.2, entity: 'Liverpool' },
    { source: 'API Football', icon: '⚽', text: 'Referee analysis: Michael Oliver averages 4.2 cards/game — may disrupt flow', impact: 'low', sentiment: -0.05, entity: 'Officials' },
    { source: 'Yahoo Finance', icon: '💹', text: 'Sharp volume: Unusual £2M stake placed on Under 2.5 goals — institutional signal', impact: 'high', sentiment: -0.1, entity: 'Market' },
    { source: 'RSS News', icon: '📰', text: 'United captain Bruno Fernandes declares "We are ready to dominate" in presser', impact: 'medium', sentiment: 0.25, entity: 'Manchester United' },
    { source: 'API Football', icon: '⚽', text: 'xG model projection: United 1.8 vs Liverpool 1.2 expected goals based on recent form', impact: 'high', sentiment: 0.3, entity: 'Statistics' },
    { source: 'Social Media', icon: '🐦', text: 'COUNTER-NARRATIVE detected: Leaked lineup shows Liverpool parking the bus', impact: 'medium', sentiment: 0.1, entity: 'Liverpool' },
    { source: 'Yahoo Finance', icon: '💹', text: 'Market consensus shifting: Home win probability now above 50% pre-match', impact: 'high', sentiment: 0.35, entity: 'Market' },
];

let feedCounter = 0;

export function getRandomFeedItem(): FeedItem {
    const template = feedTemplates[feedCounter % feedTemplates.length];
    feedCounter++;
    const item: FeedItem = {
        ...template,
        id: `feed-${Date.now()}-${feedCounter}`,
        timestamp: Date.now(),
    };
    // Feed into NLP engine
    nlpEngine.ingestFeed(item);
    return item;
}

// ----- Probability Generation -----
export function generateInitialProbabilities(): ProbabilityPoint[] {
    const points: ProbabilityPoint[] = [];
    let home = 45, draw = 28, away = 27;

    for (let i = 0; i < 20; i++) {
        const bps = nlpEngine.updateProbabilities();
        home = bps[0] / 100;
        draw = bps[1] / 100;
        away = bps[2] / 100;

        points.push({
            time: `${i * 5}'`,
            home: Math.round(home * 100) / 100,
            draw: Math.round(draw * 100) / 100,
            away: Math.round(away * 100) / 100,
        });
    }
    return points;
}

export function simulateProbShift(current: ProbabilityPoint): ProbabilityPoint {
    const bps = nlpEngine.updateProbabilities();
    const timeNum = parseInt(current.time) + 5;
    return {
        time: `${timeNum}'`,
        home: Math.round(bps[0]) / 100,
        draw: Math.round(bps[1]) / 100,
        away: Math.round(bps[2]) / 100,
    };
}

// ----- Sentiment Sources (live from engine) -----
export function getSentimentSources(): SentimentSource[] {
    const state = nlpEngine.getState();
    const s = state.sentimentNorm;
    const baseB = Math.round(50 + s * 30);

    return [
        { name: 'RSS News', icon: '📰', bullish: Math.min(95, baseB + 8), bearish: Math.max(5, 85 - baseB), neutral: 15, signal: s > 0.2 ? 'Strong Bullish' : s > 0 ? 'Bullish' : 'Neutral' },
        { name: 'Yahoo Finance', icon: '💹', bullish: Math.min(90, baseB - 5), bearish: Math.max(5, 90 - baseB), neutral: 17, signal: Math.abs(s) < 0.1 ? 'Neutral' : s > 0 ? 'Bullish' : 'Bearish' },
        { name: 'Social Media', icon: '🐦', bullish: Math.min(95, baseB + 15), bearish: Math.max(5, 80 - baseB), neutral: 11, signal: s > 0.25 ? 'Strong Bullish' : s > 0 ? 'Bullish' : s < -0.1 ? 'Bearish' : 'Neutral' },
        { name: 'API Football', icon: '⚽', bullish: Math.min(90, baseB + 3), bearish: Math.max(5, 87 - baseB), neutral: 15, signal: s > 0.15 ? 'Bullish' : 'Neutral' },
    ];
}

// ----- Leaderboard -----
export function getLeaderboardData(): LeaderboardPlayer[] {
    return [
        { rank: 1, address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', totalReturn: 847.32, accuracy: 94.2, trades: 156 },
        { rank: 2, address: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS', totalReturn: 623.18, accuracy: 91.7, trades: 203 },
        { rank: 3, address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', totalReturn: 501.45, accuracy: 89.3, trades: 178 },
        { rank: 4, address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', totalReturn: 389.67, accuracy: 87.8, trades: 134 },
        { rank: 5, address: '2WLbbqWtE5hfXUz35tQhWXsJRkYsXE8WJUhfVLCxjWqR', totalReturn: 245.89, accuracy: 85.1, trades: 97 },
        { rank: 6, address: '4ZwF4MqCVG9YkPJfVZ34UXJeDqGqRVx4T7aPMFdAjADh', totalReturn: 198.34, accuracy: 83.6, trades: 112 },
        { rank: 7, address: 'BPFLoader2111111111111111111111111111111111111', totalReturn: 156.78, accuracy: 81.2, trades: 89 },
        { rank: 8, address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', totalReturn: 112.56, accuracy: 79.5, trades: 145 },
    ];
}

// ----- Performance -----
export function getPerformanceData() {
    return {
        totalPnl: 234.56,
        winRate: 67.8,
        avgReturn: 12.3,
        totalTrades: 42,
        exposureLevel: 65,
        accuracyScore: 82.4,
        activePositions: 3,
        bestTrade: 89.12,
    };
}

// ----- Pool -----
export function getPoolData() {
    return {
        totalPool: 125000,
        distributed: 43250,
        remaining: 81750,
        contributors: 342,
        avgContribution: 365.5,
        multiplier: 1.5,
    };
}

// ----- Agent Positions (dummy) -----
export function getDummyAgentPositions(): AgentPosition[] {
    return [
        { outcome: 'Home Win', direction: 'UP', entryProb: 42.5, currentProb: 45.8, amount: 0.5, unrealizedPnl: 0.058 },
        { outcome: 'Draw', direction: 'DOWN', entryProb: 28.0, currentProb: 26.3, amount: 0.3, unrealizedPnl: 0.024 },
        { outcome: 'Away Win', direction: 'DOWN', entryProb: 29.5, currentProb: 27.9, amount: 0.2, unrealizedPnl: 0.013 },
    ];
}

// ----- Agent Simulation Engine -----
const agentStrategies: Record<string, (feed: FeedItem) => AgentLog | null> = {
    default: (feed) => {
        if (feed.impact === 'high') {
            return {
                timestamp: Date.now(),
                type: 'signal',
                message: `🔔 High-impact signal: "${feed.text.slice(0, 60)}..." — Sentiment: ${feed.sentiment > 0 ? '📈' : '📉'} ${(feed.sentiment * 100).toFixed(0)}%`,
            };
        }
        if (Math.random() > 0.5) {
            return {
                timestamp: Date.now(),
                type: 'analysis',
                message: `🧠 Processing ${feed.source}: Entity="${feed.entity}" → Sentiment=${(feed.sentiment * 100).toFixed(0)}%`,
            };
        }
        return null;
    },
};

export function simulateAgentStep(agent: DeployedAgent, currentProbs: ProbabilityPoint): DeployedAgent {
    const updated = { ...agent, logs: [...agent.logs], trades: [...agent.trades] };

    // Progress status
    const elapsed = Date.now() - agent.createdAt;
    if (elapsed < 3000) {
        updated.status = 'deploying';
    } else if (elapsed < 7000) {
        updated.status = 'analyzing';
    } else if (elapsed < 10000) {
        updated.status = 'trading';
    } else {
        updated.status = 'active';
    }

    // Generate analysis logs
    if (updated.status === 'analyzing' || updated.status === 'active') {
        const state = nlpEngine.getState();
        if (Math.random() > 0.6) {
            updated.logs.push({
                timestamp: Date.now(),
                type: 'analysis',
                message: `📊 S(t)=${state.sentimentNorm.toFixed(3)} | M(t)=${state.momentum.toFixed(4)} | V(t)=${state.volatility.toFixed(4)} | Regime: ${state.regime.toUpperCase()}`,
            });
        }
    }

    // Generate simulated trades
    if (updated.status === 'active' && Math.random() > 0.85) {
        const outcomeIdx = agent.targetOutcome;
        const probKey = outcomeIdx === 0 ? 'home' : outcomeIdx === 1 ? 'draw' : 'away';
        const currentP = currentProbs[probKey];
        const pnl = (Math.random() - 0.4) * 0.05 * agent.riskLevel;

        const trade: AgentTrade = {
            id: `trade-${Date.now()}`,
            outcome: OUTCOMES[outcomeIdx],
            direction: agent.direction,
            entryProb: currentP - (Math.random() * 2),
            exitProb: currentP,
            amount: 0.1 * agent.riskLevel,
            pnl: Math.round(pnl * 1000) / 1000,
            timestamp: Date.now(),
        };

        updated.trades.push(trade);
        updated.totalPnl += trade.pnl;
        updated.accuracy = Math.min(99, 50 + updated.trades.filter(t => t.pnl > 0).length / updated.trades.length * 50);

        updated.logs.push({
            timestamp: Date.now(),
            type: 'trade',
            message: `💰 ${agent.direction} ${OUTCOMES[outcomeIdx]} @ ${currentP.toFixed(1)}% → P&L: ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(3)} SOL`,
        });
    }

    // Keep last 20 logs
    if (updated.logs.length > 20) {
        updated.logs = updated.logs.slice(-20);
    }

    return updated;
}

export function createAgentDeployLogs(strategy: string): AgentLog[] {
    return [
        { timestamp: Date.now(), type: 'info', message: '🚀 Initializing AI Agent deployment...' },
        { timestamp: Date.now() + 500, type: 'info', message: `📝 Strategy loaded: "${strategy.slice(0, 80)}${strategy.length > 80 ? '...' : ''}"` },
        { timestamp: Date.now() + 1200, type: 'info', message: '🔗 Connecting to NLP pipeline...' },
        { timestamp: Date.now() + 2000, type: 'info', message: '✅ Data streams initialized: RSS, Yahoo Finance, Social Media, API Football' },
        { timestamp: Date.now() + 3000, type: 'analysis', message: '🧠 Running initial sentiment analysis on 4 data sources...' },
        { timestamp: Date.now() + 4500, type: 'analysis', message: '📊 Feature engineering: S(t), M(t), V(t) computed successfully' },
        { timestamp: Date.now() + 5500, type: 'analysis', message: '🔄 Bayesian priors loaded — time-decay weighting active' },
        { timestamp: Date.now() + 7000, type: 'signal', message: '✨ Agent is now LIVE — monitoring feeds and generating signals...' },
    ];
}
