'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/supabase';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { Assets3DIcon, Agents3DIcon } from '@/components/Agents3DIcon';

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
    const searchParams = useSearchParams();
    const tabParam = searchParams.get('tab');

    const [activeTab, setActiveTab] = useState<'assets' | 'agents'>('assets');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Restore selected tab from search params
    useEffect(() => {
        if (tabParam === 'agents' || tabParam === 'assets') {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    // Theme toggle handling
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

    // Agent tracking hook
    const {
        forecasters,
        pauseForecaster,
        resumeForecaster,
        stopForecaster,
        deleteForecaster,
        loading: agentsLoading
    } = useRealtimeAgents(publicKey?.toString() || null);

    const [balance, setBalance] = useState<number | null>(null);
    const [solPrice, setSolPrice] = useState<number | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState(0);
    const fetchInFlight = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    const handleClaim = async (winnerId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!publicKey) {
            alert('Please connect your Solana wallet to claim this prize.');
            return;
        }

        if (claimingId === winnerId) return;

        const confirmed = window.confirm(
            'Confirm Claim Request\n\n' +
            'You are about to claim this prize to your connected wallet.\n' +
            `Wallet: ${publicKey.toString().slice(0, 8)}...${publicKey.toString().slice(-6)}\n\n` +
            'Do you want to proceed?'
        );

        if (!confirmed) return;

        try {
            setClaimingId(winnerId);
            const res = await apiFetch<any>('/pool/claim', {
                method: 'POST',
                body: JSON.stringify({ winner_id: winnerId }),
                headers: { 'x-user-id': publicKey.toString() }
            });
            
            if (res.success) {
                alert(`✅ Prize claimed successfully!\n\nTransaction: ${res.tx}`);
                window.location.reload();
            } else {
                throw new Error(res.message || 'Unknown error occurred during claim');
            }
        } catch (err: any) {
            console.error('Claim Error:', err);
            const errorMessage = err.response?.data?.message || err.message || 'Failed to claim prize';
            alert(`❌ Claim Failed\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`);
        } finally {
            setClaimingId(null);
        }
    };
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
                    :root {
                        --db-bg: #000;
                        --db-text: #fff;
                        --db-text-muted: rgba(255,255,255,0.5);
                        --db-text-secondary: rgba(255,255,255,0.8);
                        --db-card-bg: rgba(255,255,255,0.03);
                        --db-border: rgba(255,255,255,0.08);
                        --db-radial-1: rgba(153,69,255,0.15);
                        --db-radial-2: rgba(20,241,149,0.1);
                        --db-radial-bg: #000;
                        --db-header-border: rgba(255,255,255,0.05);
                    }
                    [data-theme='light'] {
                        --db-bg: #f8fafc;
                        --db-text: #0f172a;
                        --db-text-muted: rgba(15,23,42,0.5);
                        --db-text-secondary: rgba(15,23,42,0.8);
                        --db-card-bg: #ffffff;
                        --db-border: rgba(15,23,42,0.08);
                        --db-radial-1: rgba(153,69,255,0.06);
                        --db-radial-2: rgba(20,241,149,0.04);
                        --db-radial-bg: #f8fafc;
                        --db-header-border: rgba(15,23,42,0.06);
                    }
                    .db-container {
                        min-height: 100vh;
                        background: radial-gradient(circle at 0% 0%, var(--db-radial-1) 0%, transparent 40%), radial-gradient(circle at 100% 0%, var(--db-radial-2) 0%, var(--db-radial-bg) 50%);
                        background-color: var(--db-bg); color: var(--db-text); padding-bottom: 100px;
                        font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
                        animation: dbFadeIn 0.4s ease;
                        transition: background-color 0.3s ease, color 0.3s ease;
                    }
                    .portfolio-page-wrapper { background-color: var(--db-bg); min-height: 100vh; transition: background-color 0.3s ease; }
                    .desktop-only-header { display: none; }
                    @media (min-width: 769px) {
                        .db-container {
                            max-width: 1200px;
                            margin: 0 auto;
                            border-left: 1px solid var(--db-header-border);
                            border-right: 1px solid var(--db-header-border);
                        }
                        .db-hamburger-btn { display: none !important; }
                        .db-nav { padding-top: 2rem; }
                        .desktop-only-header { display: block; }
                    }
                    @keyframes dbFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                    .db-nav { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem; }
                    .db-icon-btn { width: 40px; height: 40px; border-radius: 50%;
                        background: var(--db-card-bg); border: 1px solid var(--db-border);
                        display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--db-text); text-decoration: none; }
                    .db-icon-btn:hover { background: rgba(255,255,255,0.1); }
                    .db-title-wrap { display: flex; align-items: center; gap: 0.5rem; }
                    .db-sol-logo { width: 24px; height: 24px; border-radius: 50%; }
                    .db-title { font-size: 1.1rem; font-weight: 600; color: var(--db-text); }
                    .db-bal { padding: 0 1.5rem; margin-top: 0.5rem; }
                    .db-bal-label { color: var(--db-text-muted); font-size: 0.9rem; margin-bottom: 0.25rem; }
                    .db-bal-row { display: flex; align-items: baseline; justify-content: space-between; }
                    .db-bal-main { display: flex; align-items: baseline; gap: 0.5rem; }
                    .db-bal-val { font-size: 2.5rem; font-weight: 500; letter-spacing: -0.02em; color: var(--db-text); }
                    .db-bal-cur { font-size: 1.25rem; color: var(--db-text-muted); }
                    .db-bal-usd { font-size: 0.9rem; color: var(--db-text-secondary); }
                    .db-overview { padding: 0 1.5rem; margin-top: 2rem; }
                    .db-overview-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: var(--db-text); }
                    .db-pb { display: flex; height: 32px; border-radius: 8px; overflow: hidden; gap: 4px; margin-bottom: 1.5rem; }
                    .db-pb-seg { height: 100%; border-radius: 6px; }
                    .db-pb-1 { background: #7c8db0; }
                    .db-pb-2 { background: #6b7280; }
                    .db-pb-3 { background: #5eead4; }
                    .db-pb-4 { background: repeating-linear-gradient(-45deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05) 5px,rgba(255,255,255,0.1) 5px,rgba(255,255,255,0.1) 10px); }
                    .db-legend { display: flex; flex-direction: column; gap: 0.75rem; }
                    .db-leg-item { display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; color: var(--db-text); }
                    .db-leg-left { display: flex; align-items: center; gap: 0.5rem; }
                    .db-leg-dot { width: 6px; height: 6px; border-radius: 50%; }
                    .db-leg-val { color: var(--db-text-muted); }
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
                    <Header theme={theme} onToggleTheme={toggleTheme} />
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

                        {/* Tab Selector */}
                        <div style={{ display: 'flex', gap: '0.75rem', padding: '0 1.5rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                            <button 
                                onClick={() => setActiveTab('assets')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    border: activeTab === 'assets' ? '1px solid var(--accent-cyan)' : '1px solid var(--db-border)',
                                    background: activeTab === 'assets' ? 'rgba(34,211,238,0.1)' : 'transparent',
                                    color: activeTab === 'assets' ? 'var(--accent-cyan)' : 'var(--db-text-muted)',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <Assets3DIcon />
                                Assets & Chart
                            </button>
                            <button 
                                onClick={() => setActiveTab('agents')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    border: activeTab === 'agents' ? '1px solid var(--accent-indigo)' : '1px solid var(--db-border)',
                                    background: activeTab === 'agents' ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    color: activeTab === 'agents' ? 'var(--accent-indigo)' : 'var(--db-text-muted)',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <Agents3DIcon size={16} />
                                My Agents
                            </button>
                        </div>

                        {activeTab === 'agents' ? (
                            <div style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--db-text)' }}>My Deployed AI Agents</h3>
                                    {forecasters.length > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--db-text-muted)', background: 'var(--db-card-bg)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--db-border)' }}>
                                            Deploys: {forecasters.filter(f => f.status !== 'terminated').length} / 10 Active
                                        </span>
                                    )}
                                </div>

                                {agentsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--db-text-muted)' }}>
                                        <div className="circular-spinner" style={{ margin: '0 auto 1rem' }} />
                                        <span>Loading deployed agents...</span>
                                    </div>
                                ) : forecasters.length === 0 ? (
                                    <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--db-card-bg)', borderRadius: '16px', border: '1px solid var(--db-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                                            <Agents3DIcon size={72} />
                                        </div>
                                        <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--db-text)' }}>No AI Agents Deployed</h4>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--db-text-muted)', maxWidth: '280px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
                                            Deploy your first probability forecasting agent to start competing in tournaments!
                                        </p>
                                        <Link href="/" style={{
                                            display: 'inline-block',
                                            padding: '8px 20px',
                                            borderRadius: '12px',
                                            background: 'var(--accent-indigo)',
                                            color: '#fff',
                                            textDecoration: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                        }}>
                                            Go to Markets & Deploy
                                        </Link>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                        {forecasters.map((agent) => {
                                            const promptPct = (agent.prompts_used / agent.max_free_prompts) * 100;
                                            return (
                                                <div 
                                                    key={agent.id}
                                                    style={{
                                                        padding: '1.25rem',
                                                        borderRadius: '16px',
                                                        background: 'var(--db-card-bg)',
                                                        border: '1px solid var(--db-border)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    {/* Agent Header */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <Agents3DIcon size={20} />
                                                                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--db-text)' }}>{agent.name}</h4>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--db-text-muted)' }}>({agent.id.slice(0, 4)})</span>
                                                            </div>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--db-text-muted)' }}>Model: <strong style={{ color: 'var(--db-text)' }}>{agent.model}</strong></span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            {agent.status === 'active' && (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                                    background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)'
                                                                }}>
                                                                    <span className="live-pulsing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                                                    RUNNING
                                                                </span>
                                                            )}
                                                            {agent.status === 'paused' && (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                                    background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)'
                                                                }}>
                                                                    PAUSED
                                                                </span>
                                                            )}
                                                            {agent.status === 'terminated' && (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                                    background: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)'
                                                                }}>
                                                                    STOPPED
                                                                </span>
                                                            )}
                                                            {['exhausted', 'error'].includes(agent.status) && (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                                    background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)'
                                                                }}>
                                                                    {agent.status === 'error' ? 'STOPPED' : agent.status.toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* System Prompt / Target */}
                                                    {agent.system_prompt && (
                                                        <div style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--db-border)', color: 'var(--db-text-secondary)', fontStyle: 'italic' }}>
                                                            &ldquo;{agent.system_prompt.length > 120 ? agent.system_prompt.slice(0, 120) + '...' : agent.system_prompt}&rdquo;
                                                        </div>
                                                    )}

                                                    {/* Quota Progress */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--db-text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                                            <span>Quota Free Prompts</span>
                                                            <span>{agent.prompts_used} / {agent.max_free_prompts}</span>
                                                        </div>
                                                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--db-border)', overflow: 'hidden' }}>
                                                            <div style={{ 
                                                                height: '100%', 
                                                                width: `${Math.min(100, promptPct)}%`, 
                                                                background: promptPct >= 90 ? 'var(--accent-pink, #ec4899)' : 'var(--accent-indigo, #6366f1)',
                                                                borderRadius: 'inherit',
                                                                transition: 'width 0.3s ease'
                                                            }} />
                                                        </div>
                                                    </div>

                                                    {/* Competitions */}
                                                    {agent.competitions && agent.competitions.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--db-text-muted)', fontWeight: 600 }}>Enrolled Tournaments:</span>
                                                            {agent.competitions.map((comp) => (
                                                                <div key={comp.competition_id} style={{ 
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)',
                                                                    border: '1px solid var(--db-border)', fontSize: '0.75rem' 
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ textTransform: 'capitalize', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-indigo)', border: '1px solid rgba(99,102,241,0.15)' }}>{comp.sector || 'global'}</span>
                                                                        <span style={{ color: 'var(--db-text)', fontWeight: 500 }}>{comp.title || 'Competition'}</span>
                                                                    </div>
                                                                    <span style={{ 
                                                                        fontFamily: 'var(--font-mono)', 
                                                                        fontWeight: 600,
                                                                        color: comp.brier_score !== null ? '#10b981' : 'var(--db-text-muted)' 
                                                                    }}>
                                                                        {comp.brier_score !== null ? `Brier: ${comp.brier_score.toFixed(4)}` : 'Evaluating...'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--db-text-muted)', fontStyle: 'italic' }}>Not competing in any tournaments.</span>
                                                    )}

                                                    {/* On-Chain Stakes */}
                                                    {(() => {
                                                        const stakes = agent.pool_stakes || [];
                                                        if (stakes.length === 0) return null;
                                                        const bestStake = stakes.reduce((best: any, s: any) => {
                                                            if (!best) return s;
                                                            if (s.verified_onchain && !best.verified_onchain) return s;
                                                            if (!s.verified_onchain && best.verified_onchain) return best;
                                                            if (s.onchain_tx && !best.onchain_tx) return s;
                                                            if (!s.onchain_tx && best.onchain_tx) return best;
                                                            return Number(s.stake_amount) > Number(best.stake_amount) ? s : best;
                                                        }, null);
                                                        if (!bestStake) return null;
                                                        const isVerified = bestStake.verified_onchain || !!bestStake.onchain_tx;
                                                        return (
                                                            <div style={{
                                                                background: isVerified ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)',
                                                                border: `1px solid ${isVerified ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                                                                borderRadius: '8px', padding: '0.6rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                marginTop: '0.25rem'
                                                            }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{ fontSize: '0.6rem', color: isVerified ? '#10b981' : '#f59e0b', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        {isVerified ? '✅' : '🔗'} On-Chain Stake
                                                                        {isVerified && (
                                                                            <span style={{
                                                                                fontSize: '0.5rem', padding: '1px 4px',
                                                                                borderRadius: '3px', background: 'rgba(16,185,129,0.15)',
                                                                                color: '#10b981', fontWeight: 800,
                                                                            }}>VERIFIED</span>
                                                                        )}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--db-text)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                                                                        {Number(bestStake.stake_amount).toFixed(4)} SOL Staked
                                                                    </span>
                                                                </div>
                                                                {bestStake.onchain_tx ? (
                                                                    <a 
                                                                        href={`https://solscan.io/tx/${bestStake.onchain_tx}?cluster=devnet`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            fontSize: '0.65rem', color: '#10b981', textDecoration: 'none',
                                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                                            padding: '5px 10px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px',
                                                                            fontWeight: 600, border: '1px solid rgba(16,185,129,0.2)', transition: 'all 0.2s'
                                                                        }}
                                                                    >
                                                                        View Stake ↗
                                                                    </a>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.6rem', color: 'var(--db-text-muted)' }}>Pending On-Chain</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* On-Chain Claims */}
                                                    {agent.pool_winners && agent.pool_winners.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                            {agent.pool_winners.map((winner, idx) => {
                                                                const comp = agent.competitions?.find((c: any) => c.competition_id === winner.competition_id);
                                                                return (
                                                                    <div key={winner.id || idx} style={{
                                                                        background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 100%)', 
                                                                        border: '1px solid rgba(251,191,36,0.25)',
                                                                        borderRadius: '8px', padding: '0.6rem',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                        boxShadow: '0 2px 8px rgba(251,191,36,0.05)'
                                                                    }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                            <span style={{ fontSize: '0.6rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <span>{winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : winner.rank === 3 ? '🥉' : '🏆'}</span> PRIZE WON: {comp?.sector || 'COMPETITION'}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.78rem', color: 'var(--db-text)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                                                                +{Number(winner.prize_amount).toFixed(4)} SOL
                                                                            </span>
                                                                            {comp?.title && (
                                                                                <span style={{ fontSize: '0.6rem', color: 'var(--db-text-muted)', fontWeight: 500, marginTop: '1px' }}>
                                                                                    {comp.title}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        
                                                                        {winner.disburse_tx ? (
                                                                            <a 
                                                                                href={`https://solscan.io/tx/${winner.disburse_tx}?cluster=devnet`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                style={{
                                                                                    fontSize: '0.65rem', color: '#fbbf24', textDecoration: 'none',
                                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                                    padding: '5px 10px', background: 'rgba(251,191,36,0.12)', borderRadius: '6px',
                                                                                    fontWeight: 600, border: '1px solid rgba(251,191,36,0.2)', transition: 'all 0.2s'
                                                                                }}
                                                                            >
                                                                                View Payout TX ↗
                                                                            </a>
                                                                        ) : !winner.claimed && winner.id ? (
                                                                            <button 
                                                                                onClick={(e) => handleClaim(winner.id, e)}
                                                                                disabled={claimingId === winner.id}
                                                                                style={{
                                                                                    fontSize: '0.65rem', color: '#fff', textDecoration: 'none',
                                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                                    padding: '5px 12px', background: '#10b981', borderRadius: '6px',
                                                                                    fontWeight: 600, transition: 'all 0.2s', border: 'none', cursor: 'pointer',
                                                                                    boxShadow: '0 2px 6px rgba(16,185,129,0.2)'
                                                                                }}
                                                                            >
                                                                                {claimingId === winner.id ? 'Claiming...' : 'Claim Reward 💰'}
                                                                            </button>
                                                                        ) : null}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Latest Reasoning */}
                                                    {agent.latest_reasoning && (
                                                        <div style={{ 
                                                            padding: '8px 10px', borderRadius: '8px', 
                                                            background: 'rgba(0,0,0,0.05)', border: '1px solid var(--db-border)',
                                                            fontSize: '0.7rem', color: 'var(--db-text-muted)',
                                                            maxHeight: '60px', overflowY: 'auto'
                                                        }}>
                                                            <strong style={{ color: 'var(--db-text)' }}>Latest Reasoning: </strong>
                                                            {agent.latest_reasoning}
                                                        </div>
                                                    )}

                                                    {/* Action Controls */}
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        justifyContent: 'flex-end', 
                                                        gap: '0.5rem', 
                                                        marginTop: '0.5rem', 
                                                        paddingTop: '0.75rem', 
                                                        borderTop: '1px solid var(--db-border)' 
                                                    }}>
                                                        {agent.status === 'active' && (
                                                            <>
                                                                <button 
                                                                    onClick={() => pauseForecaster(agent.id)}
                                                                    style={{
                                                                        padding: '5px 12px', borderRadius: '8px',
                                                                        border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.1)',
                                                                        color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    ⏸ Pause
                                                                </button>
                                                                <button 
                                                                    onClick={() => stopForecaster(agent.id)}
                                                                    style={{
                                                                        padding: '5px 12px', borderRadius: '8px',
                                                                        border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)',
                                                                        color: '#ef4444', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    🛑 Stop
                                                                </button>
                                                            </>
                                                        )}
                                                        {agent.status === 'paused' && (
                                                            <>
                                                                <button 
                                                                    onClick={() => resumeForecaster(agent.id)}
                                                                    style={{
                                                                        padding: '5px 12px', borderRadius: '8px',
                                                                        border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.1)',
                                                                        color: '#10b981', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    ▶ Resume
                                                                </button>
                                                                <button 
                                                                    onClick={() => stopForecaster(agent.id)}
                                                                    style={{
                                                                        padding: '5px 12px', borderRadius: '8px',
                                                                        border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)',
                                                                        color: '#ef4444', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    🛑 Stop
                                                                </button>
                                                            </>
                                                        )}
                                                        {agent.status === 'terminated' && (
                                                            <button 
                                                                onClick={() => deleteForecaster(agent.id)}
                                                                style={{
                                                                    padding: '5px 12px', borderRadius: '8px',
                                                                    border: '1px solid var(--db-border)', background: 'rgba(148,163,184,0.06)',
                                                                    color: 'var(--db-text-muted)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                🗑 Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
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
                        )}
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
            <React.Suspense fallback={
                <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="circular-spinner" />
                    <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Loading...</div>
                </div>
            }>
                <PortfolioContent />
            </React.Suspense>
        </WalletProvider>
    );
}
