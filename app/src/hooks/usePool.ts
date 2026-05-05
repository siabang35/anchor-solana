'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, supabase } from '@/lib/supabase';

export interface PoolStake {
    user_id: string;
    agent_id: string;
    stake_amount: number;
    onchain_tx: string | null;
    staked_at: string;
    status: string;
}

export interface PoolData {
    total_pool: number;
    total_staked: number;
    platform_fee: number;
    competition_count: number;
    active_competitions: number;
    settled_competitions?: number;
    total_participants: number;
    sectors?: Array<{ sector: string; pool: number; competitions: number }>;
    // Per-competition fields
    settlement_status?: string;
    distributable_pool?: number;
    stake_count?: number;
    onchain_settle_tx?: string;
    onchain_disburse_txs?: any[];
}

export interface PoolWinner {
    rank: number;
    agent_id: string;
    agent_name: string;
    prize_amount: number;
    final_accuracy: number;
    prediction_count: number;
    claimed: boolean;
    claim_tx?: string;
    disburse_tx?: string;
    winner_wallet?: string;
    competition_title?: string;
    competition_id?: string;
    model?: string;
    global_accuracy?: number;
    competitions_entered?: number;
    total_predictions?: number;
    total_wins?: number;
    total_prize_earned?: number;
}

export interface PoolWithWinners {
    pool: PoolData;
    winners: PoolWinner[];
    stakes: PoolStake[];
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

/**
 * Visibility-aware polling — only poll when tab is visible
 * Saves bandwidth and prevents unnecessary server load
 */
function useVisibilityPolling(callback: () => void, intervalMs: number) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (!timer) {
                timer = setInterval(() => callbackRef.current(), intervalMs);
            }
        };

        const stop = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                callbackRef.current(); // Immediate refresh on tab focus
                start();
            } else {
                stop(); // Stop polling when tab is hidden
            }
        };

        // Start polling if tab is visible
        if (document.visibilityState === 'visible') {
            start();
        }

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [intervalMs]);
}

/**
 * Hook to fetch sector pool data + winners
 */
export function useSectorPool(sector: string): PoolWithWinners {
    const [pool, setPool] = useState<PoolData>({
        total_pool: 0, total_staked: 0, platform_fee: 0,
        competition_count: 0, active_competitions: 0, total_participants: 0,
    });
    const [winners, setWinners] = useState<PoolWinner[]>([]);
    const [stakes, setStakes] = useState<PoolStake[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchCountRef = useRef(0);

    const fetchData = useCallback(async () => {
        if (!sector) return;
        try {
            fetchCountRef.current += 1;
            if (fetchCountRef.current === 1) setLoading(true);

            const res = await apiFetch<{ pool: PoolData; winners: PoolWinner[] }>(`/pool/sector?sector=${sector}&limit=3`);
            if (res?.pool) setPool(res.pool);
            if (res?.winners) setWinners(res.winners);
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch sector pool:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [sector]);

    // Initial fetch
    useEffect(() => { fetchData(); }, [fetchData]);

    // Smart polling: only when tab is visible (30s)
    useVisibilityPolling(fetchData, 30_000);

    // Realtime subscription — triggers instant refetch (no polling needed)
    useEffect(() => {
        const channel = supabase
            .channel(`sector-pool-${sector}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'competition_pools',
            }, () => {
                fetchData();
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pool_stakes',
            }, () => {
                // Instant refetch when ANY new stake is added
                fetchData();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [sector, fetchData]);

    return { pool, winners, stakes, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch global pool data + top winners
 */
export function useGlobalPool(limit: number = 4): PoolWithWinners {
    const [pool, setPool] = useState<PoolData>({
        total_pool: 0, total_staked: 0, platform_fee: 0,
        competition_count: 0, active_competitions: 0, total_participants: 0,
    });
    const [winners, setWinners] = useState<PoolWinner[]>([]);
    const [stakes, setStakes] = useState<PoolStake[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchCountRef = useRef(0);

    const fetchData = useCallback(async () => {
        try {
            fetchCountRef.current += 1;
            if (fetchCountRef.current === 1) setLoading(true);

            const res = await apiFetch<{ pool: PoolData; winners: PoolWinner[] }>(`/pool/global?limit=${limit}`);
            if (res?.pool) setPool(res.pool);
            if (res?.winners) setWinners(res.winners);
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch global pool:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    // Initial fetch
    useEffect(() => { fetchData(); }, [fetchData]);

    // Smart polling: only when tab is visible (30s)
    useVisibilityPolling(fetchData, 30_000);

    return { pool, winners, stakes, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch competition-specific pool data + winners + stakes
 * With REALTIME updates on both competition_pools AND pool_stakes tables
 */
export function useCompetitionPool(competitionId: string | null | undefined): PoolWithWinners {
    const [pool, setPool] = useState<PoolData>({
        total_pool: 0, total_staked: 0, platform_fee: 0,
        competition_count: 0, active_competitions: 0, total_participants: 0,
    });
    const [winners, setWinners] = useState<PoolWinner[]>([]);
    const [stakes, setStakes] = useState<PoolStake[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchCountRef = useRef(0);

    const fetchData = useCallback(async () => {
        if (!competitionId) {
            setLoading(false);
            return;
        }
        try {
            fetchCountRef.current += 1;
            const isFirstFetch = fetchCountRef.current === 1;
            if (isFirstFetch) setLoading(true);

            const res = await apiFetch<{ pool: PoolData; winners: PoolWinner[]; stakes?: PoolStake[] }>(`/pool/competition?competition_id=${competitionId}`);
            if (res?.pool) setPool(res.pool);
            if (res?.winners) setWinners(res.winners);
            if (res?.stakes) setStakes(res.stakes);
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch competition pool:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    // Initial fetch
    useEffect(() => { fetchData(); }, [fetchData]);

    // Smart polling: only when tab is visible (15s for competition-specific)
    useVisibilityPolling(fetchData, 15_000);

    // Realtime subscription for BOTH pool updates AND new stakes
    useEffect(() => {
        if (!competitionId) return;

        const channel = supabase
            .channel(`comp-pool-${competitionId}`)
            // Listen to competition_pools changes (triggered by update_pool_on_stake trigger)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'competition_pools',
                filter: `competition_id=eq.${competitionId}`
            }, () => {
                // Immediately refetch to get updated totals
                fetchData();
            })
            // Listen to new stakes being added to this competition
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pool_stakes',
                filter: `competition_id=eq.${competitionId}`
            }, () => {
                // Immediately refetch — the DB trigger will have already updated competition_pools
                fetchData();
            })
            // Listen to pool_winners (settlement completed)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pool_winners',
                filter: `competition_id=eq.${competitionId}`
            }, () => {
                fetchData();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [competitionId, fetchData]);

    return { pool, winners, stakes, loading, error, refetch: fetchData };
}
