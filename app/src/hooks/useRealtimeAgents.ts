'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, apiFetch } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface Agent {
    id: string;
    user_id: string;
    name: string;
    strategy_prompt: string;
    target_outcome: string;
    direction: string;
    risk_level: number;
    status: 'pending' | 'active' | 'paused' | 'terminated' | 'exhausted' | 'error';
    accuracy_score: number;
    total_trades: number;
    total_pnl: number;
    win_rate: number;
    deploy_number: number;
    deployed_at: string | null;
    created_at: string;
    agent_type?: {
        name: string;
        slug: string;
        icon_emoji: string;
        color_hex: string;
        sector: string;
    };
}

export interface ForecasterAgent {
    id: string;
    user_id: string;
    name: string;
    system_prompt: string;
    model: string;
    status: 'active' | 'paused' | 'terminated' | 'exhausted' | 'error';
    prompts_used: number;
    max_free_prompts: number;
    updated_at: string;
    latest_reasoning?: string;
    competitions: Array<{
        competition_id: string;
        brier_score: number | null;
        status: string;
        final_rank?: number;
        title?: string;
        sector?: string;
    }>;
}

export interface AgentQuota {
    deploys_used: number;
    max_deploys: number;
    deploys_remaining: number;
}

export interface UseRealtimeAgentsResult {
    agents: Agent[];
    forecasters: ForecasterAgent[];
    quota: AgentQuota;
    loading: boolean;
    error: string | null;
    connected: boolean;
    refresh: () => void;
    pauseForecaster: (agentId: string) => Promise<void>;
    resumeForecaster: (agentId: string) => Promise<void>;
    stopForecaster: (agentId: string) => Promise<void>;
    terminateForecaster: (agentId: string) => Promise<void>;
    deleteForecaster: (agentId: string) => Promise<void>;
}

