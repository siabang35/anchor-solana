'use client';

import React, { useMemo } from 'react';
import { useClusterData } from '@/hooks/useClusterData';

interface SentimentAnalysisProps {
    competitionId?: string;
}

export default function SentimentAnalysis({ competitionId }: SentimentAnalysisProps) {
    const { clusters, loading } = useClusterData(competitionId || 'all');

    const pipeline = useMemo(() => {
        if (!clusters || clusters.length === 0) {
            return {
                sentimentNorm: 0,
                momentum: 0,
                volatility: 0,
                regime: 'neutral',
                timeDecayFactor: 'e^(-λt)'
            };
        }

        const sentiments = clusters.map(c => c.sentiment);
        
        // S(t) = average sentiment
        const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        
        // M(t) = momentum (simple diff between recent half and older half)
        const half = Math.floor(sentiments.length / 2);
        const recentAvg = half > 0 ? sentiments.slice(0, half).reduce((a, b) => a + b, 0) / half : avgSentiment;
        const olderAvg = half > 0 ? sentiments.slice(half).reduce((a, b) => a + b, 0) / (sentiments.length - half) : avgSentiment;
        const momentum = recentAvg - olderAvg;
        
        // V(t) = volatility (std dev)
        const variance = sentiments.reduce((a, b) => a + Math.pow(b - avgSentiment, 2), 0) / sentiments.length;
        const volatility = Math.sqrt(variance);
        
        let regime = 'neutral';
        if (avgSentiment > 0.3 && momentum >= 0) regime = 'bullish';
        else if (avgSentiment < -0.3 && momentum <= 0) regime = 'bearish';
        else if (avgSentiment > 0.5) regime = 'bullish';
        else if (avgSentiment < -0.5) regime = 'bearish';

        return {
            sentimentNorm: avgSentiment,
            momentum,
            volatility,
            regime,
            timeDecayFactor: 'e^(-λt)'
        };
    }, [clusters]);

    const regimeColor = pipeline.regime === 'bullish' ? 'var(--accent-green)' : pipeline.regime === 'bearish' ? 'var(--accent-red)' : 'var(--accent-amber)';

    const displaySources = useMemo(() => {
        return clusters.slice(0, 4).map(c => {
            // sentiment is -1 to 1. map to 0-100% bullish
            const bullishPct = Math.round(((c.sentiment + 1) / 2) * 100);
            const bearishPct = 100 - bullishPct;
            
            let signalText = 'Neutral';
            if (c.sentiment > 0.5) signalText = 'Strong Bullish';
            else if (c.sentiment > 0.1) signalText = 'Bullish';
            else if (c.sentiment < -0.5) signalText = 'Strong Bearish';
            else if (c.sentiment < -0.1) signalText = 'Bearish';
            
            // extract first signal source if exists, else generic
            let sourceName = `Cluster ${c.cluster_hash.slice(0, 6)}`;
            if (c.signals && c.signals.length > 0 && c.signals[0].source) {
                sourceName = c.signals[0].source;
            } else if (c.signals && c.signals.length > 0 && c.signals[0].platform) {
                sourceName = c.signals[0].platform;
                if (sourceName === 'twitter') sourceName = 'Twitter / X';
            }

            return {
                id: c.id,
                name: sourceName,
                icon: sourceName.toLowerCase().includes('twitter') ? '𝕏' : '📰',
                bullish: bullishPct,
                bearish: bearishPct,
                signal: signalText
            };
        });
    }, [clusters]);

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🧠</span> NLP Sentiment Pipeline</h3>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>LLM → Feature → Bayesian</span>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Computing pipeline...
                </div>
            ) : (
                <>
                    {/* Pipeline Metrics */}
                    <div className="pipeline-metrics">
                        <div className="pipeline-metric">
                            <div className="metric-label">S(t)</div>
                            <div className="metric-value" style={{ color: pipeline.sentimentNorm >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                {pipeline.sentimentNorm >= 0 ? '+' : ''}{pipeline.sentimentNorm.toFixed(3)}
                            </div>
                        </div>
                        <div className="pipeline-metric">
                            <div className="metric-label">M(t)</div>
                            <div className="metric-value" style={{ color: pipeline.momentum >= 0 ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}>
                                {pipeline.momentum >= 0 ? '+' : ''}{pipeline.momentum.toFixed(4)}
                            </div>
                        </div>
                        <div className="pipeline-metric">
                            <div className="metric-label">V(t)</div>
                            <div className="metric-value" style={{ color: 'var(--accent-purple)' }}>
                                {pipeline.volatility.toFixed(4)}
                            </div>
                        </div>
                        <div className="pipeline-metric">
                            <div className="metric-label">Regime</div>
                            <div className="metric-value" style={{ color: regimeColor, fontSize: '0.75rem' }}>
                                {pipeline.regime.toUpperCase()}
                            </div>
                        </div>
                    </div>

                    {/* Sentiment Sources */}
                    {displaySources.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No recent signals detected.
                        </div>
                    ) : (
                        displaySources.map((src) => {
                            const signalColor =
                                src.signal.includes('Strong Bullish') ? 'var(--accent-green)' :
                                    src.signal.includes('Bullish') ? 'var(--accent-cyan)' :
                                        src.signal.includes('Bearish') ? 'var(--accent-red)' : 'var(--accent-amber)';

                            const signalBg =
                                src.signal.includes('Strong Bullish') ? 'rgba(16,185,129,0.12)' :
                                    src.signal.includes('Bullish') ? 'rgba(34,211,238,0.12)' :
                                        src.signal.includes('Bearish') ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';

                            return (
                                <div className="sentiment-row" key={src.id}>
                                    <span className="source-icon">{src.icon}</span>
                                    <div className="source-info">
                                        <div className="source-name">{src.name}</div>
                                    </div>
                                    <div className="sentiment-bar">
                                        <div
                                            className={`sentiment-fill ${src.bullish > src.bearish ? 'bullish' : 'bearish'}`}
                                            style={{ width: `${src.bullish}%` }}
                                        />
                                    </div>
                                    <span className="signal-badge" style={{ color: signalColor, background: signalBg }}>
                                        {src.signal}
                                    </span>
                                </div>
                            );
                        })
                    )}

                    {/* Pipeline formula */}
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--gradient-card)',
                        border: '1px solid var(--border-card)',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'center',
                    }}>
                        P(t) = Bayesian(S(t), M(t), V(t)) × TimeDecay({pipeline.timeDecayFactor}) + RegimeShift
                    </div>
                </>
            )}
        </div>
    );
}
