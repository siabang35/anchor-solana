'use client';

import React from 'react';
import { getDummyAgentPositions } from '@/lib/dummy-data';

export default function AgentPosition() {
    const positions = getDummyAgentPositions();
    const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🤖</span> AI Agent Positions</h3>
                <span style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                    P&L: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(3)} SOL
                </span>
            </div>

            {/* Header row */}
            <div className="position-row" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span>OUTCOME</span>
                <span>DIR</span>
                <span style={{ textAlign: 'right' }}>ENTRY</span>
                <span style={{ textAlign: 'right' }}>CURRENT</span>
                <span style={{ textAlign: 'right' }}>P&L</span>
            </div>

            {positions.map((pos, i) => (
                <div className="position-row" key={i}>
                    <span style={{ fontWeight: 600 }}>{pos.outcome}</span>
                    <span className={`pos-dir ${pos.direction.toLowerCase()}`}>{pos.direction}</span>
                    <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {pos.entryProb.toFixed(1)}%
                    </span>
                    <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {pos.currentProb.toFixed(1)}%
                    </span>
                    <span style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: pos.unrealizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(3)}
                    </span>
                </div>
            ))}
        </div>
    );
}
