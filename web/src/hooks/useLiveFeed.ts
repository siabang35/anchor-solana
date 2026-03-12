import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, API_BASE_URL } from '../services/supabase';
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
}

export interface UseLiveFeedResult {
    feeds: LiveFeedItem[];
    loading: boolean;
    error: string | null;
    connected: boolean;
    refetch: () => Promise<void>;
}

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
    };
}

export function useLiveFeed(limit: number = 20, category?: string): UseLiveFeedResult {
    const [feeds, setFeeds] = useState<LiveFeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchFeeds = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const isCategoryValid = category && category !== 'top' && category !== 'foryou';
            const url = isCategoryValid
                ? `${API_BASE_URL}/markets/feed?category=${category}&limit=${limit}`
                : `${API_BASE_URL}/markets/feed?limit=${limit}`;

            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
            });

            if (res.ok) {
                const responseData = await res.json();
                const itemsList = Array.isArray(responseData) ? responseData : (responseData?.data || []);
                const items = itemsList.map(mapToFeedItem);
                setFeeds(items);
                setLoading(false);
                return;
            }
        } catch {
            // Backend API failed, fallback to Supabase
        }

        try {
            const isCategoryValid = category && category !== 'top' && category !== 'foryou';
            let query = supabase
                .from('market_data_items')
                .select('id, title, description, source_name, source, published_at, impact, sentiment, sentiment_score, category, tags')
                .eq('is_active', true)
                .eq('is_duplicate', false);

            if (isCategoryValid) {
                query = query.eq('category', category);
            }

            const { data, error: sbError } = await query
                .order('published_at', { ascending: false })
                .limit(limit);

            if (sbError) throw sbError;

            const items = (data || []).map(mapToFeedItem);
            setFeeds(items);
        } catch (err: any) {
            setError(err.message || 'Failed to load live feed');
        } finally {
            setLoading(false);
        }
    }, [limit, category]);

    useEffect(() => {
        fetchFeeds();

        const channel = supabase
            .channel('live-feed-inserts')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'market_data_items',
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    const newRow = payload.new as any;
                    const isCategoryValid = category && category !== 'top' && category !== 'foryou';
                    const matchesCategory = !isCategoryValid || newRow.category === category;

                    if (newRow.is_active !== false && newRow.is_duplicate !== true && matchesCategory) {
                        const feedItem = mapToFeedItem(newRow);
                        setFeeds((prev) => [feedItem, ...prev].slice(0, limit));
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
