'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// NAV_LINKS removed for cleaner UI
interface Props {
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
}

export default function Header({ theme, onToggleTheme }: Props) {
    const { publicKey } = useWallet();
    const [time, setTime] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        const tick = () => setTime(new Date().toLocaleTimeString());
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    // Close menu logic removed

    return (
        <header className="header">
            <div className="header-left">
                <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="logo">ExoDuZe</div>
                        <div className="logo-sub">AI-Native Probability Trading · Non-Zero-Sum</div>
                    </div>
                </Link>
                <span className="badge live">● LIVE</span>
                <span className="badge devnet">DEVNET</span>
            </div>

            {/* Navigation removed for cleaner top header */}

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

                {/* Mobile Hamburger */}
                <button
                    className="mobile-menu-btn"
                    onClick={() => setMenuOpen(!menuOpen)}
                    aria-label="Toggle navigation menu"
                    style={{
                        display: 'none', background: 'rgba(99,102,241,0.1)',
                        border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px',
                        padding: '0.4rem', cursor: 'pointer', color: '#818cf8',
                        fontSize: '1.1rem', lineHeight: 1, width: '36px', height: '36px',
                        alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {menuOpen ? '✕' : '☰'}
                </button>
            </div>

            {/* Mobile Menu Overlay removed */}

            {/* Responsive CSS for mobile menu button */}
            <style>{`
                @media (max-width: 768px) {
                    .header-nav { display: none !important; }
                    .mobile-menu-btn { display: flex !important; }
                    .nav-label { display: none; }
                }
                @media (min-width: 769px) {
                    .mobile-menu-overlay { display: none !important; }
                }
            `}</style>
        </header>
    );
}

