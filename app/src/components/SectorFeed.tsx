'use client';

import { useRouter } from 'next/navigation';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';

interface Props {
    sector: string;
    selectedCompId?: string;
    onSelectCompetition?: (id: string) => void;
    searchQuery?: string;
    activeCategory?: string;
    activeFilter?: string;
}

// ── Tab metadata ────────────────────────────────────────────────
const TAB_META: Record<string, { icon: string; title: string; description: string }> = {
    top: { icon: '🔥', title: 'Top Markets', description: 'Most popular competitions by participant count' },
    foryou: { icon: '✨', title: 'Recommended For You', description: 'Curated competitions based on your activity, prize pools, and market potential.' },
    signals: { icon: '📡', title: 'Market Signals', description: 'Latest intelligence and sentiment changes from live data feeds' },
    latest: { icon: '⚡', title: 'Latest Competitions', description: 'Newest competitions just created — be the first to deploy your AI agent.' },
};

// ── Helpers ─────────────────────────────────────────────────────
function getCompetitionStatus(comp: Competition): 'live' | 'upcoming' | 'ended' {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now >= start && now <= end) return 'live';
    if (now < start) return 'upcoming';
    return 'ended';
}

function getStatusConfig(status: 'live' | 'upcoming' | 'ended') {
    switch (status) {
        case 'live':
            return { label: '● LIVE', bg: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', glow: '0 0 8px rgba(16,185,129,0.3)' };
        case 'upcoming':
            return { label: '⏳ UPCOMING', bg: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', glow: 'none' };
        case 'ended':
            return { label: '✓ ENDED', bg: 'rgba(107,115,148,0.15)', color: 'var(--text-muted)', glow: 'none' };
    }
}

function getTimeRemaining(comp: Competition): string {
    const now = Date.now();
    const status = getCompetitionStatus(comp);
    if (status === 'ended') return 'Finished';
    const targetTime = status === 'upcoming'
        ? new Date(comp.competition_start).getTime()
        : new Date(comp.competition_end).getTime();
    const diff = targetTime - now;
    if (diff <= 0) return status === 'upcoming' ? 'Starting...' : 'Settling...';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function getHorizonLabel(comp: Competition): string {
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours <= 2) return '2H';
    if (hours <= 7) return '7H';
    if (hours <= 12) return '12H';
    return '24H';
}

function getProgressPct(comp: Competition): number {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
}

// ── Competition Card (reused for top, foryou, latest) ────────────
function CompetitionCard({ comp, selected, onClick }: { comp: Competition, selected?: boolean, onClick?: () => void }) {
    const router = useRouter();
    const probLabels = comp.outcomes || ['Home', 'Draw', 'Away'];
    const probs = comp.probabilities || [5000, 2500, 2500];
    const status = getCompetitionStatus(comp);
    const statusConfig = getStatusConfig(status);
    const timeLeft = getTimeRemaining(comp);
    const horizon = getHorizonLabel(comp);
    const progress = getProgressPct(comp);

    return (
        <article
            className="feed-card animate-in"
            style={{
                border: selected ? '2px solid var(--accent-indigo)' : '1px solid var(--border-glass)',
                cursor: 'pointer',
                transform: selected ? 'scale(1.02)' : 'none',
                transition: 'all 0.2s ease',
                boxShadow: selected ? '0 0 20px rgba(99,102,241,0.15)' : statusConfig.glow,
                opacity: status === 'ended' ? 0.7 : 1,
                padding: 0, // Remove padding from article to allow full-width image
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
            onClick={onClick}
        >
            {/* Animated Interactive Image Banner */}
            {comp.image_url && (
                <div style={{
                    height: '140px',
                    width: '100%',
                    position: 'relative',
                    borderBottom: '1px solid var(--border-glass)',
                    flexShrink: 0,
                    overflow: 'hidden',
                }} className="feed-card-img-container">
                    <img 
                        src={comp.image_url} 
                        alt={comp.title} 
                        loading="lazy"
                        className="hover-zoom"
                        style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover',
                            transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                        }} 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(to bottom, transparent 40%, rgba(10, 11, 20, 0.95) 100%)',
                        pointerEvents: 'none'
                    }} />
                    <div className="img-overlay-hover" style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(99, 102, 241, 0.15)',
                        backdropFilter: 'blur(2px)',
                        opacity: 0,
                        transition: 'all 0.4s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                    }}>
                        <span style={{
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            border: '1px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            transform: 'translateY(10px)',
                            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                        }} className="view-market-pill">
                            View Market
                        </span>
                    </div>
                </div>
            )}
            
            <div className="feed-card__content" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="feed-card__header">
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <span className="feed-card__badge" style={{
                            background: 'rgba(99,102,241,0.15)',
                            color: 'var(--accent-indigo)',
                            fontSize: '0.5rem',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-round)',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                        }}>
                            🏆 {comp.sector || 'Competition'}
                        </span>
                        <span style={{
                            fontSize: '0.5rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-round)',
                            background: 'rgba(139,92,246,0.15)',
                            color: 'var(--accent-purple)',
                            letterSpacing: '0.05em',
                        }}>
                            {horizon}
                        </span>
                    </div>
                    <span style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        background: statusConfig.bg,
                        color: statusConfig.color,
                        animation: status === 'live' ? 'pulse 2s infinite' : 'none',
                    }}>
                        {statusConfig.label}
                    </span>
                </div>
                <h3 className="feed-card__title">{comp.title}</h3>
                {comp.description && (
                    <p className="feed-card__desc">{comp.description}</p>
                )}

                {/* Progress bar for live competitions */}
                {status === 'live' && (
                    <div style={{ margin: '0.4rem 0', height: '3px', borderRadius: '2px', background: 'var(--border-glass)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            borderRadius: '2px',
                            background: 'linear-gradient(90deg, var(--accent-indigo), var(--accent-purple))',
                            transition: 'width 1s ease',
                        }} />
                    </div>
                )}

                {/* Probability bars */}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {probLabels.map((label, i) => (
                        <div key={i} style={{
                            flex: 1,
                            minWidth: 70,
                            textAlign: 'center',
                            padding: '0.3rem 0.4rem',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--gradient-card)',
                            border: '1px solid var(--border-card)',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
                            <div style={{
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                                color: i === 0 ? 'var(--accent-indigo)' : i === 1 ? 'var(--accent-amber)' : 'var(--accent-red)',
                            }}>
                                {((probs[i] || 0) / 100).toFixed(1)}%
                            </div>
                        </div>
                    ))}
                </div>
                
                {comp.tags && comp.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '0.8rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>SOURCES:</span>
                        {comp.tags.slice(0, 3).map((tag, idx) => (
                            <span key={`${tag}-${idx}`} style={{ 
                                fontSize: '0.55rem', 
                                color: 'var(--text-primary)', 
                                background: 'var(--bg-input)', 
                                border: '1px solid var(--border-glass)',
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                fontWeight: 500,
                                textTransform: 'capitalize'
                            }}>
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                <div className="feed-card__footer" style={{ marginTop: '0.6rem' }}>
                    <span className="feed-card__source">
                        💰 {comp.prize_pool} SOL Pool
                    </span>
                    <span className="feed-card__time" style={{
                        fontWeight: 700,
                        color: status === 'live' ? 'var(--accent-green)' : status === 'upcoming' ? 'var(--accent-amber)' : 'var(--text-muted)',
                    }}>
                        {status === 'live' ? `⏱ ${timeLeft} left` : status === 'upcoming' ? `Starts in ${timeLeft}` : `✓ ${timeLeft}`}
                    </span>
                </div>
                <div className="feed-card__footer" style={{ marginTop: '0.2rem' }}>
                    <span className="feed-card__source" style={{ fontSize: '0.5rem' }}>
                        👥 {comp.entry_count}/{comp.max_entries} entries
                    </span>
                </div>
                {selected && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            localStorage.setItem('selected_competition_id', comp.id);
                            router.push(`/${comp.sector.toLowerCase()}`);
                        }}
                        className="btn-compete-premium"
                    >
                        <span className="sword-icon">⚔️</span> Compete Now
                    </button>
                )}
            </div>
        </article>
    );
}

// ── Signal Feed Item Card ─────────────────────────────────────
function SignalCard({ item }: { item: LiveFeedItem }) {
    const sentimentLabel = item.sentiment > 0.1 ? 'BULLISH' : item.sentiment < -0.1 ? 'BEARISH' : 'NEUTRAL';
    const sentimentColor = item.sentiment > 0.1 ? 'var(--accent-green)' : item.sentiment < -0.1 ? 'var(--accent-red)' : 'var(--text-muted)';
    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const hasImage = !!(item.image_url);
    const hasUrl = !!(item.url);

    const cardContent = (
        <div className="feed-item animate-in" style={{
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            padding: '1rem', borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-glass)',
            transition: 'all 0.2s ease',
            cursor: hasUrl ? 'pointer' : 'default',
        }}>
            {/* Thumbnail or Icon */}
            {hasImage ? (
                <div className="feed-item-image-wrapper" style={{
                    width: '64px', height: '64px', borderRadius: '8px',
                    overflow: 'hidden', flexShrink: 0,
                    background: 'var(--bg-input)',
                }}>
                    <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        className="hover-zoom"
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                        }}
                        onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                        }}
                    />
                </div>
            ) : null}
            
            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {(item.category || item.entity || 'General')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>•</span>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {item.source}
                    </span>
                    {hasUrl && (
                        <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>↗</span>
                    )}
                </div>
                
                <h3 style={{
                    fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',
                    lineHeight: 1.4, margin: 0, wordBreak: 'break-word',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {item.text}
                </h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {item.tags && item.tags.length > 0 && (
                        <span style={{
                            fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }}>
                            <span style={{ opacity: 0.6 }}>💬</span> {item.tags.slice(0,2).join(', ')}
                        </span>
                    )}
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', gap: '0.3rem'
                    }}>
                        <span style={{ opacity: 0.6 }}>⏱</span> {timeStr}
                    </span>
                </div>
            </div>
        </div>
    );

    if (hasUrl) {
        return (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                {cardContent}
            </a>
        );
    }
    return cardContent;
}

