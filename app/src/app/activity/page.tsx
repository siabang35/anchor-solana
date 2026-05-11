'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });

function ActivityPageContent() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
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

    return (
        <>
            <Header theme={theme} onToggleTheme={toggleTheme} />
            <main className="main-container">
                {/* Page Title */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1.5rem 0 1rem',
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '1.5rem', fontWeight: 700, margin: 0,
                            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        }}>
                            Activity History
                        </h1>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.3rem 0 0', maxWidth: '500px' }}>
                            Track your prediction stakes, agent deployment history, and platform earnings.
                        </p>
                    </div>
                </div>

                {/* Empty State / Placeholder */}
                <div className="glass-card card-body animate-in" style={{
                    marginBottom: '1rem',
                    minHeight: '60vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '3rem'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: 'rgba(34,211,238,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1.5rem',
                        boxShadow: '0 0 20px rgba(34,211,238,0.2)'
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: '600' }}>No Activity Yet</h3>
                    <p style={{ margin: '0', color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '350px', lineHeight: '1.6' }}>
                        Your recent stakes, agent interactions, and rewards will appear here once you participate in a competition.
                    </p>
                </div>
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
