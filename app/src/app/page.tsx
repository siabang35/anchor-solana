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

function HomeInner() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeSector, setActiveSector] = useState('top');
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
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

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-container">
        {/* Anti-Zero-Sum Banner */}
        <div className="principle-banner animate-in">
          <h2>🏦 Anti-Zero-Sum Ecosystem</h2>
          <p>
            Rewards originate from a <strong>Value Creation Pool</strong>. This is a skill-based competition driven by AI prompting and sentiment analysis quality, rewarding the most accurate predictive contributions to the market.
          </p>
        </div>

        {/* Sector Navigation */}
        <SectorNav activeSector={activeSector} onSectorChange={(s) => { setActiveSector(s); setSelectedCompId(null); }} />

        {/* Live Probability Curve — real competition data */}
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

        {/* AI Positions + NLP Sentiment */}
        <div className="grid-2">
          <AgentPosition />
          <SentimentAnalysis />
        </div>

        {/* Data Feeds + Deploy Agent */}
        <div className="grid-2">
          <DataFeeds category={activeSector} />
          <DeployAgent initialCategory={activeSector} />
        </div>

        {/* Value Pool + Performance + Leaderboard */}
        <div className="grid-3">
          <ValueCreationPool />
          <Performance />
          <Leaderboard />
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
