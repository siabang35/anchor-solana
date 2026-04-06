'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, apiFetch } from '@/lib/supabase';

export interface AgentPrediction {
    id: string;
    agent_id: string;
    competition_id: string;
    probability: number;
    reasoning: string;
    projected_curve?: Array<{ timestamp_offset_mins: number; probability: number }>;
    timestamp: string;
}

export interface AgentPredictionGroup {
    agent_id: string;
    agent_name: string;
    predictions: AgentPrediction[];
    latest_probability: number | null;
    prediction_count: number;
}

export interface ScoringUpdate {
    agent_id: string;
    competition_id: string;
    weighted_score: number | null;
    brier_score: number | null;
    prediction_count: number;
    rank_trend: number;
    last_scored_at: string | null;
}

export interface UseAgentPredictionsResult {
    predictionsByAgent: Map<string, AgentPredictionGroup>;
    scoringUpdates: Map<string, ScoringUpdate>;
    allPredictions: AgentPrediction[];
    loading: boolean;
    connected: boolean;
    latestPredictionAt: Date | null;
}

/**
 * Hook to fetch and subscribe to real-time agent predictions for a competition.
 * Returns grouped predictions by agent and live scoring updates.
 */
export function useAgentPredictions(competitionId: string | null | undefined): UseAgentPredictionsResult {
    const [allPredictions, setAllPredictions] = useState<AgentPrediction[]>([]);
    const [scoringUpdates, setScoringUpdates] = useState<Map<string, ScoringUpdate>>(new Map());
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [latestPredictionAt, setLatestPredictionAt] = useState<Date | null>(null);
    const channelRef = useRef<any>(null);
    const scoreChannelRef = useRef<any>(null);

    // Fetch initial predictions
    const fetchPredictions = useCallback(async () => {
        if (!competitionId) {
            setLoading(false);
            return;
        }

        try {
            // Fetch predictions from the agent_predictions table via Supabase
            const { data, error } = await supabase
                .from('agent_predictions')
                .select('id, agent_id, competition_id, probability, reasoning, projected_curve, timestamp')
                .eq('competition_id', competitionId)
                .order('timestamp', { ascending: true });

            if (!error && data) {
                setAllPredictions(data as AgentPrediction[]);
                if (data.length > 0) {
                    setLatestPredictionAt(new Date(data[data.length - 1].timestamp));
                }
            }
        } catch (err) {
            console.error('Failed to fetch agent predictions:', err);
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    // Fetch initial scoring state
    const fetchScoring = useCallback(async () => {
        if (!competitionId) return;

        try {
            const { data, error } = await supabase
                .from('agent_competition_entries')
                .select('agent_id, weighted_score, brier_score, prediction_count, rank_trend, last_scored_at')
                .eq('competition_id', competitionId)
                .in('status', ['active', 'paused']);

            if (!error && data) {
                const map = new Map<string, ScoringUpdate>();
                for (const entry of data) {
                    map.set(entry.agent_id, {
                        agent_id: entry.agent_id,
                        competition_id: competitionId,
                        weighted_score: entry.weighted_score ? Number(entry.weighted_score) : null,
                        brier_score: entry.brier_score ? Number(entry.brier_score) : null,
                        prediction_count: entry.prediction_count || 0,
                        rank_trend: entry.rank_trend || 0,
                        last_scored_at: entry.last_scored_at,
                    });
                }
                setScoringUpdates(map);
            }
        } catch (err) {
            console.error('Failed to fetch scoring data:', err);
        }
    }, [competitionId]);

    useEffect(() => {
        fetchPredictions();
        fetchScoring();

        if (!competitionId) return;

        // Subscribe to new predictions (INSERT on agent_predictions)
        const predChannel = supabase
            .channel(`predictions-${competitionId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'agent_predictions',
                filter: `competition_id=eq.${competitionId}`,
            }, (payload: any) => {
                const newPred = payload.new as AgentPrediction;
                if (!newPred) return;

                setAllPredictions(prev => {
                    // Dedup to prevent double counting
                    if (prev.some(p => p.id === newPred.id)) return prev;
                    // Prepend new predict and limit memory to 500 to prevent leak
                    const updated = [...prev, newPred];
                    if (updated.length > 500) return updated.slice(updated.length - 500);
                    return updated;
                });
                setLatestPredictionAt(new Date(newPred.timestamp));
            })
            .subscribe((status: string) => {
                setConnected(status === 'SUBSCRIBED');
            });

        channelRef.current = predChannel;

        // Subscribe to scoring updates (UPDATE on agent_competition_entries)
        const scoreChannel = supabase
            .channel(`scoring-${competitionId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'agent_competition_entries',
                filter: `competition_id=eq.${competitionId}`,
            }, (payload: any) => {
                const updated = payload.new;
                if (!updated) return;

                setScoringUpdates(prev => {
                    const newMap = new Map(prev);
                    newMap.set(updated.agent_id, {
                        agent_id: updated.agent_id,
                        competition_id: competitionId,
                        weighted_score: updated.weighted_score ? Number(updated.weighted_score) : null,
                        brier_score: updated.brier_score ? Number(updated.brier_score) : null,
                        prediction_count: updated.prediction_count || 0,
                        rank_trend: updated.rank_trend || 0,
                        last_scored_at: updated.last_scored_at,
                    });
                    return newMap;
                });
            })
            .subscribe();

        scoreChannelRef.current = scoreChannel;

        // Poll fallback every 5 mins (300s) to protect Supabase limits
        const interval = setInterval(() => {
            fetchPredictions();
            fetchScoring();
        }, 300_000);

        return () => {
            clearInterval(interval);
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            if (scoreChannelRef.current) supabase.removeChannel(scoreChannelRef.current);
            channelRef.current = null;
            scoreChannelRef.current = null;
            setConnected(false);
        };
    }, [competitionId, fetchPredictions, fetchScoring]);

    // Group predictions by agent
    const predictionsByAgent = new Map<string, AgentPredictionGroup>();
    for (const pred of allPredictions) {
        if (!predictionsByAgent.has(pred.agent_id)) {
            predictionsByAgent.set(pred.agent_id, {
                agent_id: pred.agent_id,
                agent_name: '', // Will be enriched by parent
                predictions: [],
                latest_probability: null,
                prediction_count: 0,
            });
        }
        const group = predictionsByAgent.get(pred.agent_id)!;
        group.predictions.push(pred);
        group.prediction_count = group.predictions.length;
        group.latest_probability = pred.probability;
    }

    return {
        predictionsByAgent,
        scoringUpdates,
        allPredictions,
        loading,
        connected,
        latestPredictionAt,
    };
}
