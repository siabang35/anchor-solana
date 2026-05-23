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
    timestamp: number;
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

    const fetchMarketFromCompetition = useCallback(async (isCancelled: () => boolean) => {
        if (!competitionId) {
            if (!isCancelled()) setLoading(false);
            return;
        }

        if (!isCancelled()) setLoading(true);
        try {
            const { data, error: sbError } = await supabase
                .from('competitions')
                .select('*')
                .eq('id', competitionId)
                .single();

            if (isCancelled()) return;

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

            if (!isCancelled()) {
                setMarket(onChainMarket);
            }

            // Fetch historical snapshots to populate curve
            const { data: snapshots } = await supabase
                .from('probability_history_lean')
                .select('home, draw, away, created_at, narrative')
                .eq('competition_id', competitionId)
                .order('created_at', { ascending: true })
                .limit(1000);

            if (isCancelled()) return;

            let history: ProbabilitySnapshot[] = [];
            
            if (snapshots && snapshots.length > 0) {
                history = snapshots.map(snap => ({
                    time: new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    timestamp: Math.floor(new Date(snap.created_at).getTime() / 1000),
                    home: snap.home,
                    draw: snap.draw,
                    away: snap.away,
                    narrative: snap.narrative
                }));
            }

            // Append current live probability as trailing point
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const currentHome = probs[0] / 100;
            const currentDraw = probs[1] / 100;
            const currentAway = (probs[2] || 10000 - probs[0] - probs[1]) / 100;
            const currentPoint: ProbabilitySnapshot = {
                time: nowTime,
                timestamp: Math.floor(Date.now() / 1000),
                home: currentHome,
                draw: currentDraw,
                away: currentAway,
            };
            
            if (history.length > 0) {
                // Only append if time is different from the last real history point
                if (history[history.length - 1].time !== nowTime) {
                    history.push(currentPoint);
                }
            } else {
                // ── Seed synthetic initial history so the chart is never empty ──
                // Generate 8 data points with gradual perturbations from current
                // probabilities. This ensures visible green/red line movement from
                // the first render, even before CurveEngine catches up.
                const seedCount = 8;
                const now = new Date();
                const intervalSec = 15; // 15-second intervals between synthetic points
                // Use competition ID hash for deterministic but unique perturbation per competition
                let idHash = 0;
                for (let c = 0; c < (competitionId || '').length; c++) {
                    idHash = ((idHash << 5) - idHash + (competitionId || '').charCodeAt(c)) | 0;
                }
                idHash = Math.abs(idHash);
                
                let h = currentHome;
                let d = currentDraw;
                let a = currentAway;

                for (let i = 0; i < seedCount; i++) {
                    const pointTime = new Date(now.getTime() - (seedCount - i) * intervalSec * 1000);
                    const timeStr = pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    
                    // Deterministic perturbation using sin/cos with competition-specific phase
                    const delta = Math.sin(i * 1.7 + idHash * 0.0001) * 3.5;
                    const delta2 = Math.cos(i * 2.3 + idHash * 0.0002) * 2.0;
                    
                    h = Math.max(5, Math.min(95, h + delta));
                    d = Math.max(2, Math.min(40, d + delta2));
                    a = Math.max(2, 100 - h - d);
                    
                    // Normalize to 100%
                    const total = h + d + a;
                    const nh = (h / total) * 100;
                    const nd = (d / total) * 100;
                    const na = 100 - nh - nd;

                    history.push({
                        time: timeStr,
                        timestamp: Math.floor(pointTime.getTime() / 1000),
                        home: parseFloat(nh.toFixed(2)),
                        draw: parseFloat(nd.toFixed(2)),
                        away: parseFloat(na.toFixed(2)),
                    });
                }
                // Add current live point as final
                history.push(currentPoint);
            }

            if (!isCancelled()) {
                setProbHistory(history);
            }
        } catch (err: any) {
            if (!isCancelled()) {
                setError(err.message);
            }
        } finally {
            if (!isCancelled()) {
                setLoading(false);
            }
        }
    }, [competitionId]);

    // Subscribe to competition updates for live probability changes
    useEffect(() => {
        let cancelled = false;
        const checkCancelled = () => cancelled;

        fetchMarketFromCompetition(checkCancelled);

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
                    if (cancelled) return;
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
                },
            )
            .on(
                'broadcast',
                { event: 'probability_update' },
                (payload) => {
                    if (cancelled) return;
                    const data = payload.payload as { marketId: string; snapshot: ProbabilitySnapshot };
                    if (data.marketId === competitionId && data.snapshot) {
                         const snap = {
                             ...data.snapshot,
                             timestamp: data.snapshot.timestamp || Math.floor(Date.now() / 1000)
                         };
                         setProbHistory((prev) => {
                             // dedupe by time just in case
                             if (prev.length > 0 && prev[prev.length - 1].time === snap.time) {
                                 return prev;
                             }
                             return [...prev.slice(-1000), snap];
                         });
                    }
                }
            )
            .subscribe();

        // Second channel: listen directly to probability_history INSERT events
        // This is the TRUE realtime source — the CurveEngine inserts here every tick
        const historyChannel = supabase
            .channel(`prob-history-${competitionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'probability_history',
                    filter: `competition_id=eq.${competitionId}`,
                },
                (payload) => {
                    if (cancelled) return;
                    const row = payload.new as any;
                    if (!row) return;

                    const newPoint: ProbabilitySnapshot = {
                        time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        timestamp: Math.floor(new Date(row.created_at).getTime() / 1000),
                        home: row.home,
                        draw: row.draw,
                        away: row.away,
                        narrative: row.narrative || undefined,
                    };

                    setProbHistory((prev) => {
                        // Dedupe: skip if the last point has the same time label
                        if (prev.length > 0 && prev[prev.length - 1].time === newPoint.time) {
                            // Update in-place if values differ (same second, new data)
                            const last = prev[prev.length - 1];
                            if (last.home !== newPoint.home || last.draw !== newPoint.draw) {
                                const updated = [...prev];
                                updated[updated.length - 1] = newPoint;
                                return updated;
                            }
                            return prev;
                        }
                        return [...prev.slice(-1000), newPoint];
                    });
                },
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            cancelled = true;
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
            supabase.removeChannel(historyChannel);
        };
    }, [competitionId, fetchMarketFromCompetition]);

    // Curve data now comes from backend CurveEngine via Supabase Realtime broadcast
    // (subscribed above on the 'probability_update' broadcast event)
    // No local simulation needed

    return { market, probHistory, loading, error };
}
