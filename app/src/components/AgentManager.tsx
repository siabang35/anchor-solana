'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { ForecasterAgent } from '@/hooks/useRealtimeAgents';
import { apiFetch } from '@/lib/supabase';
import { useWallet } from '@solana/wallet-adapter-react';

type StatusFilter = 'all' | 'active' | 'paused' | 'terminated';

interface AgentManagerProps {
    forecasters: ForecasterAgent[];
    loading: boolean;
    onPause: (agentId: string) => Promise<void>;
    onResume: (agentId: string) => Promise<void>;
    onStop: (agentId: string) => Promise<void>;
    onDelete?: (agentId: string) => Promise<void>;
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    active:     { label: 'Running',    color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: '●' },
    paused:     { label: 'Paused',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '⏸' },
    terminated: { label: 'Stopped',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '⏹' },
    exhausted:  { label: 'Exhausted',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  icon: '⚡' },
    error:      { label: 'Error',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '⚠' },
};

const FILTER_TABS: { key: StatusFilter; label: string; icon: string }[] = [
    { key: 'all',        label: 'All',     icon: '📋' },
    { key: 'active',     label: 'Running', icon: '🟢' },
    { key: 'paused',     label: 'Paused',  icon: '🟡' },
    { key: 'terminated', label: 'Stopped', icon: '🔴' },
];

