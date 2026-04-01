'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/category/crypto', label: 'Crypto', icon: '₿' },
    { href: '/category/finance', label: 'Finance', icon: '📈' },
    { href: '/category/politics', label: 'Politics', icon: '🏛️' },
    { href: '/category/tech', label: 'Tech', icon: '💻' },
    { href: '/category/sports', label: 'Sports', icon: '⚽' },
];

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

    // Close menu on route change
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

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

            {/* Desktop Navigation */}
            <nav className="header-nav" style={{
                display: 'flex', gap: '0.15rem', alignItems: 'center',
                marginLeft: '1rem', marginRight: 'auto',
            }}>
                {NAV_LINKS.map(link => {
                    const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-round, 9999px)',
                                fontSize: '0.6rem', fontWeight: isActive ? 700 : 500,
                                color: isActive ? '#818cf8' : 'var(--text-muted)',
                                background: isActive ? 'rgba(129,140,248,0.1)' : 'transparent',
                                border: isActive ? '1px solid rgba(129,140,248,0.2)' : '1px solid transparent',
                                textDecoration: 'none', transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <span style={{ fontSize: '0.7rem' }}>{link.icon}</span>
                            <span className="nav-label">{link.label}</span>
                        </Link>
                    );
                })}
            </nav>

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

            {/* Mobile Menu Overlay */}
            {menuOpen && (
                <div className="mobile-menu-overlay" style={{
                    position: 'fixed', top: '60px', left: 0, right: 0, bottom: 0,
                    background: 'rgba(7,8,15,0.95)', backdropFilter: 'blur(12px)',
                    zIndex: 100, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem',
                    animation: 'fadeIn 0.2s ease-out',
                }}>
                    {NAV_LINKS.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMenuOpen(false)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.8rem 1rem', borderRadius: '12px',
                                    fontSize: '0.85rem', fontWeight: isActive ? 700 : 500,
                                    color: isActive ? '#818cf8' : 'var(--text-secondary, #94a3b8)',
                                    background: isActive ? 'rgba(129,140,248,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isActive ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                    textDecoration: 'none', transition: 'all 0.2s',
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>{link.icon}</span>
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            )}

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

