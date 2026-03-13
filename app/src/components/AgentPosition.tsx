'use client';

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { apiFetch } from '@/lib/supabase';

// Map to what the backend will eventually provide
interface AgentPositionData {
    outcome: string;
    direction: string;
    entryProb: number;
    currentProb: number;
    unrealizedPnl: number;
}

export default function AgentPosition() {
    const { publicKey } = useWallet();
    const [positions, setPositions] = useState<AgentPositionData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPortfolio = async () => {
            if (!publicKey) {
                setPositions([]);
                setLoading(false);
                return;
            }

            try {
                // Fetch from the backend
                const data = await apiFetch<any>('/dashboard/portfolio', {
                    headers: { 'x-user-id': publicKey.toString() }
                });
                
                // Set positions if available
                setPositions(data?.positions || []);
            } catch (err) {
                console.error('Failed to load portfolio positions', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPortfolio();
    }, [publicKey]);

    const totalPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

    if (!publicKey) {
        return (
            <div className="glass-card card-body animate-in" style={{ textAlign: 'center', padding: '2rem' }}>
                <span className="icon" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🤖</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Connect wallet to view open positions</span>
            </div>
        );
    }

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🤖</span> AI Agent Positions</h3>
                {!loading && positions.length > 0 && (
                    <span style={{
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}>
                        P&L: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(3)} SOL
                    </span>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Loading positions...
                </div>
            ) : positions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No active positions.
                </div>
            ) : (
                <>
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
                            <span className={`pos-dir ${pos.direction?.toLowerCase() || ''}`}>{pos.direction}</span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {pos.entryProb?.toFixed(1) || 0}%
                            </span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                {pos.currentProb?.toFixed(1) || 0}%
                            </span>
                            <span style={{
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: (pos.unrealizedPnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}>
                                {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}{(pos.unrealizedPnl || 0).toFixed(3)}
                            </span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
