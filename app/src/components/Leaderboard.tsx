'use client';

import React from 'react';
import { getLeaderboardData } from '@/lib/dummy-data';

export default function Leaderboard() {
    const players = getLeaderboardData();

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
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Top Traders</span>
            </div>

            <div className="leaderboard-row" style={{
                borderBottom: '1px solid var(--border-glass)',
                paddingBottom: '0.5rem',
                marginBottom: '0.25rem',
            }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>#</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRADER</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>RETURN</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>ACC</span>
            </div>

            {players.map((player) => (
                <div className="leaderboard-row" key={player.rank}>
                    <span className={`rank ${rankStyle(player.rank)}`}>
                        {rankEmoji(player.rank)}
                    </span>
                    <span className="trader-name">
                        {player.address.slice(0, 4)}...{player.address.slice(-4)}
                    </span>
                    <span className="return-value" style={{ color: 'var(--accent-green)' }}>
                        +{player.totalReturn.toFixed(1)}
                    </span>
                    <span className="accuracy-value">
                        {player.accuracy}%
                    </span>
                </div>
            ))}
        </div>
    );
}
