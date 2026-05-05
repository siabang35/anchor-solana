'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, API_BASE_URL, apiFetch } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface LiveFeedItem {
    id: string;
    source: string;
    icon: string;
    text: string;
    impact: 'high' | 'medium' | 'low';
    timestamp: number;
    sentiment: number;
    entity: string;
    category?: string;
    tags?: string[];
    url?: string;
    image_url?: string;
}

export interface UseLiveFeedResult {
    feeds: LiveFeedItem[];
    loading: boolean;
    error: string | null;
    connected: boolean;
    refetch: () => Promise<void>;
}

// Source icon mapping (matches live-feed.controller.ts)
const SOURCE_ICONS: Record<string, string> = {
    'NewsAPI': '📰',
    'GDELT': '🌐',
    'CoinGecko': '🪙',
    'CoinMarketCap': '💰',
    'CryptoPanic': '📊',
    'Alpha Vantage': '💹',
    'FRED': '🏦',
    'HackerNews': '💻',
    'ArXiv': '🔬',
    'SemanticScholar': '📚',
    'WorldBank': '🌍',
    'IMF': '🏛️',
    'OECD': '📈',
    'RSS': '📡',
};

function normalizeImpact(impact: string): 'high' | 'medium' | 'low' {
    const lower = (impact || 'medium').toLowerCase();
    if (lower === 'critical' || lower === 'high') return 'high';
    if (lower === 'low') return 'low';
    return 'medium';
}

function sentimentToScore(sentiment: string, sentimentScore?: number): number {
    if (sentimentScore !== undefined && sentimentScore !== null) {
        return sentimentScore;
    }
    switch ((sentiment || 'neutral').toLowerCase()) {
        case 'bullish': return 0.3;
        case 'bearish': return -0.3;
        default: return 0;
    }
}

/**
 * Maps a Supabase market_data_items row to LiveFeedItem
 */
function mapToFeedItem(item: any): LiveFeedItem {
    return {
        id: item.id || `feed-${Date.now()}-${Math.random()}`,
        source: (item.source_name || item.source || 'Unknown').toUpperCase(),
        icon: SOURCE_ICONS[item.source_name || item.source] || '📰',
        text: item.title || item.description || '',
        impact: normalizeImpact(item.impact),
        timestamp: new Date(item.published_at || item.publishedAt || Date.now()).getTime(),
        sentiment: sentimentToScore(item.sentiment, item.sentiment_score ?? item.sentimentScore),
        entity: item.category || 'General',
        category: item.category,
        tags: item.tags || [],
        url: item.url || item.link || '',
        image_url: item.image_url || item.urlToImage || item.imageUrl || '',
    };
}

/**
 * Hook for real-time live feed data.
 * 
 * 1. Fetches initial items from REST API (or Supabase fallback)
 * 2. Subscribes to Supabase Realtime for new INSERTs
 * 3. Auto-prepends new items to the feed
 */
export function useLiveFeed(limit: number = 20, category?: string): UseLiveFeedResult {
    const [feeds, setFeeds] = useState<LiveFeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Initial fetch
    const fetchFeeds = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Try backend API first
            const isCategoryValid = category && category !== 'top' && category !== 'foryou' && category !== 'signals' && category !== 'latest';
            const path = isCategoryValid
                ? `/markets/feed?category=${category}&limit=${limit}`
                : `/markets/feed?limit=${limit}`;

            const responseData = await apiFetch<any>(path);

            if (responseData) {
                const itemsList = Array.isArray(responseData) ? responseData : (responseData?.items || responseData?.data || []);
                const items = itemsList.map(mapToFeedItem);

                if (items.length > 0) {
                    setFeeds(items);
                    setLoading(false);
                    return;
                }
            }
        } catch (err: any) {
            console.warn('Backend API failed for live feed:', err.message);
        }

        // Fallback: fetch directly from Supabase market_data_items
        try {
            const isCategoryValid = category && category !== 'top' && category !== 'foryou' && category !== 'signals' && category !== 'latest';
            let query = supabase
                .from('market_data_items')
                .select('id, title, description, source_name, source, url, published_at, impact, sentiment, sentiment_score, category, tags');

            if (isCategoryValid) {
                query = query.eq('category', category);
            }

            const { data, error: sbError } = await query
                .order('published_at', { ascending: false })
                .limit(limit);

            if (!sbError && data && data.length > 0) {
                const items = data.map(mapToFeedItem);
                setFeeds(items);
                setLoading(false);
                return;
            }
        } catch {
            // Supabase query failed
        }

        // Fallback 2: Use competitions as feed items
        try {
            const isCategoryValid = category && category !== 'top' && category !== 'foryou' && category !== 'signals' && category !== 'latest';
            let query = supabase
                .from('competitions')
                .select('id, title, description, sector, status, created_at');

            if (isCategoryValid) {
                query = query.eq('sector', category);
            }

            const { data: comps } = await query
                .order('created_at', { ascending: false })
                .limit(limit);

            if (comps && comps.length > 0) {
                const items: LiveFeedItem[] = comps.map((c: any) => ({
                    id: c.id,
                    source: 'ExoDuZe',
                    icon: '🎯',
                    text: c.title || c.description || 'Competition',
                    impact: 'high' as const,
                    timestamp: new Date(c.created_at).getTime(),
                    sentiment: 0,
                    entity: c.sector || 'General',
                    category: c.sector,
                    tags: ['competition', c.status],
                    url: '',
                }));
                setFeeds(items);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load live feed');
        } finally {
            setLoading(false);
        }
    }, [limit, category]);

    // Subscribe to realtime inserts
    useEffect(() => {
        fetchFeeds();

        const channelName = category ? `live-feed-inserts-${category}` : 'live-feed-inserts-all';
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'market_data_items',
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    const newRow = payload.new as any;
                    const isCategoryValid = category && category !== 'top' && category !== 'foryou' && category !== 'signals' && category !== 'latest';
                    const matchesCategory = !isCategoryValid || newRow.category === category;

                    if (newRow.is_active !== false && newRow.is_duplicate !== true && matchesCategory) {
                        const feedItem = mapToFeedItem(newRow);
                        setFeeds((prev) => {
                            // Dedup guard
                            if (prev.some(p => p.id === feedItem.id)) return prev;
                            return [feedItem, ...prev].slice(0, limit);
                        });
                    }
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
    }, [limit, category, fetchFeeds]);

    return { feeds, loading, error, connected, refetch: fetchFeeds };
}
