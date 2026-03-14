'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { useOnChainMarket } from '@/hooks/useOnChainMarket';
import { useClusterData } from '@/hooks/useClusterData';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { apiFetch } from '@/lib/supabase';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const CompetitionTimer = dynamic(() => import('@/components/CompetitionTimer'), { ssr: false });
const CompetitionLeaderboard = dynamic(() => import('@/components/CompetitionLeaderboard'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const DeployAgent = dynamic(() => import('@/components/DeployAgent'), { ssr: false });
const SentimentAnalysis = dynamic(() => import('@/components/SentimentAnalysis'), { ssr: false });

const SECTOR_META: Record<string, { label: string; icon: string; color: string; description: string }> = {
    politics: { label: 'Politics', icon: '🏛️', color: '#818cf8', description: 'Political events, regulatory decisions, and government policy predictions' },
    finance: { label: 'Finance', icon: '📈', color: '#10b981', description: 'Financial markets, earnings, interest rates, and economic indicators' },
    crypto: { label: 'Crypto', icon: '₿', color: '#f59e0b', description: 'Cryptocurrency markets, DeFi protocols, and blockchain events' },
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
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours <= 2) return '2H';
    if (hours <= 7) return '7H';
    if (hours <= 12) return '12H';
    if (hours <= 24) return '24H';
    if (hours <= 72) return '3D';
    return '7D';
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
    const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardLastUpdated, setLeaderboardLastUpdated] = useState<Date | null>(null);

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

    // Sort: live first, then upcoming, then ended
    const sorted = useMemo(() => [...competitions].sort((a, b) => {
        const order = { live: 0, upcoming: 1, ended: 2 };
        const diff = order[getCompetitionStatus(a)] - order[getCompetitionStatus(b)];
        if (diff !== 0) return diff;
        return new Date(a.competition_start).getTime() - new Date(b.competition_start).getTime();
    }), [competitions]);

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
            <Header theme={theme} onToggleTheme={toggleTheme} />
            <main className="main-container">
                {/* Category Hero Header */}
                <div className="glass-card card-body animate-in" style={{
                    borderLeft: `4px solid ${meta.color}`,
                    marginBottom: '0.5rem',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                <button
                                    onClick={() => router.push('/')}
                                    style={{
                                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                        borderRadius: 'var(--radius-round)', padding: '0.2rem 0.5rem',
                                        color: 'var(--accent-indigo)', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    ← Dashboard
                                </button>
                                <span style={{ fontSize: '1.5rem' }}>{meta.icon}</span>
                                <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                                    {meta.label}
                                </h1>
                            </div>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, maxWidth: '500px' }}>
                                {meta.description}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            {liveCount > 0 && (
                                <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, padding: '3px 10px',
                                    borderRadius: 'var(--radius-round)',
                                    background: 'rgba(16,185,129,0.15)', color: '#10b981',
                                    animation: 'pulse 2s infinite',
                                }}>
                                    {liveCount} LIVE
                                </span>
                            )}
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 600, padding: '3px 8px',
                                borderRadius: 'var(--radius-round)',
                                background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                color: connected ? '#10b981' : '#f59e0b',
                            }}>
                                {connected ? '● Connected' : '○ Connecting...'}
                            </span>
                        </div>
                    </div>

                    {/* Category Navigation */}
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        {Object.entries(SECTOR_META).map(([id, m]) => (
                            <button
                                key={id}
                                onClick={() => router.push(`/category/${id}`)}
                                style={{
                                    padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-round)',
                                    border: id === sector ? `2px solid ${m.color}` : '1px solid var(--border-card)',
                                    background: id === sector ? `${m.color}15` : 'transparent',
                                    color: id === sector ? m.color : 'var(--text-muted)',
                                    fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {m.icon} {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Probability Curve for Selected Competition */}
                <ProbabilityCurve
                    competition={activeComp}
                    probHistory={probHistory}
                    forecasters={[
                        ...forecasters.filter(f => {
                            if (!f.competitions || f.competitions.length === 0) return false;
                            // Show agent if it's enrolled in the selected competition
                            // OR if it's enrolled in any competition within the same sector
                            return f.competitions.some((entry: any) =>
                                entry.competition_id === activeComp?.id ||
                                (entry.sector && entry.sector.toLowerCase() === sector.toLowerCase())
                            );
                        }),
                        // Map competitors to match ForecasterAgent shape, excluding user's own agents
                        ...competitors
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
                />

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
                    <div className="glass-card card-body animate-in">
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

                        <div className="feed-scroll" style={{ maxHeight: '300px' }}>
                            {feeds.map((item: LiveFeedItem) => (
                                <a 
                                    key={item.id} 
                                    href={item.url || '#'} 
                                    target={item.url ? "_blank" : "_self"} 
                                    rel="noopener noreferrer"
                                    className={`feed-item ${item.impact}`}
                                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', cursor: item.url ? 'pointer' : 'default' }}
                                >
                                    <span className="feed-icon">{item.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div className="feed-source">{item.source} {item.url && <span style={{fontSize: '0.5rem', opacity: 0.5}}>🔗</span>}</div>
                                        <div className="feed-text">{item.text}</div>
                                    </div>
                                    <span className={`feed-impact ${item.impact}`}>{item.impact.toUpperCase()}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* AI Agent Deploy + Sentiment */}
                <div className="grid-2">
                    <SentimentAnalysis />
                    <DeployAgent initialCategory={sector} />
                </div>
            </main>
        </>
    );
}

export default function CategoryPage() {
    const params = useParams();
    const sector = (params.sector as string) || 'finance';
    const meta = SECTOR_META[sector] || SECTOR_META.finance;

    return (
        <WalletProvider>
            <CategoryPageInner sector={sector} meta={meta} />
        </WalletProvider>
    );
}
