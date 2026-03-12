import { TrendingUp, Activity, Newspaper, Zap, Landmark, Globe, Monitor, Bitcoin, FlaskConical, LucideIcon } from "lucide-react";

export interface MarketCategory {
    id: string;
    path: string; // URL path segment (empty for root)
    label: string;
    icon: LucideIcon;
    description?: string;
}

export const MO_MARKET_CATEGORIES: MarketCategory[] = [
    { id: "top_markets", path: "", label: "Top Markets", icon: TrendingUp, description: "Curated top picks for you" },
    { id: "for_you", path: "for-you", label: "For You", icon: Activity, description: "Personalized recommendations" },
    { id: "signals", path: "signals", label: "Signals", icon: Newspaper, description: "Market signals and news" },
    { id: "latest", path: "latest", label: "Latest", icon: Zap, description: "Newest markets" },
    { id: "politics", path: "politics", label: "Politics", icon: Landmark, description: "Global political events" },
    { id: "finance", path: "finance", label: "Finance", icon: TrendingUp, description: "Economic indicators" },
    { id: "tech", path: "tech", label: "Tech", icon: Monitor, description: "Technology trends" },
    { id: "crypto", path: "crypto", label: "Crypto", icon: Bitcoin, description: "Cryptocurrency markets" },
    { id: "sports", path: "sports/*", label: "Sports", icon: Activity, description: "Sports matches and events" },
    { id: "economy", path: "economy", label: "Economy", icon: Globe, description: "Global economy" },
    { id: "science", path: "science", label: "Science", icon: FlaskConical, description: "Scientific breakthroughs" },
];
