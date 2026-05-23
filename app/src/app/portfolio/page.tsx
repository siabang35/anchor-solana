'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/supabase';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const SolanaChart = dynamic(() => import('@/components/SolanaChart'), { ssr: false });
const MobileBottomNav = dynamic(() => import('@/components/MobileBottomNav'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });

/* ── Constants ── */
const MIN_FETCH_INTERVAL_MS = 10_000;
const BALANCE_CACHE_TTL_MS = 15_000;
const MAX_BALANCE_SOL = 1_000_000_000;
const FETCH_TIMEOUT_MS = 8_000;

function isValidPublicKey(key: PublicKey | null): key is PublicKey {
    if (!key) return false;
    try {
        const reconstructed = new PublicKey(key.toBase58());
        return reconstructed.equals(key);
    } catch { return false; }
}

function sanitiseLamports(raw: unknown): number | null {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
    const lamports = Math.floor(raw);
    if (lamports / LAMPORTS_PER_SOL > MAX_BALANCE_SOL) return null;
    return lamports;
}

/* ── Dashboard (Connected) ── */
function DashboardView() {
    const { publicKey, connected } = useWallet();
    const { connection } = useConnection();
    const pathname = usePathname();
    const [balance, setBalance] = useState<number | null>(null);
    const [solPrice, setSolPrice] = useState<number | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState(0);
    const fetchInFlight = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [stats, setStats] = useState<{
        activeStakedSol: number;
        totalWonSol: number;
        portfolioValue: number;
    } | null>(null);

    // Auto-close menu on route change
    useEffect(() => { setMenuOpen(false); }, [pathname]);

    const fetchBalance = useCallback(async (force = false) => {
        if (!connected || !isValidPublicKey(publicKey)) { setBalance(null); return; }
        if (!force && Date.now() - lastFetchedAt < MIN_FETCH_INTERVAL_MS) return;
        if (fetchInFlight.current) return;
        fetchInFlight.current = true;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        try {
            const raw = await Promise.race([
                connection.getBalance(publicKey, 'confirmed'),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('RPC_TIMEOUT')), FETCH_TIMEOUT_MS)),
            ]);
            const safe = sanitiseLamports(raw);
            if (safe !== null) { setBalance(safe); setLastFetchedAt(Date.now()); }
        } catch (e) { console.error('[Portfolio]', e); }
        finally { fetchInFlight.current = false; }
    }, [connected, publicKey, connection, lastFetchedAt]);

    useEffect(() => {
        if (connected && isValidPublicKey(publicKey)) fetchBalance(true);
        else setBalance(null);
        return () => { abortRef.current?.abort(); };
    }, [connected, publicKey, fetchBalance]);

    useEffect(() => {
        if (!connected || !isValidPublicKey(publicKey)) return;
        const iv = setInterval(() => fetchBalance(false), BALANCE_CACHE_TTL_MS);
        return () => clearInterval(iv);
    }, [connected, publicKey, fetchBalance]);

    useEffect(() => {
        if (!connected || !publicKey) {
            setStats(null);
            return;
        }

        const loadStats = async () => {
            try {
                const data = await apiFetch<any>('/dashboard/stats', {
                    headers: { 'x-user-id': publicKey.toString() }
                });
                setStats(data);
            } catch (err) {
                console.error('Failed to load portfolio stats:', err);
            }
        };

        loadStats();
        const iv = setInterval(loadStats, 15_000);
        return () => clearInterval(iv);
    }, [connected, publicKey]);

    const solBal = balance !== null ? balance / LAMPORTS_PER_SOL : 0;
    const stakedSol = stats?.activeStakedSol || 0;
    const earnedSol = stats?.totalWonSol || 0;
    const totalVal = solBal + stakedSol + earnedSol;
    const usdVal = totalVal && solPrice ? totalVal * solPrice : 0;

    const avPct = totalVal > 0 ? (solBal / totalVal) * 100 : 100;
    const stPct = totalVal > 0 ? (stakedSol / totalVal) * 100 : 0;
    const erPct = totalVal > 0 ? (earnedSol / totalVal) * 100 : 0;

    return (
        <div className="portfolio-page-wrapper">
            <div className="db-container">
                <style>{`
                    .db-container {
                        min-height: 100vh; background: radial-gradient(circle at 0% 0%, rgba(153,69,255,0.15) 0%, transparent 40%), radial-gradient(circle at 100% 0%, rgba(20,241,149,0.1) 0%, #000 50%);
                        background-color: #000; color: #fff; padding-bottom: 100px;
                        font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
                        animation: dbFadeIn 0.4s ease;
                    }
                    .portfolio-page-wrapper { background-color: #000; min-height: 100vh; }
                    .desktop-only-header { display: none; }
                    @media (min-width: 769px) {
                        .db-container {
                            max-width: 1200px;
                            margin: 0 auto;
                            border-left: 1px solid rgba(255,255,255,0.05);
                            border-right: 1px solid rgba(255,255,255,0.05);
                        }
                        .db-hamburger-btn { display: none !important; }
                        .db-nav { padding-top: 2rem; }
                        .desktop-only-header { display: block; }
                    }
                    @keyframes dbFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                    .db-nav { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem; }
                    .db-icon-btn { width: 40px; height: 40px; border-radius: 50%;
                        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05);
                        display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; text-decoration: none; }
                    .db-icon-btn:hover { background: rgba(255,255,255,0.1); }
                    .db-title-wrap { display: flex; align-items: center; gap: 0.5rem; }
                    .db-sol-logo { width: 24px; height: 24px; border-radius: 50%; }
                    .db-title { font-size: 1.1rem; font-weight: 500; }
                    .db-bal { padding: 0 1.5rem; margin-top: 0.5rem; }
                    .db-bal-label { color: rgba(255,255,255,0.5); font-size: 0.9rem; margin-bottom: 0.25rem; }
                    .db-bal-row { display: flex; align-items: baseline; justify-content: space-between; }
                    .db-bal-main { display: flex; align-items: baseline; gap: 0.5rem; }
                    .db-bal-val { font-size: 2.5rem; font-weight: 500; letter-spacing: -0.02em; }
                    .db-bal-cur { font-size: 1.25rem; color: rgba(255,255,255,0.6); }
                    .db-bal-usd { font-size: 0.9rem; color: rgba(255,255,255,0.8); }
                    .db-overview { padding: 0 1.5rem; margin-top: 2rem; }
                    .db-overview-title { font-size: 1.1rem; font-weight: 500; margin-bottom: 1rem; }
                    .db-pb { display: flex; height: 32px; border-radius: 8px; overflow: hidden; gap: 4px; margin-bottom: 1.5rem; }
                    .db-pb-seg { height: 100%; border-radius: 6px; }
                    .db-pb-1 { background: #7c8db0; }
                    .db-pb-2 { background: #6b7280; }
                    .db-pb-3 { background: #5eead4; }
                    .db-pb-4 { background: repeating-linear-gradient(-45deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05) 5px,rgba(255,255,255,0.1) 5px,rgba(255,255,255,0.1) 10px); }
                    .db-legend { display: flex; flex-direction: column; gap: 0.75rem; }
                    .db-leg-item { display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; }
                    .db-leg-left { display: flex; align-items: center; gap: 0.5rem; }
                    .db-leg-dot { width: 6px; height: 6px; border-radius: 50%; }
                    .db-leg-val { color: rgba(255,255,255,0.6); }
                    .db-chart { margin-top: 2.5rem; }

                    /* ── Connect Wallet UI ── */
                    .cw-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; text-align: center; }
                    .cw-icon { width: 160px; height: 160px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; position: relative; perspective: 1000px; }
                    .cw-icon::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; height: 80%; background: radial-gradient(circle, rgba(168,85,247,0.25), transparent 70%); border-radius: 50%; filter: blur(15px); z-index: 0; }
                    .cw-3d-img { width: 100%; height: 100%; object-fit: contain; position: relative; z-index: 1; filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5)); animation: float3D 6s ease-in-out infinite; transform-style: preserve-3d; }
                    @keyframes float3D { 0%, 100% { transform: translateY(0) rotateX(0deg) rotateY(0deg); } 25% { transform: translateY(-12px) rotateX(5deg) rotateY(8deg); } 75% { transform: translateY(8px) rotateX(-5deg) rotateY(-8deg); } }
                    .cw-title { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.75rem; }
                    .cw-desc { font-size: 0.85rem; color: rgba(255,255,255,0.5); max-width: 300px; line-height: 1.6; margin-bottom: 2.5rem; }
                    .cw-container .wallet-adapter-button { background: linear-gradient(135deg, #a855f7, #6366f1) !important; border-radius: 16px !important; padding: 0.9rem 2.5rem !important; font-weight: 600 !important; font-size: 1rem !important; box-shadow: 0 4px 24px rgba(168,85,247,0.35) !important; }
                    .cw-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.8rem; border-radius: 100px; font-size: 0.7rem; font-weight: 600; background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); color: #22d3ee; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2rem; }
                    .cw-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22d3ee; animation: cwPulse 2s ease infinite; }
                    @keyframes cwPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

                    /* ── Hamburger Button ── */
                    .db-hamburger-btn { width: 40px; height: 40px; border-radius: 12px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #818cf8; transition: background 0.2s; }
                    .db-hamburger-btn:hover { background: rgba(99,102,241,0.2); }

                    /* ── Menu Drawer ── */
                    .db-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 99; animation: dbFadeIn 0.2s ease; }
                    .db-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 85%; max-width: 320px; background: #0f172a; border-right: 1px solid rgba(255,255,255,0.08); z-index: 100; display: flex; flex-direction: column; animation: dbSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
                    @keyframes dbSlideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                    .db-drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
                    .db-drawer-close { background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; padding: 0.4rem; }
                    .db-drawer-close:hover { color: #fff; }
                    .db-drawer-nav { padding: 1.5rem 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; flex: 1; }
                    .db-drawer-link { display: flex; align-items: center; gap: 1rem; color: #fff; text-decoration: none; font-size: 1.1rem; font-weight: 600; padding: 0.5rem 0; }
                    .db-drawer-link:hover { color: #a855f7; }
                    .db-drawer-icon { width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; color: #818cf8; }
                    .db-drawer-footer { padding: 1.25rem; border-top: 1px solid rgba(255,255,255,0.05); }
                    .db-drawer-footer .wallet-adapter-button { width: 100% !important; background: #f59e0b !important; color: #000 !important; border-radius: 12px !important; padding: 0.85rem 1.5rem !important; font-weight: 700 !important; font-size: 0.95rem !important; justify-content: center !important; box-shadow: 0 4px 16px rgba(245,158,11,0.3) !important; transition: transform 0.1s, box-shadow 0.2s !important; }
                    .db-drawer-footer .wallet-adapter-button:hover { transform: translateY(-1px) !important; box-shadow: 0 6px 24px rgba(245,158,11,0.4) !important; }
                    .db-drawer-footer .wallet-adapter-button:active { transform: scale(0.97) !important; }
                `}</style>

                <div className="desktop-only-header">
                    <Header theme="dark" onToggleTheme={() => {}} />
                </div>

                <div className="db-nav">
                    <div className="db-title-wrap">
                        <img src="/images/coin/solana.png" alt="Solana" className="db-sol-logo" />
                        <div className="db-title">Solana</div>
                    </div>
                    <button className="db-hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* Drawer backdrop */}
                {menuOpen && <div className="db-drawer-backdrop" onClick={() => setMenuOpen(false)} />}

                {/* Side Menu Drawer */}
                {menuOpen && (
                    <div className="db-drawer">
                        <div className="db-drawer-header">
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="db-drawer-close" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                </button>
                            </div>
                            <button className="db-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <nav className="db-drawer-nav">
                            <Link href="/" className="db-drawer-link" onClick={() => setMenuOpen(false)}>
                                <div className="db-drawer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg></div>
                                <span>Markets</span>
                            </Link>
                            <Link href="/ranks" className="db-drawer-link" onClick={() => setMenuOpen(false)}>
                                <div className="db-drawer-icon" style={{ color: '#f59e0b' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></div>
                                <span>Ranks</span>
                            </Link>
                            {connected && (
                                <Link href="/activity" className="db-drawer-link" onClick={() => setMenuOpen(false)}>
                                    <div className="db-drawer-icon" style={{ color: '#22d3ee' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                                    <span>Activity</span>
                                </Link>
                            )}
                            <Link href="/rewards" className="db-drawer-link" onClick={() => setMenuOpen(false)}>
                                <div className="db-drawer-icon" style={{ color: '#ec4899' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg></div>
                                <span>Rewards</span>
                            </Link>
                            <Link href="/about" className="db-drawer-link" onClick={() => setMenuOpen(false)}>
                                <div className="db-drawer-icon" style={{ color: '#2dd4bf' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
                                <span>About</span>
                            </Link>
                        </nav>
                        <div className="db-drawer-footer">
                            <WalletMultiButton />
                        </div>
                    </div>
                )}

                {connected ? (
                    <>
                        <div className="db-bal">
                            <div className="db-bal-label">Portfolio Value</div>
                            <div className="db-bal-row">
                                <div className="db-bal-main">
                                    <span className="db-bal-val">{totalVal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                                    <span className="db-bal-cur">SOL</span>
                                </div>
                                <div className="db-bal-usd">${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                        </div>

                        <div className="db-overview">
                            <div className="db-overview-title">Overview</div>
                            <div className="db-pb">
                                <div className="db-pb-seg db-pb-1" style={{ width: `${avPct}%` }}/>
                                <div className="db-pb-seg db-pb-2" style={{ width: `${stPct}%` }}/>
                                <div className="db-pb-seg db-pb-3" style={{ width: `${erPct}%` }}/>
                                <div className="db-pb-seg db-pb-4" style={{ width: '0%' }}/>
                            </div>
                            <div className="db-legend">
                                <div className="db-leg-item"><div className="db-leg-left"><div className="db-leg-dot" style={{background:'#7c8db0'}}/><span>Available</span></div><span className="db-leg-val">{solBal.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4})} SOL</span></div>
                                <div className="db-leg-item"><div className="db-leg-left"><div className="db-leg-dot" style={{background:'#6b7280'}}/><span>Staked</span></div><span className="db-leg-val">{stakedSol.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4})} SOL</span></div>
                                <div className="db-leg-item"><div className="db-leg-left"><div className="db-leg-dot" style={{background:'#5eead4'}}/><span>Earned</span></div><span className="db-leg-val">{earnedSol.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4})} SOL</span></div>
                            </div>
                        </div>

                        <div className="db-chart"><SolanaChart symbol="SOLUSDT" interval="1m" onPriceUpdate={setSolPrice} /></div>
                    </>
                ) : (
                    <div className="cw-container">
                        <div className="cw-icon">
                            <img src="/images/item/wallet3d.png" alt="3D Wallet" className="cw-3d-img" />
                        </div>
                        <div className="cw-title">Connect Your Wallet</div>
                        <div className="cw-desc">Link your Solana wallet to unlock real-time portfolio tracking, live charts, and staking insights.</div>
                        <WalletMultiButton />
                        <div className="cw-badge"><span className="cw-badge-dot" /> Devnet</div>
                    </div>
                )}
            </div>

            {/* Global MobileBottomNav */}
            <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
        </div>
    );
}

/* ── Main Orchestrator ── */
function PortfolioContent() {
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setHydrated(true);
    }, []);

    if (!hydrated) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="circular-spinner" />
            <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.05em' }}>Loading portfolio...</div>
        </div>
    );

    return <DashboardView />;
}

export default function PortfolioPage() {
    return (
        <WalletProvider>
            <PortfolioContent />
        </WalletProvider>
    );
}
