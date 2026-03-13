'use client';

import { useCompetitions, Competition } from '@/hooks/useCompetitions';

interface Props {
    sector: string;
    selectedCompId?: string;
    onSelectCompetition?: (id: string) => void;
}

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
            return { label: '● LIVE', bg: 'rgba(16,185,129,0.15)', color: '#10b981', glow: '0 0 8px rgba(16,185,129,0.3)' };
        case 'upcoming':
            return { label: '⏳ UPCOMING', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', glow: 'none' };
        case 'ended':
            return { label: '✓ ENDED', bg: 'rgba(107,115,148,0.15)', color: '#6b7394', glow: 'none' };
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

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }
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
    if (hours <= 24) return '24H';
    if (hours <= 72) return '3D';
    return '7D';
}

function getProgressPct(comp: Competition): number {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
}

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
                border: selected ? '2px solid var(--accent-indigo)' : '1px solid rgba(99,102,241,0.2)',
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
                            color: '#8b5cf6',
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
                    <div style={{ margin: '0.4rem 0', height: '3px', borderRadius: '2px', background: 'rgba(99,102,241,0.1)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            borderRadius: '2px',
                            background: 'linear-gradient(90deg, #818cf8, #6366f1)',
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
                                color: i === 0 ? '#818cf8' : i === 1 ? '#f59e0b' : '#ef4444',
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
                        color: status === 'live' ? '#10b981' : status === 'upcoming' ? '#f59e0b' : '#6b7394',
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

export default function SectorFeed({ sector, selectedCompId, onSelectCompetition }: Props) {
    const { competitions, loading, connected } = useCompetitions(sector);

    let sorted = [...competitions];

    if (sector === 'top') {
        // Top Markets: sort primarily by prize_pool descending, then active status
        sorted.sort((a, b) => {
            const statusOrder = { live: 0, upcoming: 1, ended: 2 };
            const statusA = statusOrder[getCompetitionStatus(a)];
            const statusB = statusOrder[getCompetitionStatus(b)];
            if (statusA !== statusB) return statusA - statusB;
            // secondary sort by prize pool inside the same status
            return (b.prize_pool || 0) - (a.prize_pool || 0);
        });
    } else if (sector === 'foryou') {
        // For You: recommendation algorithm (collaborative filtering placeholder / hotness)
        // Composite score: prize_pool + (status) + pseudo-randomness
        const userSeed = typeof window !== 'undefined' && window.localStorage ? (localStorage.getItem('foryou_seed') || Math.random().toString()) : 'default';
        if (typeof window !== 'undefined' && !localStorage.getItem('foryou_seed')) localStorage.setItem('foryou_seed', userSeed);
        
        sorted.sort((a, b) => {
            const getScore = (comp: Competition) => {
               let s = 0;
               if (getCompetitionStatus(comp) === 'live') s += 1000;
               if (getCompetitionStatus(comp) === 'upcoming') s += 500;
               s += (comp.prize_pool || 0) * 10;
               s += (comp.entry_count || 0) * 5;
               // Add a deterministic pseudo-random factor per competition
               const hash = comp.id.charCodeAt(0) + comp.id.charCodeAt(comp.id.length - 1);
               if (hash % 3 === 0) s += 200; // personalized boost
               return s;
            };
            return getScore(b) - getScore(a);
        });
    } else if (sector === 'signals') {
        // Signals: display competitions with the most recent updates
        sorted.sort((a, b) => {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
    } else {
        // Default sorting (latest, category specific)
        sorted.sort((a, b) => {
            const statusOrder = { live: 0, upcoming: 1, ended: 2 };
            const statusA = statusOrder[getCompetitionStatus(a)];
            const statusB = statusOrder[getCompetitionStatus(b)];
            if (statusA !== statusB) return statusA - statusB;
            
            if (sector === 'latest') {
                 return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            return new Date(a.competition_start).getTime() - new Date(b.competition_start).getTime();
        });
    }

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    return (
        <section className="sector-feed">
            <div className="sector-feed__status">
                <span className={`sector-feed__indicator ${connected ? 'sector-feed__indicator--live' : ''}`} />
                {connected ? 'Live' : 'Connecting...'}
                {liveCount > 0 && (
                    <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        background: 'rgba(16,185,129,0.15)',
                        color: '#10b981',
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
