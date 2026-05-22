'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ClusterItem {
    id: string;
    competition_id: string;
    cluster_hash: string;
    article_urls: string[];
    signals: any[];
    sentiment: number;
    created_at: string;
}

export interface ClusterDataResult {
    clusters: ClusterItem[];
    loading: boolean;
    error: string | null;
    connected: boolean;
    refresh: () => void;
}

/**
 * Hook to fetch real-time news cluster data
 * Subscribes to Supabase Realtime for live updates
 * Pass 'all' or undefined as competitionId to fetch globally
 */
export function useClusterData(competitionId?: string | null): ClusterDataResult {
    const [clusters, setClusters] = useState<ClusterItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const isGlobal = !competitionId || competitionId === 'all';

    const fetchClusters = useCallback(async () => {
        setLoading(true);
        setError(null);

        if (competitionId === 'skip') {
            setClusters([]);
            setLoading(false);
            return;
        }

        try {
            let url = '/competitions/clusters';
            if (!isGlobal && competitionId) {
                url += `?competition_id=${competitionId}`;
            }

            const data = await apiFetch<ClusterItem[]>(url);
            setClusters(data || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load cluster data');
        } finally {
            setLoading(false);
        }
    }, [competitionId, isGlobal]);

    useEffect(() => {
        fetchClusters();

        if (competitionId === 'skip') return;

        const channelName = isGlobal ? 'clusters-global' : `clusters-${competitionId}`;
        const filter = isGlobal ? undefined : `competition_id=eq.${competitionId}`;

        const intervalId = setInterval(fetchClusters, 10000); // Polling every 10s

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'news_clusters',
                    ...(filter ? { filter } : {}),
                },
                (payload) => {
                    const newCluster = payload.new as unknown as ClusterItem;
                    setClusters((prev) => [newCluster, ...prev].slice(0, 20));
                },
            )
            .subscribe((status: string) => {
                setConnected(status === 'SUBSCRIBED');
            });

        channelRef.current = channel;

        return () => {
            clearInterval(intervalId);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [competitionId, fetchClusters, isGlobal]);

    return { clusters, loading, error, connected: true, refresh: fetchClusters };
}
