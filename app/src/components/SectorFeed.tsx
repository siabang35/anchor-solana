'use client';

import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';

interface Props {
    sector: string;
    selectedCompId?: string;
    onSelectCompetition?: (id: string) => void;
}

// ── Tab metadata ────────────────────────────────────────────────
const TAB_META: Record<string, { icon: string; title: string; description: string }> = {
    top:     { icon: '🔥', title: 'Top Markets',      description: 'Most popular competitions by participant count' },
    foryou:  { icon: '✨', title: 'Recommended For You', description: 'Curated picks based on activity and potential' },
    signals: { icon: '📡', title: 'Market Signals',    description: 'Latest intelligence from live data feeds' },
    latest:  { icon: '⚡', title: 'Latest Competitions', description: 'Newest competitions just created' },
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
            }}
            onClick={onClick}
        >
            <div className="feed-card__content">
                <div className="feed-card__header">
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <span className="feed-card__badge" style={{
                            background: 'rgba(99,102,241,0.15)',
                            color: 'var(--accent-indigo)',
                            fontSize: '0.5rem',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-round)',
                            fontWeight: 700,
                        }}>
                            🏆 Competition
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
                <div className="feed-card__footer" style={{ marginTop: '0.4rem' }}>
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
                {comp.tags && comp.tags.length > 0 && (
                    <div className="feed-card__tags">
                        {comp.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="feed-card__tag">#{tag}</span>
                        ))}
                    </div>
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
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem', borderRadius: 'var(--radius-xs)',
            background: 'var(--gradient-card)',
            border: `1px solid var(--border-card)`,
            borderLeft: `3px solid ${sentimentColor}`,
            transition: 'all 0.3s ease',
            cursor: hasUrl ? 'pointer' : 'default',
        }}>
            {/* Thumbnail or Icon */}
            {hasImage ? (
                <div style={{
                    width: '80px', height: '80px', borderRadius: '10px',
                    overflow: 'hidden', flexShrink: 0,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-glass)',
                }}>
                    <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                        }}
                        onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                            if (el.parentElement) {
                                el.parentElement.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem">${item.icon}</div>`;
                            }
                        }}
                    />
                </div>
            ) : (
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', flexShrink: 0,
                }}>
                    {item.icon}
                </div>
            )}
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                    <span style={{
                        fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-indigo)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                        {item.source}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>·</span>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>🕐 {timeStr}</span>
                </div>
                <div style={{
                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)',
                    lineHeight: 1.5, wordBreak: 'break-word',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {item.text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px',
                        borderRadius: 'var(--radius-round)',
                        background: item.sentiment > 0.1 ? 'rgba(16,185,129,0.12)' : item.sentiment < -0.1 ? 'rgba(239,68,68,0.12)' : 'var(--bg-input)',
                        color: sentimentColor,
                    }}>
                        {sentimentLabel}
                    </span>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px',
                        borderRadius: 'var(--radius-round)',
                        background: item.impact === 'high' ? 'rgba(239,68,68,0.12)' : item.impact === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(34,211,238,0.12)',
                        color: item.impact === 'high' ? 'var(--accent-red)' : item.impact === 'medium' ? 'var(--accent-amber)' : 'var(--accent-cyan)',
                    }}>
                        {item.impact.toUpperCase()}
                    </span>
                    {item.category && (
                        <span style={{
                            fontSize: '0.5rem', fontWeight: 600, padding: '2px 6px',
                            borderRadius: 'var(--radius-round)',
                            background: 'var(--bg-input)', color: 'var(--text-muted)',
                        }}>
                            {item.category}
                        </span>
                    )}
                    {hasUrl && (
                        <span style={{
                            fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px',
                            borderRadius: 'var(--radius-round)',
                            background: 'rgba(99,102,241,0.1)', color: 'var(--accent-indigo)',
                            marginLeft: 'auto',
                        }}>
                            🔗 Source
                        </span>
                    )}
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
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '0.75rem', padding: '0.75rem 0',
            borderBottom: '1px solid var(--border-card)',
        }}>
            <div>
                <h3 style={{
                    fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0,
                }}>
                    <span>{meta.icon}</span> {meta.title}
                </h3>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem', margin: 0 }}>
                    {meta.description}
                </p>
            </div>
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
    );
}

// ── Main SectorFeed Component ──────────────────────────────────
export default function SectorFeed({ sector, selectedCompId, onSelectCompetition }: Props) {
    const { competitions, loading, connected } = useCompetitions(sector);
    const { feeds: signalFeeds, loading: signalsLoading, connected: signalsConnected } = useLiveFeed(30);

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
                // Capacity factor: prefer competitions that aren't full yet
                const capacityPct = comp.max_entries > 0 ? (comp.entry_count / comp.max_entries) : 0;
                if (capacityPct > 0.3 && capacityPct < 0.85) s += 300; // sweet spot
                // Deterministic pseudo-random factor per competition for variety
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
    // signals tab doesn't use competitions

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    // ── Signals Tab: render live feed items ─────────────────────
    if (sector === 'signals') {
        return (
            <section className="sector-feed">
                <SectionHeader sector={sector} liveCount={signalFeeds.length} connected={signalsConnected} />

                {signalsLoading && signalFeeds.length === 0 && (
                    <div className="sector-feed__skeleton">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="feed-card feed-card--skeleton">
                                <div className="skeleton-line skeleton-line--title" />
                                <div className="skeleton-line skeleton-line--desc" />
                                <div className="skeleton-line skeleton-line--short" />
                            </div>
                        ))}
                    </div>
                )}

                {!signalsLoading && signalFeeds.length === 0 && (
                    <div className="sector-feed__empty">
                        <p>No signals available yet.</p>
                        <p className="sector-feed__empty-sub">Market intelligence will appear as events are detected from live data feeds.</p>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {signalFeeds.map((item) => (
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
                <div className="sector-feed__skeleton">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="feed-card feed-card--skeleton">
                            <div className="skeleton-line skeleton-line--title" />
                            <div className="skeleton-line skeleton-line--desc" />
                            <div className="skeleton-line skeleton-line--short" />
                        </div>
                    ))}
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
