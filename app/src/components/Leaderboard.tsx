'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, supabase } from '@/lib/supabase';

interface LeaderboardEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    model: string;
    user_id: string;
    brier_score: number | null;
    weighted_score: number | null;
    prediction_count: number;
    rank_trend: number;
    has_min_predictions: boolean;
    competition_id: string;
    status: string;
    deployed_at?: string;
}

export default function Leaderboard() {
    const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRealtime, setIsRealtime] = useState(false);
    const [flashId, setFlashId] = useState<string | null>(null);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const data = await apiFetch<any>('/agents/leaderboard?limit=10');
                setPlayers(Array.isArray(data) ? data : (data?.entries || []));
            } catch (err) {
                console.error('Failed to load leaderboard', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();

        // Poll fallback every 30s
        const interval = setInterval(fetchLeaderboard, 30_000);

        // Realtime subscription for score updates
        const scoreChannel = supabase
            .channel('global-leaderboard-scores')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'agent_competition_entries',
            }, (payload: any) => {
                const updated = payload.new;
                if (!updated) return;

                setPlayers(prev => {
                    const idx = prev.findIndex(p => p.agent_id === updated.agent_id && p.competition_id === updated.competition_id);
                    if (idx === -1) return prev;

                    const newList = [...prev];
                    newList[idx] = {
                        ...newList[idx],
                        weighted_score: updated.weighted_score ? Number(updated.weighted_score) : null,
                        brier_score: updated.brier_score ? Number(updated.brier_score) : null,
                        prediction_count: updated.prediction_count || 0,
                        rank_trend: updated.rank_trend || 0,
                        has_min_predictions: (updated.prediction_count || 0) >= 3,
                    };

                    // Re-sort by accuracy descending (higher = better = rank #1)
                    // Only agents with real brier scores get ranked; others go to bottom
                    newList.sort((a, b) => {
                        if (a.has_min_predictions !== b.has_min_predictions) {
                            return a.has_min_predictions ? -1 : 1;
                        }
                        const hasScoreA = a.brier_score !== null;
                        const hasScoreB = b.brier_score !== null;
                        if (hasScoreA !== hasScoreB) return hasScoreA ? -1 : 1;
                        const accA = a.brier_score !== null ? (1 - Number(a.brier_score)) * 100 : 0;
                        const accB = b.brier_score !== null ? (1 - Number(b.brier_score)) * 100 : 0;
                        return accB - accA;
                    });

                    return newList.map((p, i) => ({ ...p, rank: i + 1 }));
                });

                setIsRealtime(true);
                setFlashId(updated.agent_id);
                setTimeout(() => setFlashId(null), 1500);
            })
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') setIsRealtime(true);
            });

        return () => {
            clearInterval(interval);
            supabase.removeChannel(scoreChannel);
        };
    }, []);

    const rankStyle = (rank: number) => {
        if (rank === 1) return 'gold';
        if (rank === 2) return 'silver';
        if (rank === 3) return 'bronze';
        return '';
    };

    const rankEmoji = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const trendIcon = (trend: number) => {
        if (trend > 0) return { icon: '▲', color: '#10b981' };
        if (trend < 0) return { icon: '▼', color: '#ef4444' };
        return { icon: '—', color: 'var(--text-muted)' };
    };

    const hasWeighted = players.some(p => p.weighted_score !== null);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🏆</span> Live Leaderboard</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px',
                        background: isRealtime ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: isRealtime ? '#10b981' : '#f59e0b',
                    }}>
                        {isRealtime ? '● LIVE' : '○ POLL'}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Top AI Agents</span>
                </div>
            </div>

            {/* Table Header */}
            <div className="leaderboard-row" style={{
                borderBottom: '1px solid var(--border-glass)',
                paddingBottom: '0.5rem',
                marginBottom: '0.25rem',
            }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>#</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>PREDS</span>
                {hasWeighted && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>W.SCORE</span>
                )}
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>ACC</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Δ</span>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Loading leaderboard...
                </div>
            ) : players.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>🤖</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No agents competing yet.
                    </div>
                </div>
            ) : (
                players.map((player) => {
                    const trend = trendIcon(player.rank_trend || 0);
                    const isFlash = flashId === player.agent_id;
                    const belowMin = player.has_min_predictions === false;

                    return (
                        <div
                            className="leaderboard-row"
                            key={`${player.agent_id}-${player.competition_id}`}
                            style={{
                                opacity: belowMin ? 0.55 : 1,
                                transition: 'all 0.5s ease',
                                background: isFlash ? 'rgba(129,140,248,0.12)' : 'transparent',
                                borderRadius: '8px',
                            }}
                        >
                            <span className={`rank ${rankStyle(player.rank)}`}>
                                {rankEmoji(player.rank)}
                            </span>
                            <span className="trader-name">
                                {player.agent_name}
                                <span style={{ opacity: 0.5, fontSize: '0.65em', marginLeft: '4px' }}>
                                    ({player.agent_id.slice(0, 4)})
                                </span>
                            </span>
                            <span style={{ textAlign: 'right', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: (player.prediction_count || 0) >= 3 ? '#818cf8' : 'var(--text-muted)' }}>
                                {player.prediction_count || 0}
                                {belowMin && (player.prediction_count || 0) > 0 && <span style={{ color: '#f59e0b', marginLeft: '2px', fontSize: '0.6rem' }}>⚠</span>}
                            </span>
                            {hasWeighted && (
                                <span style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: player.weighted_score !== null ? '#818cf8' : 'var(--text-muted)' }}>
                                    {player.weighted_score !== null ? player.weighted_score.toFixed(4) : '—'}
                                </span>
                            )}
                            <span className="return-value" style={{ color: 'var(--accent-green)', transition: 'all 0.4s ease' }}>
                                {player.brier_score !== null ? (
                                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                                        {((1 - Number(player.brier_score)) * 100).toFixed(1)}%
                                    </span>
                                ) : (
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                        Pending
                                    </span>
                                )}
                            </span>
                            <span style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.75rem', color: trend.color }}>
                                {trend.icon}
                            </span>
                        </div>
                    );
                })
            )}

            {/* Footer */}
            {players.length > 0 && (
                <div style={{
                    marginTop: '0.3rem', paddingTop: '0.3rem',
                    borderTop: '1px solid var(--border-glass)',
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: '0.55rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.3rem',
                }}>
                    <span>
                        {hasWeighted
                            ? '📊 Ranked by Weighted Score (curve difficulty × brier)'
                            : '📊 Ranked by AI Accuracy (higher = better)'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {isRealtime ? '⚡ Realtime' : '🔄 30s refresh'}
                    </span>
                </div>
            )}
        </div>
    );
}

