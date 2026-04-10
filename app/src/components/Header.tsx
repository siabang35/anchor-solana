'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SECTORS, CATEGORY_SECTORS } from './SectorNav';

// NAV_LINKS removed for cleaner UI
interface Props {
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
    activeSector?: string;
    onSectorChange?: (sector: string) => void;
}

export default function Header({ theme, onToggleTheme, activeSector, onSectorChange }: Props) {
    const { publicKey } = useWallet();
    const [time, setTime] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
                        <img 
                            src="/images/logo/exoduze-logo.png" 
                            alt="ExoDuZe Logo" 
                            className="header-exoduze-logo" 
                        />
                        <div style={{ marginLeft: '-12px' }}>
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
                <span style={{ marginRight: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{time}</span>
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
                <div className="wallet-btn-wrap">
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
                        padding: '0.3rem', cursor: 'pointer', color: '#818cf8',
                        fontSize: '1rem', lineHeight: 1, width: '32px', height: '32px',
                        alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {menuOpen ? '✕' : '☰'}
                </button>
            </div>

            {menuOpen && (
                <div className="mobile-menu-overlay" style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--bg-card)',
                    backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                    borderBottom: '1px solid var(--border-glass)',
                    padding: '1.2rem 0 1.2rem 1.2rem',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6)', zIndex: 100,
                    animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingRight: '1.2rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em' }}>
                            EXPLORE MARKETS
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{time}</span>
                    </div>

                    <div className="hide-scrollbar" style={{ 
                        display: 'flex', 
                        overflowX: 'auto', 
                        gap: '0.8rem', 
                        paddingBottom: '0.5rem',
                        paddingRight: '1.2rem',
                        scrollSnapType: 'x mandatory',
                        WebkitOverflowScrolling: 'touch'
                    }}>
                        {SECTORS.map((sector) => {
                            const isActive = activeSector === sector.id;
                            return (
                                <button
                                    key={sector.id}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        if (CATEGORY_SECTORS.includes(sector.id)) {
                                            router.push(`/category/${sector.id}`);
                                        } else {
                                            if (pathname === '/') {
                                                onSectorChange?.(sector.id);
                                            } else {
                                                localStorage.setItem('redirect_tab', sector.id);
                                                router.push('/');
                                            }
                                        }
                                    }}
                                    style={{
                                        flex: '0 0 auto',
                                        width: '64px',
                                        height: '64px',
                                        scrollSnapAlign: 'start',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                                        padding: '0.4rem', borderRadius: '14px',
                                        background: isActive ? 'var(--gradient-vibrant)' : 'var(--bg-card)',
                                        border: isActive ? 'none' : '1px solid var(--border-card)',
                                        color: isActive ? '#fff' : 'var(--text-primary)',
                                        cursor: 'pointer', textAlign: 'center',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: isActive ? '0 8px 16px rgba(99,102,241,0.2)' : 'var(--shadow-card)',
                                    }}
                                >
                                    <span style={{ fontSize: '1.25rem', lineHeight: 1, filter: isActive ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'none' }}>
                                        {sector.icon}
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.01em', textShadow: isActive ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}>
                                        {sector.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Responsive CSS for mobile menu button */}
            <style>{`
                .header-exoduze-logo {
                    width: 90px;
                    height: 90px;
                    border-radius: 8px;
                    object-fit: contain;
                }
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
                @media (max-width: 768px) {
                    .header-nav { display: none !important; }
                    .mobile-menu-btn { display: flex !important; }
                    .nav-label { display: none; }
                    .header-exoduze-logo {
                        width: 48px;
                        height: 48px;
                    }
                    .wallet-btn-wrap {
                        transform: scale(0.78) !important;
                    }
                }
                @media (min-width: 769px) {
                    .mobile-menu-overlay { display: none !important; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </header>
    );
}

