export interface MarketCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
    subCategories?: SubCategory[];
    markets: MarketTemplate[];
}

export interface SubCategory {
    id: string;
    name: string;
    icon: string;
}

export interface MarketTemplate {
    id: string;
    title: string;
    outcomes: string[];
    subCategoryId?: string; // Links to subcategory for filtering
}

export interface ModelTier {
    id: string;
    name: string;
    icon: string;
    price: string;
    features: string[];
    dataSources: number;
    updateFreq: string;
    badge: string;
    color: string;
}

export const MODEL_TIERS: ModelTier[] = [
    {
        id: 'free', name: 'Starter', icon: '🆓',
        price: 'Free',
        features: ['Qwen 2.5 7B + Groq Llama 3', '4-Tier AI Cascade', 'Update every 45s', '7 active agents'],
        dataSources: 2, updateFreq: '45s', badge: 'FREE', color: 'var(--text-muted)',
    },
    {
        id: 'pro', name: 'Pro Analyst', icon: '⚡',
        price: '0.5 SOL/mo',
        features: ['Priority Qwen 2.5 + Llama 70B', '6 data sources', 'Update every 15s', '15 active agents', 'Regime detection'],
        dataSources: 6, updateFreq: '15s', badge: 'PRO', color: 'var(--accent-indigo)',
    },
    {
        id: 'premium', name: 'Institutional', icon: '👑',
        price: '2 SOL/mo',
        features: ['Full Bayesian + GPT-4o Pipeline', '12+ data sources', 'Real-time updates', 'Unlimited agents', 'Regime + volatility alerts', 'Priority execution'],
        dataSources: 12, updateFreq: '3s', badge: 'PREMIUM', color: 'var(--accent-amber)',
    },
];

