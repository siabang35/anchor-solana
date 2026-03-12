"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
    Search,
    Sparkles,
    TrendingUp,
    Flame,
    Timer,
    X,
    SlidersHorizontal,
    Loader2,
    Filter,
    MessageSquare,
    AlertCircle,
    RefreshCw,
    ExternalLink
} from "lucide-react";
import { cn } from "../../components/ui/utils";
import { useDebounce } from "../../hooks/useDebounce";
import { useIntersectionObserver } from "../../hooks/useIntersectionObserver";

// API URL from environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Secondary Navigation Links
const TOP_NAV_LINKS = [
    { id: "all", label: "All" },
    { id: "sports", label: "Sports" },
    { id: "politics", label: "Politics" },
    { id: "crypto", label: "Crypto" },
    { id: "science", label: "Science" },
    { id: "tech", label: "Tech" },
    { id: "finance", label: "Finance" },
    { id: "economy", label: "Economy" },
];

// Browse filter options (Pills) - Maps to sortBy and special filter logic
const BROWSE_FILTERS: Array<{ id: string; label: string; icon: any; sortBy: 'date' | 'relevance' | 'engagement' }> = [
    { id: "new", label: "New", icon: Sparkles, sortBy: 'date' },
    { id: "trending", label: "Trending", icon: TrendingUp, sortBy: 'engagement' },
    { id: "ending_soon", label: "Ending Soon", icon: Timer, sortBy: 'date' },
];

// Sort options for sidebar
const SORT_OPTIONS = [
    { id: "date", label: "Newest", icon: Sparkles },
    { id: "relevance", label: "Relevant", icon: TrendingUp },
    { id: "engagement", label: "Popular", icon: Flame },
];

