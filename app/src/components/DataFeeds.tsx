'use client';

import React from 'react';
import { useLiveFeed, LiveFeedItem } from '@/hooks/useLiveFeed';

export default function DataFeeds({ category }: { category?: string }) {
    const { feeds, loading, connected } = useLiveFeed(20, category);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title">
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
                }}>
                    {connected ? '● Live' : '○ Connecting...'}
                </span>
            </div>

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

            <div className="feed-scroll">
                {feeds.map((item: LiveFeedItem) => (
                    <div key={item.id} className={`feed-item ${item.impact}`}>
                        <span className="feed-icon">{item.icon}</span>
                        <div style={{ flex: 1 }}>
                            <div className="feed-source">{item.source}</div>
                            <div className="feed-text">{item.text}</div>
                        </div>
                        <span className={`feed-impact ${item.impact}`}>{item.impact.toUpperCase()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
