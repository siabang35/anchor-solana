
import { useState, useMemo } from "react";
import { FilterSection } from "../../components/FilterSection";
import { MarketGrid, MarketOutcome } from "../../components/markets";
import { useMarketData } from "../../hooks/useMarketData";
import { MarketFeed } from "../../components/markets/MarketFeed";
import { MarketCategory } from "@/hooks/useMarketSocket";
import { useBetSlip } from "../../contexts/BetSlipContext";
import BetSlip from "../../components/BetSlip";
import { LoadingSpinner } from "../../components/LoadingSpinner";

interface CategoryPageProps {
    category: string;
    title?: string;
    showFilter?: boolean;
    overrideMarkets?: any[]; // Allow injecting pre-ranked markets
    isLoadingOverride?: boolean;
    loadMoreOverride?: () => void;
    hasMoreOverride?: boolean;
}

// Category Fallback Images (High quality Unsplash/Placeholder)
const CATEGORY_IMAGES: Record<string, string> = {
    crypto: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&q=80&w=600",
    politics: "https://images.unsplash.com/photo-1529101091760-61df52839f87?auto=format&fit=crop&q=80&w=600",
    science: "https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600",
    tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600",
    finance: "https://images.unsplash.com/photo-1611974765270-ca12586343bb?auto=format&fit=crop&q=80&w=600",
    economy: "https://images.unsplash.com/photo-1611974765270-ca12586343bb?auto=format&fit=crop&q=80&w=600",
    sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600",
    default: "https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&q=80&w=600"
};

const getFallbackImage = (category: string = 'default') => {
    return CATEGORY_IMAGES[category.toLowerCase()] || CATEGORY_IMAGES.default;
};

// Transform API market data to PolymarketCard format
function transformToPolymarketFormat(market: any) {
    const fallbackImage = getFallbackImage(market.category);

    // Helper to ensure image is not just an empty string
    const resolveImage = (img: string | null | undefined) => {
        if (!img || img.trim() === '') return fallbackImage;
        return img;
    };

    if (market.outcomes && Array.isArray(market.outcomes)) {
        return {
            id: market.id,
            title: market.title,
            image: resolveImage(market.image_url || market.image || market.imageUrl),
            icon: market.emoji || market.icon,
            outcomes: market.outcomes.map((o: any, idx: number) => ({
                id: o.id || `${market.id}-outcome-${idx}`,
                label: o.label || o.text || o.name,
                probability: o.probability || o.yesPercent || Math.round(Math.random() * 60 + 20),
            })),
            volume: market.volume,
            timeframe: market.timeframe || (market.endDate ? undefined : 'Active'),
            category: market.category,
            endDate: market.endDate || market.end_time,
        };
    }

    if (market.questions && Array.isArray(market.questions)) {
        return {
            id: market.id,
            title: market.title,
            image: resolveImage(market.image_url || market.image),
            icon: market.emoji,
            outcomes: market.questions.map((q: any, idx: number) => ({
                id: `${market.id}-q-${idx}`,
                label: q.text || market.title,
                probability: q.yesPercent || 50,
            })),
            volume: market.volume,
            timeframe: market.timeframe,
            category: market.category,
            endDate: market.endDate,
        };
    }

    return {
        id: market.id,
        title: market.title,
        image: resolveImage(market.image_url || market.image || market.imageUrl),
        icon: market.emoji || '📊',
        outcomes: [{
            id: `${market.id}-default`,
            label: 'Yes',
            probability: market.yes_price ? Math.round(market.yes_price * 100) : 50,
        }],
        volume: market.volume || market.liquidity,
        timeframe: market.timeframe,
        category: market.category,
        endDate: market.endDate || market.end_time,
    };
}

// Transform News Feed Item to PolymarketCard format
function transformNewsToMarket(item: any): any {
    const isCrypto = item.currencies && item.currencies.length > 0;
    const title = item.title;
    let outcomes: MarketOutcome[] = [];

    if (item.sentiment === 'bullish') {
        outcomes = [
            { id: `${item.id}-yes`, label: "Bullish Impact", probability: 75 },
            { id: `${item.id}-no`, label: "Bearish Impact", probability: 25 }
        ];
    } else if (item.sentiment === 'bearish') {
        outcomes = [
            { id: `${item.id}-yes`, label: "Bullish Impact", probability: 25 },
            { id: `${item.id}-no`, label: "Bearish Impact", probability: 75 }
        ];
    } else {
        outcomes = [
            { id: `${item.id}-high`, label: "High Impact", probability: 45 },
            { id: `${item.id}-low`, label: "Low Impact", probability: 55 }
        ];
    }

    return {
        id: `news-${item.id}`,
        title: `Will "${title.substring(0, 60)}..." have significant market impact?`,
        image: item.imageUrl || item.image_url || item.image,
        icon: isCrypto ? '₿' : '📰',
        outcomes: outcomes,
        volume: undefined,
        timeframe: 'New',
        category: 'news',
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isNewsArgs: true
    };
}

