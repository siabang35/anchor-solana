import { TrendingUp, Newspaper, Zap, Bitcoin, Activity, Globe, Monitor, Landmark, FlaskConical } from "lucide-react";

export interface Question {
    text: string;
    yesPercent: number;
    noPercent: number;
}

export interface Market {
    id: string;
    emoji: string;
    title: string;
    badge?: "NEW" | "HOT" | "ENDING" | "VERIFIED";
    questions: Question[];
    volume: string;
    comments: number;
    category: string;
    isTopPick?: boolean;
    isForYou?: boolean;
    image?: string;
    endDate?: string;
}

export interface Signal {
    id: string;
    title: string;
    source: string;
    timeAgo: string;
    image?: string;
    sourceIcon?: string;
    url?: string;
    impact: "HIGH" | "MEDIUM" | "LOW";
    sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    tags: string[];
    // Backend compat fields
    source_icon?: string;
    source_type?: string;
    published_at?: string;
}

export const CATEGORIES = [
    { id: "top_markets", label: "Top Markets", icon: TrendingUp },
    { id: "for_you", label: "For You", icon: Activity },
    { id: "signals", label: "Signals", icon: Newspaper },
    { id: "latest", label: "Latest", icon: Zap },
    { id: "politics", label: "Politics", icon: Landmark },
    { id: "finance", label: "Finance", icon: TrendingUp },
    { id: "tech", label: "Tech", icon: Monitor },
    { id: "crypto", label: "Crypto", icon: Bitcoin },
    { id: "sports", label: "Sports", icon: Activity },
    { id: "economy", label: "Economy", icon: Globe },
    { id: "science", label: "Science", icon: FlaskConical },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

export const MOCK_MARKETS: Market[] = [
    // TOP PICS & HIGH VOLUME
    {
        id: "tp1",
        emoji: "🇺🇸",
        title: "Who will win the 2028 US Presidential Election?",
        category: "politics",
        isTopPick: true,
        volume: "12.5M",
        comments: 1240,
        badge: "HOT",
        questions: [{ text: "Democrat vs Republican", yesPercent: 48, noPercent: 52 }]
    },
    {
        id: "tp2",
        emoji: "🚀",
        title: "SpaceX Starship: successful orbit in next launch?",
        category: "science",
        isTopPick: true,
        volume: "4.2M",
        comments: 890,
        questions: [{ text: "", yesPercent: 85, noPercent: 15 }]
    },
    {
        id: "tp3",
        emoji: "💰",
        title: "Bitcoin to hit $100k by Q1 2026?",
        category: "crypto",
        isTopPick: true,
        volume: "8.1M",
        comments: 2100,
        badge: "VERIFIED",
        questions: [{ text: "", yesPercent: 65, noPercent: 35 }]
    },
    {
        id: "tp4",
        emoji: "🤖",
        title: "AGI achieved before 2027?",
        category: "tech",
        isTopPick: true,
        volume: "3.5M",
        comments: 560,
        questions: [{ text: "", yesPercent: 30, noPercent: 70 }]
    },

    // FOR YOU
    {
        id: "fy1",
        emoji: "🎵",
        title: "Taylor Swift new album announcement in January?",
        category: "entertainment",
        isForYou: true,
        volume: "900K",
        comments: 320,
        questions: [{ text: "", yesPercent: 70, noPercent: 30 }]
    },
    {
        id: "fy2",
        emoji: "🍎",
        title: "Apple Vision Pro 2 released in 2026?",
        category: "tech",
        isForYou: true,
        volume: "1.2M",
        comments: 450,
        questions: [{ text: "", yesPercent: 20, noPercent: 80 }]
    },
    {
        id: "fy3",
        emoji: "⚽",
        title: "Champions League Winner 2026",
        category: "sports",
        isForYou: true,
        volume: "2.8M",
        comments: 670,
        questions: [
            { text: "Real Madrid", yesPercent: 35, noPercent: 65 },
            { text: "Man City", yesPercent: 30, noPercent: 70 }
        ]
    },

    // POLITICS
    {
        id: "pol1",
        emoji: "🏳️‍🌈",
        title: "Same-sex marriage legalized in Japan by 2026?",
        category: "politics",
        volume: "500K",
        comments: 120,
        questions: [{ text: "", yesPercent: 40, noPercent: 60 }]
    },
    {
        id: "pol2",
        emoji: "🇪🇺",
        title: "EU to expand membership in 2026?",
        category: "politics",
        volume: "300K",
        comments: 80,
        questions: [{ text: "", yesPercent: 15, noPercent: 85 }]
    },

    // FINANCE
    {
        id: "fin1",
        emoji: "📉",
        title: "US Recession declared in 2026?",
        category: "finance",
        volume: "1.8M",
        comments: 400,
        badge: "ENDING",
        questions: [{ text: "", yesPercent: 25, noPercent: 75 }]
    },
    {
        id: "fin2",
        emoji: "💵",
        title: "Fed Interest Rate cut in next meeting?",
        category: "finance",
        volume: "2.5M",
        comments: 900,
        questions: [{ text: "", yesPercent: 60, noPercent: 40 }]
    },

    // TECH
    {
        id: "tech1",
        emoji: "🎮",
        title: "GTA VI delayed to 2027?",
        category: "tech",
        volume: "5M",
        comments: 3000,
        badge: "HOT",
        questions: [{ text: "", yesPercent: 45, noPercent: 55 }]
    },
    {
        id: "tech2",
        emoji: "🧠",
        title: "Neuralink human trials expanded to 100+ people?",
        category: "tech",
        volume: "800K",
        comments: 200,
        questions: [{ text: "", yesPercent: 80, noPercent: 20 }]
    },

    // CRYPTO
    {
        id: "cry1",
        emoji: "🐕",
        title: "Dogecoin to $1 in 2026?",
        category: "crypto",
        volume: "1.1M",
        comments: 1500,
        questions: [{ text: "", yesPercent: 10, noPercent: 90 }]
    },
    {
        id: "cry2",
        emoji: "Ξ",
        title: "Ethereum flippening (Market Cap > BTC)?",
        category: "crypto",
        volume: "600K",
        comments: 400,
        questions: [{ text: "", yesPercent: 5, noPercent: 95 }]
    },

    // ECONOMY
    {
        id: "eco1",
        emoji: "🛢️",
        title: "Oil prices exceed $100/barrel in Q2?",
        category: "economy",
        volume: "450K",
        comments: 100,
        questions: [{ text: "", yesPercent: 55, noPercent: 45 }]
    },
    {
        id: "eco2",
        emoji: "🏠",
        title: "US Housing Crash in 2026?",
        category: "economy",
        volume: "900K",
        comments: 350,
        questions: [{ text: "", yesPercent: 20, noPercent: 80 }]
    },

    // SCIENCE
    {
        id: "sci1",
        emoji: "🌡️",
        title: "2026 hottest year on record?",
        category: "science",
        volume: "1.5M",
        comments: 600,
        questions: [{ text: "", yesPercent: 90, noPercent: 10 }]
    },
    {
        id: "sci2",
        emoji: "👽",
        title: "Alien life evidence confirmed by NASA?",
        category: "science",
        volume: "2.1M",
        comments: 2000,
        questions: [{ text: "", yesPercent: 5, noPercent: 95 }]
    },

    // LATEST / GENERAL
    {
        id: "lat1",
        emoji: "🎬",
        title: "Next James Bond actor announced Q1?",
        category: "latest",
        volume: "300K",
        comments: 150,
        questions: [{ text: "", yesPercent: 15, noPercent: 85 }]
    }
];

export const MOCK_SIGNALS: Signal[] = [
    {
        id: "sig1",
        title: "GPT-5 Rumored Release Date Leaked",
        source: "TechCrunch",
        timeAgo: "2h ago",
        impact: "HIGH",
        sentiment: "BULLISH",
        tags: ["AI", "Tech"]
    },
    {
        id: "sig2",
        title: "SEC approves new Crypto ETFs",
        source: "Bloomberg",
        timeAgo: "15m ago",
        impact: "HIGH",
        sentiment: "BULLISH",
        tags: ["Crypto", "Regulation"]
    },
    {
        id: "sig3",
        title: "Global Inflation Rate Drops Below 2%",
        source: "Reuters",
        timeAgo: "5h ago",
        impact: "MEDIUM",
        sentiment: "BULLISH",
        tags: ["Economy", "Finance"]
    },
    {
        id: "sig4",
        title: "SpaceX Starship Explosion on Pad",
        source: "SpaceNews",
        timeAgo: "1h ago",
        impact: "HIGH",
        sentiment: "BEARISH",
        tags: ["Space", "Tech"]
    },
    {
        id: "sig5",
        title: "New Electric Vehicle Tax Credits Announced",
        source: "CNBC",
        timeAgo: "30m ago",
        impact: "MEDIUM",
        sentiment: "BULLISH",
        tags: ["EV", "Economy"]
    }
];
