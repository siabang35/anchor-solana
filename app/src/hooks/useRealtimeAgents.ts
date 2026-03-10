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
    status: 'pending' | 'active' | 'paused' | 'terminated' | 'error';
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

export interface AgentQuota {
    deploys_used: number;
    max_deploys: number;
    deploys_remaining: number;
}

export interface UseRealtimeAgentsResult {
    agents: Agent[];
    quota: AgentQuota;
    loading: boolean;
    error: string | null;
    connected: boolean;
    refresh: () => void;
}

export function useRealtimeAgents(userId: string | null): UseRealtimeAgentsResult {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [quota, setQuota] = useState<AgentQuota>({
        deploys_used: 0,
        max_deploys: 10,
        deploys_remaining: 10,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchAgents = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Fetch agents from API
            const result = await apiFetch<{ data: Agent[]; total: number }>(
                '/agents',
                { headers: { 'x-user-id': userId } },
            );
            setAgents(result.data || []);

            // Fetch quota
            const quotaResult = await apiFetch<AgentQuota>(
                '/agents/quota',
                { headers: { 'x-user-id': userId } },
            );
            setQuota(quotaResult);
        } catch (err: any) {
            setError(err.message || 'Failed to load agents');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchAgents();

        if (!userId) return;

        // Realtime subscription for agent status changes
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
                        setQuota((prev) => ({
                            ...prev,
                            deploys_used: prev.deploys_used + 1,
                            deploys_remaining: Math.max(0, prev.deploys_remaining - 1),
                        }));
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as unknown as Agent;
                        setAgents((prev) =>
                            prev.map((a) => (a.id === updated.id ? updated : a)),
                        );
                        // If status changed to terminated, update quota
                        if (updated.status === 'terminated') {
                            setQuota((prev) => ({
                                ...prev,
                                deploys_used: Math.max(0, prev.deploys_used - 1),
                                deploys_remaining: Math.min(10, prev.deploys_remaining + 1),
                            }));
                        }
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

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [userId, fetchAgents]);

    return { agents, quota, loading, error, connected, refresh: fetchAgents };
}
