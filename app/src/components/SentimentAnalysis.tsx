'use client';

import React, { useState, useEffect } from 'react';
import { getSentimentSources, nlpEngine } from '@/lib/dummy-data';

export default function SentimentAnalysis() {
    const [sources, setSources] = useState(getSentimentSources());
    const [pipeline, setPipeline] = useState(nlpEngine.getState());

    useEffect(() => {
        const interval = setInterval(() => {
            setSources(getSentimentSources());
            setPipeline(nlpEngine.getState());
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const regimeColor = pipeline.regime === 'bullish' ? 'var(--accent-green)' : pipeline.regime === 'bearish' ? 'var(--accent-red)' : 'var(--accent-amber)';

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🧠</span> NLP Sentiment Pipeline</h3>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>LLM → Feature → Bayesian</span>
            </div>

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
            {sources.map((src, i) => {
                const signalColor =
                    src.signal.includes('Strong Bullish') ? 'var(--accent-green)' :
                        src.signal.includes('Bullish') ? 'var(--accent-cyan)' :
                            src.signal.includes('Bearish') ? 'var(--accent-red)' : 'var(--accent-amber)';

                const signalBg =
                    src.signal.includes('Strong Bullish') ? 'rgba(16,185,129,0.12)' :
                        src.signal.includes('Bullish') ? 'rgba(34,211,238,0.12)' :
                            src.signal.includes('Bearish') ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';

                return (
                    <div className="sentiment-row" key={i}>
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
            })}

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
        </div>
    );
}
