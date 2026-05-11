'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCompetitions, SectorSummary } from '@/hooks/useCompetitions';
import { TrendingUp, Sparkles, Radio, Zap, Landmark, BarChart3, Monitor, Bitcoin, Trophy, Globe2, FlaskConical } from 'lucide-react';

export interface Sector {
    id: string;
    label: string;
    icon: React.ReactNode;
    emoji?: string;
}

export const SECTORS: Sector[] = [
    { id: 'top', label: 'Top Markets', icon: <TrendingUp size={16} strokeWidth={2.2} />, emoji: '🔥' },
    { id: 'foryou', label: 'For You', icon: <Sparkles size={16} strokeWidth={2.2} />, emoji: '✨' },
    { id: 'signals', label: 'Signals', icon: <Radio size={16} strokeWidth={2.2} />, emoji: '📡' },
    { id: 'latest', label: 'Latest', icon: <Zap size={16} strokeWidth={2.2} />, emoji: '⚡' },
    { id: 'politics', label: 'Politics', icon: <Landmark size={16} strokeWidth={2.2} />, emoji: '🏛️' },
    { id: 'finance', label: 'Finance', icon: <BarChart3 size={16} strokeWidth={2.2} />, emoji: '📈' },
    { id: 'tech', label: 'Tech', icon: <Monitor size={16} strokeWidth={2.2} />, emoji: '💻' },
    { id: 'crypto', label: 'Crypto', icon: <Bitcoin size={16} strokeWidth={2.2} />, emoji: '₿' },
    { id: 'sports', label: 'Sports', icon: <Trophy size={16} strokeWidth={2.2} />, emoji: '⚽' },
    { id: 'economy', label: 'Economy', icon: <Globe2 size={16} strokeWidth={2.2} />, emoji: '🌍' },
    { id: 'science', label: 'Science', icon: <FlaskConical size={16} strokeWidth={2.2} />, emoji: '🔬' },
];

export const CATEGORY_SECTORS = ['politics', 'finance', 'tech', 'crypto', 'sports', 'economy', 'science'];

interface Props {
    activeSector: string;
    onSectorChange: (sector: string) => void;
}

export default function SectorNav({ activeSector, onSectorChange }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const { sectorSummary } = useCompetitions();

    // Tab refs for underline positioning
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // Build a lookup map for sector counts
    const countMap = new Map<string, number>();
    sectorSummary.forEach((s: SectorSummary) => {
        countMap.set(s.sector, s.active_count + s.upcoming_count);
    });

    // Auto-scroll active tab into view
    useEffect(() => {
        if (!scrollRef.current) return;
        const btn = scrollRef.current.querySelector(`[data-sector="${activeSector}"]`) as HTMLElement;
        if (btn) {
            setTimeout(() => {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }, 50);
        }
    }, [activeSector]);

    // Route mapping for meta-tabs
    const META_TAB_ROUTES: Record<string, string> = {
        foryou: '/for-you',
        signals: '/signals',
        latest: '/latest',
    };

    const handleClick = (sectorId: string) => {
        // Meta-tabs (For You, Signals, Latest) → their own route
        if (META_TAB_ROUTES[sectorId]) {
            router.push(META_TAB_ROUTES[sectorId]);
            return;
        }

        // "Top Markets" → home
        if (sectorId === 'top') {
            if (pathname === '/') {
                onSectorChange('top');
            } else {
                router.push('/');
            }
            return;
        }

        // Category sectors → clean URL (/politics, /finance, etc.)
        if (CATEGORY_SECTORS.includes(sectorId)) {
            router.push(`/${sectorId}`);
            return;
        }

        // Fallback
        onSectorChange(sectorId);
    };

    // Determine active sector from route for non-home pages
    const getEffectiveActive = () => {
        if (pathname === '/signals') return 'signals';
        if (pathname === '/for-you') return 'foryou';
        if (pathname === '/latest') return 'latest';
        // Detect /category/X (internal) or /X (rewritten clean URL)
        if (pathname?.startsWith('/category/')) return pathname.split('/')[2];
        // Check if pathname matches a sector directly (clean URL)
        const cleanSector = pathname?.replace('/', '');
        if (cleanSector && CATEGORY_SECTORS.includes(cleanSector)) return cleanSector;
        return activeSector;
    };
    const effectiveActive = getEffectiveActive();

    // Animation state for underline indicator
    const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0, opacity: 0 });
    // Scroll edge detection
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Detect scroll edges for fade hints
    const updateScrollEdges = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 8);
        setCanScrollRight(el.scrollLeft + el.offsetWidth < el.scrollWidth - 8);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateScrollEdges();
        el.addEventListener('scroll', updateScrollEdges, { passive: true });
        window.addEventListener('resize', updateScrollEdges);
        return () => {
            el.removeEventListener('scroll', updateScrollEdges);
            window.removeEventListener('resize', updateScrollEdges);
        };
    }, [updateScrollEdges]);

    // Update underline position
    useEffect(() => {
        const activeTab = tabRefs.current[effectiveActive];
        const container = scrollRef.current;
        if (activeTab && container) {
            requestAnimationFrame(() => {
                setUnderlineStyle({
                    left: activeTab.offsetLeft,
                    width: activeTab.offsetWidth,
                    opacity: 1,
                });

                // Scroll into view if needed
                const scrollLeft = container.scrollLeft;
                const containerWidth = container.offsetWidth;
                const tabLeft = activeTab.offsetLeft;
                const tabRight = tabLeft + activeTab.offsetWidth;
                if (tabLeft < scrollLeft + 40 || tabRight > scrollLeft + containerWidth - 40) {
                    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            });
        }
    }, [effectiveActive]);

    return (
        <nav className="sector-nav" aria-label="Market sectors">
            <div
                ref={wrapperRef}
                className={`sector-nav__scroll-wrapper${canScrollLeft ? ' can-scroll-left' : ''}${canScrollRight ? ' can-scroll-right' : ''}`}
            >
                <div className="sector-nav__scroll" ref={scrollRef} style={{ position: 'relative' }}>
                    <div
                        className="sector-nav__pill-bg"
                        style={{
                            transform: `translateX(${underlineStyle.left}px) translateY(-50%)`,
                            width: `${underlineStyle.width}px`,
                            opacity: underlineStyle.opacity,
                        }}
                    />
                    {SECTORS.map((sector) => {
                        const count = countMap.get(sector.id) || 0;
                        const isActive = sector.id === effectiveActive;
                        return (
                            <button
                                key={sector.id}
                                ref={el => { tabRefs.current[sector.id] = el; }}
                                data-sector={sector.id}
                                className={`sector-nav__tab ${isActive ? 'sector-nav__tab--active' : ''}`}
                                onClick={(e) => {
                                    // Water droplet ripple effect
                                    const btn = e.currentTarget;
                                    const rect = btn.getBoundingClientRect();
                                    const ripple = document.createElement('span');
                                    const size = Math.max(rect.width, rect.height) * 2;
                                    ripple.className = 'sector-nav__ripple';
                                    ripple.style.width = ripple.style.height = `${size}px`;
                                    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
                                    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
                                    btn.appendChild(ripple);
                                    setTimeout(() => ripple.remove(), 700);
                                    handleClick(sector.id);
                                }}
                                aria-pressed={isActive}
                            >
                                <span className="sector-nav__icon">{sector.icon}</span>
                                <span className="sector-nav__label">{sector.label}</span>
                                {count > 0 && (
                                    <span className="sector-nav__count">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