// Event status filters
const STATUS_FILTERS = [
    { id: "active", label: "Active" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
];

// OWASP A03:2021 - Client-side input sanitization
function sanitizeSearchInput(input: string): string {
    if (!input) return '';
    return input
        .replace(/[<>'";&\\]/g, '') // Remove potentially dangerous characters
        .replace(/javascript:/gi, '') // Prevent JS injection
        .trim()
        .substring(0, 100); // Limit length
}

// Market item interface from API
interface MarketItem {
    id: string;
    title: string;
    description?: string;
    category: string;
    source?: string;
    publishedAt?: string;
    impact?: string;
    sentiment?: string;
    sentimentScore?: number;
    relevanceScore?: number;
    imageUrl?: string;
    url?: string;
    tags?: string[];
    outcomes?: Array<{ id: string; label: string; probability: number }>;
    volume?: number;
    timeframe?: string;
}

export function SearchPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);

    // Derived State from URL (Single Source of Truth)
    const activeCategory = searchParams.get("category") || "all";
    const activeFilter = searchParams.get("filter") || "all";
    const activeSort = searchParams.get("sortBy") || "date";
    // We keep status local for now unless requested otherwise, or sync it too.
    // Let's sync it to URL for consistency if we want full deep linking, 
    // but to avoid changing too much logic, we'll keep it simple or align it.
    // User asked for "New, Trending, Ending Soon, Topics" to work. 
    // Status is separate. Let's keep status managed via URL to be safe? 
    // Actually, user didn't mention status. Let's keep it derived or default.
    const activeStatus = searchParams.get("status") || "active";

    // Local state for input to allow typing before debouncing
    const [inputValue, setInputValue] = useState(searchParams.get("q") || "");
    const debouncedQuery = useDebounce(inputValue, 400);

    const [results, setResults] = useState<MarketItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);

    const LIMIT = 20;

    // Intersection observer for infinite scroll
    const [loadMoreRef, isLoadMoreVisible] = useIntersectionObserver({ threshold: 0.1 });

    // Sync URL 'q' parameter to local input state (handling back/forward navigation)
    useEffect(() => {
        const urlQ = searchParams.get("q") || "";
        if (urlQ !== inputValue) {
            setInputValue(urlQ);
        }
    }, [searchParams]);

    // Update URL when debounced query changes
    useEffect(() => {
        // Only update if the URL value is different from debounced value
        // preventing loops
        const currentQ = searchParams.get("q") || "";
        if (debouncedQuery !== currentQ) {
            setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                if (debouncedQuery) newParams.set("q", debouncedQuery);
                else newParams.delete("q");
                return newParams;
            }, { replace: true });
        }
    }, [debouncedQuery]);

    const fetchSearchResults = useCallback(async (isLoadMore = false) => {
        const sanitizedQuery = sanitizeSearchInput(searchParams.get("q") || "");
        // Use derived state directly
        const category = searchParams.get("category") || "all";
        const sort = searchParams.get("sortBy") || "date";
        // status ??

        if (!isLoadMore) {
            setIsSearching(true);
            setError(null);
            setPage(0);
            setResults([]);
        }

        try {
            let url = '';

            // Branch logic: Use specialized Sports API for 'sports' category
            if (category === 'sports') {
                const queryParams = new URLSearchParams();
                if (sanitizedQuery) queryParams.append('search', sanitizedQuery);
                queryParams.append('isActive', 'true'); // Default to active
                queryParams.append('limit', LIMIT.toString());
                queryParams.append('page', (isLoadMore ? (page + 2) : 1).toString()); // API uses 1-based page index? Checked DTO: default 1.
                // Note: Frontend 'page' state is 0-based.

                // Map frontend sort to API sort
                if (sort === 'date') queryParams.append('sortBy', 'createdAt');
                else if (sort === 'engagement') queryParams.append('sortBy', 'volume');
                // else undefined (default)

                url = `${API_URL}/sports/markets?${queryParams.toString()}`;
            } else {
                // Generic Feed API
                const queryParams = new URLSearchParams();
                if (sanitizedQuery) queryParams.append('search', sanitizedQuery);
                if (category !== 'all') queryParams.append('category', category);
                queryParams.append('sortBy', sort); // API expects sortBy
                queryParams.append('limit', LIMIT.toString());
                queryParams.append('offset', (isLoadMore ? (page + 1) * LIMIT : 0).toString());

                url = `${API_URL}/markets/feed?${queryParams.toString()}`;
            }

            const response = await fetch(
                url,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    // AbortController for request cancellation (anti-throttling)
                    signal: AbortSignal.timeout(15000), // 15s timeout
                }
            );

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Terlalu banyak permintaan. Mohon tunggu sebentar.');
                }
                throw new Error(`Gagal mencari: ${response.statusText}`);
            }

            const data = await response.json();

            let items: MarketItem[] = [];
            let totalCount = 0;
            let hasMoreItems = false;

            if (category === 'sports') {
                // Map Sports API response to MarketItem
                const sportsData = data as { data: any[], total: number, totalPages: number, page: number };
                items = (sportsData.data || []).map((m: any) => ({
                    id: m.id,
                    title: m.title || m.event?.name || 'Sports Market',
                    description: m.description,
                    category: 'sports',
                    source: m.event?.league?.name || 'Sports',
                    publishedAt: m.createdAt,
                    impact: m.isFeatured ? 'high' : 'medium',
                    sentiment: 'neutral',
                    imageUrl: m.event?.thumbnailUrl || m.event?.league?.logoUrl, // Fallback to league logo
                    outcomes: m.outcomes?.map((label: string, idx: number) => ({
                        id: `${m.id}-${idx}`,
                        label,
                        probability: Math.round((m.outcomePrices?.[idx] || 0) * 100)
                    })),
                    volume: m.volume,
                    url: `/market/${m.id}` // Internal link
                }));
                totalCount = sportsData.total;
                hasMoreItems = sportsData.page < sportsData.totalPages;
            } else {
                items = data.data || [];
                totalCount = data.total || 0;
                hasMoreItems = data.hasMore ?? items.length >= LIMIT;
            }

            if (isLoadMore) {
                setResults(prev => [...prev, ...items]);
                setPage(prev => prev + 1);
            } else {
                setResults(items);
            }

            setTotal(totalCount);
            setHasMore(hasMoreItems);
        } catch (err) {
            if (err instanceof Error) {
                if (err.name === 'AbortError' || err.name === 'TimeoutError') {
                    setError('Permintaan timeout. Silakan coba lagi.');
                } else {
                    setError(err.message);
                }
            } else {
                setError('Terjadi kesalahan saat mencari.');
            }
        } finally {
            setIsSearching(false);
        }
    }, [searchParams, page]); // Dependency on searchParams ensures refetch on URL change

    // Initial load & when params change (Category, Sort, Query in URL)
    // We use a stringified version of relevant params to avoid excessive re-renders/looping on object reference change
    const paramsKey = `${searchParams.get("q")}-${searchParams.get("category")}-${searchParams.get("sortBy")}-${searchParams.get("filter")}`;

    useEffect(() => {
        fetchSearchResults(false);
    }, [paramsKey]);

    // Infinite scroll trigger
    useEffect(() => {
        if (isLoadMoreVisible && hasMore && !isSearching && results.length > 0) {
            fetchSearchResults(true);
        }
    }, [isLoadMoreVisible, hasMore, isSearching, results.length]);

    // Handlers for UI to update URL directly
    const updateCategory = (cat: string) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            if (cat === "all") newParams.delete("category");
            else newParams.set("category", cat);
            return newParams;
        }, { replace: true });
    };

    const updateFilter = (filterId: string) => {
        const filter = BROWSE_FILTERS.find(f => f.id === filterId);
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            if (filterId === "all") {
                newParams.delete("filter");
                // Reset sort to date if clearing filter?
                newParams.set("sortBy", "date");
            } else {
                newParams.set("filter", filterId);
                if (filter) newParams.set("sortBy", filter.sortBy);
            }
            return newParams;
        }, { replace: true });
    };

    const updateSort = (sortId: string) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.set("sortBy", sortId);
            return newParams;
        }, { replace: true });
    };

    const updateStatus = (statusId: string) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.set("status", statusId);
            return newParams;
        }, { replace: true });
    }

    const handleMarketClick = (item: MarketItem) => {
        if (item.url && !item.outcomes) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        } else {
            navigate(`/market/${item.id}`);
        }
    };

    const clearSearch = () => {
        setInputValue("");
        inputRef.current?.focus();
    };

    const handleRetry = () => {
        fetchSearchResults(false);
    };

    const getCategoryEmoji = (category: string): string => {
        const emojis: Record<string, string> = {
            politics: "🏛️",
            finance: "💹",
            tech: "💻",
            crypto: "₿",
            sports: "⚽",
            economy: "📊",
            science: "🔬",
            entertainment: "🎬",
        };
        return emojis[category?.toLowerCase()] || "📰";
    };

    const formatTimeAgo = (dateString?: string): string => {
        if (!dateString) return "";
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="min-h-screen w-full bg-background font-sans text-foreground pb-20 lg:pb-12">

            {/* Top Navigation Bar (Mobile & Desktop) */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/40">
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1 group max-w-2xl">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                {isSearching ? (
                                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                ) : (
                                    <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                )}
                            </div>
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full bg-secondary/50 hover:bg-secondary/70 border border-border/50 focus:border-primary/50 focus:bg-background rounded-lg py-2.5 pl-10 pr-10 text-sm outline-none transition-all shadow-sm focus:shadow-md"
                                placeholder="Search markets..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                maxLength={100}
                            />
                            {inputValue && (
                                <button
                                    onClick={clearSearch}
                                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Secondary Navigation (Horizontal Scroll) */}
                    <div className="flex items-center gap-6 overflow-x-auto scrollbar-none mt-3 pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 border-t border-transparent lg:border-none">
                        {TOP_NAV_LINKS.map((link) => (
                            <button
                                key={link.id}
                                onClick={() => updateCategory(link.id)}
                                className={cn(
                                    "text-sm font-semibold whitespace-nowrap transition-colors relative py-2",
                                    activeCategory === link.id
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {link.label}
                                {activeCategory === link.id && (
                                    <motion.div
                                        layoutId="activeNavIndicator"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* Main Content (Feed) */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Results Summary */}
                    {inputValue && !isSearching && (
                        <div className="text-sm text-muted-foreground">
                            {total > 0 ? (
                                <span>Found <strong className="text-foreground">{total}</strong> results for "<strong className="text-foreground">{inputValue}</strong>"</span>
                            ) : (
                                <span>No results found for "<strong className="text-foreground">{inputValue}</strong>"</span>
                            )}
                        </div>
                    )}

                    {/* Header Filters (Pills) */}
                    <div className="flex items-center overflow-x-auto scrollbar-none gap-2 pb-2">
                        <div className="flex gap-2">
                            <button
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-sm font-bold transition-all",
                                    activeFilter === 'all'
                                        ? "bg-foreground text-background"
                                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                )}
                                onClick={() => updateFilter('all')}
                            >
                                All
                            </button>
                            {BROWSE_FILTERS.map((filter) => {
                                const Icon = filter.icon;
                                const isActive = activeFilter === filter.id;
                                return (
                                    <button
                                        key={filter.id}
                                        onClick={() => updateFilter(filter.id)}
                                        className={cn(
                                            "group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border whitespace-nowrap",
                                            isActive
                                                ? "bg-foreground text-background border-foreground"
                                                : "bg-background hover:bg-secondary/50 border-transparent text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {filter.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Error State */}
                    {error && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center">
                            <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-foreground mb-2">Oops!</h3>
                            <p className="text-muted-foreground mb-4">{error}</p>
                            <button
                                onClick={handleRetry}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* Loading State */}
                    {isSearching && results.length === 0 && (
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/30 bg-card/50 animate-pulse">
                                    <div className="w-14 h-14 rounded-lg bg-secondary/50" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-secondary/50 rounded w-1/4" />
                                        <div className="h-5 bg-secondary/50 rounded w-3/4" />
                                        <div className="h-3 bg-secondary/50 rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Markets List (Compact Row Style) */}
                    {!error && (
                        <div className="space-y-4">
                            <AnimatePresence mode="popLayout">
                                {results.map((market, index) => (
                                    <motion.div
                                        key={market.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                                        onClick={() => handleMarketClick(market)}
                                        className="group flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-border/30 bg-card/50 hover:bg-secondary/20 hover:border-border/80 transition-all cursor-pointer"
                                    >
                                        {/* Market Image / Emoji */}
                                        <div className="flex-shrink-0">
                                            {market.imageUrl ? (
                                                <img
                                                    src={market.imageUrl}
                                                    alt=""
                                                    className="w-16 h-16 sm:w-14 sm:h-14 rounded-lg object-cover shadow-sm"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 sm:w-14 sm:h-14 rounded-lg bg-secondary/50 flex items-center justify-center text-3xl sm:text-2xl shadow-sm">
                                                    {getCategoryEmoji(market.category)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5 flex items-center gap-1">
                                                        {market.category}
                                                        {market.source && (
                                                            <>
                                                                <span className="text-border">•</span>
                                                                <span>{market.source}</span>
                                                            </>
                                                        )}
                                                        {market.url && !market.outcomes && (
                                                            <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-50" />
                                                        )}
                                                    </div>
                                                    <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight group-hover:text-primary transition-colors pr-4">
                                                        {market.title}
                                                    </h3>
                                                </div>

                                                {/* Desktop Score/Sentiment (Right aligned) */}
                                                <div className="hidden sm:flex flex-col items-end flex-shrink-0 pl-4 gap-1">
                                                    {market.outcomes ? (
                                                        <>
                                                            <span className={cn(
                                                                "text-lg font-bold tabular-nums",
                                                                (market.outcomes[0]?.probability || 0) > 50 ? "text-primary" : "text-foreground"
                                                            )}>
                                                                {market.outcomes[0]?.probability || 50}%
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">Chance</span>
                                                        </>
                                                    ) : (
                                                        <div className="flex flex-col items-end gap-1.5">
                                                            {/* Impact Badge */}
                                                            {market.impact && market.impact !== 'medium' && (
                                                                <span className={cn(
                                                                    "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                                                                    market.impact === 'high' || market.impact === 'critical'
                                                                        ? "bg-orange-500/10 text-orange-500"
                                                                        : "bg-secondary text-muted-foreground"
                                                                )}>
                                                                    <Flame className="w-2.5 h-2.5" />
                                                                    {market.impact}
                                                                </span>
                                                            )}

                                                            {/* Sentiment Badge */}
                                                            <span className={cn(
                                                                "text-xs font-bold px-2 py-0.5 rounded-full",
                                                                market.sentiment === 'positive' || market.sentiment === 'bullish'
                                                                    ? "bg-green-500/10 text-green-500"
                                                                    : market.sentiment === 'negative' || market.sentiment === 'bearish'
                                                                        ? "bg-red-500/10 text-red-500"
                                                                        : "bg-secondary text-muted-foreground"
                                                            )}>
                                                                {market.sentiment || 'neutral'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                            {market.volume !== undefined && market.volume > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-foreground">{market.volume}</span> engagement
                                                </div>
                                            )}
                                            {market.tags && market.tags.length > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <MessageSquare className="w-3 h-3" />
                                                    <span>{market.tags.slice(0, 2).join(', ')}</span>
                                                </div>
                                            )}
                                            {market.publishedAt && (
                                                <div className="flex items-center gap-1 opacity-70">
                                                    <Timer className="w-3 h-3" />
                                                    <span>{formatTimeAgo(market.publishedAt)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {/* Load More Trigger */}
                            <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                                {isSearching && results.length > 0 && (
                                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                )}
                            </div>

                            {/* Empty State */}
                            {!isSearching && results.length === 0 && !error && (
                                <div className="text-center py-20">
                                    <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground">No markets found</h3>
                                    <p className="text-muted-foreground mt-1">Try changing your filters or search terms.</p>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {/* Right Sidebar (Desktop Sticky) */}
                <div className="hidden lg:block lg:col-span-1">
                    <div className="sticky top-28 space-y-6">

                        {/* Filters Panel */}
                        <div className="bg-card/50 border border-border/50 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4" />
                                Filters
                            </h3>

                            <div className="space-y-4">
                                {/* Sort By */}
                                <div>
                                    <label className="text-xs text-muted-foreground font-medium mb-2 block">Sort By</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SORT_OPTIONS.map((sort) => (
                                            <button
                                                key={sort.id}
                                                onClick={() => updateSort(sort.id)}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium text-left border transition-all flex items-center gap-1.5",
                                                    activeSort === sort.id
                                                        ? "bg-primary/10 text-primary border-primary/30"
                                                        : "bg-background text-muted-foreground border-transparent hover:bg-secondary"
                                                )}
                                            >
                                                <sort.icon className="w-3 h-3" />
                                                {sort.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Status */}
                                <div>
                                    <label className="text-xs text-muted-foreground font-medium mb-2 block">Event Status</label>
                                    <div className="flex p-1 bg-secondary rounded-lg">
                                        {STATUS_FILTERS.map((status) => (
                                            <button
                                                key={status.id}
                                                onClick={() => updateStatus(status.id)}
                                                className={cn(
                                                    "flex-1 py-1.5 rounded-md text-xs font-bold transition-all",
                                                    activeStatus === status.id
                                                        ? "bg-background text-foreground shadow-sm"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {status.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer / Links */}
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground px-2">
                            <a href="#" className="hover:text-foreground transition-colors">How it works</a>
                            <a href="#" className="hover:text-foreground transition-colors">Rules</a>
                            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
                            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Floating Action Button (FAB) */}
            <AnimatePresence>
                {!showMobileFilters && (
                    <motion.button
                        initial={{ scale: 0, rotate: 90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 90 }}
                        onClick={() => setShowMobileFilters(true)}
                        className="lg:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/25 font-bold text-sm tracking-wide active:scale-95 transition-transform"
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Mobile Filter Sheet */}
            <AnimatePresence>
                {showMobileFilters && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
                            onClick={() => setShowMobileFilters(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl z-50 p-6 pb-safe lg:hidden max-h-[85vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-8 sticky top-0 bg-card z-10 pb-2 border-b border-border/50">
                                <h3 className="text-xl font-bold font-rajdhani">Filter Markets</h3>
                                <button
                                    onClick={() => setShowMobileFilters(false)}
                                    className="p-2 bg-secondary rounded-full hover:bg-secondary/80 transition-colors"
                                >
                                    <X className="w-5 h-5 text-foreground" />
                                </button>
                            </div>

                            {/* Mobile Filters Content (Same as Desktop Sidebar) */}
                            <div className="space-y-8">
                                <div>
                                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Sort By</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {SORT_OPTIONS.map((sort) => (
                                            <button
                                                key={sort.id}
                                                onClick={() => updateSort(sort.id)}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium text-left border transition-all flex items-center gap-1.5",
                                                    activeSort === sort.id
                                                        ? "bg-primary/10 text-primary border-primary/30"
                                                        : "bg-secondary/30 text-foreground border-transparent"
                                                )}
                                            >
                                                <sort.icon className="w-4 h-4" />
                                                {sort.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Market Status</h4>
                                    <div className="flex p-1 bg-secondary rounded-xl">
                                        {STATUS_FILTERS.map((status) => (
                                            <button
                                                key={status.id}
                                                onClick={() => updateStatus(status.id)}
                                                className={cn(
                                                    "flex-1 py-3 text-xs font-bold rounded-lg transition-all",
                                                    activeStatus === status.id
                                                        ? "bg-background text-primary shadow-sm"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {status.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowMobileFilters(false)}
                                className="w-full mt-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base shadow-lg shadow-primary/25 active:scale-95 transition-all"
                            >
                                Show {results.length} Results
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
