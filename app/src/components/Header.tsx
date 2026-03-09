'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface Props {
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
}

export default function Header({ theme, onToggleTheme }: Props) {
    const { publicKey } = useWallet();
    const [time, setTime] = useState('');

    useEffect(() => {
        const tick = () => setTime(new Date().toLocaleTimeString());
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="header">
            <div className="header-left">
                <div>
                    <div className="logo">ExoDuZe</div>
                    <div className="logo-sub">AI-Native Probability Trading · Non-Zero-Sum</div>
                </div>
                <span className="badge live">● LIVE</span>
                <span className="badge devnet">DEVNET</span>
            </div>
            <div className="header-right">
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{time}</span>
                {publicKey && (
                    <span style={{
                        fontSize: '0.65rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-indigo)',
                        background: 'rgba(99,102,241,0.1)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-round)',
                    }}>
                        {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                    </span>
                )}
                <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <WalletMultiButton />
            </div>
        </header>
    );
}
