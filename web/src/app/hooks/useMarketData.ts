import { useState, useEffect, useCallback } from 'react';
import { Market, Signal } from '../utils/mockData';
export type { Signal };
import { useMarketSocket, MarketMessage } from '../../hooks/useMarketSocket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

interface UseMarketDataOptions {
    category: string;
    searchQuery?: string;
    signalCategory?: string;
}

interface UseMarketDataResult {
    markets: Market[];
    feedItems: any[];
    signals: Signal[];
    isLoading: boolean;
    error: Error | null;
    loadMore: () => void;
    hasMore: boolean;
}

export function useMarketData({ category, searchQuery = "", signalCategory = "all" }: UseMarketDataOptions): UseMarketDataResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [data, setData] = useState<{ markets: Market[], feedItems: any[], signals: Signal[] }>({ markets: [], feedItems: [], signals: [] });

    // Real-time socket integration
    const handleSocketMessage = useCallback((message: MarketMessage) => {
        // console.log('Socket update:', message);
        if (message.type === 'new_item' || message.type === 'market_update' || message.type === 'signal_update') {
            // Efficiently merge new items into state without full refetch
            setData(prev => {
                // Signals usually come as an array in signal_update
                const newItemsRaw = message.data.item || message.data;
                const newItems = Array.isArray(newItemsRaw) ? newItemsRaw : [newItemsRaw];

                let updatedSignals = [...prev.signals];
                let updatedMarkets = [...prev.markets];
                let updatedFeed = [...prev.feedItems];

                newItems.forEach((newItem: any) => {
                    // Determine if it's a market or feed item based on structure
                    // Ideally backend sends type, for now assume feed item if not explicitly market
                    const isMarket = newItem.questions || newItem.outcomes;

                    // If it's a signal update, it belongs to signals
                    if (message.type === 'signal_update' || newItem.signal_type) {
                        if (!updatedSignals.some(s => s.id === newItem.id)) {
                            updatedSignals.unshift(newItem);
                        }
                        return;
                    }

                    if (isMarket) {
                        // Check for duplicates
                        if (!updatedMarkets.some(m => m.id === newItem.id)) {
                            updatedMarkets.unshift(newItem);
                        }
                    } else {
                        if (!updatedFeed.some(i => i.id === newItem.id)) {
                            updatedFeed.unshift(newItem);
                        }
                    }
                });

                return {
                    markets: updatedMarkets,
                    feedItems: updatedFeed,
                    signals: updatedSignals
                };
            });
        }
    }, []);

    const { subscribe, unsubscribe } = useMarketSocket({
        autoConnect: true,
        onMessage: handleSocketMessage
    });

    // Subscribe to category channel
    useEffect(() => {
        if (category && category !== 'top_markets' && category !== 'for_you') {
            subscribe(category as any);
            return () => unsubscribe(category as any);
        }
    }, [category, subscribe, unsubscribe]);

    // Pagination state
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 20;

    // ... socket code ...

    useEffect(() => {
        let isMounted = true;
        // Only reset if it's a new category/search/signalCategory, not just a page load
        if (page === 0) {
            setIsLoading(true);
            setData({ markets: [], feedItems: [], signals: [] });
        }
        setError(null);

        const fetchData = async () => {
            try {
                let endpoint = '';
                let queryParams = new URLSearchParams();

                if (searchQuery) {
                    queryParams.append('search', searchQuery);
                }

                // Pagination params
                queryParams.append('limit', LIMIT.toString());
                queryParams.append('offset', (page * LIMIT).toString());

                if (category === 'signals') {
                    endpoint = `${API_URL}/signals`;
                    if (signalCategory && signalCategory !== 'all') {
                        queryParams.append('category', signalCategory);
                    }
                } else if (category === 'top_markets') {
                    // Top Markets uses the recommendations algorithm
                    endpoint = `${API_URL}/recommendations/top-markets`;
                } else if (category === 'for_you') {
                    // For You uses personalized recommendations
                    endpoint = `${API_URL}/recommendations/for-you`;
                } else {
                    // All other categories (politics, finance, tech, crypto, economy, science, latest)
                    // Use the feed endpoint which queries ETL-populated market_data_items table
                    endpoint = `${API_URL}/markets/feed`;
                    if (category && category !== 'latest') {
                        queryParams.append('category', category);
                    }
                }

                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Failed to fetch data: ${response.statusText}`);
                }

                const result = await response.json();

                if (isMounted) {
                    const newItems = Array.isArray(result) ? result : (result.data || []);

                    // Use server-provided hasMore if available, otherwise calculate from item count
                    const serverHasMore = result.hasMore !== undefined ? result.hasMore : (newItems.length >= LIMIT);
                    if (!serverHasMore) {
                        setHasMore(false);
                    }

                    if (category === 'signals') {
                        setData(prev => ({
                            ...prev,
                            signals: page === 0 ? newItems : [...prev.signals, ...newItems]
                        }));
                    } else {
                        // ... existing splitting logic ...
                        const marketsData = newItems.filter((i: any) => i.questions || i.outcomes);
                        const feedData = newItems.filter((i: any) => !i.questions && !i.outcomes);

                        setData(prev => ({
                            markets: page === 0 ? marketsData : [...prev.markets, ...marketsData],
                            feedItems: page === 0 ? feedData : [...prev.feedItems, ...feedData],
                            signals: []
                        }));
                    }
                    setIsLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Market data fetch error:', err);
                    setError(err instanceof Error ? err : new Error('Failed to fetch market data'));
                    setIsLoading(false);
                }
            }
        };

        const timer = setTimeout(fetchData, 300);
        return () => { isMounted = false; clearTimeout(timer); };
    }, [category, searchQuery, page, signalCategory]);

    const loadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            setPage(prev => prev + 1);
        }
    }, [isLoading, hasMore]);

    return {
        markets: data.markets,
        feedItems: data.feedItems,
        signals: data.signals,
        isLoading,
        error,
        loadMore,
        hasMore
    };
}
