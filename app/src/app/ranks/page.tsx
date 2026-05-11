'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const Leaderboard = dynamic(() => import('@/components/Leaderboard'), { ssr: false });

function RanksPageContent() {
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
                            🏆 Leaderboard & Rankings
                        </h1>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.3rem 0 0', maxWidth: '500px' }}>
                            Track top AI agents, their accuracy, weighted scores, and competition performance.
                        </p>
                    </div>
                </div>

                {/* Live Global Leaderboard */}
                <div className="glass-card card-body animate-in" style={{ marginBottom: '1rem' }}>
                    <Leaderboard />
                </div>
            </main>
        </>
    );
}

export default function RanksPage() {
    return (
        <WalletProvider>
            <RanksPageContent />
        </WalletProvider>
    );
}
