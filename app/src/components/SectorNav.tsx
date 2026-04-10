'use client';

import React, { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompetitions, SectorSummary } from '@/hooks/useCompetitions';

export interface Sector {
    id: string;
    label: string;
    icon: string;
}

export const SECTORS: Sector[] = [
    { id: 'top', label: 'Top Markets', icon: '🔥' },
    { id: 'foryou', label: 'For You', icon: '✨' },
    { id: 'signals', label: 'Signals', icon: '📡' },
    { id: 'latest', label: 'Latest', icon: '⚡' },
    { id: 'politics', label: 'Politics', icon: '🏛️' },
    { id: 'finance', label: 'Finance', icon: '📈' },
    { id: 'tech', label: 'Tech', icon: '💻' },
    { id: 'crypto', label: 'Crypto', icon: '₿' },
    { id: 'sports', label: 'Sports', icon: '⚽' },
    { id: 'economy', label: 'Economy', icon: '🌍' },
    { id: 'science', label: 'Science', icon: '🔬' },
];

export const CATEGORY_SECTORS = ['politics', 'finance', 'tech', 'crypto', 'sports', 'economy', 'science'];

interface Props {
    activeSector: string;
    onSectorChange: (sector: string) => void;
}

export default function SectorNav({ activeSector, onSectorChange }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);
    const router = useRouter();
    const { sectorSummary } = useCompetitions();

    // Build a lookup map for sector counts
    const countMap = new Map<string, number>();
    sectorSummary.forEach((s: SectorSummary) => {
        countMap.set(s.sector, s.active_count + s.upcoming_count);
    });

    // Auto-scroll active tab into view
    useEffect(() => {
        if (activeRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const btn = activeRef.current;
            const scrollLeft = btn.offsetLeft - container.offsetWidth / 2 + btn.offsetWidth / 2;
            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }, [activeSector]);

    // Route mapping for meta-tabs
    const META_TAB_ROUTES: Record<string, string> = {
        foryou: '/for-you',
        signals: '/signals',
        latest: '/latest',
    };

    const handleClick = (sectorId: string) => {
        if (CATEGORY_SECTORS.includes(sectorId)) {
            router.push(`/category/${sectorId}`);
        } else if (META_TAB_ROUTES[sectorId]) {
            router.push(META_TAB_ROUTES[sectorId]);
        } else {
            // 'top' — stay on homepage
            if (window.location.pathname !== '/') {
                router.push('/');
            } else {
                onSectorChange(sectorId);
            }
        }
    };

    return (
        <nav className="sector-nav" aria-label="Market sectors">
            <div className="sector-nav__scroll" ref={scrollRef}>
                {SECTORS.map((sector) => {
                    const count = countMap.get(sector.id) || 0;
                    return (
                        <button
                            key={sector.id}
                            ref={sector.id === activeSector ? activeRef : undefined}
                            className={`sector-nav__tab ${sector.id === activeSector ? 'sector-nav__tab--active' : ''}`}
                            onClick={() => handleClick(sector.id)}
                            aria-pressed={sector.id === activeSector}
                        >
                            <span className="sector-nav__icon">{sector.icon}</span>
                            <span className="sector-nav__label">{sector.label}</span>
                            {count > 0 && (
                                <span className="sector-nav__count" style={{
                                    marginLeft: '0.25rem',
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    background: 'rgba(99,102,241,0.15)',
                                    color: 'var(--accent-indigo)',
                                    padding: '1px 5px',
                                    borderRadius: 'var(--radius-round)',
                                    minWidth: '1.1rem',
                                    textAlign: 'center',
                                }}>
                                    {count}
                                </span>
                            )}
                            {sector.id === activeSector && (
                                <span className="sector-nav__indicator" />
                            )}
                        </button>
                    );
                })}
            </div>
            <style>{`
                @media (max-width: 768px) {
                    .sector-nav { display: none !important; }
                }
            `}</style>
        </nav>
    );
}

