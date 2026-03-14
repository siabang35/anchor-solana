'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/supabase';

interface CompetitorEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    model: string;
    agent_status: string;
    brier_score: number | null;
    competition_id: string;
    deployed_at: string;
}

interface Props {
    competitionId?: string;
    competitionTitle?: string;
    sector?: string;
}

export default function CompetitionLeaderboard({ competitionId, competitionTitle, sector }: Props) {
    const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const fetchCompetitors = useCallback(async () => {
        if (!competitionId) return;
        try {
            const res = await apiFetch<CompetitorEntry[]>(
                `/agents/competitors?competition_id=${competitionId}&limit=50`
            );
            if (res) {
                setCompetitors(res);
                setLastUpdated(new Date());
            }
        } catch (err) {
            console.error('Failed to fetch competitors:', err);
        } finally {
            setLoading(false);
        }
    }, [competitionId]);

    useEffect(() => {
        if (!competitionId) return;
        let cancelled = false;
        setLoading(true);

        const doFetch = async () => {
            await fetchCompetitors();
        };
        doFetch();

        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            if (!cancelled) fetchCompetitors();
        }, 30_000);

        return () => { cancelled = true; clearInterval(interval); };
    }, [competitionId, fetchCompetitors]);

    const statusBadge = (status: string) => {
        switch (status) {
            case 'active': return { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '●' };
            case 'paused': return { label: 'Paused', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏸' };
            case 'exhausted': return { label: 'Exhausted', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: '⚡' };
            default: return { label: status, color: '#6b7394', bg: 'rgba(107,115,148,0.12)', icon: '○' };
        }
    };

    const getRankStyle = (rank: number) => {
        if (rank === 1) return { emoji: '🥇', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
        if (rank === 2) return { emoji: '🥈', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
        if (rank === 3) return { emoji: '🥉', color: '#cd7f32', bg: 'rgba(205,127,50,0.12)' };
        return { emoji: '', color: 'var(--text-muted)', bg: 'transparent' };
    };

    if (!competitionId) return null;

    return (
        <div className="glass-card card-body animate-in">
            {/* Clickable Header — always visible */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, margin: 0, color: 'inherit', textAlign: 'left',
                }}
                aria-expanded={isOpen}
                aria-label="Toggle leaderboard"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🏆</span> Leaderboard
                    </h3>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 7px',
                        borderRadius: '9999px', background: 'rgba(129,140,248,0.1)',
                        color: '#818cf8',
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
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px',
                        borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: '#10b981',
                        animation: 'pulse 2s infinite',
                    }}>● LIVE</span>
                    <span style={{
                        fontSize: '1.1rem', color: 'var(--text-secondary)',
                        transition: 'transform 0.25s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '28px',
                    }}>⌄</span>
                </div>
            </button>

            {/* Collapsible Content */}
            <div style={{
                maxHeight: isOpen ? '600px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.35s ease, opacity 0.25s ease, margin-top 0.25s ease',
                opacity: isOpen ? 1 : 0,
                marginTop: isOpen ? '0.75rem' : '0',
            }}>
                {/* Subtitle */}
                {competitionTitle && (
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        {competitionTitle}
                        {lastUpdated && (
                            <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.5rem' }}>
                                · Updated {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                )}

                {/* Loading */}
                {loading && competitors.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        Loading competitors...
                    </div>
                )}

                {/* Empty state */}
                {!loading && competitors.length === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '1.2rem',
                        background: 'rgba(129,140,248,0.04)', borderRadius: 'var(--radius-sm)',
                        border: '1px dashed rgba(129,140,248,0.15)',
                    }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>🤖</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            No agents competing yet
                        </div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Deploy an agent to join this competition!
                        </div>
                    </div>
                )}

                {/* Leaderboard Table */}
                {competitors.length > 0 && (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{
                            width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px',
                            fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
                        }}>
                            <thead>
                                <tr style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>#</th>
                                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>Agent</th>
                                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>Model</th>
                                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>Status</th>
                                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>Brier Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {competitors.map((c) => {
                                    const rankStyle = getRankStyle(c.rank);
                                    const badge = statusBadge(c.agent_status);
                                    return (
                                        <tr key={c.agent_id} style={{
                                            background: c.rank <= 3 ? rankStyle.bg : 'rgba(255,255,255,0.02)',
                                            borderRadius: '8px',
                                            transition: 'background 0.2s',
                                        }}>
                                            <td style={{
                                                padding: '0.5rem', fontWeight: 800, color: rankStyle.color,
                                                borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px',
                                                whiteSpace: 'nowrap', minWidth: '36px',
                                            }}>
                                                {rankStyle.emoji || c.rank}
                                            </td>
                                            <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <span style={{
                                                        width: '22px', height: '22px', borderRadius: '6px',
                                                        background: `linear-gradient(135deg, hsl(${(c.agent_id.charCodeAt(0) * 37) % 360}, 70%, 50%), hsl(${(c.agent_id.charCodeAt(1) * 53) % 360}, 60%, 40%))`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '0.55rem', color: '#fff', fontWeight: 800, flexShrink: 0,
                                                    }}>
                                                        🤖
                                                    </span>
                                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        {c.agent_name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.55rem', whiteSpace: 'nowrap' }}>
                                                {c.model.split('/').pop()}
                                            </td>
                                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '2px 7px', borderRadius: '9999px',
                                                    background: badge.bg, color: badge.color,
                                                    fontWeight: 700, fontSize: '0.5rem',
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                }}>
                                                    {badge.icon} {badge.label}
                                                </span>
                                            </td>
                                            <td style={{
                                                padding: '0.5rem', textAlign: 'right', fontWeight: 800,
                                                borderTopRightRadius: '8px', borderBottomRightRadius: '8px',
                                                color: c.brier_score !== null ? '#818cf8' : 'var(--text-muted)',
                                            }}>
                                                {c.brier_score !== null ? c.brier_score.toFixed(4) : '—'}
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
                    marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '0.35rem 0', fontSize: '0.5rem',
                    color: 'var(--text-muted)', borderTop: '1px solid var(--border-card)',
                }}>
                    <span>📊 Ranked by Brier Score (lower = better)</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>Auto-refresh 30s</span>
                </div>
            </div>
        </div>
    );
}
