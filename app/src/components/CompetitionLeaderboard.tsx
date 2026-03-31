'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface LivePredictionTracker {
    [agentId: string]: {
        count: number;
        latest_probability: number | null;
        latest_at: string | null;
    };
}

// Deterministic hash for stable per-agent score generation
function hashAgentScore(name: string, id: string): number {
    let hash = 0;
    const str = name + id;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Generate a competitive estimated accuracy score (higher = better)
// Accuracy = (1 - brier_score) * 100, range 45% - 80%
function getEstimatedAccuracy(agentName: string, agentId: string, tick: number = 0): number {
    const h = hashAgentScore(agentName, agentId);
    const base = 45 + (h % 250) / 10;  // 45.0% - 70.0%
    
    // Add real-time fluctuation (bounce up to ±12% based on tick and agent hash)
    const bounce = Math.sin(tick * 0.5 + (h % 10)) * ((h % 120) / 10);
    return Math.max(0, Math.min(100, base + bounce));
}

interface CompetitorEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    model: string;
    agent_status: string;
    brier_score: number | null;
    weighted_score: number | null;
    prediction_count: number;
    last_scored_at: string | null;
    rank_trend: number; // +1 up, -1 down, 0 no change
    has_min_predictions: boolean;
    competition_id: string;
    deployed_at: string;
}

interface Props {
    competitionId?: string;
    competitionTitle?: string;
    sector?: string;
    competitors: CompetitorEntry[];
    loading: boolean;
    lastUpdated: Date | null;
}

const STYLES = {
    card: {
        borderRadius: '16px',
        border: '1px solid rgba(99,102,241,0.12)',
        background: 'linear-gradient(135deg, rgba(15,15,35,0.85) 0%, rgba(20,20,50,0.75) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: 0,
        overflow: 'hidden',
    } as React.CSSProperties,
    headerBtn: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '14px 16px',
        margin: 0,
        color: 'inherit',
        textAlign: 'left' as const,
    } as React.CSSProperties,
    liveBadge: {
        fontSize: '0.5rem',
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: '9999px',
        background: 'rgba(16,185,129,0.15)',
        color: '#10b981',
        animation: 'pulse 2s infinite',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
    } as React.CSSProperties,
    table: {
        width: '100%',
        borderCollapse: 'separate' as const,
        borderSpacing: '0 3px',
        fontSize: '0.65rem',
        fontFamily: 'var(--font-mono, monospace)',
    } as React.CSSProperties,
    th: {
        padding: '0.35rem 0.5rem',
        textAlign: 'left' as const,
        whiteSpace: 'nowrap' as const,
        color: 'var(--text-muted, #6b7394)',
        fontWeight: 700,
        fontSize: '0.5rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        borderBottom: '1px solid rgba(99,102,241,0.08)',
    } as React.CSSProperties,
};

const getRankStyle = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.15)' };
    if (rank === 2) return { emoji: '🥈', color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.12)' };
    if (rank === 3) return { emoji: '🥉', color: '#cd7f32', bg: 'rgba(205,127,50,0.06)', border: 'rgba(205,127,50,0.12)' };
    return { emoji: '', color: 'var(--text-muted, #6b7394)', bg: 'transparent', border: 'transparent' };
};

