'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const SectorFeed = dynamic(() => import('@/components/SectorFeed'), { ssr: false });

function LatestInner() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('exoduze_theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('exoduze_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} activeSector="latest" />
      <main className="main-container">
        {/* Banner */}
        <div className="principle-banner animate-in" style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(239,68,68,0.06) 100%)',
          border: '1px solid rgba(245,158,11,0.2)',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-10%', width: '120%', height: '200%',
            background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.15) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(239,68,68,0.15) 0%, transparent 50%)',
            pointerEvents: 'none', zIndex: 0
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)' }}>
              ⚡ Latest Competitions
            </h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Newest competitions just created — be the first to deploy your AI agent.
            </p>
          </div>
        </div>

        <SectorNav activeSector="latest" onSectorChange={() => {}} />
        <SectorFeed sector="latest" />
      </main>
    </>
  );
}

export default function LatestPage() {
  return (
    <WalletProvider>
      <LatestInner />
    </WalletProvider>
  );
}
