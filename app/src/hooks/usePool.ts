'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, supabase } from '@/lib/supabase';

export interface PoolStake {
    user_id: string;
    agent_id: string;
    stake_amount: number;
    onchain_tx: string | null;
    verified_onchain: boolean;
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
    id?: string;
    rank: number;
    agent_id: string;
    agent_name: string;
    user_id?: string;
    prize_amount: number;
    final_accuracy: number;
    prediction_count: number;
    claimed: boolean;
    claim_tx?: string;
    disburse_tx?: string;
    winner_wallet?: string;
    prize_share_bps?: number;
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

    const fetchData = useCallback(async () => {
        if (!sector) return;
        try {
            setLoading(true);
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

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30_000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchData]);

    // Realtime subscription for pool updates
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
                event: '*',
                schema: 'public',
                table: 'pool_stakes',
            }, () => {
                // Instant refetch when ANY stake is added, updated, or removed
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

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
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

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30_000);
        return () => clearInterval(interval);
    }, [fetchData]);

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
            // Always update stakes — use empty array as fallback to clear stale state
            setStakes(Array.isArray(res?.stakes) ? res.stakes : []);
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch competition pool:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    useEffect(() => {
        fetchData();
        // Poll every 15s for fast updates
        const interval = setInterval(fetchData, 15_000);
        return () => clearInterval(interval);
    }, [fetchData]);

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
            }, (payload) => {
                console.log('[Pool Realtime] competition_pools changed:', payload.eventType);
                // Immediately refetch to get updated totals
                fetchData();
            })
            // Listen to stake changes (INSERT, UPDATE, DELETE)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'pool_stakes',
                filter: `competition_id=eq.${competitionId}`
            }, (payload) => {
                console.log('[Pool Realtime] Stake changed:', payload.eventType);
                // Immediately refetch — the DB trigger will have already updated competition_pools
                fetchData();
            })
            // Listen to pool_winners (settlement completed)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pool_winners',
                filter: `competition_id=eq.${competitionId}`
            }, (payload) => {
                console.log('[Pool Realtime] Winner determined!', payload.new);
                fetchData();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Pool Realtime] Subscribed to competition ${competitionId}`);
                }
            });

        return () => { supabase.removeChannel(channel); };
    }, [competitionId, fetchData]);

    return { pool, winners, stakes, loading, error, refetch: fetchData };
}
