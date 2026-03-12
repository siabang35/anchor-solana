import { useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMarketSocket, MarketMessage } from '../../hooks/useMarketSocket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
const LIMIT = 20;

// Unified item type matching backend
export interface RecommendedItem {
    id: string;
    type: 'news' | 'market' | 'signal' | 'sports';
    title: string;
    description: string;
    category: string;
    source: string;
    publishedAt: string;
    impact: string;
    sentiment: string;
    sentimentScore: number;
    relevanceScore: number;
    confidenceScore: number;
    imageUrl: string | null;
    url: string | null;
    tags: string[];
    volume: number;
    trendScore: number;
    _score?: number;
}

interface UseAdvancedMarketRankingOptions {
    target?: 'top_markets' | 'for_you' | 'both';
}

interface UseAdvancedMarketRankingResult {
    topMarkets: RecommendedItem[];
    forYouMarkets: RecommendedItem[];
    isLoading: boolean;
    error: Error | null;
    refresh: () => void;
    loadMore: () => void;
    hasMore: boolean;
}

const fetchMarkets = async ({ pageParam = 0, endpoint }: { pageParam: number; endpoint: string }) => {
    const offset = pageParam * LIMIT;
    const res = await fetch(`${API_URL}/recommendations/${endpoint}?limit=${LIMIT}&offset=${offset}`, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : (data.data || []);
};

/**
 * Advanced Market Ranking Hook
 * 
 * Uses TanStack Query for caching and anti-throttling.
 * Integrates with WebSockets for real-time updates by updating the query cache.
 */
export function useAdvancedMarketRanking({ target = 'both' }: UseAdvancedMarketRankingOptions = {}): UseAdvancedMarketRankingResult {
    const queryClient = useQueryClient();

    // Top Markets Query
    const {
        data: topData,
        fetchNextPage: fetchNextTop,
        hasNextPage: hasNextTop,
        isLoading: loadTop,
        error: errorTop,
        refetch: refetchTop
    } = useInfiniteQuery({
        queryKey: ['markets', 'top'],
        queryFn: ({ pageParam }) => fetchMarkets({ pageParam, endpoint: 'top-markets' }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length < LIMIT ? undefined : allPages.length;
        },
        enabled: target === 'top_markets' || target === 'both',
        staleTime: 1000 * 60, // 1 minute stale time to prevent throttling
    });

    // For You Query
    const {
        data: forYouData,
        fetchNextPage: fetchNextForYou,
        hasNextPage: hasNextForYou,
        isLoading: loadForYou,
        error: errorForYou,
        refetch: refetchForYou
    } = useInfiniteQuery({
        queryKey: ['markets', 'forYou'],
        queryFn: ({ pageParam }) => fetchMarkets({ pageParam, endpoint: 'for-you' }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length < LIMIT ? undefined : allPages.length;
        },
        enabled: target === 'for_you' || target === 'both',
        staleTime: 1000 * 60,
    });

    // Flatten data
    const topMarkets = useMemo(() =>
        topData?.pages.flatMap(page => page) || [],
        [topData]);

    const forYouMarkets = useMemo(() =>
        forYouData?.pages.flatMap(page => page) || [],
        [forYouData]);

    // Socket Integration
    const handleSocketMessage = useCallback((message: MarketMessage) => {
        if (message.type === 'new_item' || message.type === 'market_update') {
            const newItem = message.data?.item || message.data;
            if (!newItem?.id) return;

            const formatItem = (item: any): RecommendedItem => ({
                id: item.id,
                type: item.type || 'news',
                title: item.title || '',
                description: item.description || '',
                category: message.category || item.category || 'latest',
                source: item.source_name || item.source || 'unknown',
                publishedAt: item.published_at || new Date().toISOString(),
                impact: item.impact || 'medium',
                sentiment: item.sentiment || 'neutral',
                sentimentScore: item.sentiment_score || 0,
                relevanceScore: item.relevance_score || 0.5,
                confidenceScore: item.confidence_score || 0.5,
                imageUrl: item.image_url || null,
                url: item.url || null,
                tags: item.tags || [],
                volume: item.volume || 0,
                trendScore: 0,
            });

            const formatted = formatItem(newItem);

            // Optimistically update caches
            // We prepend to the first page of the query data
            if (target === 'top_markets' || target === 'both') {
                queryClient.setQueryData(['markets', 'top'], (oldData: any) => {
                    if (!oldData) return oldData;
                    const newPages = [...oldData.pages];
                    if (newPages.length > 0) {
                        // Check if exists
                        const exists = newPages.some(page => page.some((m: RecommendedItem) => m.id === formatted.id));
                        if (!exists) {
                            newPages[0] = [formatted, ...newPages[0]];
                        }
                    }
                    return { ...oldData, pages: newPages };
                });
            }

            if (target === 'for_you' || target === 'both') {
                queryClient.setQueryData(['markets', 'forYou'], (oldData: any) => {
                    if (!oldData) return oldData;
                    const newPages = [...oldData.pages];
                    if (newPages.length > 0) {
                        const exists = newPages.some(page => page.some((m: RecommendedItem) => m.id === formatted.id));
                        if (!exists) {
                            newPages[0] = [formatted, ...newPages[0]];
                        }
                    }
                    return { ...oldData, pages: newPages };
                });
            }
        }
    }, [queryClient, target]);

    const { subscribe, unsubscribe, isConnected } = useMarketSocket({
        autoConnect: true,
        onMessage: handleSocketMessage
    });

    useEffect(() => {
        if (isConnected) subscribe('signals' as any);
        return () => unsubscribe('signals' as any);
    }, [isConnected, subscribe, unsubscribe]);

    const refresh = useCallback(() => {
        if (target === 'top_markets' || target === 'both') refetchTop();
        if (target === 'for_you' || target === 'both') refetchForYou();
    }, [target, refetchTop, refetchForYou]);

    const loadMore = useCallback(() => {
        if (target === 'top_markets' || target === 'both') fetchNextTop();
        if (target === 'for_you' || target === 'both') fetchNextForYou();
    }, [target, fetchNextTop, fetchNextForYou]);

    const isLoading = (target === 'top_markets' && loadTop) ||
        (target === 'for_you' && loadForYou) ||
        (target === 'both' && (loadTop || loadForYou));

    const hasMore = (target === 'top_markets' && hasNextTop) ||
        (target === 'for_you' && hasNextForYou) ||
        (target === 'both' && (hasNextTop || hasNextForYou));

    return {
        topMarkets,
        forYouMarkets,
        isLoading,
        error: (errorTop || errorForYou) as Error | null,
        refresh,
        loadMore,
        hasMore: !!hasMore
    };
}
