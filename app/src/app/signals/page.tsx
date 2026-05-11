'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const CATEGORIES = [
      { id: 'all', label: 'All' },
      { id: 'crypto', label: 'Crypto' },
      { id: 'politics', label: 'Politics' },
      { id: 'finance', label: 'Finance' },
      { id: 'tech', label: 'Tech' },
      { id: 'science', label: 'Science' },
      { id: 'economy', label: 'Economy' },
  ];

  // Smooth sliding indicator positioning
  const updateIndicator = useCallback((id: string) => {
    if (!navRef.current || !indicatorRef.current) return;
    const btn = navRef.current.querySelector(`[data-cat="${id}"]`) as HTMLElement;
    if (!btn) return;
    const navRect = navRef.current.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    indicatorRef.current.style.width = `${btnRect.width}px`;
    indicatorRef.current.style.left = `${btnRect.left - navRect.left + navRef.current.scrollLeft}px`;
    indicatorRef.current.style.opacity = '1';
  }, []);

  useEffect(() => {
    updateIndicator(activeCategory);
  }, [activeCategory, updateIndicator]);

  useEffect(() => {
    const handler = () => updateIndicator(activeCategory);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [activeCategory, updateIndicator]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const handler = () => updateIndicator(activeCategory);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [activeCategory, updateIndicator]);

  const handleCategoryClick = (id: string) => {
    setActiveCategory(id);
    if (navRef.current) {
      const btn = navRef.current.querySelector(`[data-cat="${id}"]`) as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} activeSector="signals" />
      <main className="main-container">

        {/* SectorNav — visible on desktop for Top Markets, For You, etc. */}
        <SectorNav activeSector="signals" onSectorChange={() => {}} />

        {/* Search + Filter UI */}
        <div className="search-page">
            {/* Search Bar */}
            <div className="search-bar-wrapper">
                <Search size={18} strokeWidth={2} className="search-bar-icon" />
                <input 
                    type="text" 
                    placeholder="Search markets, events, or categories..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-bar-input"
                />
            </div>

            {/* Category filter pills */}
            <div className="search-sectors">
                <div ref={navRef} className="search-sectors__scroll">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            data-cat={cat.id}
                            onClick={() => handleCategoryClick(cat.id)}
                            className={`search-sector-btn ${activeCategory === cat.id ? 'active' : ''}`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
                <div ref={indicatorRef} className="search-sectors__indicator" />
            </div>
        </div>

        <SectorFeed 
            sector="signals" 
            searchQuery={searchQuery}
            activeCategory={activeCategory}
        />
      </main>

      <style>{`
        .search-page {
            margin-top: 0.5rem;
            margin-bottom: 1rem;
        }

        .search-bar-wrapper {
            position: relative;
            margin-bottom: 1rem;
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--border-glass);
            border-radius: 12px;
            display: flex;
            align-items: center;
            padding: 0.7rem 1rem;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .search-bar-wrapper:focus-within {
            border-color: rgba(99,102,241,0.4);
            box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
        }
        .search-bar-icon {
            opacity: 0.5;
            margin-right: 0.7rem;
            color: var(--text-muted);
            flex-shrink: 0;
        }
        .search-bar-input {
            background: transparent;
            border: none;
            outline: none;
            color: var(--text-primary);
            width: 100%;
            font-size: 0.9rem;
            font-weight: 500;
            font-family: inherit;
        }
        .search-bar-input::placeholder {
            color: var(--text-muted);
            opacity: 0.7;
        }

        .search-sectors {
            position: relative;
            margin-bottom: 1rem;
        }
        .search-sectors__scroll {
            display: flex;
            gap: 0.4rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
            flex-wrap: nowrap;
            padding-bottom: 0.5rem;
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .search-sectors__scroll::-webkit-scrollbar {
            display: none;
        }

        .search-sector-btn {
            background: transparent;
            border: 1px solid var(--border-card);
            color: var(--text-muted);
            font-weight: 600;
            font-size: 0.8rem;
            font-family: inherit;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 0;
            padding: 0.35rem 0.85rem;
            border-radius: 20px;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
        }
        .search-sector-btn:hover {
            background: rgba(255,255,255,0.04);
            border-color: rgba(255,255,255,0.1);
            color: var(--text-secondary);
        }
        .search-sector-btn:active {
            transform: scale(0.95);
        }
        .search-sector-btn.active {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(34, 211, 238, 0.1));
            border-color: rgba(99, 102, 241, 0.3);
            color: var(--text-primary);
            font-weight: 700;
        }

        .search-sectors__indicator {
            display: none;
        }

        @media (max-width: 768px) {
            .search-page { margin-top: 0.25rem; }
            .search-bar-wrapper { padding: 0.6rem 0.85rem; border-radius: 10px; }
            .search-bar-input { font-size: 0.85rem; }
            .search-sector-btn { font-size: 0.78rem; padding: 0.3rem 0.7rem; }
        }
      `}</style>
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