export default function AgentManager({ forecasters, loading: initLoading, onPause, onResume, onStop, onDelete }: AgentManagerProps) {
    const { publicKey } = useWallet();
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
    
    // History state
    const [historyData, setHistoryData] = useState<Record<string, any[]>>({});
    const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

    const filtered = useMemo(() => {
        if (filter === 'all') return forecasters;
        return forecasters.filter(a => a.status === filter);
    }, [forecasters, filter]);

    const counts = useMemo(() => ({
        all: forecasters.length,
        active: forecasters.filter(a => a.status === 'active').length,
        paused: forecasters.filter(a => a.status === 'paused').length,
        terminated: forecasters.filter(a => a.status === 'terminated' || a.status === 'exhausted').length,
    }), [forecasters]);

    // Fetch history when an agent card is expanded
    useEffect(() => {
        if (!expandedId || !publicKey) return;
        if (historyData[expandedId]) return; // Already fetched

        const fetchHistory = async () => {
            setLoadingHistory(expandedId);
            try {
                const history = await apiFetch<any[]>(`/agents/${expandedId}/predictions`, {
                    headers: { 'x-user-id': publicKey.toString() }
                });
                setHistoryData(prev => ({ ...prev, [expandedId]: history || [] }));
            } catch (err) {
                console.error('Failed to fetch agent history:', err);
            } finally {
                setLoadingHistory(null);
            }
        };

        fetchHistory();
    }, [expandedId, publicKey, historyData]);

    const handleAction = async (agentId: string, action: 'pause' | 'resume' | 'stop' | 'delete') => {
        setActionLoading(agentId);
        setDropdownOpenId(null);
        try {
            if (action === 'pause') await onPause(agentId);
            else if (action === 'resume') await onResume(agentId);
            else if (action === 'stop') { await onStop(agentId); }
            else if (action === 'delete' && onDelete) {
                await onDelete(agentId);
            }
        } finally {
            setActionLoading(null);
        }
    };

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    return (
        <div className="glass-card card-body animate-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="section-header" style={{ marginBottom: '0.75rem', flexShrink: 0 }}>
                <h3 className="section-title"><span className="icon">📡</span> My Agents</h3>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {counts.active} running · {counts.paused} paused
                </span>
            </div>

            {/* Filter Tabs */}
            <div style={{
                display: 'flex',
                gap: '0.3rem',
                marginBottom: '0.75rem',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-round)',
                padding: '0.2rem',
                flexShrink: 0,
            }}>
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setFilter(tab.key); setExpandedId(null); }}
                        style={{
                            flex: 1,
                            padding: '0.45rem 0.3rem',
                            borderRadius: 'var(--radius-round)',
                            background: filter === tab.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: filter === tab.key ? 'var(--accent-indigo)' : 'var(--text-muted)',
                            border: filter === tab.key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.25rem',
                        }}
                    >
                        <span style={{ fontSize: '0.55rem' }}>{tab.icon}</span>
                        {tab.label}
                        {counts[tab.key] > 0 && (
                            <span style={{
                                fontSize: '0.45rem',
                                background: filter === tab.key ? 'var(--accent-indigo)' : 'rgba(255,255,255,0.08)',
                                color: filter === tab.key ? '#fff' : 'var(--text-muted)',
                                borderRadius: '50%',
                                minWidth: '16px',
                                height: '16px',
                                padding: '0 4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                            }}>
                                {counts[tab.key]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Agent List */}
            {initLoading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <span className="spinner" style={{ marginRight: '8px' }} /> Loading agents...
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '2.5rem 1rem', color: 'var(--text-muted)',
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>🤖</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {filter === 'all' ? 'No agents deployed yet' : `No ${filter} agents`}
                    </div>
                    <div style={{ fontSize: '0.6rem', marginTop: '0.25rem' }}>
                        {filter === 'all' ? 'Deploy your first AI forecaster to compete!' : 'Try a different filter'}
                    </div>
                </div>
            ) : (
                <div className="feed-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {filtered.map(agent => {
                        const badge = STATUS_BADGE[agent.status] || STATUS_BADGE.error;
                        const isExpanded = expandedId === agent.id;
                        const isLoading = actionLoading === agent.id;
                        const history = historyData[agent.id] || [];
                        const hasHistory = history.length > 0;
                        const isHistoryLoading = loadingHistory === agent.id;
                        const mainComp = agent.competitions?.[0]; // Get the primary competition it's linked to

                        return (
                            <div
                                key={agent.id}
                                style={{
                                    borderRadius: 'var(--radius-sm)',
                                    background: isExpanded ? 'rgba(99,102,241,0.06)' : 'var(--gradient-card)',
                                    border: isExpanded ? '1px solid rgba(99,102,241,0.3)' : `1px solid ${agent.status === 'active' ? 'rgba(16,185,129,0.2)' : 'var(--border-card)'}`,
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative',
                                    overflow: 'visible',
                                    cursor: isExpanded ? 'default' : 'pointer',
                                    boxShadow: isExpanded ? '0 4px 24px rgba(0,0,0,0.2)' : 'none',
                                    zIndex: isExpanded ? 5 : 1,
                                }}
                                onClick={() => !isExpanded && setExpandedId(agent.id)}
                            >
                                {/* Active pulse indicator */}
                                {agent.status === 'active' && !isExpanded && (
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, width: '3px', height: '100%',
                                        background: 'linear-gradient(180deg, #10b981, #06b6d4)', borderRadius: '3px 0 0 3px',
                                    }} />
                                )}

                                {/* Compact Header (always visible) */}
                                <div style={{ padding: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                                            }}>🤖</div>
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    {agent.name}
                                                    {mainComp?.sector && (
                                                        <span style={{ fontSize: '0.5rem', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                                            {mainComp.sector}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {(() => {
                                                        const reasoning = agent.latest_reasoning || '';
                                                        if (reasoning.includes('[LOCAL-SIM]')) {
                                                            return <span style={{ padding: '1px 5px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)', letterSpacing: '0.02em', fontSize: '0.55rem' }}>⚙️ LOCAL-SIM</span>;
                                                        }
                                                        if (reasoning.includes('[Groq]') || reasoning.includes('[Groq-8B]')) {
                                                            return <span style={{ padding: '1px 5px', background: 'rgba(139,92,246,0.12)', color: '#a78bfa', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(139,92,246,0.4)', letterSpacing: '0.02em', fontSize: '0.55rem' }}>⚡ GROQ (Llama-3)</span>;
                                                        }
                                                        if (reasoning.includes('[OpenRouter')) {
                                                            return <span style={{ padding: '1px 5px', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(56,189,248,0.4)', letterSpacing: '0.02em', fontSize: '0.55rem' }}>🌐 OPENROUTER</span>;
                                                        }
                                                        // Ensure default fallback uses correct model metadata string
                                                        return <span style={{ padding: '1px 5px', background: 'rgba(16,185,129,0.12)', color: '#34d399', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(16,185,129,0.4)', letterSpacing: '0.02em', fontSize: '0.55rem' }}>🧠 HF (Qwen-2.5)</span>;
                                                    })()}
                                                    <span style={{ opacity: 0.5 }}>·</span> <span>ID: {agent.id.slice(0, 8)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                    fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px',
                                                    borderRadius: 'var(--radius-round)', background: badge.bg, color: badge.color,
                                                    display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.03em',
                                                }}>
                                                    <span style={{ fontSize: '0.5rem' }}>{badge.icon}</span>
                                                    {badge.label}
                                                </span>
                                                
                                                {/* Expand/Collapse Chevron */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : agent.id); setDropdownOpenId(null); }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '1.1rem',
                                                        cursor: 'pointer',
                                                        padding: '0.25rem',
                                                        borderRadius: 'var(--radius-xs)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'transform 0.2s ease',
                                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        minWidth: '28px',
                                                        minHeight: '28px',
                                                    }}
                                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                                >
                                                    ⌄
                                                </button>

                                                {/* Actions Kebab Menu */}
                                                <div style={{ position: 'relative' }}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDropdownOpenId(dropdownOpenId === agent.id ? null : agent.id); }}
                                                        style={{
                                                            background: dropdownOpenId === agent.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                                            border: 'none',
                                                            color: 'var(--text-secondary)',
                                                            fontSize: '0.9rem',
                                                            cursor: 'pointer',
                                                            padding: '0.25rem',
                                                            borderRadius: 'var(--radius-xs)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            minWidth: '28px',
                                                            minHeight: '28px',
                                                            letterSpacing: '1px',
                                                        }}
                                                        aria-label="Agent actions"
                                                    >
                                                        ⋮
                                                    </button>

                                                    {/* Dropdown Menu */}
                                                    {dropdownOpenId === agent.id && (
                                                        <div style={{
                                                            position: 'absolute', top: '100%', right: 0, marginTop: '0.4rem',
                                                            background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                                            borderRadius: '8px', padding: '0.4rem', zIndex: 100, // High z-index
                                                            display: 'flex', flexDirection: 'column', gap: '0.2rem',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                                                            minWidth: '150px'
                                                        }}>
                                                            {agent.status === 'active' && (
                                                                <button
                                                                    disabled={isLoading} onClick={(e) => { e.stopPropagation(); handleAction(agent.id, 'pause'); }}
                                                                    style={{
                                                                        padding: '0.6rem', borderRadius: '4px', background: 'transparent',
                                                                        color: 'var(--accent-amber)', border: 'none', textAlign: 'left',
                                                                        fontSize: '0.7rem', fontWeight: 600, cursor: isLoading ? 'wait' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                                    }}
                                                                >
                                                                    <span>⏸</span> Pause
                                                                </button>
                                                            )}
                                                            {(agent.status === 'paused' || agent.status === 'exhausted') && (
                                                                <button
                                                                    disabled={isLoading} onClick={(e) => { e.stopPropagation(); handleAction(agent.id, 'resume'); }}
                                                                    style={{
                                                                        padding: '0.6rem', borderRadius: '4px', background: 'transparent',
                                                                        color: 'var(--accent-green)', border: 'none', textAlign: 'left',
                                                                        fontSize: '0.7rem', fontWeight: 600, cursor: isLoading ? 'wait' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                                    }}
                                                                >
                                                                    <span>▶</span> Resume
                                                                </button>
                                                            )}
                                                            {agent.status !== 'terminated' && (
                                                                <button
                                                                    disabled={isLoading} 
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation();
                                                                        handleAction(agent.id, 'stop');
                                                                    }}
                                                                    style={{
                                                                        padding: '0.6rem', borderRadius: '4px', background: 'transparent',
                                                                        color: 'var(--accent-red)', border: 'none', textAlign: 'left',
                                                                        fontSize: '0.7rem', fontWeight: 600, cursor: isLoading ? 'wait' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                                    }}
                                                                >
                                                                    <span>⏹</span> Stop
                                                                </button>
                                                            )}
                                                            {onDelete && (
                                                                <button
                                                                    disabled={isLoading} 
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation();
                                                                        handleAction(agent.id, 'delete');
                                                                    }}
                                                                    style={{
                                                                        padding: '0.6rem', borderRadius: '4px', background: 'transparent',
                                                                        color: 'var(--accent-red)', border: 'none', textAlign: 'left',
                                                                        fontSize: '0.7rem', fontWeight: 600, cursor: isLoading ? 'wait' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                                    }}
                                                                >
                                                                    <span>🗑️</span> Delete
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {!isExpanded && (
                                                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                                                    {agent.prompts_used}/{agent.max_free_prompts} prompts
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {!isExpanded && mainComp && (
                                        <div style={{
                                            fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.6rem',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '6px', border: '1px solid var(--border-glass)'
                                        }}>
                                            <span style={{ fontSize: '0.7rem' }}>
                                                {(mainComp.final_rank && mainComp.final_rank <= 3) 
                                                    ? (mainComp.final_rank === 1 ? '🥇' : mainComp.final_rank === 2 ? '🥈' : '🥉') 
                                                    : '🏆'}
                                            </span>
                                            <span style={{ 
                                                fontSize: '0.55rem', 
                                                textTransform: 'uppercase', 
                                                fontWeight: 800, 
                                                color: 'var(--text-muted)' 
                                            }}>
                                                {mainComp.sector || 'COMPETITION'}
                                            </span>
                                            <span style={{ color: 'var(--border-glass)' }}>|</span>
                                            <span style={{ 
                                                overflow: 'hidden', 
                                                textOverflow: 'ellipsis', 
                                                whiteSpace: 'nowrap', 
                                                flex: 1,
                                                fontWeight: 600,
                                                color: 'var(--text-primary)'
                                            }}>
                                                {mainComp.title || `ID: ${mainComp.competition_id.slice(0, 8)}`}
                                            </span>
                                        </div>
                                    )}
                                </div>


                                {isExpanded && (
                                    <div className="animate-in" style={{
                                        borderTop: '1px solid rgba(99,102,241,0.15)',
                                        background: 'rgba(0,0,0,0.2)',
                                        padding: '0.75rem',
                                        animation: 'fadeUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                                        position: 'relative',
                                        zIndex: 10
                                    }}>
                                        
                                        {/* Competition Info */}
                                        {mainComp && (
                                            <div style={{
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                                                borderRadius: '8px', padding: '0.5rem', marginBottom: '0.75rem',
                                            }}>
                                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>
                                                    {(mainComp.final_rank && mainComp.final_rank <= 3) 
                                                        ? (mainComp.final_rank === 1 ? '🥇' : mainComp.final_rank === 2 ? '🥈' : '🥉') 
                                                        : '🏆'} Assigned Competition
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                                                    {mainComp.title || `Competition ID: ${mainComp.competition_id.slice(0, 8)}...`}
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', gap: '0.5rem' }}>
                                                    <span>Status: {mainComp.status === 'active' ? '🟢 Live' : mainComp.status === 'completed' ? '🏁 Ended' : mainComp.status}</span>
                                                    {mainComp.brier_score !== null && <span>Brier Score: {mainComp.brier_score.toFixed(3)}</span>}
                                                    {mainComp.final_rank && <span>Rank: #{mainComp.final_rank}</span>}
                                                </div>
                                            </div>
                                        )}



                                        {/* Performance / History */}
                                        <div style={{ marginBottom: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                                    📈 Recent Predictions
                                                </div>
                                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                                                    {agent.prompts_used} / {agent.max_free_prompts} Prompts Used
                                                </div>
                                            </div>
                                            
                                            <div style={{
                                                background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid var(--border-glass)',
                                                maxHeight: '120px', overflowY: 'auto',
                                            }}>
                                                {isHistoryLoading ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                        <span className="spinner" style={{ width: '10px', height: '10px', marginRight: '6px' }} /> Loading...
                                                    </div>
                                                ) : hasHistory ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        {history.map((pred, i) => (
                                                            <div key={i} style={{
                                                                padding: '0.4rem 0.5rem', borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                                        Home: {(pred.prediction_home_prob || 0).toFixed(1)}% · Away: {(pred.prediction_away_prob || 0).toFixed(1)}%
                                                                    </div>
                                                                    {pred.reasoning && (
                                                                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                            {pred.reasoning}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                                                                    {timeAgo(pred.timestamp)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                        No predictions yet
                                                    </div>
                                                )}
                                            </div>
                                        </div>


                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