export const CATEGORIES: MarketCategory[] = [
    {
        id: 'sports', name: 'Sports', icon: '🏟️',
        description: 'Predict match outcomes across global sports leagues',
        subCategories: [
            { id: 'football', name: 'Football / Soccer', icon: '⚽' },
            { id: 'basketball', name: 'Basketball', icon: '🏀' },
            { id: 'cfl', name: 'CFL / Football', icon: '🏈' },
            { id: 'cricket', name: 'Cricket', icon: '🏏' },
            { id: 'tennis', name: 'Tennis', icon: '🎾' },
            { id: 'mma', name: 'MMA / Boxing', icon: '🥊' },
            { id: 'esports', name: 'Esports', icon: '🎮' },
        ],
        markets: [
            { id: 'mun-liv', title: 'Manchester United vs Liverpool', outcomes: ['Home Win', 'Draw', 'Away Win'], subCategoryId: 'football' },
            { id: 'barca-real', title: 'Barcelona vs Real Madrid', outcomes: ['Home Win', 'Draw', 'Away Win'], subCategoryId: 'football' },
            { id: 'ars-che', title: 'Arsenal vs Chelsea', outcomes: ['Home Win', 'Draw', 'Away Win'], subCategoryId: 'football' },
            { id: 'lakers-celtics', title: 'LA Lakers vs Boston Celtics', outcomes: ['Lakers Win', 'Celtics Win'], subCategoryId: 'basketball' },
            { id: 'warriors-bucks', title: 'Warriors vs Bucks', outcomes: ['Warriors Win', 'Bucks Win'], subCategoryId: 'basketball' },
            { id: 'cfl-grey', title: 'Grey Cup: Toronto vs Montreal', outcomes: ['Toronto Win', 'Montreal Win'], subCategoryId: 'cfl' },
            { id: 'ipl-final', title: 'IPL Final: Mumbai vs Chennai', outcomes: ['Mumbai Win', 'Chennai Win'], subCategoryId: 'cricket' },
            { id: 'wimbledon', title: 'Wimbledon Final', outcomes: ['Player A Win', 'Player B Win'], subCategoryId: 'tennis' },
            { id: 'ufc-main', title: 'UFC 310 Main Event', outcomes: ['Fighter A Win', 'Fighter B Win', 'Draw'], subCategoryId: 'mma' },
            { id: 'lol-worlds', title: 'LoL Worlds Final', outcomes: ['Team A Win', 'Team B Win'], subCategoryId: 'esports' },
        ],
    },
    {
        id: 'finance', name: 'Finance', icon: '💹',
        description: 'Predict financial market movements and indicators',
        markets: [
            { id: 'sp500-close', title: 'S&P 500 Closing Direction', outcomes: ['Bullish Close', 'Flat', 'Bearish Close'] },
            { id: 'fed-rate', title: 'Federal Reserve Rate Decision', outcomes: ['Rate Hike', 'Hold', 'Rate Cut'] },
            { id: 'tsla-earnings', title: 'Tesla Q4 Earnings Beat/Miss', outcomes: ['Beat Estimates', 'In-Line', 'Miss Estimates'] },
            { id: 'gold-2000', title: 'Gold Price Above $2000 EOW', outcomes: ['Yes', 'No'] },
            { id: 'dxy-direction', title: 'US Dollar Index Direction', outcomes: ['Strengthen', 'Stable', 'Weaken'] },
        ],
    },
    {
        id: 'crypto', name: 'Crypto', icon: '₿',
        description: 'Predict crypto market events and price movements',
        markets: [
            { id: 'btc-100k', title: 'BTC Above $100k This Month', outcomes: ['Yes', 'No'] },
            { id: 'eth-merge', title: 'ETH Layer 2 TVL Growth', outcomes: ['High Growth', 'Moderate', 'Decline'] },
            { id: 'sol-price', title: 'SOL Price Direction (7D)', outcomes: ['Bullish', 'Sideways', 'Bearish'] },
            { id: 'defi-tvl', title: 'DeFi Total TVL TVL Trend', outcomes: ['Increase >5%', 'Stable', 'Decrease >5%'] },
            { id: 'nft-volume', title: 'NFT Market Weekly Volume', outcomes: ['Up', 'Stable', 'Down'] },
        ],
    },
    {
        id: 'tech', name: 'Technology', icon: '💻',
        description: 'Predict tech industry events and product launches',
        markets: [
            { id: 'apple-launch', title: 'Apple Product Launch Impact', outcomes: ['Strong Positive', 'Neutral', 'Negative'] },
            { id: 'ai-regulation', title: 'AI Regulation Outcome', outcomes: ['Strict Regulation', 'Moderate', 'Light Touch'] },
            { id: 'nvidia-ai', title: 'NVIDIA AI Chip Demand Q4', outcomes: ['Exceed Expectations', 'Meet', 'Below'] },
            { id: 'meta-ar', title: 'Meta AR/VR Adoption Rate', outcomes: ['Accelerating', 'Steady', 'Slowing'] },
        ],
    },
    {
        id: 'economy', name: 'Economy', icon: '🏦',
        description: 'Predict macroeconomic indicators and policy outcomes',
        markets: [
            { id: 'us-inflation', title: 'US CPI Month-over-Month', outcomes: ['Above 0.3%', '0.1-0.3%', 'Below 0.1%'] },
            { id: 'unemployment', title: 'US Unemployment Rate', outcomes: ['Decrease', 'Stable', 'Increase'] },
            { id: 'gdp-growth', title: 'US GDP Growth Q4', outcomes: ['Above 3%', '2-3%', 'Below 2%'] },
            { id: 'housing-market', title: 'Housing Market Trend', outcomes: ['Rising Prices', 'Stable', 'Declining'] },
        ],
    },
    {
        id: 'science', name: 'Science', icon: '🔬',
        description: 'Predict scientific breakthroughs and research outcomes',
        markets: [
            { id: 'climate-target', title: 'Global Climate Target Met', outcomes: ['On Track', 'Partial', 'Off Track'] },
            { id: 'fusion-progress', title: 'Fusion Energy Milestone in 2026', outcomes: ['Breakthrough', 'Progress', 'No Change'] },
            { id: 'space-launch', title: 'SpaceX Starship Success', outcomes: ['Full Success', 'Partial', 'Failure'] },
        ],
    },
    {
        id: 'politics', name: 'Politics', icon: '🏛️',
        description: 'Predict political events and election outcomes',
        markets: [
            { id: 'us-midterm', title: 'US Congressional Balance', outcomes: ['Republican Majority', 'Split', 'Democrat Majority'] },
            { id: 'uk-election', title: 'UK Policy Direction', outcomes: ['Progressive Shift', 'Maintain', 'Conservative Shift'] },
            { id: 'trade-deal', title: 'US-China Trade Agreement', outcomes: ['Agreement', 'Partial Deal', 'No Deal'] },
            { id: 'eu-policy', title: 'EU Tech Regulation Impact', outcomes: ['Restrictive', 'Balanced', 'Permissive'] },
        ],
    },
];

export function getMarketsForCategory(categoryId: string, subCategoryId?: string): MarketTemplate[] {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return [];
    if (subCategoryId && cat.subCategories) {
        return cat.markets.filter(m => m.subCategoryId === subCategoryId);
    }
    return cat.markets;
}
