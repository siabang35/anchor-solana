'use client';

import React, { useState } from 'react';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';

export default function DataFeeds({ category }: { category?: string }) {
    const { feeds, loading, connected, refetch } = useLiveFeed(20, category);
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="glass-card card-body animate-in" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', margin: 0, color: 'inherit', textAlign: 'left'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="icon">📡</span> Live Data Feeds
                        {category && category !== 'top' && category !== 'foryou' && (
                            <span style={{
                                marginLeft: '8px',
                                fontSize: '0.65rem',
                                opacity: 0.8,
                                padding: '2px 6px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '4px'
                            }}>
                                {category.toUpperCase()}
                            </span>
                        )}
                    </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); refetch(); }}
                        disabled={loading}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-secondary)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.65rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: loading ? 0.5 : 1
                        }}
                    >
                        {loading ? '↻...' : '↻ Refresh'}
                    </button>
                    <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        background: connected
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        color: connected
                            ? 'var(--accent-green)'
                            : 'var(--accent-amber)',
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                    }}>
                        {connected ? '● Live' : '○ Connecting...'}
                    </span>
                    <span style={{
                        fontSize: '1.1rem', color: 'var(--text-secondary, #94a3b8)',
                        transition: 'transform 0.25s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '28px',
                    }}>⌄</span>
                </div>
            </div>

            <div style={{
                maxHeight: isOpen ? '500px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
                opacity: isOpen ? 1 : 0,
            }}>

            {loading && feeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    Loading live feed data...
                </div>
            )}

            {!loading && feeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    No feed data available yet. Data will appear as events are detected.
                </div>
            )}

            <div className="marquee-container" style={{ overflow: 'hidden', position: 'relative', width: '100%', maxWidth: '100%', padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Fade overlays for the edges */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '100%', background: 'linear-gradient(to right, var(--bg-card), transparent)', zIndex: 2, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '100%', background: 'linear-gradient(to left, var(--bg-card), transparent)', zIndex: 2, pointerEvents: 'none' }} />

                {/* Row 1 (Moves Left) */}
                <div className="marquee-row left" style={{ display: 'flex', width: 'max-content' }}>
                    {[0, 1].map((setIndex) => (
                        <div key={`set1-${setIndex}`} style={{ display: 'flex', gap: '1rem', paddingRight: '1rem' }}>
                            {feeds.filter((_, i) => i % 2 === 0).map((item: LiveFeedItem, idx) => (
                                <div key={`${item.id}-${idx}`} className={`feed-item ${item.impact}`} style={{
                                    display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem',
                                    alignItems: 'center', transition: 'all 0.3s ease',
                                    border: '1px solid var(--border-glass)',
                                    borderRadius: '12px', background: 'var(--bg-input)',
                                    width: '280px', flexShrink: 0
                                }}>
                                    {item.image_url ? (
                                        <div className="feed-item-image-wrapper" style={{
                                            width: '40px', height: '40px', borderRadius: '10px',
                                            overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-glass)'
                                        }}>
                                            <img src={item.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="hover-zoom" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                        </div>
                                    ) : (
                                        <span className="feed-icon" style={{
                                            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'var(--bg-input)', borderRadius: '10px', fontSize: '1.2rem', border: '1px solid var(--border-glass)', flexShrink: 0
                                        }}>{item.icon}</span>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="feed-source" style={{ fontWeight: 700, fontSize: '0.65rem', marginBottom: '2px', color: 'var(--text-secondary)' }}>{item.source}</div>
                                        <div className="feed-text" style={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
                                    </div>
                                    <span className={`feed-impact ${item.impact}`} style={{
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0
                                    }}>{item.impact.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Row 2 (Moves Right) */}
                <div className="marquee-row right" style={{ display: 'flex', width: 'max-content' }}>
                    {[0, 1].map((setIndex) => (
                        <div key={`set2-${setIndex}`} style={{ display: 'flex', gap: '1rem', paddingRight: '1rem' }}>
                            {feeds.filter((_, i) => i % 2 === 1).map((item: LiveFeedItem, idx) => (
                                <div key={`${item.id}-${idx}-row2`} className={`feed-item ${item.impact}`} style={{
                                    display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem',
                                    alignItems: 'center', transition: 'all 0.3s ease',
                                    border: '1px solid var(--border-glass)',
                                    borderRadius: '12px', background: 'var(--bg-input)',
                                    width: '280px', flexShrink: 0
                                }}>
                                    {item.image_url ? (
                                        <div className="feed-item-image-wrapper" style={{
                                            width: '40px', height: '40px', borderRadius: '10px',
                                            overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-glass)'
                                        }}>
                                            <img src={item.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="hover-zoom" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                        </div>
                                    ) : (
                                        <span className="feed-icon" style={{
                                            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'var(--bg-input)', borderRadius: '10px', fontSize: '1.2rem', border: '1px solid var(--border-glass)', flexShrink: 0
                                        }}>{item.icon}</span>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="feed-source" style={{ fontWeight: 700, fontSize: '0.65rem', marginBottom: '2px', color: 'var(--text-secondary)' }}>{item.source}</div>
                                        <div className="feed-text" style={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
                                    </div>
                                    <span className={`feed-impact ${item.impact}`} style={{
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0
                                    }}>{item.impact.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            </div>
        </div>
    );
}
