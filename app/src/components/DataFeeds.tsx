'use client';

import React, { useEffect, useState } from 'react';
import { getRandomFeedItem, FeedItem } from '@/lib/dummy-data';

export default function DataFeeds() {
    const [feeds, setFeeds] = useState<FeedItem[]>([]);

    useEffect(() => {
        // Load initial feeds
        const initial = Array.from({ length: 4 }, () => getRandomFeedItem());
        setFeeds(initial);

        // Simulate live feed
        const interval = setInterval(() => {
            const newItem = getRandomFeedItem();
            setFeeds((prev) => [newItem, ...prev.slice(0, 7)]);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">📡</span> Live Data Feeds</h3>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Dummy Simulation</span>
            </div>
            <div className="feed-scroll">
                {feeds.map((item) => (
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
