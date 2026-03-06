'use client';

import React from 'react';
import { getPoolData } from '@/lib/dummy-data';

export default function ValueCreationPool() {
    const pool = getPoolData();
    const fillPercent = ((pool.distributed / pool.totalPool) * 100).toFixed(0);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🏦</span> Value Creation Pool</h3>
            </div>

            <div className="pool-amount">{pool.totalPool.toLocaleString()} SOL</div>

            <div className="pool-bar">
                <div className="pool-fill" style={{ width: `${fillPercent}%` }} />
            </div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
            }}>
                <span>Distributed: {pool.distributed.toLocaleString()} SOL</span>
                <span>Remaining: {pool.remaining.toLocaleString()} SOL</span>
            </div>

            <div className="stat-row">
                <span className="stat-label">Active Contributors</span>
                <span className="stat-value indigo">{pool.contributors}</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Avg Contribution</span>
                <span className="stat-value cyan">{pool.avgContribution} SOL</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Pool Multiplier</span>
                <span className="stat-value green">{pool.multiplier}x</span>
            </div>

            <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-xs)',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                textAlign: 'center',
            }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Reward Formula
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-indigo)' }}>
                    Accuracy × Exposure × Prob Shift × 1.5x
                </div>
            </div>
        </div>
    );
}
