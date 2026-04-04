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
            <div className="header-glass-overlay" style={{
                position: 'absolute', inset: 0, 
                borderRadius: 'inherit',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), inset 0 -1px 1px rgba(0,0,0,0.5)',
                pointerEvents: 'none', zIndex: -1
            }} />
            
            <div className="header-left">
                <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px', 
                            background: 'var(--gradient-vibrant)',
                            backgroundSize: '200% 200%',
                            animation: 'holographic 6s ease infinite',
                            boxShadow: '0 4px 12px rgba(131, 56, 236, 0.4), inset 0 2px 4px rgba(255,255,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 900, fontSize: '1.2rem',
                            textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                        }}>E</div>
                        <div>
                            <div className="logo" style={{ lineHeight: 1.1 }}>ExoDuZe</div>
                            <div className="logo-sub" style={{ opacity: 0.8, marginTop: '2px' }}>AI-Native Probability Trading</div>
                        </div>
                    </div>
                </Link>
                
                <div style={{ display: 'flex', gap: '6px', marginLeft: '0.5rem' }}>
                    <span className="badge live" style={{ transform: 'translateY(-1px)' }}>● LIVE</span>
                    <span className="badge devnet" style={{ transform: 'translateY(-1px)' }}>DEVNET</span>
                </div>
            </div>

            <div className="header-right">
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{time}</span>
                {publicKey && (
                    <span style={{
                        fontSize: '0.65rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-indigo)',
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-round)',
                    }}>
                        {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                    </span>
                )}
                <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme" style={{
                    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.2)'
                }}>
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
                    <WalletMultiButton />
                </div>

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

