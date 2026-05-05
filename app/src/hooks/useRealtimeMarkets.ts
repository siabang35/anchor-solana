'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, apiFetch } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface MarketDataItem {
    id: string;
    title: string;
    description: string;
    source_name: string;
    published_at: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    sentiment: 'bearish' | 'neutral' | 'bullish';
    image_url: string | null;
    url: string | null;
    tags: string[];
    category: string;
    content_type: string;
    relevance_score: number;
    is_active?: boolean;
    is_duplicate?: boolean;
}

export interface UseRealtimeMarketsResult {
    items: MarketDataItem[];
    loading: boolean;
    error: string | null;
    connected: boolean;
    refresh: () => void;
}

export function useRealtimeMarkets(
    category: string,
    limit: number = 20,
): UseRealtimeMarketsResult {
    const [items, setItems] = useState<MarketDataItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Initial fetch from API
    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiFetch<{ data: MarketDataItem[] }>(
                `/markets/category/${category}?limit=${limit}`,
            );
            setItems(result.data || []);
        } catch (err: any) {
            // Fallback: fetch directly from Supabase
            try {
                const { data, error: sbError } = await supabase
                    .from('market_data_items')
                    .select('id, title, description, source_name, published_at, impact, sentiment, image_url, url, tags, category, content_type, relevance_score')
                    .eq('category', category)
                    .eq('is_active', true)
                    .eq('is_duplicate', false)
                    .order('published_at', { ascending: false })
                    .limit(limit);

                if (sbError) throw sbError;
                setItems((data as MarketDataItem[]) || []);
            } catch (fallbackErr: any) {
                setError(fallbackErr.message || 'Failed to load market data');
            }
        } finally {
            setLoading(false);
        }
    }, [category, limit]);

    // Subscribe to realtime changes
    useEffect(() => {
        fetchItems();

        // Realtime subscription
        const channel = supabase
            .channel(`market-data-${category}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'market_data_items',
                    filter: `category=eq.${category}`,
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    const newItem = payload.new as MarketDataItem;
                    if (newItem.is_active !== false && newItem.is_duplicate !== true) {
                        setItems((prev) => [newItem, ...prev].slice(0, limit));
                    }
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'market_data_items',
                    filter: `category=eq.${category}`,
                },
                (payload) => {
                    const updated = payload.new as MarketDataItem;
                    setItems((prev) =>
                        prev.map((item) => (item.id === updated.id ? updated : item)),
                    );
                },
            )
            .subscribe((status: string) => {
                setConnected(status === 'SUBSCRIBED');
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [category, limit, fetchItems]);

    return { items, loading, error, connected, refresh: fetchItems };
}
