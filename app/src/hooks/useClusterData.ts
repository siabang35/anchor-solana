'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, apiFetch } from '@/lib/supabase';
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
 * Hook to fetch real-time news cluster data for a competition
 * Subscribes to Supabase Realtime for live updates
 */
export function useClusterData(competitionId?: string | null): ClusterDataResult {
    const [clusters, setClusters] = useState<ClusterItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchClusters = useCallback(async () => {
        if (!competitionId) {
            setClusters([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data, error: sbError } = await supabase
                .from('news_clusters')
                .select('*')
                .eq('competition_id', competitionId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (sbError) throw sbError;
            setClusters((data as ClusterItem[]) || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load cluster data');
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    useEffect(() => {
        fetchClusters();

        if (!competitionId) return;

        const channel = supabase
            .channel(`clusters-${competitionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'news_clusters',
                    filter: `competition_id=eq.${competitionId}`,
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
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [competitionId, fetchClusters]);

    return { clusters, loading, error, connected, refresh: fetchClusters };
}