export function CategoryPage({
    category,
    title,
    showFilter = true,
    overrideMarkets,
    isLoadingOverride,
    loadMoreOverride,
    hasMoreOverride
}: CategoryPageProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const { markets: fetchedMarkets, feedItems, isLoading: fetchLoading, error, loadMore: fetchLoadMore, hasMore: fetchHasMore } = useMarketData({ category, searchQuery });
    const { addToBetSlip } = useBetSlip();
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const markets = overrideMarkets || fetchedMarkets;
    const isLoading = isLoadingOverride ?? fetchLoading;
    const loadMore = loadMoreOverride || fetchLoadMore;
    const hasMore = hasMoreOverride !== undefined ? hasMoreOverride : fetchHasMore;

    // Transform markets to Polymarket format
    // If no real markets, transform feed items into "simulated" markets
    const displayMarkets = useMemo(() => {
        if (markets.length > 0) {
            // Check if already transformed (if passed via override) or needs transformation
            // Our algorithms return 'Market' objects, so we likely need to transform them here
            return markets.map(transformToPolymarketFormat);
        }
        // Fallback: Turn news into markets if no real markets exist
        if (feedItems.length > 0) {
            return feedItems.map(transformNewsToMarket);
        }
        return [];
    }, [markets, feedItems]);

    // Manual Load More handler
    const handleLoadMore = () => {
        if (!isLoading && !isLoadingMore && hasMore) {
            setIsLoadingMore(true);
            loadMore();
            // Just for visual effect, simpler than adding state to hook
            setTimeout(() => setIsLoadingMore(false), 500);
        }
    };

    // Handle outcome selection
    const handleSelectOutcome = (marketId: string, outcome: MarketOutcome, action: 'yes' | 'no') => {
        // Check if it's a real market or simulated news market
        const realMarket = markets.find(m => m.id === marketId);
        const newsItem = !realMarket ? feedItems.find(f => `news-${f.id}` === marketId) : null;

        const marketTitle = realMarket?.title || (newsItem ? `Will "${newsItem.title.substring(0, 40)}..." have impact?` : 'Market');

        addToBetSlip({
            id: `${marketId}-${outcome.id}-${action}`,
            marketId: marketId,
            question: outcome.label || marketTitle,
            outcome: action,
            price: (action === 'yes' ? outcome.probability : 100 - outcome.probability) / 100,
            sport: category
        });
    };

    const handleCardClick = (marketId: string) => {
        if (marketId.startsWith('news-')) {
            // For simulated news markets, maybe open the source URL?
            const newsId = marketId.replace('news-', '');
            const item = feedItems.find(i => i.id == newsId);
            if (item && item.url) {
                window.open(item.url, '_blank');
            }
        } else {
            window.location.href = `/markets/${marketId}`;
        }
    };

    return (
        <div className="flex flex-col space-y-6 pb-24 bg-background min-h-screen">
            {showFilter && (
                <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40">
                    <FilterSection
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />
                </div>
            )}

            <div className="container mx-auto px-4 max-w-[1600px]">
                {title && (
                    <h2 className="text-2xl font-bold mb-6 text-foreground capitalize">
                        {title || category}
                    </h2>
                )}

                <div className="flex flex-col xl:flex-row gap-6 mt-4">
                    {/* Main Content Area - Desktop has scrollable container */}
                    <div className="flex-1 min-w-0 xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto xl:pr-2 custom-scrollbar">
                        {error ? (
                            <div className="text-center py-20 text-destructive bg-destructive/10 rounded-2xl border border-destructive/20">
                                <p className="font-medium">Error loading markets</p>
                                <p className="text-sm opacity-80 mt-1">{error.message}</p>
                            </div>
                        ) : (
                            <>
                                <MarketGrid
                                    markets={displayMarkets}
                                    isLoading={isLoading && displayMarkets.length === 0}
                                    onSelectOutcome={handleSelectOutcome}
                                    onCardClick={handleCardClick}
                                    skeletonCount={12}
                                />

                                {/* Load More Section */}
                                {displayMarkets.length > 0 && (
                                    <div className="mt-8 flex flex-col items-center gap-4 pb-4">
                                        {/* Loading indicator */}
                                        {isLoadingMore && (
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <LoadingSpinner size="sm" />
                                                <span className="text-sm">Loading more...</span>
                                            </div>
                                        )}

                                        {/* Load More Button */}
                                        {hasMore && !isLoadingMore && (
                                            <button
                                                onClick={handleLoadMore}
                                                disabled={isLoading}
                                                className="px-8 py-3 bg-white dark:bg-card border border-zinc-200 dark:border-white/10 rounded-full font-semibold text-sm hover:shadow-lg hover:border-primary/30 transition-all disabled:opacity-50 flex items-center gap-2 group"
                                            >
                                                <span>Load More</span>
                                                <svg
                                                    className="w-4 h-4 group-hover:translate-y-0.5 transition-transform"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                </svg>
                                            </button>
                                        )}

                                        {/* End of content indicator */}
                                        {!hasMore && displayMarkets.length > 0 && (
                                            <p className="text-sm text-muted-foreground">
                                                You've reached the end • {displayMarkets.length} items loaded
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* If completely empty (no markets AND no news) */}
                        {!isLoading && displayMarkets.length === 0 && (
                            <div className="text-center py-20 text-muted-foreground bg-accent/20 rounded-xl border border-border/40">
                                <p className="text-xl">No active markets found for {category}</p>
                                <p className="text-sm mt-2">Check back later for new AI agent competitions</p>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar (Desktop) */}
                    <div className="hidden xl:flex flex-col gap-4 w-80 shrink-0 sticky top-24 h-[calc(100vh-120px)]">
                        {/* Live Feed */}
                        <div className="flex-1 min-h-0 bg-card rounded-xl border border-border/50 p-4 flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    Live Feed
                                </h3>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">
                                <MarketFeed category={category as MarketCategory} items={feedItems} />
                            </div>
                        </div>

                        {/* Bet Slip */}
                        <div className="h-auto">
                            <BetSlip className="border-border/50 bg-card" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bet Slip */}
            <div className="xl:hidden fixed bottom-0 left-0 right-0 z-50 p-2 pointer-events-none">
                <div className="pointer-events-auto">
                    <BetSlip className="h-auto max-h-[80vh] shadow-2xl border-border/50 bg-card" />
                </div>
            </div>
        </div>
    );
}

