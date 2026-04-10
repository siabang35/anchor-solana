'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const SectorFeed = dynamic(() => import('@/components/SectorFeed'), { ssr: false });

function SignalsInner() {
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
      <Header theme={theme} onToggleTheme={toggleTheme} activeSector="signals" />
      <main className="main-container">
        {/* Banner */}
        <div className="principle-banner animate-in" style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.06) 0%, rgba(99,102,241,0.06) 100%)',
          border: '1px solid rgba(34,211,238,0.2)',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-10%', width: '120%', height: '200%',
            background: 'radial-gradient(ellipse at top left, rgba(34,211,238,0.15) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(99,102,241,0.15) 0%, transparent 50%)',
            pointerEvents: 'none', zIndex: 0
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)' }}>
              📡 Market Signals
            </h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Real-time intelligence from live NLP data feeds across all sectors.
            </p>
          </div>
        </div>

        <SectorNav activeSector="signals" onSectorChange={() => {}} />
        <SectorFeed sector="signals" />
      </main>
    </>
  );
}

export default function SignalsPage() {
  return (
    <WalletProvider>
      <SignalsInner />
    </WalletProvider>
  );
}
