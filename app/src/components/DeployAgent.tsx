'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
    DeployedAgent,
    createAgentDeployLogs,
    simulateAgentStep,
    nlpEngine,
    ProbabilityPoint,
} from '@/lib/dummy-data';

interface Props {
    currentProbs: ProbabilityPoint;
}

export default function DeployAgent({ currentProbs }: Props) {
    const { connected } = useWallet();
    const [strategy, setStrategy] = useState('');
    const [outcome, setOutcome] = useState('0');
    const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
    const [riskLevel, setRiskLevel] = useState(3);
    const [agent, setAgent] = useState<DeployedAgent | null>(null);
    const [deploying, setDeploying] = useState(false);
    const [logIndex, setLogIndex] = useState(0);

    const handleDeploy = useCallback(() => {
        if (!connected || !strategy) return;
        setDeploying(true);

        const logs = createAgentDeployLogs(strategy);
        const newAgent: DeployedAgent = {
            id: `agent-${Date.now()}`,
            name: `Agent-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            strategy,
            targetOutcome: parseInt(outcome),
            direction,
            riskLevel,
            status: 'deploying',
            createdAt: Date.now(),
            trades: [],
            accuracy: 0,
            totalPnl: 0,
            logs: [],
        };

        setAgent(newAgent);
        setLogIndex(0);

        // Animate log entries one by one
        logs.forEach((log, i) => {
            setTimeout(() => {
                setAgent(prev => {
                    if (!prev) return prev;
                    return { ...prev, logs: [...prev.logs, log] };
                });
                setLogIndex(i + 1);
                if (i === logs.length - 1) {
                    setDeploying(false);
                }
            }, (i + 1) * 1000);
        });
    }, [connected, strategy, outcome, direction, riskLevel]);

    // Simulate agent after deployment
    useEffect(() => {
        if (!agent || deploying) return;
        const interval = setInterval(() => {
            setAgent(prev => {
                if (!prev) return prev;
                return simulateAgentStep(prev, currentProbs);
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [agent, deploying, currentProbs]);

    const statusLabels: Record<string, string> = {
        deploying: '🚀 Deploying...',
        analyzing: '🧠 Analyzing Data...',
        trading: '📊 Executing Trades...',
        active: '✅ Active & Trading',
    };

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🔓</span> Deploy AI Agent (OpenClaw)</h3>
            </div>

            {!agent ? (
                <>
                    <div className="form-group">
                        <label className="form-label">Strategy Prompt</label>
                        <textarea
                            className="form-textarea"
                            placeholder="e.g. Analyze social media sentiment for Home team momentum signals and take UP positions when bullish sentiment exceeds 65%"
                            value={strategy}
                            onChange={(e) => setStrategy(e.target.value)}
                            maxLength={256}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {strategy.length}/256
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Target Outcome</label>
                        <select className="form-select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                            <option value="0">🏠 Home Win</option>
                            <option value="1">🤝 Draw</option>
                            <option value="2">✈️ Away Win</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Direction</label>
                        <div className="direction-btns">
                            <button className={`dir-btn up ${direction === 'UP' ? 'active' : ''}`} onClick={() => setDirection('UP')}>
                                📈 UP (Probability ↑)
                            </button>
                            <button className={`dir-btn down ${direction === 'DOWN' ? 'active' : ''}`} onClick={() => setDirection('DOWN')}>
                                📉 DOWN (Probability ↓)
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Risk Level: {riskLevel}/5</label>
                        <input type="range" className="risk-slider" min={1} max={5} value={riskLevel} onChange={(e) => setRiskLevel(Number(e.target.value))} />
                        <div className="risk-levels">
                            <span>Conservative</span>
                            <span>Moderate</span>
                            <span>Aggressive</span>
                        </div>
                    </div>

                    <button className="btn-primary" onClick={handleDeploy} disabled={!connected || !strategy}>
                        {!connected ? '🔗 Connect Wallet First' : '🚀 Deploy Agent'}
                    </button>

                    {!connected && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Connect your Solana wallet to deploy an agent on devnet
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Agent Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{agent.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                {['Home Win', 'Draw', 'Away Win'][agent.targetOutcome]} · {agent.direction}
                            </div>
                        </div>
                        <span className={`agent-status ${agent.status}`}>
                            <span className="status-dot" />
                            {statusLabels[agent.status]}
                        </span>
                    </div>

                    {/* Agent Stats */}
                    {agent.trades.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', borderRadius: 'var(--radius-xs)', background: 'var(--gradient-card)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trades</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{agent.trades.length}</div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', borderRadius: 'var(--radius-xs)', background: 'var(--gradient-card)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>P&L</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: agent.totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                    {agent.totalPnl >= 0 ? '+' : ''}{agent.totalPnl.toFixed(3)}
                                </div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', borderRadius: 'var(--radius-xs)', background: 'var(--gradient-card)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accuracy</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                                    {agent.accuracy.toFixed(0)}%
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Console */}
                    <div className="agent-console">
                        {agent.logs.map((log, i) => (
                            <div key={i} className={`agent-log ${log.type}`}>
                                <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                {log.message}
                            </div>
                        ))}
                        {deploying && <div className="agent-log info"><span className="spinner" /> <span className="typing-dots"> Processing</span></div>}
                    </div>

                    {/* Reset */}
                    <button
                        className="btn-primary"
                        onClick={() => { setAgent(null); setStrategy(''); }}
                        style={{ marginTop: '0.75rem', background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}
                    >
                        ✕ Terminate & Deploy New Agent
                    </button>
                </>
            )}
        </div>
    );
}
