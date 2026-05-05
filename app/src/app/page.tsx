'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCompetitions } from '@/hooks/useCompetitions';
import { useOnChainMarket } from '@/hooks/useOnChainMarket';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const SectorFeed = dynamic(() => import('@/components/SectorFeed'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const AgentPosition = dynamic(() => import('@/components/AgentPosition'), { ssr: false });
const SentimentAnalysis = dynamic(() => import('@/components/SentimentAnalysis'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const DeployAgent = dynamic(() => import('@/components/DeployAgent'), { ssr: false });
const ValueCreationPool = dynamic(() => import('@/components/ValueCreationPool'), { ssr: false });
const Performance = dynamic(() => import('@/components/Performance'), { ssr: false });
const Leaderboard = dynamic(() => import('@/components/Leaderboard'), { ssr: false });
const CompetitionTimer = dynamic(() => import('@/components/CompetitionTimer'), { ssr: false });
const GlobalPoolWinners = dynamic(() => import('@/components/GlobalPoolWinners'), { ssr: false });

function HomeInner() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeSector, setActiveSector] = useState('top');
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);

  // Agent data for neural lines on curve
  const { publicKey } = useWallet();
  const {
    forecasters,
    pauseForecaster,
    resumeForecaster,
    stopForecaster,
  } = useRealtimeAgents(publicKey?.toString() || null);

  // Real competition data from backend + Supabase realtime
  const { competitions, activeCompetition: defaultActiveComp, loading: compLoading } = useCompetitions(activeSector);

  // Determine which competition to show the curve for
  const activeCompetition = selectedCompId 
      ? competitions.find(c => c.id === selectedCompId) || defaultActiveComp 
      : defaultActiveComp;

  // Market data for the active competition (probability history)
  const { probHistory } = useOnChainMarket(activeCompetition?.id);

  // Load theme from localStorage on mount
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

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Competition timing — from real data or defaults
  const competitionStart = activeCompetition
    ? Math.floor(new Date(activeCompetition.competition_start).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 3600;
  const competitionEnd = activeCompetition
    ? Math.floor(new Date(activeCompetition.competition_end).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + 7200;

  // Filter forecasters: show only agents enrolled in the active competition
  // OR enrolled in any competition within the currently viewed sector
  const filteredForecasters = forecasters.filter(f => {
    if (!f.competitions || f.competitions.length === 0) return false;
    return f.competitions.some((entry: any) =>
      entry.competition_id === activeCompetition?.id ||
      (entry.sector && activeSector !== 'top' && entry.sector.toLowerCase() === activeSector.toLowerCase())
    );
  });

  // Compute user level from agents count
  const agentCount = forecasters.length;
  const userLevel = agentCount >= 10 ? 5 : agentCount >= 7 ? 4 : agentCount >= 4 ? 3 : agentCount >= 2 ? 2 : agentCount >= 1 ? 1 : 0;
  const levelNames = ['Explorer', 'Analyst', 'Strategist', 'Architect', 'Oracle', 'Sovereign'];

  return (
    <>
      <Header 
        theme={theme} onToggleTheme={toggleTheme} 
        activeSector={activeSector} 
        onSectorChange={(s) => { setActiveSector(s); setSelectedCompId(null); }} 
      />
      <main className="main-container">
        {/* ═══ HERO BENTO — PredictaX/Nexa hybrid ═══ */}
        <div className="hero-bento animate-float">
            {/* Main hero card */}
            <div className="hero-bento__main">
                <div style={{ position: 'relative', zIndex: 1, padding: '1rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-secondary)', padding: '0.3rem 0.6rem', borderRadius: '20px', width: 'fit-content', border: '1px solid var(--border-glass)' }}>
                        <img 
                            src="/images/coin/solana.png" 
                            alt="Solana" 
                            style={{ width: '16px', height: '16px', filter: 'drop-shadow(0 0 8px rgba(20,241,149,0.4))' }} 
                        />
                        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Powered by Solana
                        </span>
                    </div>
                    <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '1rem' }}>
                        AI-Native <span style={{ background: 'var(--gradient-vibrant)', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }}>Probability<br/>Trading</span> Platform
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: '420px', fontWeight: 500 }}>
                        Deploy autonomous AI agents, predict real-world outcomes across <strong style={{ color: 'var(--sol-green)' }}>7 sectors</strong>, and earn from the Value Creation Pool.
                    </p>
                </div>
            </div>

            {/* Side stat card 1 — Trending Agents */}
            <div className="hero-bento__side animate-float stagger-1">
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    🔥 Trending Agents
                </div>
                {filteredForecasters.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {filteredForecasters.slice(0, 3).map((f, i) => (
                            <div key={f.id || i} style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.35rem 0.5rem', borderRadius: '10px',
                                background: i === 0 ? 'rgba(251,191,36,0.06)' : 'transparent',
                                border: `1px solid ${i === 0 ? 'rgba(251,191,36,0.12)' : 'var(--border-card)'}`,
                            }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '8px',
                                    background: `linear-gradient(135deg, hsl(${(i * 90 + 200) % 360}, 70%, 55%), hsl(${(i * 90 + 245) % 360}, 80%, 50%))`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 800, color: 'white', flexShrink: 0,
                                }}>
                                    {(f.name || 'AI')[0]}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {f.name || `Agent ${i + 1}`}
                                    </div>
                                    <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                        {f.status || 'active'}
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: i === 0 ? '#fbbf24' : 'var(--accent-indigo)' }}>
                                    #{i + 1}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.2rem', padding: '0.2rem' }}>
                        <div 
                            className="instruction-toggle"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} 
                            onClick={() => setIsInstructionsOpen(!isInstructionsOpen)}
                        >
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Ready to deploy? How to build:
                            </div>
                            <div className="instruction-chevron" style={{ fontSize: '0.8rem', color: 'var(--accent-indigo)', transform: isInstructionsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                ▼
                            </div>
                        </div>

                        <div className={`instruction-content ${isInstructionsOpen ? 'open' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                                <div style={{ background: 'var(--bg-secondary)', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-indigo)' }}>1</div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)' }}>Select a <strong>Category</strong> below</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                                <div style={{ background: 'var(--bg-secondary)', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-indigo)' }}>2</div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)' }}>
                                    <span className="desktop-text">Scroll down to <strong>Build AI Agent</strong></span>
                                    <span className="mobile-text">Tap <strong>DEPLOY AI</strong> on the right</span>
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                                <div style={{ background: 'var(--bg-secondary)', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-indigo)' }}>3</div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)' }}>Confirm &amp; <strong>Deploy</strong></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Side stat card 2 — Live Stats */}
            <div className="hero-bento__side animate-float stagger-2">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Markets', value: String(competitions.length || '—'), color: 'var(--sol-purple)' },
                        { label: 'AI Agents', value: String(forecasters.length || '—'), color: 'var(--sol-green)' },
                        { label: 'Network', value: 'Devnet', color: 'var(--accent-cyan)' },
                    ].map((stat) => (
                        <div key={stat.label} style={{
                            flex: 1, minWidth: '60px',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-card)',
                            borderRadius: '12px', padding: '0.6rem 0.5rem', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</div>
                            <div style={{ fontSize: '0.5rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>{stat.label}</div>
                        </div>
                    ))}
                </div>
                {/* User Level */}
                {publicKey && (
                    <div style={{
                        marginTop: '0.6rem', padding: '0.5rem',
                        borderRadius: '10px', background: 'rgba(153,69,255,0.04)',
                        border: '1px solid rgba(153,69,255,0.08)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '10px',
                            background: 'var(--gradient-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.85rem', flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(153,69,255,0.2)',
                        }}>
                            {['🌱', '📊', '🎯', '🏗️', '🔮', '👑'][userLevel]}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                Level {userLevel + 1} · {levelNames[userLevel]}
                            </div>
                            <div style={{ width: '100%', height: '3px', background: 'var(--border-glass)', borderRadius: '2px', marginTop: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (agentCount / 10) * 100)}%`, background: 'var(--gradient-primary)', borderRadius: '2px' }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Sector Navigation */}
        <SectorNav activeSector={activeSector} onSectorChange={(s) => { setActiveSector(s); setSelectedCompId(null); }} />

        {/* Live Probability Curve */}
        <ProbabilityCurve
          competition={activeCompetition}
          probHistory={probHistory}
          forecasters={filteredForecasters}
          onPauseAgent={pauseForecaster}
          onResumeAgent={resumeForecaster}
          onStopAgent={stopForecaster}
          onDeleteAgent={stopForecaster}
        />

        {/* Competition Timer — real data from backend */}
        <CompetitionTimer
          startTime={competitionStart}
          endTime={competitionEnd}
          label={activeCompetition?.title || 'Current Competition'}
        />

        {/* Sector Feed — Realtime Data */}
        <SectorFeed sector={activeSector} selectedCompId={activeCompetition?.id} onSelectCompetition={setSelectedCompId} />

        {/* Dashboard sections — always visible on homepage */}
        {/* AI Positions + NLP Sentiment */}
        <div className="grid-2">
          <AgentPosition />
          <SentimentAnalysis />
        </div>

        {/* Data Feeds + Deploy Agent */}
        <div style={{ display: 'grid', gridTemplateColumns: activeSector === 'top' ? '1fr' : '1fr 1fr', gap: '1rem' }}>
          <DataFeeds category={activeSector} />
          {activeSector !== 'top' && (
              <DeployAgent initialCategory={activeSector} />
          )}
        </div>

        {/* Global Pool & Champions + Value Pool + Leaderboard */}
        <div className="grid-3">
          <ValueCreationPool />
          <GlobalPoolWinners limit={4} />
          <Leaderboard />
        </div>

        {/* Performance Analytics */}
        <div className="performance-section" style={{ marginTop: '0.75rem' }}>
          <Performance />
        </div>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <WalletProvider>
      <HomeInner />
    </WalletProvider>
  );
}
