'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { apiFetch } from '@/lib/supabase';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });

interface Activity {
    id: string;
    type: 'stake' | 'deploy' | 'win';
    title: string;
    description: string;
    timestamp: number;
    txSignature: string | null;
    status: string;
}

function ActivityPageContent() {
    const { connected, publicKey } = useWallet();
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
    };

    useEffect(() => {
        const saved = (localStorage.getItem('exoduze-theme') as 'dark' | 'light') || 'dark';
        setTheme(saved);
        document.documentElement.setAttribute('data-theme', saved);
    }, []);

    useEffect(() => {
        localStorage.setItem('exoduze-theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!connected || !publicKey) {
            setActivities([]);
            return;
        }

        const fetchActivities = async () => {
            setLoading(true);
            try {
                const data = await apiFetch<{ activities: Activity[] }>('/dashboard/activity', {
                    headers: { 'x-user-id': publicKey.toString() }
                });
                setActivities(data.activities || []);
            } catch (err) {
                console.error('Failed to fetch activity history:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchActivities();
    }, [connected, publicKey]);

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'win': return '#22c55e'; // green
            case 'stake': return '#3b82f6'; // blue
            case 'deploy': return '#a855f7'; // purple
            default: return '#7c8db0';
        }
    };

    const getTypeEmoji = (type: string) => {
        switch (type) {
            case 'win': return '🏆';
            case 'stake': return '🪙';
            case 'deploy': return '🚀';
            default: return '⚡';
        }
    };

    return (
        <>
            <Header theme={theme} onToggleTheme={toggleTheme} />
            <main className="main-container" style={{ paddingBottom: '100px' }}>
                <style>{`
                    .activity-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 1.25rem;
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        border-radius: 12px;
                        margin-bottom: 0.75rem;
                        transition: all 0.2s ease;
                    }
                    .activity-item:hover {
                        background: rgba(255, 255, 255, 0.04);
                        border-color: rgba(255, 255, 255, 0.08);
                        transform: translateY(-2px);
                    }
                    .activity-icon-badge {
                        width: 48px;
                        height: 48px;
                        border-radius: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.25rem;
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                    }
                    .tx-link {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.35rem;
                        color: #22d3ee;
                        text-decoration: none;
                        font-size: 0.8rem;
                        background: rgba(34, 211, 238, 0.05);
                        border: 1px solid rgba(34, 211, 238, 0.1);
                        padding: 0.35rem 0.75rem;
                        border-radius: 6px;
                        transition: all 0.2s;
                        font-weight: 500;
                    }
                    .tx-link:hover {
                        background: rgba(34, 211, 238, 0.12);
                        border-color: rgba(34, 211, 238, 0.2);
                        transform: translateY(-1px);
                    }
                    .cw-card {
                        text-align: center;
                        padding: 4rem 2rem;
                        border-radius: 16px;
                        background: rgba(255, 255, 255, 0.01);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                    }
                    .badge-status {
                        font-size: 0.7rem;
                        text-transform: uppercase;
                        padding: 0.2rem 0.5rem;
                        border-radius: 100px;
                        font-weight: 600;
                        letter-spacing: 0.04em;
                    }
                `}</style>

                {/* Page Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 0 1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            Activity Ledger
                        </h1>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.3rem 0 0' }}>
                            Your on-chain deployments, active stakes, and claimed prize returns.
                        </p>
                    </div>
                </div>

                {!connected ? (
                    <div className="cw-card animate-in">
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: 'rgba(168, 85, 247, 0.1)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem',
                            boxShadow: '0 0 30px rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.2)'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="12" y1="10" x2="12" y2="10"/>
                            </svg>
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: '600' }}>Wallet Connection Required</h3>
                        <p style={{ margin: '0 0 2rem', color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6' }}>
                            Connect your Solana wallet to load your staking transactions and agent activities history.
                        </p>
                        <WalletMultiButton />
                    </div>
                ) : loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
                        <div className="circular-spinner" />
                        <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Syncing history...</div>
                    </div>
                ) : activities.length === 0 ? (
                    <div className="glass-card card-body animate-in" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '3rem' }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(34,211,238,0.08)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem',
                            border: '1px solid rgba(34,211,238,0.15)'
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: '600' }}>No History Recorded</h3>
                        <p style={{ margin: '0', color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '320px', lineHeight: '1.6' }}>
                            Deploy an AI agent or back a forecasting competition to see activity transactions recorded here.
                        </p>
                    </div>
                ) : (
                    <div className="animate-in">
                        {activities.map((act) => (
                            <div key={act.id} className="activity-item">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div className="activity-icon-badge" style={{ borderColor: `${getTypeColor(act.type)}40` }}>
                                        {getTypeEmoji(act.type)}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                                                {act.title}
                                            </span>
                                            <span className="badge-status" style={{
                                                background: act.status === 'active' || act.status === 'completed' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                color: act.status === 'active' || act.status === 'completed' ? '#22c55e' : '#ef4444'
                                            }}>
                                                {act.status}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                            {act.description}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.3rem' }}>
                                            {formatDate(act.timestamp)}
                                        </div>
                                    </div>
                                </div>
                                {act.txSignature && (
                                    <a
                                        href={`https://explorer.solana.com/tx/${act.txSignature}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="tx-link"
                                    >
                                        Explorer
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                        </svg>
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </>
    );
}

export default function ActivityPage() {
    return (
        <WalletProvider>
            <ActivityPageContent />
        </WalletProvider>
    );
}