export function useRealtimeAgents(userId: string | null): UseRealtimeAgentsResult {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [forecasters, setForecasters] = useState<ForecasterAgent[]>([]);
    const [quota, setQuota] = useState<AgentQuota>({
        deploys_used: 0,
        max_deploys: 10,
        deploys_remaining: 10,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const forecasterChannelRef = useRef<RealtimeChannel | null>(null);

    const fetchAgents = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Fetch trading agents from API
            const result = await apiFetch<{ data: Agent[]; total: number }>(
                '/agents',
                { headers: { 'x-user-id': userId } },
            );
            setAgents(result?.data || []);

            // Fetch forecaster agents
            const forecasterResult = await apiFetch<{ data: ForecasterAgent[]; total: number }>(
                '/agents/forecasters',
                { headers: { 'x-user-id': userId } },
            );
            setForecasters(forecasterResult?.data || []);

            // Fetch quota
            const quotaResult = await apiFetch<AgentQuota>(
                '/agents/quota',
                { headers: { 'x-user-id': userId } },
            );
            if (quotaResult) setQuota(quotaResult);
        } catch (err: any) {
            setError(err.message || 'Failed to load agents');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // ── Agent Actions ──────────────────────────────────────────────
    const pauseForecaster = useCallback(async (agentId: string) => {
        if (!userId) return;
        try {
            await apiFetch(`/agents/forecasters/${agentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ status: 'paused' }),
            });
            // Optimistic update
            setForecasters(prev =>
                prev.map(a => a.id === agentId ? { ...a, status: 'paused' as const } : a),
            );
        } catch (err: any) {
            setError(err.message || 'Failed to pause agent');
        }
    }, [userId]);

    const resumeForecaster = useCallback(async (agentId: string) => {
        if (!userId) return;
        try {
            await apiFetch(`/agents/forecasters/${agentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ status: 'active' }),
            });
            setForecasters(prev =>
                prev.map(a => a.id === agentId ? { ...a, status: 'active' as const } : a),
            );
        } catch (err: any) {
            setError(err.message || 'Failed to resume agent');
        }
    }, [userId]);

    const terminateForecaster = useCallback(async (agentId: string) => {
        if (!userId) return;
        try {
            await apiFetch(`/agents/forecasters/${agentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ status: 'terminated' }),
            });
            setForecasters(prev =>
                prev.map(a => a.id === agentId ? { ...a, status: 'terminated' as const } : a),
            );
            // Updating quota (terminate frees up a slot)
            setQuota(prev => ({
                ...prev,
                deploys_used: Math.max(0, prev.deploys_used - 1),
                deploys_remaining: Math.min(prev.max_deploys, prev.deploys_remaining + 1),
            }));
        } catch (err: any) {
            setError(err.message || 'Failed to terminate agent');
        }
    }, [userId]);

    const deleteForecaster = useCallback(async (agentId: string) => {
        if (!userId) return;
        try {
            await apiFetch(`/agents/forecasters/${agentId}/hard`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            });
            setForecasters(prev => prev.filter(a => a.id !== agentId));
            // Deleting frees up a slot if the agent wasn't already terminated
            setQuota(prev => ({
                ...prev,
                deploys_used: Math.max(0, prev.deploys_used - 1),
                deploys_remaining: Math.min(prev.max_deploys, prev.deploys_remaining + 1),
            }));
        } catch (err: any) {
            setError(err.message || 'Failed to delete agent');
        }
    }, [userId]);

    const stopForecaster = useCallback(async (agentId: string) => {
        if (!userId) return;
        try {
            await apiFetch(`/agents/forecasters/${agentId}`, {
                method: 'DELETE',
                headers: { 'x-user-id': userId },
            });
            setForecasters(prev =>
                prev.map(a => a.id === agentId ? { ...a, status: 'terminated' as const } : a),
            );
            setQuota(prev => ({
                ...prev,
                deploys_used: Math.max(0, prev.deploys_used - 1),
                deploys_remaining: Math.min(prev.max_deploys, prev.deploys_remaining + 1),
            }));
        } catch (err: any) {
            setError(err.message || 'Failed to stop agent');
        }
    }, [userId]);

    useEffect(() => {
        fetchAgents();

        if (!userId) return;

        // Realtime subscription for ai_agents (trading agents)
        const channel = supabase
            .channel(`agents-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ai_agents',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (payload.eventType === 'INSERT') {
                        const newAgent = payload.new as unknown as Agent;
                        setAgents((prev) => [newAgent, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as unknown as Agent;
                        setAgents((prev) =>
                            prev.map((a) => (a.id === updated.id ? updated : a)),
                        );
                    } else if (payload.eventType === 'DELETE') {
                        const deleted = payload.old as unknown as Agent;
                        setAgents((prev) => prev.filter((a) => a.id !== deleted.id));
                    }
                },
            )
            .subscribe((status: string) => {
                setConnected(status === 'SUBSCRIBED');
            });

        channelRef.current = channel;

        // Realtime subscription for agents (forecaster agents)
        const forecasterChannel = supabase
            .channel(`forecasters-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'agents',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (payload.eventType === 'INSERT') {
                        const newForecaster = payload.new as unknown as ForecasterAgent;
                        setForecasters((prev) => [
                            { ...newForecaster, prompts_used: 0, max_free_prompts: 7, competitions: [] },
                            ...prev,
                        ]);
                        setQuota((prev) => ({
                            ...prev,
                            deploys_used: prev.deploys_used + 1,
                            deploys_remaining: Math.max(0, prev.deploys_remaining - 1),
                        }));
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as unknown as ForecasterAgent;
                        setForecasters((prev) =>
                            prev.map((a) =>
                                a.id === updated.id
                                    ? { ...a, ...updated }
                                    : a,
                            ),
                        );
                        if (updated.status === 'terminated') {
                            setQuota((prev) => ({
                                ...prev,
                                deploys_used: Math.max(0, prev.deploys_used - 1),
                                deploys_remaining: Math.min(prev.max_deploys, prev.deploys_remaining + 1),
                            }));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deleted = payload.old as unknown as ForecasterAgent;
                        setForecasters((prev) => prev.filter((a) => a.id !== deleted.id));
                    }
                },
            )
            .subscribe();

        forecasterChannelRef.current = forecasterChannel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
            if (forecasterChannelRef.current) {
                supabase.removeChannel(forecasterChannelRef.current);
            }
        };
    }, [userId, fetchAgents]);

    return {
        agents,
        forecasters,
        quota,
        loading,
        error,
        connected,
        refresh: fetchAgents,
        pauseForecaster,
        resumeForecaster,
        stopForecaster,
        terminateForecaster,
        deleteForecaster,
    };
}
