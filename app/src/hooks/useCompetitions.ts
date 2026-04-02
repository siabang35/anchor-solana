'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, apiFetch } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface Competition {
    id: string;
    title: string;
    description: string | null;
    sector: string;
    team_home: string | null;
    team_away: string | null;
    outcomes: string[];
    competition_start: string;
    competition_end: string;
    status: 'upcoming' | 'active' | 'settled' | 'cancelled';
    winning_outcome: number | null;
    prize_pool: number;
    entry_count: number;
    max_entries: number;
    probabilities: number[];
    onchain_market_pubkey: string | null;
    bonding_k: number;
    bonding_n: number;
    image_url: string | null;
    tags: string[];
    seconds_remaining?: number;
    progress_pct?: number;
    capacity_pct?: number;
    created_at: string;
    updated_at: string;
}

export interface SectorSummary {
    sector: string;
    active_count: number;
    upcoming_count: number;
}

export interface UseCompetitionsResult {
    competitions: Competition[];
    sectorSummary: SectorSummary[];
    loading: boolean;
    error: string | null;
    connected: boolean;
    refresh: () => void;
    activeCompetition: Competition | null;
}

export function useCompetitions(sector?: string): UseCompetitionsResult {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [sectorSummary, setSectorSummary] = useState<SectorSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Fetch competitions from API
    const fetchCompetitions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch competitions
            const sectorParam = sector && sector !== 'all' ? `?sector=${sector}` : '';
            const result = await apiFetch<Competition[]>(`/competitions${sectorParam}`);
            setCompetitions(result || []);

            // Fetch sector summary
            const summary = await apiFetch<SectorSummary[]>('/competitions/sectors/summary');
            setSectorSummary(summary || []);
        } catch (err: any) {
            // Fallback: fetch directly from Supabase
            try {
                let query = supabase
                    .from('competitions')
                    .select('*')
                    .in('status', ['active', 'upcoming'])
                    .order('competition_start', { ascending: true })
                    .limit(50);

                if (sector && sector !== 'all' && sector !== 'top' && sector !== 'foryou' && sector !== 'latest') {
                    query = query.eq('sector', sector);
                }

                const { data, error: sbError } = await query;
                if (sbError) throw sbError;
                setCompetitions((data as Competition[]) || []);
            } catch (fallbackErr: any) {
                setError(fallbackErr.message || 'Failed to load competitions');
            }
        } finally {
            setLoading(false);
        }
    }, [sector]);

    // Realtime subscription
    useEffect(() => {
        fetchCompetitions();

        const channelName = sector ? `competitions-${sector}` : 'competitions-all';
        const filterStr = sector && sector !== 'all' ? `sector=eq.${sector}` : undefined;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'competitions',
                    ...(filterStr ? { filter: filterStr } : {}),
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (payload.eventType === 'INSERT') {
                        const newComp = payload.new as unknown as Competition;
                        if (!sector || sector === 'all' || newComp.sector === sector) {
                            setCompetitions((prev) => {
                                // dedup and memory check
                                if (prev.some(p => p.id === newComp.id)) return prev;
                                const updated = [newComp, ...prev];
                                return updated.slice(0, 100); // memory cap
                            });
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as unknown as Competition;
                        setCompetitions((prev) =>
                            prev.map((c) => (c.id === updated.id ? updated : c)),
                        );
                    } else if (payload.eventType === 'DELETE') {
                        const deleted = payload.old as unknown as Competition;
                        setCompetitions((prev) => prev.filter((c) => c.id !== deleted.id));
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
    }, [sector, fetchCompetitions]);

    // Derive active competition (first active one for the current sector)
    const activeCompetition = competitions.find((c) => c.status === 'active') || competitions[0] || null;

    return {
        competitions,
        sectorSummary,
        loading,
        error,
        connected,
        refresh: fetchCompetitions,
        activeCompetition,
    };
}
