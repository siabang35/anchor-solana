'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/supabase';

export default function ValueCreationPool({ sector = 'all' }: { sector?: string }) {
    const [stats, setStats] = useState({ total_volume: 0, total_distributed: 0, contributors: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchStats = async () => {
            setLoading(true);
            try {
                // Determine which sector to fetch (if 'all' or specific tab like 'top', just use 'all' for total platform stats)
                const targetSector = ['all', 'top', 'foryou', 'latest', 'signals'].includes(sector) ? 'all' : sector;
                const data = await apiFetch<any>(`/competitions/sectors/${targetSector}/stats`);
                if (isMounted && data) {
                    setStats(data);
                }
            } catch (err) {
                console.error("Failed to fetch sector stats:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchStats();
        return () => { isMounted = false; };
    }, [sector]);

    const pool = {
        totalPool: stats.total_volume || 0,
        contributors: stats.contributors || 0,
        distributed: stats.total_distributed || 0,
        remaining: (stats.total_volume || 0) - (stats.total_distributed || 0),
        multiplier: 1.5,
    };

    const avgContribution = pool.contributors > 0 ? (pool.totalPool / pool.contributors).toFixed(2) : '0';
    const fillPercent = pool.totalPool > 0 ? ((pool.distributed / pool.totalPool) * 100).toFixed(0) : '0';

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title">
                    <span className="icon">🏦</span> {sector && sector !== 'all' && sector !== 'top' ? `${sector.charAt(0).toUpperCase() + sector.slice(1)} Value Pool` : 'Value Creation Pool'}
                </h3>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Loading pool data...
                </div>
            ) : (
                <>
                    <div className="pool-amount" style={{ fontSize: '1.6rem', margin: '0.5rem 0' }}>{pool.totalPool.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL</div>

                    <div className="pool-bar" style={{ margin: '0.5rem 0' }}>
                        <div className="pool-fill" style={{ width: `${fillPercent}%` }} />
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.55rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.6rem',
                    }}>
                        <span>Distributed: {pool.distributed.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL</span>
                        <span>Remaining: {pool.remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL</span>
                    </div>

                    <div className="stat-row" style={{ padding: '0.4rem 0' }}>
                        <span className="stat-label">Active Contributors</span>
                        <span className="stat-value indigo">{pool.contributors.toLocaleString()}</span>
                    </div>
                    <div className="stat-row" style={{ padding: '0.4rem 0' }}>
                        <span className="stat-label">Avg Contribution</span>
                        <span className="stat-value cyan">{avgContribution} SOL</span>
                    </div>
                    <div className="stat-row" style={{ padding: '0.4rem 0', borderBottom: 'none' }}>
                        <span className="stat-label">Pool Multiplier</span>
                        <span className="stat-value green">{pool.multiplier}x</span>
                    </div>

                    <div style={{
                        marginTop: 'auto',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Reward Formula
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-indigo)' }}>
                            Accuracy × Exposure × Prob Shift × {pool.multiplier}x
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
