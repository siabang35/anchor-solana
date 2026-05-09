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
            // Fetch competitions — meta-tabs (top, foryou, latest, signals) fetch ALL competitions
            const META_TABS = ['all', 'top', 'foryou', 'latest', 'signals'];
            const sectorParam = sector && !META_TABS.includes(sector) ? `?sector=${sector}` : '';
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
                    .gt('competition_end', new Date().toISOString()) // Exclude time-expired
                    .order('competition_start', { ascending: true })
                    .limit(50);

                if (sector && !['all', 'top', 'foryou', 'latest', 'signals'].includes(sector)) {
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
                        // Only add if not expired and matches sector
                        const isExpired = new Date(newComp.competition_end).getTime() < Date.now();
                        if (isExpired) return;
                        if (newComp.status === 'settled' || newComp.status === 'cancelled') return;
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
                        // Remove settled/cancelled competitions from the feed immediately
                        if (updated.status === 'settled' || updated.status === 'cancelled') {
                            setCompetitions((prev) => prev.filter((c) => c.id !== updated.id));
                        } else {
                            setCompetitions((prev) =>
                                prev.map((c) => (c.id === updated.id ? updated : c)),
                            );
                        }
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
    // Filter out any settled/cancelled AND time-expired competitions
    const now = Date.now();
    let activeComps = competitions.filter(c => {
        if (c.status !== 'active' && c.status !== 'upcoming') return false;
        // Also exclude competitions whose end time has passed (before settle cron runs)
        if (new Date(c.competition_end).getTime() < now) return false;
        return true;
    });

    if (sector === 'latest') {
        activeComps.sort((a, b) => {
            const statusA = a.status === 'active' ? 0 : 1;
            const statusB = b.status === 'active' ? 0 : 1;
            if (statusA !== statusB) return statusA - statusB;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    } else {
        // For 'top', 'foryou', 'all', and specific sectors (crypto, tech, etc)
        // Sort by active status first, then by entry_count descending
        activeComps.sort((a, b) => {
            const statusA = a.status === 'active' ? 0 : 1;
            const statusB = b.status === 'active' ? 0 : 1;
            if (statusA !== statusB) return statusA - statusB;
            return (b.entry_count || 0) - (a.entry_count || 0);
        });
    }

    const activeCompetition = activeComps[0] || null;

    return {
        competitions: activeComps,
        sectorSummary,
        loading,
        error,
        connected,
        refresh: fetchCompetitions,
        activeCompetition,
    };
}
