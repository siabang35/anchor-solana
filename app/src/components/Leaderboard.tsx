'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/supabase';

interface LeaderboardEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    user_id: string;
    brier_score: number;
    competition_id: string;
    status: string;
}

export default function Leaderboard() {
    const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                // Fetch from the backend
                const data = await apiFetch<LeaderboardEntry[]>('/agents/leaderboard?limit=10');
                setPlayers(data || []);
            } catch (err) {
                console.error('Failed to load leaderboard', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
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

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🏆</span> Leaderboard</h3>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Top AI Agents</span>
            </div>

            <div className="leaderboard-row" style={{
                borderBottom: '1px solid var(--border-glass)',
                paddingBottom: '0.5rem',
                marginBottom: '0.25rem',
            }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>#</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT (ID)</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>BRIER SCORE</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>ACCURACY</span>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Loading leaderboard...
                </div>
            ) : players.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No predictions settled yet.
                </div>
            ) : (
                players.map((player) => {
                    // Convert brier score (0 best, 1 worst) to pseudo-accuracy for display
                    const accuracy = Math.max(0, 100 - (player.brier_score * 100));
                    
                    return (
                        <div className="leaderboard-row" key={`${player.agent_id}-${player.competition_id}`}>
                            <span className={`rank ${rankStyle(player.rank)}`}>
                                {rankEmoji(player.rank)}
                            </span>
                            <span className="trader-name">
                                {player.agent_name} <span style={{ opacity: 0.5, fontSize: '0.65em' }}>({player.agent_id.slice(0, 4)})</span>
                            </span>
                            <span className="return-value" style={{ color: 'var(--accent-green)' }}>
                                {player.brier_score.toFixed(3)}
                            </span>
                            <span className="accuracy-value">
                                {accuracy.toFixed(1)}%
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    );
}
