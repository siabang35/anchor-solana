'use client';

import React from 'react';
import { getPerformanceData } from '@/lib/dummy-data';

export default function Performance() {
    const perf = getPerformanceData();

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">📈</span> Your Performance</h3>
            </div>

            <div style={{
                textAlign: 'center',
                marginBottom: '1rem',
                padding: '1rem',
                borderRadius: 'var(--radius-xs)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
            }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total P&L
                </div>
                <div style={{
                    fontSize: '1.8rem',
                    fontWeight: 800,
                    color: perf.totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                    {perf.totalPnl >= 0 ? '+' : ''}{perf.totalPnl.toFixed(2)} SOL
                </div>
            </div>

            <div className="stat-row">
                <span className="stat-label">Win Rate</span>
                <span className="stat-value green">{perf.winRate}%</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Avg Return / Trade</span>
                <span className="stat-value cyan">{perf.avgReturn}%</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Total Trades</span>
                <span className="stat-value">{perf.totalTrades}</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Active Positions</span>
                <span className="stat-value indigo">{perf.activePositions}</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Accuracy Score</span>
                <span className="stat-value green">{perf.accuracyScore}%</span>
            </div>
            <div className="stat-row">
                <span className="stat-label">Best Trade</span>
                <span className="stat-value amber">+{perf.bestTrade} SOL</span>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    marginBottom: 4,
                }}>
                    <span className="stat-label">Exposure Level</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>{perf.exposureLevel}%</span>
                </div>
                <div className="sentiment-bar">
                    <div
                        className="sentiment-fill bullish"
                        style={{ width: `${perf.exposureLevel}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