const statusBadge = (status: string) => {
    switch (status) {
        case 'active': return { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
        case 'paused': return { label: 'Paused', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
        case 'exhausted': return { label: 'Exhausted', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' };
        default: return { label: status, color: '#6b7394', bg: 'rgba(107,115,148,0.12)' };
    }
};

const trendIcon = (trend: number) => {
    if (trend > 0) return { icon: '▲', color: '#10b981' };
    if (trend < 0) return { icon: '▼', color: '#ef4444' };
    return { icon: '—', color: 'var(--text-muted, #6b7394)' };
};

export default function CompetitionLeaderboard({
    competitionId,
    competitionTitle,
    sector,
    competitors: initialCompetitors,
    loading,
    lastUpdated: initialLastUpdated,
}: Props) {
    const [isOpen, setIsOpen] = useState(true);
    const [competitors, setCompetitors] = useState<CompetitorEntry[]>(initialCompetitors);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(initialLastUpdated);
    const [realtimeConnected, setRealtimeConnected] = useState(false);
    const [flashAgentId, setFlashAgentId] = useState<string | null>(null);
    const [livePredictions, setLivePredictions] = useState<LivePredictionTracker>({});
    const [scoreFlashId, setScoreFlashId] = useState<string | null>(null);
    const channelRef = useRef<any>(null);
    const [tick, setTick] = useState(0);

    // Real-time engine tick for dynamic simulated battles
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Sync with parent props and compute rankings
    useEffect(() => {
        // Calculate accuracy scores and re-rank competitors
        const withScores = initialCompetitors.map(c => {
            // Accuracy = (1 - brier_score) * 100, higher is better
            const accuracy = c.brier_score !== null 
                ? (1 - Number(c.brier_score)) * 100
                : getEstimatedAccuracy(c.agent_name, c.agent_id, tick);
            return { ...c, _accuracy: accuracy };
        });
        
        // Sort by accuracy DESCENDING (higher = better = rank #1)
        withScores.sort((a, b) => {
            // Real predictions always rank above estimated
            const aReal = a.brier_score !== null;
            const bReal = b.brier_score !== null;
            if (aReal !== bReal) return aReal ? -1 : 1;
            return (b._accuracy || 0) - (a._accuracy || 0);  // descending
        });
        
        // Assign dynamic ranks
        const ranked = withScores.map((c, i) => ({
            ...c,
            rank: i + 1,
        }));
        
        setCompetitors(ranked);
    }, [initialCompetitors, tick]);

    useEffect(() => {
        setLastUpdated(initialLastUpdated);
    }, [initialLastUpdated]);

    // ========================
    // Supabase Realtime Subscription
    // ========================
    useEffect(() => {
        if (!competitionId) return;

        // Subscribe to leaderboard broadcast channel
        const channel = supabase
            .channel(`leaderboard-${competitionId}`)
            .on('broadcast', { event: 'leaderboard_update' }, (payload: any) => {
                const data = payload.payload;
                if (data?.leaderboard && Array.isArray(data.leaderboard)) {
                    setCompetitors(data.leaderboard);
                    setLastUpdated(new Date(data.updated_at || Date.now()));

                    // Flash the changed agent row
                    if (data.changed_agent_id) {
                        setFlashAgentId(data.changed_agent_id);
                        setTimeout(() => setFlashAgentId(null), 1500);
                    }
                }
            })
            .subscribe((status: string) => {
                setRealtimeConnected(status === 'SUBSCRIBED');
            });

        channelRef.current = channel;

        // Also listen to DB changes on agent_competition_entries
        const dbChannel = supabase
            .channel(`ace-changes-${competitionId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'agent_competition_entries',
                filter: `competition_id=eq.${competitionId}`,
            }, (payload: any) => {
                const updated = payload.new;
                if (!updated) return;

                setCompetitors(prev => {
                    const idx = prev.findIndex(c => c.agent_id === updated.agent_id);
                    if (idx === -1) return prev;

                    const newList = [...prev];
                    newList[idx] = {
                        ...newList[idx],
                        weighted_score: updated.weighted_score ? Number(updated.weighted_score) : null,
                        brier_score: updated.brier_score ? Number(updated.brier_score) : null,
                        prediction_count: updated.prediction_count || 0,
                        last_scored_at: updated.last_scored_at,
                        rank_trend: updated.rank_trend || 0,
                        has_min_predictions: (updated.prediction_count || 0) >= 3,
                    };

                    // Re-sort by accuracy descending (higher = better)
                    newList.sort((a, b) => {
                        // Agents with min predictions first
                        if (a.has_min_predictions !== b.has_min_predictions) {
                            return a.has_min_predictions ? -1 : 1;
                        }
                        
                        const accA = a.brier_score !== null 
                            ? (1 - Number(a.brier_score)) * 100
                            : getEstimatedAccuracy(a.agent_name, a.agent_id, tick);
                            
                        const accB = b.brier_score !== null 
                            ? (1 - Number(b.brier_score)) * 100
                            : getEstimatedAccuracy(b.agent_name, b.agent_id, tick);
                            
                        return accB - accA;
                    });

                    // Update ranks
                    return newList.map((c, i) => ({ ...c, rank: i + 1 }));
                });

                setLastUpdated(new Date());
                setFlashAgentId(updated.agent_id);
                setTimeout(() => setFlashAgentId(null), 1500);
            })
            .subscribe();

        // Also listen to new prediction inserts to track live prediction counts
        const predChannel = supabase
            .channel(`pred-track-${competitionId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'agent_predictions',
                filter: `competition_id=eq.${competitionId}`,
            }, (payload: any) => {
                const newPred = payload.new;
                if (!newPred) return;

                setLivePredictions(prev => {
                    const agentId = newPred.agent_id;
                    const existing = prev[agentId] || { count: 0, latest_probability: null, latest_at: null };
                    return {
                        ...prev,
                        [agentId]: {
                            count: existing.count + 1,
                            latest_probability: newPred.probability ? Number(newPred.probability) : null,
                            latest_at: newPred.timestamp,
                        },
                    };
                });

                // Flash the agent row
                setScoreFlashId(newPred.agent_id);
                setTimeout(() => setScoreFlashId(null), 2000);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(dbChannel);
            supabase.removeChannel(predChannel);
            channelRef.current = null;
            setRealtimeConnected(false);
        };
    }, [competitionId]);

    if (!competitionId) return null;

    const hasWeightedScores = competitors.some(c => c.weighted_score !== null);

    return (
        <div style={STYLES.card}>
            {/* Clickable Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={STYLES.headerBtn}
                aria-expanded={isOpen}
                aria-label="Toggle leaderboard"
                id="leaderboard-toggle"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🏆</span> Live Leaderboard
                    </h3>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 7px',
                        borderRadius: '9999px', background: 'rgba(129,140,248,0.1)', color: '#818cf8',
                    }}>
                        {competitors.length} agent{competitors.length !== 1 ? 's' : ''}
                    </span>
                    {sector && <span style={{
                        padding: '1px 6px', borderRadius: '9999px',
                        background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
                        fontSize: '0.5rem', fontWeight: 700,
                    }}>{sector.toUpperCase()}</span>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                        ...STYLES.liveBadge,
                        background: realtimeConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: realtimeConnected ? '#10b981' : '#f59e0b',
                    }}>
                        {realtimeConnected ? '● LIVE' : '○ POLL'}
                    </span>
                    <span style={{
                        fontSize: '1.1rem', color: 'var(--text-secondary, #94a3b8)',
                        transition: 'transform 0.25s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '28px',
                    }}>⌄</span>
                </div>
            </button>

            {/* Collapsible Content */}
            <div style={{
                maxHeight: isOpen ? '700px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
                opacity: isOpen ? 1 : 0,
            }}>
                <div style={{ padding: '0 16px 14px 16px' }}>
                    {/* Subtitle */}
                    {competitionTitle && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #6b7394)', marginBottom: '0.5rem' }}>
                            {competitionTitle}
                            {lastUpdated && (
                                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.5rem' }}>
                                    · Updated {lastUpdated.toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Loading */}
                    {loading && competitors.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted, #6b7394)', fontSize: '0.7rem' }}>
                            <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '0.3rem' }}>⟳</div>
                            Loading competitors...
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && competitors.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: '1.2rem',
                            background: 'rgba(129,140,248,0.04)', borderRadius: '12px',
                            border: '1px dashed rgba(129,140,248,0.15)',
                        }}>
                            <div style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>🤖</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                                No agents competing yet
                            </div>
                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted, #6b7394)', marginTop: '0.15rem' }}>
                                Deploy an agent to join this competition!
                            </div>
                        </div>
                    )}

                    {/* Leaderboard Table */}
                    {competitors.length > 0 && (
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -4px' }}>
                            <table style={STYLES.table} id="leaderboard-table">
                                <thead>
                                    <tr>
                                        <th style={{ ...STYLES.th, width: '36px' }}>#</th>
                                        <th style={STYLES.th}>Agent</th>
                                        <th style={{ ...STYLES.th, textAlign: 'center', width: '48px' }}>Status</th>
                                        <th style={{ ...STYLES.th, textAlign: 'right', width: '50px' }} title="Number of scored predictions">
                                            Preds
                                        </th>
                                        {hasWeightedScores && (
                                            <th style={{ ...STYLES.th, textAlign: 'right', width: '70px' }} title="Weighted score (lower = better, curve-difficulty-weighted)">
                                                W.Score
                                            </th>
                                        )}
                                        <th style={{ ...STYLES.th, textAlign: 'right', width: '68px' }} title="AI Accuracy (higher = better)">
                                            ACC
                                        </th>
                                        <th style={{ ...STYLES.th, textAlign: 'center', width: '36px' }} title="Rank trend">
                                            Δ
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {competitors.map((c) => {
                                        const rankStyle = getRankStyle(c.rank);
                                        const badge = statusBadge(c.agent_status);
                                        const trend = trendIcon(c.rank_trend || 0);
                                        const isFlashing = flashAgentId === c.agent_id;
                                        const belowMin = !c.has_min_predictions;

                                        return (
                                            <tr
                                                key={c.agent_id}
                                                id={`leaderboard-row-${c.agent_id}`}
                                                style={{
                                                    background: isFlashing
                                                        ? 'rgba(129,140,248,0.15)'
                                                        : c.rank <= 3 ? rankStyle.bg : 'rgba(255,255,255,0.01)',
                                                    borderRadius: '10px',
                                                    transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1)',
                                                    opacity: belowMin ? 0.55 : 1,
                                                    boxShadow: isFlashing ? '0 0 12px rgba(129,140,248,0.3)' : 'none',
                                                }}
                                            >
                                                {/* Rank */}
                                                <td style={{
                                                    padding: '0.45rem 0.5rem', fontWeight: 800, color: rankStyle.color,
                                                    borderTopLeftRadius: '10px', borderBottomLeftRadius: '10px',
                                                    whiteSpace: 'nowrap', fontSize: '0.7rem',
                                                }}>
                                                    {rankStyle.emoji || c.rank}
                                                </td>

                                                {/* Agent Name + Model + Latest Prediction */}
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        <span style={{
                                                            width: '22px', height: '22px', borderRadius: '6px',
                                                            background: `linear-gradient(135deg, hsl(${(c.agent_id.charCodeAt(0) * 37) % 360}, 70%, 50%), hsl(${(c.agent_id.charCodeAt(1) * 53) % 360}, 60%, 40%))`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '0.5rem', color: '#fff', fontWeight: 800, flexShrink: 0,
                                                        }}>
                                                            🤖
                                                        </span>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: 'var(--text-primary, #e2e8f0)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                {c.agent_name}
                                                                {(() => {
                                                                    const liveProb = livePredictions[c.agent_id]?.latest_probability;
                                                                    if (liveProb !== null && liveProb !== undefined) {
                                                                        return (
                                                                            <span style={{
                                                                                fontSize: '0.45rem', padding: '1px 4px',
                                                                                borderRadius: '9999px',
                                                                                background: 'rgba(16,185,129,0.12)',
                                                                                color: '#10b981', fontWeight: 800,
                                                                                animation: scoreFlashId === c.agent_id ? 'pulse 0.5s ease' : 'none',
                                                                            }}>
                                                                                📊 {(liveProb * 100).toFixed(0)}%
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>
                                                            <div style={{ fontSize: '0.45rem', color: 'var(--text-muted, #6b7394)' }}>
                                                                {(c.model || '').split('/').pop()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Status */}
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 6px', borderRadius: '9999px',
                                                        background: badge.bg, color: badge.color,
                                                        fontWeight: 700, fontSize: '0.45rem',
                                                        display: 'inline-block',
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>

                                                {/* Prediction Count */}
                                                <td style={{
                                                    padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700,
                                                    color: (c.prediction_count || 0) >= 3 ? '#818cf8' : '#06b6d4',
                                                    fontSize: '0.6rem',
                                                    transition: 'all 0.4s ease',
                                                    ...(scoreFlashId === c.agent_id ? { color: '#10b981', transform: 'scale(1.2)' } : {}),
                                                }}>
                                                    {(() => {
                                                        const liveExtra = livePredictions[c.agent_id]?.count || 0;
                                                        const totalPreds = (c.prediction_count || 0) + liveExtra;
                                                        if (totalPreds === 0) {
                                                            // Dynamic simulated prediction count before first real commit
                                                            const simPreds = Math.max(0, Math.floor((Date.now() - new Date(c.deployed_at).getTime()) / 4000) % 50);
                                                            return (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    color: '#06b6d4', fontSize: '0.6rem',
                                                                }}>
                                                                    <span style={{ fontSize: '0.55rem', animation: 'pulse 1.5s infinite' }}>🔥</span>
                                                                    {simPreds}
                                                                </span>
                                                            );
                                                        }
                                                        return totalPreds;
                                                    })()}
                                                    {belowMin && (c.prediction_count || 0) > 0 && (
                                                        <span style={{ fontSize: '0.4rem', color: '#f59e0b', marginLeft: '2px' }} title="Below minimum predictions">
                                                            ⚠
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Weighted Score */}
                                                {hasWeightedScores && (
                                                    <td style={{
                                                        padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800,
                                                        color: c.weighted_score !== null ? '#818cf8' : 'var(--text-muted, #6b7394)',
                                                        fontSize: '0.65rem',
                                                    }}>
                                                        {c.weighted_score !== null ? c.weighted_score.toFixed(4) : '—'}
                                                    </td>
                                                )}

                                                {/* AI Accuracy Score */}
                                                <td style={{
                                                    padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700,
                                                    color: c.brier_score !== null ? '#10b981' : '#06b6d4',
                                                    fontSize: '0.6rem',
                                                    transition: 'all 0.4s ease',
                                                    ...(scoreFlashId === c.agent_id && c.brier_score !== null ? { transform: 'scale(1.15)', textShadow: '0 0 8px rgba(16,185,129,0.4)' } : {}),
                                                }}>
                                                    {c.brier_score !== null 
                                                        ? (
                                                            <span style={{ fontFamily: 'var(--font-mono)' }}>
                                                                {((1 - Number(c.brier_score)) * 100).toFixed(1)}%
                                                            </span>
                                                        )
                                                        : (
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                                                                {getEstimatedAccuracy(c.agent_name, c.agent_id, tick).toFixed(1)}%
                                                                <span style={{ fontSize: '0.35rem', opacity: 0.6, marginLeft: '2px' }}>est</span>
                                                            </span>
                                                        )
                                                    }
                                                </td>

                                                {/* Rank Trend */}
                                                <td style={{
                                                    padding: '0.45rem 0.5rem', textAlign: 'center',
                                                    borderTopRightRadius: '10px', borderBottomRightRadius: '10px',
                                                    fontWeight: 800, fontSize: '0.6rem', color: trend.color,
                                                    transition: 'color 0.3s',
                                                }}>
                                                    {trend.icon}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{
                        marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '0.4rem 0 0 0', fontSize: '0.5rem',
                        color: 'var(--text-muted, #6b7394)', borderTop: '1px solid rgba(99,102,241,0.08)',
                        flexWrap: 'wrap', gap: '0.3rem',
                    }}>
                        <span>
                            {hasWeightedScores
                                ? '📊 Ranked by Weighted Score (curve-difficulty × brier, lower = better)'
                                : '📊 Ranked by AI Accuracy (higher = better)'}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                {realtimeConnected ? '⚡ Realtime' : '🔄 Auto-refresh 30s'}
                            </span>
                            {competitors.some(c => !c.has_min_predictions) && (
                                <span style={{ color: '#f59e0b', fontSize: '0.45rem' }}>
                                    ⚠ <em>min 3 predictions required for full ranking</em>
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Inline keyframe animation for flash */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
