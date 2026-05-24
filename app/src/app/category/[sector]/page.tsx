'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { useOnChainMarket } from '@/hooks/useOnChainMarket';
import { useClusterData } from '@/hooks/useClusterData';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useAgentPredictions } from '@/hooks/useAgentPredictions';
import { apiFetch } from '@/lib/supabase';
import CompetitionPoolWinners from '@/components/CompetitionPoolWinners';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const CompetitionTimer = dynamic(() => import('@/components/CompetitionTimer'), { ssr: false });
const CompetitionLeaderboard = dynamic(() => import('@/components/CompetitionLeaderboard'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const DeployAgent = dynamic(() => import('@/components/DeployAgent'), { ssr: false });
const SentimentAnalysis = dynamic(() => import('@/components/SentimentAnalysis'), { ssr: false });
const ValueCreationPool = dynamic(() => import('@/components/ValueCreationPool'), { ssr: false });
const Leaderboard = dynamic(() => import('@/components/Leaderboard'), { ssr: false });
const CategoryPoolWinners = dynamic(() => import('@/components/CategoryPoolWinners'), { ssr: false });

// ── Allowed sectors (anti-injection allowlist) ──────────────────
const VALID_SECTORS = ['politics', 'finance', 'tech', 'crypto', 'sports', 'economy', 'science'] as const;
type ValidSector = typeof VALID_SECTORS[number];

function isValidSector(s: string): s is ValidSector {
    return VALID_SECTORS.includes(s as ValidSector);
}

const SECTOR_META: Record<string, { label: string; icon: string; color: string; description: string }> = {
    politics: { label: 'Politics', icon: '🏛️', color: '#818cf8', description: 'Political events, regulatory decisions, and government policy predictions' },
    finance: { label: 'Finance', icon: '📈', color: '#10b981', description: 'Financial markets, earnings, interest rates, and economic indicators' },
    crypto: { label: 'Crypto', icon: '₿', color: '#f59e0b', description: 'Cryptocurrency markets, trending crypto news, DeFi protocols, and blockchain events' },
    tech: { label: 'Technology', icon: '💻', color: '#6366f1', description: 'Tech industry events, product launches, and innovation milestones' },
    economy: { label: 'Economy', icon: '🌍', color: '#14b8a6', description: 'Macroeconomic indicators, GDP, inflation, and trade data' },
    science: { label: 'Science', icon: '🔬', color: '#8b5cf6', description: 'Scientific breakthroughs, clinical trials, and research milestones' },
    sports: { label: 'Sports', icon: '⚽', color: '#ef4444', description: 'Sports match outcomes, tournament predictions, and player performance' },
};

function getCompetitionStatus(comp: Competition): 'live' | 'upcoming' | 'ended' {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now >= start && now <= end) return 'live';
    if (now < start) return 'upcoming';
    return 'ended';
}

function getHorizonLabel(comp: Competition): string {
    const end = new Date(comp.competition_end).getTime();
    const now = Date.now();
    const hours = Math.max(0, (end - now) / (1000 * 60 * 60));
    if (hours <= 2) return '2H';
    if (hours <= 7) return '7H';
    if (hours <= 12) return '12H';
    return '24H';
}

function getTimeRemaining(comp: Competition): string {
    const now = Date.now();
    const status = getCompetitionStatus(comp);
    if (status === 'ended') return 'Finished';
    const target = status === 'upcoming'
        ? new Date(comp.competition_start).getTime()
        : new Date(comp.competition_end).getTime();
    const diff = target - now;
    if (diff <= 0) return status === 'upcoming' ? 'Starting...' : 'Settling...';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function getProgressPct(comp: Competition): number {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
}

function getStatusConfig(status: 'live' | 'upcoming' | 'ended') {
    switch (status) {
        case 'live': return { label: '● LIVE', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
        case 'upcoming': return { label: '⏳ UPCOMING', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
        case 'ended': return { label: '✓ ENDED', bg: 'rgba(107,115,148,0.15)', color: '#6b7394' };
    }
}

function CategoryPageInner({ sector, meta }: { sector: string, meta: any }) {
    const router = useRouter();
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('exoduze_theme');
        if (saved === 'light' || saved === 'dark') {
            setTheme(saved);
        }
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('exoduze_theme', theme);
    }, [theme]);
    const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardLastUpdated, setLeaderboardLastUpdated] = useState<Date | null>(null);

    // Restore selected competition from homepage/feed on mount
    useEffect(() => {
        const stored = localStorage.getItem('selected_competition_id');
        if (stored) {
            setSelectedCompId(stored);
            localStorage.removeItem('selected_competition_id');
        }
    }, []);

    // Agent data for neural lines on curve
    const { publicKey } = useWallet();
    const {
        forecasters,
        pauseForecaster,
        resumeForecaster,
        stopForecaster,
    } = useRealtimeAgents(publicKey?.toString() || null);

    // Fetch competitions for this sector
    const { competitions, loading: compLoading, connected } = useCompetitions(sector);

    // Sort: live first, then upcoming, then ended, prioritizing competitions with active AI agents (highest entry count)
    const sorted = useMemo(() => {
        const now = Date.now();
        return [...competitions]
            // Filter out ended competitions — they get auto-replaced by the backend
            .filter(c => {
                const end = new Date(c.competition_end).getTime();
                return end > now; // Only show competitions that haven't expired
            })
            .sort((a, b) => {
                const order = { live: 0, upcoming: 1, ended: 2 };
                const diff = order[getCompetitionStatus(a)] - order[getCompetitionStatus(b)];
                if (diff !== 0) return diff;

                // Prioritize competitions with active competing AI agents (entry_count)
                const entryDiff = (b.entry_count || 0) - (a.entry_count || 0);
                if (entryDiff !== 0) return entryDiff;

                return new Date(a.competition_start).getTime() - new Date(b.competition_start).getTime();
            });
    }, [competitions]);

    // Active competition for curve
    const activeComp = selectedCompId
        ? competitions.find((c) => c.id === selectedCompId) || sorted[0]
        : sorted[0];

    // Fetch competitors for the active competition to render on the curve
    useEffect(() => {
        if (!activeComp?.id) return;
        let cancelled = false;
        setLeaderboardLoading(true);

        const fetchCompetitors = async () => {
            try {
                const res = await apiFetch<any[]>(`/agents/competitors?competition_id=${activeComp.id}&limit=50`);
                if (!cancelled && res) {
                    setCompetitors(res);
                    setLeaderboardLastUpdated(new Date());
                }
            } catch (err) {
                console.error('Failed to fetch competitors:', err);
            } finally {
                if (!cancelled) setLeaderboardLoading(false);
            }
        };

        fetchCompetitors();
        // Auto-refresh every 30s so users see new agents joining in near-real-time
        const interval = setInterval(fetchCompetitors, 30_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [activeComp?.id]);


    // Real-time data for selected competition
    const { probHistory } = useOnChainMarket(activeComp?.id);
    const { clusters, connected: clusterConnected } = useClusterData(activeComp?.id);
    const { feeds, connected: feedConnected } = useLiveFeed(15, sector);

    // Real-time agent predictions for the active competition
    const { predictionsByAgent, allPredictions } = useAgentPredictions(activeComp?.id);

    // Build a Map<agentId, AgentPrediction[]> for ProbabilityCurve
    const agentPredictionsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const [agentId, group] of predictionsByAgent) {
            map.set(agentId, group.predictions);
        }
        return map;
    }, [predictionsByAgent]);

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    const competitionStart = activeComp
        ? Math.floor(new Date(activeComp.competition_start).getTime() / 1000) : Math.floor(Date.now() / 1000) - 3600;
    const competitionEnd = activeComp
        ? Math.floor(new Date(activeComp.competition_end).getTime() / 1000) : Math.floor(Date.now() / 1000) + 7200;

    return (
        <>
            <Header
                theme={theme} onToggleTheme={toggleTheme}
                activeSector={sector}
            />
            <main className="main-container">
                {/* SectorNav — Polymarket-style pill navigation for category switching */}
                <SectorNav activeSector={sector} onSectorChange={() => {}} />

                {/* Sector Title — compact */}
                <div className="glass-card" style={{
                    padding: '0.75rem 1.25rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '0.4rem',
                }}>
                    <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{meta.icon}</span> {meta.label}
                    </h1>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {liveCount > 0 && (
                            <span style={{
                                fontSize: '0.6rem', fontWeight: 600, padding: '3px 10px',
                                borderRadius: 'var(--radius-round)',
                                background: 'rgba(16,185,129,0.15)', color: '#10b981',
                                animation: 'pulse 2s infinite',
                            }}>
                                {liveCount} LIVE
                            </span>
                        )}
                        <span style={{
                            fontSize: '0.55rem', fontWeight: 500, padding: '3px 8px',
                            borderRadius: 'var(--radius-round)',
                            background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                            color: connected ? '#10b981' : '#f59e0b',
                        }}>
                            {connected ? '● Connected' : '○ Connecting...'}
                        </span>
                    </div>
                </div>

                {/* Probability Curve for Selected Competition */}
                <ProbabilityCurve
                    competition={activeComp}
                    probHistory={probHistory}
                    forecasters={[
                        ...forecasters.filter(f => {
                            if (!f.competitions || f.competitions.length === 0) return false;
                            // Show agent ONLY if it's enrolled in the selected competition
                            return f.competitions.some((entry: any) =>
                                entry.competition_id === activeComp?.id
                            );
                        }),
                        // Map competitors to match ForecasterAgent shape, excluding user's own agents
                        // PERFORMANCE LIMIT: Only render top 7 agents in the canvas to prevent browser lockup
                        ...competitors
                            .slice(0, 7)
                            .filter(c => !forecasters.find(f => f.id === c.agent_id))
                            .map(c => ({
                                id: c.agent_id,
                                name: c.agent_name,
                                user_id: '',
                                system_prompt: '',
                                status: c.agent_status || 'active',
                                model: c.model || 'Competitor',
                                prompts_used: 0,
                                max_free_prompts: 7,
                                created_at: c.deployed_at || new Date().toISOString(),
                                updated_at: c.deployed_at || new Date().toISOString(),
                                competitions: [],
                                isExternal: true,
                            }))
                    ] as any[]}
                    onPauseAgent={pauseForecaster}
                    onResumeAgent={resumeForecaster}
                    onStopAgent={stopForecaster}
                    onDeleteAgent={stopForecaster}
                    agentPredictions={agentPredictionsMap}
                />

                {/* Competition Timer */}
                {activeComp && (
                    <CompetitionTimer
                        startTime={competitionStart}
                        endTime={competitionEnd}
                        label={activeComp.title}
                    />
                )}

                {/* Competition Leaderboard — realtime */}
                <CompetitionLeaderboard
                    competitionId={activeComp?.id}
                    competitionTitle={activeComp?.title}
                    sector={sector}
                    competitors={competitors}
                    loading={leaderboardLoading}
                    lastUpdated={leaderboardLastUpdated}
                    agentPredictions={agentPredictionsMap}
                    probHistory={probHistory}
                    minPredictions={activeComp?.min_predictions}
                />

                {/* Global Leaderboard (Desktop & Mobile) */}
                <div style={{ marginBottom: '1.5rem', marginTop: '1rem' }}>
                    <Leaderboard sector={sector} limit={10} />
                </div>

                {/* Competitions Grid */}
                <section className="glass-card card-body animate-in">
                    <div className="section-header">
                        <h3 className="section-title">
                            <span className="icon">🏆</span>
                            Active Competitions ({sorted.length})
                        </h3>
                        {liveCount > 0 && (
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px',
                                borderRadius: 'var(--radius-round)',
                                background: 'rgba(16,185,129,0.15)', color: '#10b981',
                            }}>
                                {liveCount} live now
                            </span>
                        )}
                    </div>

                    {compLoading && sorted.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            Loading competitions...
                        </div>
                    )}

                    {!compLoading && sorted.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            No competitions yet for {meta.label}. They will be auto-created from live data feeds.
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                        {sorted.map((comp) => {
                            const status = getCompetitionStatus(comp);
                            const statusCfg = getStatusConfig(status);
                            const horizon = getHorizonLabel(comp);
                            const timeLeft = getTimeRemaining(comp);
                            const progress = getProgressPct(comp);
                            const isSelected = comp.id === activeComp?.id;
                            const probLabels = comp.outcomes || ['Yes', 'No'];
                            const probs = comp.probabilities || [5000, 5000];

                            return (
                                <article
                                    key={comp.id}
                                    className="feed-card animate-in"
                                    onClick={() => setSelectedCompId(comp.id)}
                                    style={{
                                        cursor: 'pointer',
                                        border: isSelected ? `2px solid ${meta.color}` : '1px solid rgba(99,102,241,0.15)',
                                        boxShadow: isSelected ? `0 0 20px ${meta.color}20` : 'none',
                                        transform: isSelected ? 'scale(1.02)' : 'none',
                                        transition: 'all 0.2s ease',
                                        opacity: status === 'ended' ? 0.65 : 1,
                                    }}
                                >
                                    <div className="feed-card__content">
                                        {/* Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.45rem', fontWeight: 800, padding: '2px 6px',
                                                    borderRadius: 'var(--radius-round)',
                                                    background: `${meta.color}15`, color: meta.color,
                                                }}>
                                                    {horizon}
                                                </span>
                                                {isSelected && (
                                                    <span style={{
                                                        fontSize: '0.45rem', fontWeight: 700, padding: '2px 6px',
                                                        borderRadius: 'var(--radius-round)',
                                                        background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                                                    }}>
                                                        📊 Viewing Curve
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{
                                                fontSize: '0.5rem', fontWeight: 700, padding: '2px 8px',
                                                borderRadius: 'var(--radius-round)',
                                                background: statusCfg.bg, color: statusCfg.color,
                                                animation: status === 'live' ? 'pulse 2s infinite' : 'none',
                                            }}>
                                                {statusCfg.label}
                                            </span>
                                        </div>

                                        {/* Title */}
                                        <h3 className="feed-card__title" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                                            {comp.title}
                                        </h3>
                                        {comp.description && (
                                            <p className="feed-card__desc" style={{ fontSize: '0.6rem', marginBottom: '0.35rem' }}>
                                                {comp.description}
                                            </p>
                                        )}

                                        {/* Progress bar */}
                                        {status === 'live' && (
                                            <div style={{ margin: '0.3rem 0', height: '3px', borderRadius: '2px', background: 'rgba(99,102,241,0.08)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', width: `${progress}%`, borderRadius: '2px',
                                                    background: `linear-gradient(90deg, ${meta.color}, ${meta.color}99)`,
                                                    transition: 'width 1s ease',
                                                }} />
                                            </div>
                                        )}

                                        {/* Probabilities */}
                                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            {probLabels.map((label, i) => (
                                                <div key={i} style={{
                                                    flex: 1, minWidth: 60, textAlign: 'center', padding: '0.25rem 0.3rem',
                                                    borderRadius: 'var(--radius-xs)',
                                                    background: 'var(--gradient-card)', border: '1px solid var(--border-card)',
                                                }}>
                                                    <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
                                                    <div style={{
                                                        fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)',
                                                        color: i === 0 ? '#818cf8' : i === 1 ? '#f59e0b' : '#ef4444',
                                                    }}>
                                                        {((probs[i] || 0) / 100).toFixed(1)}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Footer */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.55rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                💰 {comp.prize_pool || 0} SOL · 👥 {comp.entry_count || 0}/{comp.max_entries || 100}
                                            </span>
                                            <span style={{
                                                fontWeight: 700,
                                                color: status === 'live' ? '#10b981' : status === 'upcoming' ? '#f59e0b' : '#6b7394',
                                            }}>
                                                {status === 'live' ? `⏱ ${timeLeft}` : status === 'upcoming' ? `Starts ${timeLeft}` : '✓ Ended'}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                {/* Cluster Data Panel + Live Feed */}
                <div className="grid-2">
                    {/* Real-time Cluster Data */}
                    <div className="glass-card card-body animate-in">
                        <div className="section-header">
                            <h3 className="section-title">
                                <span className="icon">🧬</span> Cluster Data
                            </h3>
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px',
                                borderRadius: 'var(--radius-round)',
                                background: clusterConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                color: clusterConnected ? '#10b981' : '#f59e0b',
                            }}>
                                {clusterConnected ? '● Live' : '○ Connecting'}
                            </span>
                        </div>

                        {!activeComp && (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                Select a competition to view cluster data
                            </div>
                        )}

                        {activeComp && clusters.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                No cluster data yet. Waiting for ETL pipeline to process news...
                            </div>
                        )}

                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {clusters.map((cluster, i) => (
                                <div key={cluster.id || i} style={{
                                    padding: '0.5rem',
                                    borderRadius: 'var(--radius-xs)',
                                    background: i === 0 ? `${meta.color}08` : 'transparent',
                                    border: i === 0 ? `1px solid ${meta.color}20` : '1px solid transparent',
                                    marginBottom: '0.4rem',
                                    transition: 'background 0.3s',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            📰 Cluster #{clusters.length - i}
                                        </span>
                                        <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                                            {new Date(cluster.created_at).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                        {cluster.article_urls?.length || 0} articles ·
                                        {cluster.signals?.length || 0} signals ·
                                        Sentiment: <span style={{ color: cluster.sentiment > 0 ? '#10b981' : cluster.sentiment < 0 ? '#ef4444' : '#6b7394' }}>
                                            {cluster.sentiment > 0 ? '📈' : cluster.sentiment < 0 ? '📉' : '➖'} {(cluster.sentiment * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    {cluster.article_urls && cluster.article_urls.length > 0 && (
                                        <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'var(--font-mono)' }}>
                                            {cluster.cluster_hash?.substring(0, 16)}...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live Data Feed */}
                    <div className="glass-card card-body animate-in" style={{ overflow: 'hidden', minWidth: 0 }}>
                        <div className="section-header">
                            <h3 className="section-title">
                                <span className="icon">📡</span> Live Feed — {meta.label}
                            </h3>
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px',
                                borderRadius: 'var(--radius-round)',
                                background: feedConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                color: feedConnected ? '#10b981' : '#f59e0b',
                            }}>
                                {feedConnected ? '● Live' : '○ Connecting'}
                            </span>
                        </div>

                        {feeds.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                No feed data for {meta.label} yet.
                            </div>
                        )}

                        <div className="marquee-container" style={{ overflow: 'hidden', position: 'relative', width: '100%', maxWidth: '100%', padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Fade overlays for the edges */}
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '100%', background: 'linear-gradient(to right, var(--bg-card), transparent)', zIndex: 2, pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '100%', background: 'linear-gradient(to left, var(--bg-card), transparent)', zIndex: 2, pointerEvents: 'none' }} />

                            {/* Row 1 (Moves Right) */}
                            <div className="marquee-row right" style={{ display: 'flex', width: 'max-content' }}>
                                {[0, 1].map((setIndex) => (
                                    <div key={`set1-${setIndex}-cat`} style={{ display: 'flex', gap: '1rem', paddingRight: '1rem' }}>
                                        {feeds.filter((_, i) => i % 3 === 0).map((item: LiveFeedItem, idx) => (
                                            <a
                                                key={`${item.id}-${idx}-cat-row1`} href={item.url || '#'} target={item.url ? "_blank" : "_self"} rel="noopener noreferrer"
                                                className={`feed-item ${item.impact}`}
                                                style={{
                                                    textDecoration: 'none', color: 'inherit', display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem',
                                                    alignItems: 'center', transition: 'all 0.3s ease', cursor: item.url ? 'pointer' : 'default',
                                                    border: '1px solid var(--border-glass)', borderRadius: '12px', background: 'var(--bg-input)',
                                                    width: '280px', flexShrink: 0
                                                }}
                                            >
                                                {item.image_url ? (
                                                    <div className="feed-item-image-wrapper" style={{ width: '40px', height: '40px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-glass)' }}>
                                                        <img src={item.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="hover-zoom" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                                    </div>
                                                ) : (
                                                    <span className="feed-icon" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', borderRadius: '10px', fontSize: '1.2rem', border: '1px solid var(--border-glass)', flexShrink: 0 }}>{item.icon}</span>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="feed-source" style={{ fontWeight: 700, fontSize: '0.65rem', marginBottom: '2px', color: 'var(--text-secondary)' }}>{item.source} {item.url && <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>🔗</span>}</div>
                                                    <div className="feed-text" style={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
                                                </div>
                                                <span className={`feed-impact ${item.impact}`} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0 }}>{item.impact.toUpperCase()}</span>
                                            </a>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* Row 2 (Moves Left) */}
                            <div className="marquee-row left" style={{ display: 'flex', width: 'max-content' }}>
                                {[0, 1].map((setIndex) => (
                                    <div key={`set2-${setIndex}-cat`} style={{ display: 'flex', gap: '1rem', paddingRight: '1rem' }}>
                                        {feeds.filter((_, i) => i % 3 === 1).map((item: LiveFeedItem, idx) => (
                                            <a
                                                key={`${item.id}-${idx}-cat-row2`} href={item.url || '#'} target={item.url ? "_blank" : "_self"} rel="noopener noreferrer"
                                                className={`feed-item ${item.impact}`}
                                                style={{
                                                    textDecoration: 'none', color: 'inherit', display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem',
                                                    alignItems: 'center', transition: 'all 0.3s ease', cursor: item.url ? 'pointer' : 'default',
                                                    border: '1px solid var(--border-glass)', borderRadius: '12px', background: 'var(--bg-input)',
                                                    width: '280px', flexShrink: 0
                                                }}
                                            >
                                                {item.image_url ? (
                                                    <div className="feed-item-image-wrapper" style={{ width: '40px', height: '40px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-glass)' }}>
                                                        <img src={item.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="hover-zoom" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                                    </div>
                                                ) : (
                                                    <span className="feed-icon" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', borderRadius: '10px', fontSize: '1.2rem', border: '1px solid var(--border-glass)', flexShrink: 0 }}>{item.icon}</span>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="feed-source" style={{ fontWeight: 700, fontSize: '0.65rem', marginBottom: '2px', color: 'var(--text-secondary)' }}>{item.source} {item.url && <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>🔗</span>}</div>
                                                    <div className="feed-text" style={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
                                                </div>
                                                <span className={`feed-impact ${item.impact}`} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0 }}>{item.impact.toUpperCase()}</span>
                                            </a>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* Row 3 (Moves Right) */}
                            <div className="marquee-row right" style={{ display: 'flex', width: 'max-content' }}>
                                {[0, 1].map((setIndex) => (
                                    <div key={`set3-${setIndex}-cat`} style={{ display: 'flex', gap: '1rem', paddingRight: '1rem' }}>
                                        {feeds.filter((_, i) => i % 3 === 2).map((item: LiveFeedItem, idx) => (
                                            <a
                                                key={`${item.id}-${idx}-cat-row3`} href={item.url || '#'} target={item.url ? "_blank" : "_self"} rel="noopener noreferrer"
                                                className={`feed-item ${item.impact}`}
                                                style={{
                                                    textDecoration: 'none', color: 'inherit', display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem',
                                                    alignItems: 'center', transition: 'all 0.3s ease', cursor: item.url ? 'pointer' : 'default',
                                                    border: '1px solid var(--border-glass)', borderRadius: '12px', background: 'var(--bg-input)',
                                                    width: '280px', flexShrink: 0
                                                }}
                                            >
                                                {item.image_url ? (
                                                    <div className="feed-item-image-wrapper" style={{ width: '40px', height: '40px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-glass)' }}>
                                                        <img src={item.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="hover-zoom" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                                    </div>
                                                ) : (
                                                    <span className="feed-icon" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', borderRadius: '10px', fontSize: '1.2rem', border: '1px solid var(--border-glass)', flexShrink: 0 }}>{item.icon}</span>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="feed-source" style={{ fontWeight: 700, fontSize: '0.65rem', marginBottom: '2px', color: 'var(--text-secondary)' }}>{item.source} {item.url && <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>🔗</span>}</div>
                                                    <div className="feed-text" style={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
                                                </div>
                                                <span className={`feed-impact ${item.impact}`} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0 }}>{item.impact.toUpperCase()}</span>
                                            </a>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Layout (Masonry 2-Column) */}
                <div className="grid-2" style={{ gap: '1rem' }}>
                    {/* LEFT COLUMN */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <SentimentAnalysis competitionId={activeComp?.id} />
                        {activeComp ? (
                            <CompetitionPoolWinners competitionId={activeComp.id} sector={sector} />
                        ) : (
                            <CategoryPoolWinners sector={sector} />
                        )}
                    </div>

                    {/* RIGHT COLUMN — desktop only inline deploy panel */}
                    <div className="deploy-desktop-column">
                        <DeployAgent initialCategory={sector} />
                    </div>
                </div>

                {/* FULL-WIDTH FOOTER SECTION */}
                <div style={{ marginTop: '1rem' }}>
                    <ValueCreationPool sector={sector} />
                </div>
            </main>

            {/* DeployAgent mobile toggle/drawer — rendered at root level so
                position:fixed works even when deploy-desktop-column is hidden */}
            <div className="deploy-mobile-root">
                <DeployAgent initialCategory={sector} />
            </div>
        </>
    );
}

export default function CategoryPage() {
    const params = useParams();
    const sector = (params.sector as string) || 'finance';

    // ── Security: validate sector against allowlist ──
    if (!isValidSector(sector)) {
        notFound();
    }

    const meta = SECTOR_META[sector] || SECTOR_META.finance;

    return (
        <WalletProvider>
            <CategoryPageInner sector={sector} meta={meta} />
        </WalletProvider>
    );
}
