'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface OnChainMarket {
    pubkey: string;
    title: string;
    teamHome: string;
    teamAway: string;
    probabilities: [number, number, number]; // basis points
    sector: string;
    competitionStart: number;
    competitionEnd: number;
    bondingK: number;
    bondingN: number;
    totalVolume: number;
    totalPositions: number;
    status: 'active' | 'paused' | 'settled';
}

export interface ProbabilitySnapshot {
    time: string;
    home: number;
    draw: number;
    away: number;
    narrative?: string;
}

export interface UseOnChainMarketResult {
    market: OnChainMarket | null;
    probHistory: ProbabilitySnapshot[];
    loading: boolean;
    error: string | null;
}

/**
 * Hook to read market data — from Supabase competitions (with realtime)
 * Falls back to simulated data if no competition is available
 */
export function useOnChainMarket(competitionId?: string | null): UseOnChainMarketResult {
    const [market, setMarket] = useState<OnChainMarket | null>(null);
    const [probHistory, setProbHistory] = useState<ProbabilitySnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchMarketFromCompetition = useCallback(async () => {
        if (!competitionId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const { data, error: sbError } = await supabase
                .from('competitions')
                .select('*')
                .eq('id', competitionId)
                .single();

            if (sbError || !data) {
                throw new Error(sbError?.message || 'Competition not found');
            }

            const probs = data.probabilities || [5000, 2500, 2500];
            const onChainMarket: OnChainMarket = {
                pubkey: data.onchain_market_pubkey || '',
                title: data.title,
                teamHome: data.team_home || '',
                teamAway: data.team_away || '',
                probabilities: [probs[0], probs[1], probs[2] || 10000 - probs[0] - probs[1]] as [number, number, number],
                sector: data.sector,
                competitionStart: new Date(data.competition_start).getTime() / 1000,
                competitionEnd: new Date(data.competition_end).getTime() / 1000,
                bondingK: data.bonding_k || 100000,
                bondingN: data.bonding_n || 150,
                totalVolume: data.entry_count || 0,
                totalPositions: data.entry_count || 0,
                status: data.status === 'active' ? 'active' : data.status === 'settled' ? 'settled' : 'paused',
            };

            setMarket(onChainMarket);

            // Fetch historical snapshots to populate curve
            const { data: snapshots } = await supabase
                .from('curve_snapshots')
                .select('probability, timestamp, reasoning')
                .eq('competition_id', competitionId)
                .order('timestamp', { ascending: true })
                .limit(50);

            let history: ProbabilitySnapshot[] = [];
            
            if (snapshots && snapshots.length > 0) {
                history = snapshots.map(snap => ({
                    time: new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    home: snap.probability * 100,
                    draw: 0,
                    away: (1 - snap.probability) * 100,
                    narrative: snap.reasoning
                }));
            }

            // Always ensure we have at least 2 points so Chart.js can draw a visible line on mount
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if (history.length === 0) {
                // No fake flat curve. Only use strictly real current probability
                history.push({
                    time: nowTime,
                    home: probs[0] / 100,
                    draw: probs[1] / 100,
                    away: (probs[2] || 10000 - probs[0] - probs[1]) / 100,
                });
            } else {
                // Append current point if time is different from the last history point
                if (history[history.length - 1].time !== nowTime) {
                    history.push({
                        time: nowTime,
                        home: probs[0] / 100,
                        draw: probs[1] / 100,
                        away: (probs[2] || 10000 - probs[0] - probs[1]) / 100,
                    });
                }
            }

            setProbHistory(history);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    // Subscribe to competition updates for live probability changes
    useEffect(() => {
        fetchMarketFromCompetition();

        if (!competitionId) return;

        const channel = supabase
            .channel(`competition-market-${competitionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'competitions',
                    filter: `id=eq.${competitionId}`,
                },
                (payload) => {
                    const updated = payload.new as any;
                    const probs = updated.probabilities || [5000, 2500, 2500];

                    // Update market
                    setMarket((prev) => prev ? {
                        ...prev,
                        probabilities: [probs[0], probs[1], probs[2] || 10000 - probs[0] - probs[1]] as [number, number, number],
                        totalVolume: updated.entry_count || prev.totalVolume,
                        totalPositions: updated.entry_count || prev.totalPositions,
                        status: updated.status === 'active' ? 'active' : updated.status === 'settled' ? 'settled' : 'paused',
                    } : prev);

                    // Append to probability history with real time
                    setProbHistory((prev) => {
                        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        // dedupe by time
                        if (prev.length > 0 && prev[prev.length - 1].time === nowTime) {
                            return prev;
                        }
                        const newPoint: ProbabilitySnapshot = {
                            time: nowTime,
                            home: probs[0] / 100,
                            draw: probs[1] / 100,
                            away: (probs[2] || 10000 - probs[0] - probs[1]) / 100,
                        };
                        return [...prev.slice(-50), newPoint];
                    });
                },
            )
            .on(
                'broadcast',
                { event: 'probability_update' },
                (payload) => {
                    const data = payload.payload as { marketId: string; snapshot: ProbabilitySnapshot };
                    if (data.marketId === competitionId && data.snapshot) {
                         setProbHistory((prev) => {
                             // dedupe by time just in case
                             if (prev.length > 0 && prev[prev.length - 1].time === data.snapshot.time) {
                                 return prev;
                             }
                             return [...prev.slice(-50), data.snapshot];
                         });
                    }
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [competitionId, fetchMarketFromCompetition]);

    // Curve data now comes from backend CurveEngine via Supabase Realtime broadcast
    // (subscribed above on the 'probability_update' broadcast event)
    // No local simulation needed

    return { market, probHistory, loading, error };
}
