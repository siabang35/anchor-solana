'use client';

import { useCompetitions, Competition } from '@/hooks/useCompetitions';

interface Props {
    sector: string;
    selectedCompId?: string;
    onSelectCompetition?: (id: string) => void;
}

function impactBadgeClass(impact: string) {
    switch (impact) {
        case 'critical': return 'feed-card__badge--critical';
        case 'high': return 'feed-card__badge--high';
        case 'medium': return 'feed-card__badge--medium';
        default: return 'feed-card__badge--low';
    }
}

function sentimentIcon(sentiment: string) {
    switch (sentiment) {
        case 'bullish': return '📈';
        case 'bearish': return '📉';
        default: return '➖';
    }
}

function sentimentColor(sentiment: string) {
    switch (sentiment) {
        case 'bullish': return 'var(--color-success, #22c55e)';
        case 'bearish': return 'var(--color-danger, #ef4444)';
        default: return 'var(--color-muted, #94a3b8)';
    }
}

function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// FeedCard removed, use DataFeeds component instead

function CompetitionCard({ comp, selected, onClick }: { comp: Competition, selected?: boolean, onClick?: () => void }) {
    const probLabels = comp.outcomes || ['Home', 'Draw', 'Away'];
    const probs = comp.probabilities || [5000, 2500, 2500];

    return (
        <article 
            className="feed-card animate-in" 
            style={{ 
                border: selected ? '2px solid var(--accent-indigo)' : '1px solid rgba(99,102,241,0.2)',
                cursor: 'pointer',
                transform: selected ? 'scale(1.02)' : 'none',
                transition: 'all 0.2s ease',
                boxShadow: selected ? '0 0 20px rgba(99,102,241,0.15)' : 'none',
            }}
            onClick={onClick}
        >
            <div className="feed-card__content">
                <div className="feed-card__header">
                    <span className="feed-card__badge feed-card__badge--high" style={{
                        background: 'rgba(99,102,241,0.15)',
                        color: 'var(--accent-indigo)',
                    }}>
                        🏆 Competition
                    </span>
                    <span style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-round)',
                        background: comp.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: comp.status === 'active' ? 'var(--accent-green)' : 'var(--accent-amber)',
                    }}>
                        {comp.status === 'active' ? '● LIVE' : '⏳ UPCOMING'}
                    </span>
                </div>
                <h3 className="feed-card__title">{comp.title}</h3>
                {comp.description && (
                    <p className="feed-card__desc">{comp.description}</p>
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
                    <span className="feed-card__time">
                        {comp.entry_count}/{comp.max_entries} entries
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
    const error = null;

    return (
        <section className="sector-feed">
            <div className="sector-feed__status">
                <span className={`sector-feed__indicator ${connected ? 'sector-feed__indicator--live' : ''}`} />
                {connected ? 'Live' : 'Connecting...'}
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

            {error && (
                <div className="sector-feed__error">
                    <p>⚠️ {error}</p>
                </div>
            )}

            {!loading && competitions.length === 0 && !error && (
                <div className="sector-feed__empty">
                    <p>No data available for this sector yet.</p>
                    <p className="sector-feed__empty-sub">Data will appear here as events are detected.</p>
                </div>
            )}

            <div className="sector-feed__grid">
                {/* Show competitions first */}
                {competitions.map((comp) => (
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
