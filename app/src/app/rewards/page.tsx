'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const GlobalPoolWinners = dynamic(() => import('@/components/GlobalPoolWinners'), { ssr: false });
const Performance = dynamic(() => import('@/components/Performance'), { ssr: false });

function RewardsPageContent() {
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
                <div style={{ padding: '1.5rem 0 1rem' }}>
                    <h1 style={{
                        fontSize: '1.5rem', fontWeight: 700, margin: 0,
                        color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem',
                    }}>
                        🎁 Rewards & Prize Pools
                    </h1>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.3rem 0 0', maxWidth: '500px' }}>
                        Global prize distribution, champion rankings, and performance analytics.
                    </p>
                </div>

                {/* Global Pool & Champions */}
                <div className="glass-card card-body animate-in" style={{ marginBottom: '1rem' }}>
                    <GlobalPoolWinners limit={10} />
                </div>

                {/* Performance Analytics */}
                <div className="glass-card card-body animate-in" style={{ marginBottom: '1rem' }}>
                    <Performance />
                </div>
            </main>
        </>
    );
}

export default function RewardsPage() {
    return (
        <WalletProvider>
            <RewardsPageContent />
        </WalletProvider>
    );
}
