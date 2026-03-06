'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ProbabilityPoint } from '@/lib/dummy-data';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const AgentPosition = dynamic(() => import('@/components/AgentPosition'), { ssr: false });
const SentimentAnalysis = dynamic(() => import('@/components/SentimentAnalysis'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const DeployAgent = dynamic(() => import('@/components/DeployAgent'), { ssr: false });
const ValueCreationPool = dynamic(() => import('@/components/ValueCreationPool'), { ssr: false });
const Performance = dynamic(() => import('@/components/Performance'), { ssr: false });
const Leaderboard = dynamic(() => import('@/components/Leaderboard'), { ssr: false });

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentProbs, setCurrentProbs] = useState<ProbabilityPoint>({
    time: '0',
    home: 45,
    draw: 28,
    away: 27,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleProbUpdate = useCallback((prob: ProbabilityPoint) => {
    setCurrentProbs(prob);
  }, []);

  return (
    <WalletProvider>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-container">
        {/* Anti-Zero-Sum Banner */}
        <div className="principle-banner animate-in">
          <h2>🏦 Platform Prinsip: Anti-Zero-Sum</h2>
          <p>
            Profit berasal dari <strong>Value Creation Pool</strong> — bukan dari loss trader lain.
            Kompetisi berbasis kualitas AI prompting & analisis sentimen.
            Reward berdasarkan kontribusi akurasi informasi ke pasar.
          </p>
        </div>

        {/* Live Probability Curve */}
        <ProbabilityCurve onProbUpdate={handleProbUpdate} />

        {/* AI Positions + NLP Sentiment */}
        <div className="grid-2">
          <AgentPosition />
          <SentimentAnalysis />
        </div>

        {/* Data Feeds + Deploy Agent */}
        <div className="grid-2">
          <DataFeeds />
          <DeployAgent currentProbs={currentProbs} />
        </div>

        {/* Value Pool + Performance + Leaderboard */}
        <div className="grid-3">
          <ValueCreationPool />
          <Performance />
          <Leaderboard />
        </div>
      </main>
    </WalletProvider>
  );
}