// ── Section Header ─────────────────────────────────────────────
function SectionHeader({ sector, liveCount, connected }: { sector: string; liveCount: number; connected: boolean }) {
    const meta = TAB_META[sector];
    if (!meta) return null;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.2rem',
            marginBottom: '0.85rem', padding: '0.5rem 0',
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <h3 style={{
                    fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0,
                }}>
                    <span>{meta.icon}</span> {meta.title}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {liveCount > 0 && (
                        <span style={{
                            fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px',
                            borderRadius: 'var(--radius-round)',
                            background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)',
                        }}>
                            {liveCount} LIVE
                        </span>
                    )}
                    <span className={`sector-feed__indicator ${connected ? 'sector-feed__indicator--live' : ''}`}
                        style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? 'var(--accent-green)' : 'var(--accent-amber)' }}
                    />
                </div>
            </div>
            {/* Small description explaining the current feed section */}
            <p style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                margin: 0,
                fontWeight: 500,
                lineHeight: 1.45,
            }}>
                {meta.description}
            </p>
        </div>
    );
}

// ── Main SectorFeed Component ──────────────────────────────────
export default function SectorFeed({ sector, selectedCompId, onSelectCompetition, searchQuery, activeCategory, activeFilter }: Props) {
    const { competitions, loading, connected } = useCompetitions(sector);
    
    // Pass activeCategory to useLiveFeed so it fetches the correct sector data from backend
    const feedCategory = sector === 'signals' && activeCategory !== 'all' ? activeCategory : undefined;
    const { feeds: signalFeeds, loading: signalsLoading, connected: signalsConnected } = useLiveFeed(30, feedCategory);

    // ── Sorting logic per tab ──────────────────────────────────
    let sorted = [...competitions];

    if (sector === 'top') {
        // Top Markets: most popular by participant count
        sorted.sort((a, b) => {
            const statusOrder: Record<string, number> = { live: 0, upcoming: 1, ended: 2 };
            const statusA = statusOrder[getCompetitionStatus(a)] ?? 2;
            const statusB = statusOrder[getCompetitionStatus(b)] ?? 2;
            if (statusA !== statusB) return statusA - statusB;
            return (b.entry_count || 0) - (a.entry_count || 0);
        });
    } else if (sector === 'foryou') {
        // For You: weighted recommendation scoring
        sorted.sort((a, b) => {
            const getScore = (comp: Competition) => {
                let s = 0;
                if (getCompetitionStatus(comp) === 'live') s += 1000;
                if (getCompetitionStatus(comp) === 'upcoming') s += 500;
                s += (comp.prize_pool || 0) * 10;
                s += (comp.entry_count || 0) * 5;
                const capacityPct = comp.max_entries > 0 ? (comp.entry_count / comp.max_entries) : 0;
                if (capacityPct > 0.3 && capacityPct < 0.85) s += 300;
                const hash = comp.id.charCodeAt(0) + comp.id.charCodeAt(comp.id.length - 1);
                if (hash % 3 === 0) s += 200;
                return s;
            };
            return getScore(b) - getScore(a);
        });
    } else if (sector === 'latest') {
        // Latest: newest first by creation date
        sorted.sort((a, b) => {
            const statusOrder: Record<string, number> = { live: 0, upcoming: 1, ended: 2 };
            const statusA = statusOrder[getCompetitionStatus(a)] ?? 2;
            const statusB = statusOrder[getCompetitionStatus(b)] ?? 2;
            if (statusA !== statusB) return statusA - statusB;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }

    // Apply activeCategory filter for competitions
    if (activeCategory && activeCategory !== 'all') {
        sorted = sorted.filter(c => {
            const catStr = (c.sector || '').toLowerCase();
            return catStr.includes(activeCategory.toLowerCase());
        });
    }

    // Apply searchQuery filter for competitions
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        sorted = sorted.filter(c => 
            (c.title || '').toLowerCase().includes(query) || 
            (c.description || '').toLowerCase().includes(query) ||
            (c.sector || '').toLowerCase().includes(query)
        );
    }

    // Apply activeFilter (New, Trending, Ending Soon)
    if (activeFilter) {
        if (activeFilter === 'new') {
            sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else if (activeFilter === 'trending') {
            // Sort by entry count / prize pool
            sorted.sort((a, b) => ((b.entry_count || 0) * (b.prize_pool || 1)) - ((a.entry_count || 0) * (a.prize_pool || 1)));
        } else if (activeFilter === 'ending') {
            // Ending soon: sort by competition_end closest to now, must be 'live'
            sorted = sorted.filter(c => getCompetitionStatus(c) === 'live');
            sorted.sort((a, b) => new Date(a.competition_end).getTime() - new Date(b.competition_end).getTime());
        }
    }

    // FILTER OUT ended competitions — they should NEVER appear in the feed
    sorted = sorted.filter(c => getCompetitionStatus(c) !== 'ended');

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    // ── Signals Tab: render live feed items ─────────────────────
    if (sector === 'signals') {
        let filteredSignals = [...signalFeeds];

        if (activeCategory && activeCategory !== 'all') {
            filteredSignals = filteredSignals.filter(item => {
                const catStr = (item.category || item.entity || '').toLowerCase();
                return catStr.includes(activeCategory.toLowerCase());
            });
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredSignals = filteredSignals.filter(item => 
                item.text.toLowerCase().includes(query) || 
                item.source.toLowerCase().includes(query) ||
                (item.category && item.category.toLowerCase().includes(query))
            );
        }

        if (activeFilter) {
             if (activeFilter === 'new') {
                 filteredSignals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
             } else if (activeFilter === 'trending') {
                 // Sort by high impact first
                 filteredSignals.sort((a, b) => (b.impact === 'high' ? 1 : 0) - (a.impact === 'high' ? 1 : 0));
             }
        }

        return (
            <section className="sector-feed">
                <SectionHeader sector={sector} liveCount={filteredSignals.length} connected={signalsConnected} />

                {signalsLoading && filteredSignals.length === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', animation: 'dbFadeIn 0.3s ease' }}>
                        <div className="circular-spinner" />
                        <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.05em' }}>Loading signals...</div>
                    </div>
                )}

                {!signalsLoading && filteredSignals.length === 0 && (
                    <div className="sector-feed__empty">
                        <p>No signals available yet for these filters.</p>
                        <p className="sector-feed__empty-sub">Market intelligence will appear as events are detected from live data feeds.</p>
                    </div>
                )}

                <div className="sector-feed__grid">
                    {filteredSignals.map((item) => (
                        <SignalCard key={item.id} item={item} />
                    ))}
                </div>
            </section>
        );
    }

    // ── Default: Competition cards (top, foryou, latest) ────────
    return (
        <section className="sector-feed">
            {TAB_META[sector] && (
                <SectionHeader sector={sector} liveCount={liveCount} connected={connected} />
            )}

            <div className="sector-feed__status">
                <span className={`sector-feed__indicator ${connected ? 'sector-feed__indicator--live' : ''}`} />
                {connected ? 'Live' : 'Connecting...'}
                {liveCount > 0 && !TAB_META[sector] && (
                    <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        background: 'rgba(16,185,129,0.15)',
                        color: 'var(--accent-green)',
                    }}>
                        {liveCount} LIVE NOW
                    </span>
                )}
            </div>

            {loading && competitions.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', animation: 'dbFadeIn 0.3s ease' }}>
                    <div className="circular-spinner" />
                    <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.05em' }}>Loading markets...</div>
                </div>
            )}

            {!loading && sorted.length === 0 && (
                <div className="sector-feed__empty">
                    <p>No competitions available for this sector yet.</p>
                    <p className="sector-feed__empty-sub">Competitions will be auto-created from live data feeds.</p>
                </div>
            )}

            <div className="sector-feed__grid">
                {sorted.map((comp) => (
                    <CompetitionCard
                        key={comp.id}
                        comp={comp}
                        selected={comp.id === selectedCompId}
                        onClick={() => onSelectCompetition?.(comp.id)}
                    />
                ))}
            </div>
        </section>
    );
}
