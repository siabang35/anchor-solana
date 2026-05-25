'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SECTORS, CATEGORY_SECTORS } from './SectorNav';
import MobileBottomNav from './MobileBottomNav';

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

    // Auto-close menu on route change
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    // Auto-close menu on scroll
    useEffect(() => {
        if (!menuOpen) return;
        const onScroll = () => setMenuOpen(false);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [menuOpen]);

    // Close menu handler for backdrop
    const closeMenu = useCallback(() => setMenuOpen(false), []);

    return (
        <>
            <header className="header">
                <div className="header-glass-overlay" style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 'inherit',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), inset 0 -1px 1px rgba(0,0,0,0.5)',
                    pointerEvents: 'none', zIndex: -1
                }} />

                <div className="header-left">
                    <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <img
                                src="/images/logo/exoduze-logo.png"
                                alt="ExoDuZe Logo"
                                className="header-exoduze-logo"
                                style={{ transform: 'scale(1.15)' }}
                            />
                            <div className="header-logo-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div className="logo" style={{ lineHeight: 1, fontSize: '1.35em', paddingTop: '3px' }}>ExoDuZe</div>

                                <div className="powered-by-sol-wrap" style={{ marginTop: 0 }}>
                                    <div className="powered-by-sol-inner">
                                        <img src="/images/logo/poweredbysol.svg" alt="Powered by Solana" className="powered-by-sol-img" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Link>

                    <div className="header-badges-mobile" style={{ display: 'flex', gap: '8px', marginLeft: '0.6rem' }}>
                        <span className="badge live">● LIVE</span>
                        <span className="badge devnet">⚡ DEVNET</span>
                    </div>
                    {/* Desktop Navigation — Image 1 style */}
                    <nav className="header-desktop-nav">
                        <Link href="/" className={`header-nav-item ${pathname === '/' ? 'header-nav-item--active' : ''}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
                            Markets
                        </Link>
                        <Link href="/ranks" className={`header-nav-item ${pathname === '/ranks' ? 'header-nav-item--active' : ''}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
                            Ranks
                        </Link>

                        <Link href="/rewards" className={`header-nav-item ${pathname === '/rewards' ? 'header-nav-item--active' : ''}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
                            Rewards
                        </Link>
                        <Link href="/about" className={`header-nav-item ${pathname === '/about' ? 'header-nav-item--active' : ''}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                            About
                        </Link>
                    </nav>
                </div>

                <div className="header-right">
                    <span className="header-time" style={{ marginRight: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{time}</span>
                    {publicKey && (
                        <div className="header-portfolio-activity" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Link href="/portfolio" className="header-portfolio-btn" style={{
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                padding: '4px 10px', borderRadius: '12px',
                                background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
                                color: 'var(--accent-cyan)', fontSize: '0.7rem', fontWeight: 600, textDecoration: 'none',
                                transition: 'all 0.2s'
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                <span className="portfolio-text">Portfolio</span>
                            </Link>

                            <Link href="/activity" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '26px', height: '26px', borderRadius: '50%',
                                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                color: 'var(--accent-indigo)', textDecoration: 'none',
                                transition: 'all 0.2s'
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            </Link>
                        </div>
                    )}

                    <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme" style={{
                        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)'
                    }}>
                        {theme === 'dark' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                        )}
                    </button>
                    <div className="wallet-btn-wrap">
                        <WalletMultiButton />
                    </div>

                    {/* Hamburger — mobile only */}
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setMenuOpen(true)}
                        aria-label="Open navigation menu"
                        style={{
                            background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px',
                            padding: '0.4rem', cursor: 'pointer', color: '#818cf8',
                            width: '38px', height: '38px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Backdrop overlay */}
                {menuOpen && (
                    <div
                        className="mobile-menu-backdrop"
                        onClick={closeMenu}
                        style={{
                            position: 'fixed', inset: 0, top: 0, left: 0,
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                            zIndex: 99,
                            animation: 'fadeIn 0.2s ease',
                        }}
                    />
                )}

                {/* Mobile Menu Drawer (Side Menu like Image 2) */}
                {menuOpen && (
                    <div className="mobile-menu-drawer" style={{
                        position: 'fixed', top: 0, left: 0, bottom: 0, width: '85%', maxWidth: '320px',
                        background: 'var(--bg-primary)',
                        borderRight: '1px solid var(--border-card)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'slideRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
                    }}>
                        {/* Drawer Header: Social Icons & Close */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="drawer-social-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                </button>
                                <button className="drawer-social-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                                </button>
                                <button className="drawer-social-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                                </button>
                            </div>
                            <button onClick={closeMenu} className="drawer-close-btn" aria-label="Close menu">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {/* Navigation Links */}
                        <nav style={{ padding: '1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
                            <Link href="/" className="drawer-nav-link" onClick={closeMenu}>
                                <div className="drawer-nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg></div>
                                <span>Markets</span>
                            </Link>
                            <Link href="/ranks" className="drawer-nav-link" onClick={closeMenu}>
                                <div className="drawer-nav-icon" style={{ color: 'var(--accent-amber)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg></div>
                                <span>Ranks</span>
                            </Link>

                            {publicKey && (
                                <Link href="/activity" className="drawer-nav-link" onClick={closeMenu}>
                                    <div className="drawer-nav-icon" style={{ color: 'var(--accent-cyan)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></div>
                                    <span>Activity</span>
                                </Link>
                            )}
                            <Link href="/rewards" className="drawer-nav-link" onClick={closeMenu}>
                                <div className="drawer-nav-icon" style={{ color: 'var(--accent-pink)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg></div>
                                <span>Rewards</span>
                            </Link>
                            <Link href="/about" className="drawer-nav-link" onClick={closeMenu}>
                                <div className="drawer-nav-icon" style={{ color: 'var(--accent-cyan)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg></div>
                                <span>About</span>
                            </Link>

                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0.5rem 0' }}></div>

                            <div className="drawer-auth-section">
                                <WalletMultiButton />
                            </div>
                        </nav>
                    </div>
                )}

                {/* Responsive CSS for header, desktop nav, and mobile drawer */}
                <style>{`
                .header-exoduze-logo {
                    width: 50px;
                    height: 70px;
                    border-radius: 8px;    
                    object-fit: cover;
                }

                /* ── Badges (LIVE + DEVNET) ── */
                .header-badges-mobile {
                    display: none;
                    align-items: center;
                    gap: 0.35rem;
                    margin-left: 0.15rem;
                }

                /* ── Powered by Solana with animated border ── */
                .powered-by-sol-wrap {
                    position: relative;
                    display: inline-flex;
                    border-radius: 8px;
                    overflow: hidden;
                    margin-top: 3px;
                }
                .powered-by-sol-wrap::before {
                    content: '';
                    position: absolute;
                    inset: -150%;
                    background: conic-gradient(
                        #9945FF, #8752F3, #5497D5, #43B4CA,
                        #28E0B9, #19FB9B, #9945FF
                    );
                    animation: spinSolBorder 3s linear infinite;
                }
                .powered-by-sol-inner {
                    position: relative;
                    z-index: 1;
                    margin: 1.5px;
                    border-radius: 6.5px;
                    background: var(--bg-primary, #181728);
                    padding: 2px 6px;
                    display: flex;
                    align-items: center;
                }
                .powered-by-sol-img {
                    height: 18px;
                    width: auto;
                    display: block;
                }

                /* ===== DESKTOP NAVIGATION ===== */
                .header-desktop-nav { display: none; }
                .header-nav-item {
                    display: flex; align-items: center; gap: 0.4rem;
                    padding: 0.45rem 0.85rem; border-radius: var(--radius-round);
                    font-size: 0.82rem; font-weight: 500; color: var(--text-muted);
                    text-decoration: none; transition: color 0.2s ease, background 0.2s ease;
                    white-space: nowrap;
                }
                .header-nav-item:hover { color: var(--text-primary); background: rgba(255,255,255,0.05); }
                .header-nav-item--active {
                    background: rgba(99,102,241,0.15) !important;
                    color: var(--accent-indigo) !important; font-weight: 600;
                }
                .header-nav-item svg { opacity: 0.7; flex-shrink: 0; }
                .header-nav-item--active svg { opacity: 1; }

                /* ===== MOBILE MENU BUTTON ===== */
                .mobile-menu-btn {
                    display: none; background: transparent;
                    border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
                    color: var(--text-secondary); width: 36px; height: 36px;
                    cursor: pointer; align-items: center; justify-content: center;
                    -webkit-tap-highlight-color: transparent; flex-shrink: 0;
                }
                .mobile-menu-btn:active { background: rgba(255,255,255,0.05); }

                /* ===== DRAWER STYLES ===== */
                .drawer-social-btn {
                    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
                    color: var(--text-muted); width: 36px; height: 36px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .drawer-social-btn:active { background: rgba(255,255,255,0.08); }
                .drawer-close-btn {
                    background: transparent; border: none; color: var(--text-muted);
                    cursor: pointer; padding: 0.4rem; margin-right: -0.4rem;
                }
                .drawer-nav-link {
                    display: flex; align-items: center; gap: 1rem;
                    color: var(--text-primary); text-decoration: none;
                    font-size: 1.1rem; font-weight: 600; padding: 0.5rem 0;
                }
                .drawer-nav-icon {
                    width: 38px; height: 38px; border-radius: 10px;
                    background: rgba(255,255,255,0.03);
                    display: flex; align-items: center; justify-content: center;
                    color: var(--accent-indigo);
                }
                .drawer-auth-btn {
                    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
                    padding: 0.85rem; border-radius: 12px; font-weight: 600; font-size: 0.95rem;
                    cursor: pointer; transition: transform 0.1s;
                }
                .drawer-auth-btn:active { transform: scale(0.96); }
                .btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); }
                .btn-solid { background: var(--accent-amber); border: none; color: #000; }

                /* Drawer Wallet Button styling */
                .drawer-auth-section .wallet-adapter-button {
                    width: 100% !important;
                    background: #f59e0b !important;
                    color: #000 !important;
                    border-radius: 12px !important;
                    padding: 0.85rem 1.5rem !important;
                    font-weight: 700 !important;
                    font-size: 0.95rem !important;
                    justify-content: center !important;
                    box-shadow: 0 4px 16px rgba(245,158,11,0.3) !important;
                    transition: transform 0.1s, box-shadow 0.2s !important;
                }
                .drawer-auth-section .wallet-adapter-button:hover {
                    transform: translateY(-1px) !important;
                    box-shadow: 0 6px 24px rgba(245,158,11,0.4) !important;
                }
                .drawer-auth-section .wallet-adapter-button:active {
                    transform: scale(0.97) !important;
                }

                /* ===== DESKTOP (>= 769px) ===== */
                @media (min-width: 769px) {
                    .header-desktop-nav {
                        display: flex; align-items: center; gap: 0.25rem; margin-left: 1.5rem;
                    }
                    .mobile-menu-btn { display: none !important; }
                    .header-exoduze-logo { width: 46px; height: 46px; }
                    .header-logo-text .logo-sub { display: none; }
                    .header-badges-mobile { display: none !important; }
                    .powered-by-sol-img { height: 20px; }
                }

                /* ===== MOBILE (<= 768px) ===== */
                @media (max-width: 768px) {
                    .header {
                        flex-wrap: wrap; align-items: center; gap: 0;
                        padding: 0.6rem 1.1rem 0.5rem;
                        border-radius: 0 !important; margin: 0 !important; top: 0;
                        width: 100%; max-width: 100vw;
                        border-left: none; border-right: none; border-top: none;
                    }
                    .header-left {
                        width: 100%; display: flex; align-items: center;
                        gap: 0.35rem; min-width: 0; margin-bottom: 0.35rem;
                    }
                    .header-badges-mobile { display: flex !important; }
                    .header-badges-mobile .badge {
                        padding: 3px 10px; font-size: 0.62rem;
                    }
                    .header-right {
                        width: 100%; display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem;
                    }
                    .header-desktop-nav { display: none !important; }
                    .mobile-menu-btn { display: flex !important; margin-left: 0 !important; }
                    .header-exoduze-logo { width: 32px; height: 32px; }
                    .header-logo-text .logo { font-size: 1.15rem; }
                    .header-logo-text .logo-sub { display: none; }
                    .powered-by-sol-img { height: 14px; }
                    .powered-by-sol-wrap { margin-top: 2px; }
                    .powered-by-sol-inner { padding: 1.5px 5px; margin: 1px; }
                    .header-time {
                        display: block !important; font-size: 0.58rem !important;
                        line-height: 1.2; opacity: 0.5;
                    }
                    .header-portfolio-activity { display: none !important; }
                    .header-portfolio-btn { padding: 4px 6px !important; }
                    .portfolio-text { display: none; }
                    .wallet-btn-wrap { transform: none; }
                    .wallet-btn-wrap .wallet-adapter-button {
                        height: 30px !important;
                        padding: 0 10px !important;
                        font-size: 0.75rem !important;
                        border-radius: 10px !important;
                    }
                    .theme-toggle { width: 30px !important; height: 30px !important; }
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideRight {
                    from { opacity: 0; transform: translateX(-100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes spinSolBorder { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
            </header>

            {/* MobileBottomNav MUST be outside <header> — header's backdrop-filter
            creates a containing block that breaks position:fixed on children */}
            <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
        </>
    );
}
