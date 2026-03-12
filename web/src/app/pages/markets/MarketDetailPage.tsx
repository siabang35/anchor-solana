
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Share2, Loader2, AlertTriangle } from "lucide-react";
import { MOCK_MARKETS, Market } from "../../utils/mockData";
import SportsMarketCard from "../../components/SportsMarketCard";
import { Button } from "../../components/ui/button";
import { BetSlip } from "../../components/BetSlip";
import { MobileBetSlip } from "../../components/MobileBetSlip";

export function MarketDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [market, setMarket] = useState<Market | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate API fetch delay (anti-throttling/UX)
        setLoading(true);
        const timer = setTimeout(() => {
            const found = MOCK_MARKETS.find(m => m.id === id);
            setMarket(found || null);
            setLoading(false);
        }, 600);
        return () => clearTimeout(timer);
    }, [id]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground animate-pulse">Loading market details...</p>
            </div>
        );
    }

    if (!market) {
        return (
            <div className="container mx-auto max-w-4xl px-4 py-20 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Market Not Found</h1>
                <p className="text-muted-foreground mb-8">
                    The market you are looking for does not exist or has been removed.
                </p>
                <Button onClick={() => navigate(-1)} variant="outline">
                    Go Back
                </Button>
            </div>
        );
    }

    // Adapt mock market to SportsMarket interface if needed, or ensure they match
    // SportsMarketCard expects specific fields. MOCK_MARKETS has most but might miss some.
    // Let's ensure compatibility.
    const adaptedMarket = {
        ...market,
        eventId: market.id, // Mock
        outcomes: market.questions[0]?.text ? [market.questions[0].text, "No"] : ["Yes", "No"], // Simplified adaptation
        outcomePrices: [market.questions[0]?.yesPercent / 100, market.questions[0]?.noPercent / 100],
        isLive: market.badge === "HOT", // Mock logic
        // Parse volume string (e.g., "12.5M") to number
        volume: (() => {
            const v = market.volume || "0";
            if (v.includes("M")) return parseFloat(v) * 1_000_000;
            if (v.includes("K")) return parseFloat(v) * 1_000;
            return parseFloat(v);
        })(),
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="mb-6 pl-0 hover:pl-1 transition-all text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
            </Button>

            <div className="flex gap-8 items-start">
                <div className="flex-1 min-w-0">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                    {market.emoji} {market.category}
                                    <span className="text-border">•</span>
                                    <span>General</span>
                                </span>
                                {market.badge && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                        {market.badge}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
                                {market.title}
                            </h1>
                        </div>
                        <Button variant="outline" size="icon" className="shrink-0 rounded-full">
                            <Share2 className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Main Market Card */}
                    <div className="mb-8">
                        <SportsMarketCard market={adaptedMarket} />
                    </div>

                    {/* Additional Details (Mock) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-card border border-border/50 rounded-xl p-6">
                            <h3 className="font-semibold mb-4">Market Rules</h3>
                            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-4">
                                <li>The market will resolve based on the official outcome.</li>
                                <li>Dates listed are in your local timezone.</li>
                                <li>Trading fees are 1% on winnings.</li>
                            </ul>
                        </div>
                        <div className="bg-card border border-border/50 rounded-xl p-6">
                            <h3 className="font-semibold mb-4">Activity</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Volume</span>
                                    <span className="font-medium">{market.volume}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Comments</span>
                                    <span className="font-medium">{market.comments}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop Betslip Sidebar */}
                <aside className="hidden lg:block w-80 shrink-0 sticky top-24">
                    <BetSlip />
                </aside>
            </div>

            <MobileBetSlip />
        </div>
    );
}
