import { useState } from "react";
import { FilterSection } from "../../components/FilterSection";
import { SignalsListItem } from "../../components/SignalsListItem";
import { useMarketData } from "../../hooks/useMarketData";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { motion } from "motion/react";

export function SignalsPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const { signals, isLoading, error, loadMore, hasMore } = useMarketData({
        category: "signals",
        searchQuery,
        signalCategory: selectedCategory
    });
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const CATEGORIES = [
        { id: "all", label: "All" },
        { id: "crypto", label: "Crypto" },
        { id: "politics", label: "Politics" },
        { id: "finance", label: "Finance" },
        { id: "tech", label: "Tech" },
        { id: "science", label: "Science" },
        { id: "economy", label: "Economy" },
    ];

    // Deduplicate signals just in case
    const uniqueSignals = Array.from(new Map(signals.map(item => [item.id, item])).values());

    // Manual Load More handler
    const handleLoadMore = () => {
        if (!isLoading && !isLoadingMore && hasMore) {
            setIsLoadingMore(true);
            loadMore();
            setTimeout(() => setIsLoadingMore(false), 500);
        }
    };

    return (
        <div className="flex flex-col space-y-4 pb-12 pt-4">
            {/* Removed HeroSection as requested for professional clean look */}

            <div className="container mx-auto px-4 max-w-6xl">
                <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                    <div className="flex items-center gap-2 self-start md:self-auto">
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <div className="w-1 h-6 bg-primary rounded-full" />
                            Latest Intelligence
                        </h3>
                    </div>

                    <div className="flex w-full md:w-auto items-center gap-4 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                        <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-full">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${selectedCategory === cat.id
                                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                                        }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        <div className="hidden md:block w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                        <FilterSection
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                        />
                    </div>
                </div>

                {isLoading && uniqueSignals.length === 0 ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner />
                    </div>
                ) : error ? (
                    <div className="text-center py-20 text-red-500">
                        Error loading signals: {error.message}
                    </div>
                ) : uniqueSignals.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <p className="text-xl">No signals found</p>
                    </div>
                ) : (
                    <>
                        {/* Premium List Container */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-white/50 dark:bg-card/30 backdrop-blur-sm border border-zinc-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm"
                        >
                            {uniqueSignals.map((signal, index) => (
                                <SignalsListItem key={signal.id} signal={signal} index={index} />
                            ))}
                        </motion.div>

                        {hasMore && (
                            <div className="flex flex-col items-center gap-4 mt-8 pb-8">
                                {/* Loading indicator */}
                                {isLoadingMore && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <LoadingSpinner size="sm" />
                                        <span className="text-sm">Loading more...</span>
                                    </div>
                                )}

                                {/* Load More Button */}
                                {!isLoadingMore && (
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={isLoading}
                                        className="px-8 py-3 bg-white dark:bg-card border border-zinc-200 dark:border-white/10 rounded-full font-semibold text-sm hover:shadow-lg hover:border-primary/30 transition-all disabled:opacity-50 flex items-center gap-2 group"
                                    >
                                        <span>Load More Stories</span>
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
                            </div>
                        )}

                        {/* End of content indicator */}
                        {!hasMore && uniqueSignals.length > 0 && (
                            <p className="text-center text-sm text-muted-foreground py-8">
                                You've reached the end • {uniqueSignals.length} signals loaded
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
