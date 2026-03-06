'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
    DeployedAgent,
    createAgentDeployLogs,
    simulateAgentStep,
    nlpEngine,
    ProbabilityPoint,
    CATEGORIES,
    MODEL_TIERS,
    getMarketsForCategory,
    MarketTemplate,
    ModelTier,
} from '@/lib/dummy-data';

interface Props {
    currentProbs: ProbabilityPoint;
}

type BuilderStep = 'config' | 'deploying' | 'active';

export default function DeployAgent({ currentProbs }: Props) {
    const { connected } = useWallet();

    // Builder state
    const [agentName, setAgentName] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [subCategoryId, setSubCategoryId] = useState('');
    const [marketId, setMarketId] = useState('');
    const [selectedOutcome, setSelectedOutcome] = useState(0);
    const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
    const [strategy, setStrategy] = useState('');
    const [riskLevel, setRiskLevel] = useState(3);
    const [modelTierId, setModelTierId] = useState('free');
    const [step, setStep] = useState<BuilderStep>('config');

    // Agent state
    const [agent, setAgent] = useState<DeployedAgent | null>(null);
    const [logIndex, setLogIndex] = useState(0);

    const selectedCategory = useMemo(() => CATEGORIES.find(c => c.id === categoryId), [categoryId]);
    const availableMarkets = useMemo(() => getMarketsForCategory(categoryId, subCategoryId || undefined), [categoryId, subCategoryId]);
    const selectedMarket = useMemo(() => availableMarkets.find(m => m.id === marketId), [availableMarkets, marketId]);
    const selectedTier = useMemo(() => MODEL_TIERS.find(t => t.id === modelTierId) || MODEL_TIERS[0], [modelTierId]);

    // Reset dependent fields on category/subcategory change
    useEffect(() => { setSubCategoryId(''); setMarketId(''); setSelectedOutcome(0); }, [categoryId]);
    useEffect(() => { setMarketId(''); setSelectedOutcome(0); }, [subCategoryId]);
    useEffect(() => { setSelectedOutcome(0); }, [marketId]);

    const canDeploy = connected && agentName.trim() && categoryId && marketId && strategy.trim();

    const handleDeploy = useCallback(() => {
        if (!canDeploy || !selectedMarket) return;
        setStep('deploying');

        const logs = createAgentDeployLogs(strategy);
        const newAgent: DeployedAgent = {
            id: `agent-${Date.now()}`,
            name: agentName.trim(),
            strategy,
            targetOutcome: selectedOutcome,
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

        logs.forEach((log, i) => {
            setTimeout(() => {
                setAgent(prev => {
                    if (!prev) return prev;
                    const updatedLogs = [...prev.logs, log];
                    const newStatus = i < 2 ? 'deploying' : i < 5 ? 'analyzing' : i < 7 ? 'trading' : 'active';
                    return { ...prev, logs: updatedLogs, status: newStatus };
                });
                setLogIndex(i + 1);
                if (i === logs.length - 1) setStep('active');
            }, (i + 1) * 1000);
        });
    }, [canDeploy, agentName, strategy, selectedOutcome, direction, riskLevel, selectedMarket]);

    // Agent simulation loop
    useEffect(() => {
        if (!agent || step !== 'active') return;
        const interval = setInterval(() => {
            setAgent(prev => (prev ? simulateAgentStep(prev, currentProbs) : prev));
        }, 3000);
        return () => clearInterval(interval);
    }, [agent, step, currentProbs]);

    const handleTerminate = () => {
        setAgent(null);
        setAgentName('');
        setStrategy('');
        setStep('config');
    };

    const statusLabels: Record<string, string> = {
        deploying: '🚀 Deploying...',
        analyzing: '🧠 Analyzing Data...',
        trading: '📊 Executing Trades...',
        active: '✅ Active & Trading',
    };

    // ===== CONFIG STEP =====
    if (step === 'config') {
        return (
            <div className="glass-card card-body animate-in">
                <div className="section-header">
                    <h3 className="section-title"><span className="icon">🔓</span> Build AI Agent</h3>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>OpenClaw Engine</span>
                </div>

                {/* Agent Name */}
                <div className="form-group">
                    <label className="form-label">Agent Name</label>
                    <input
                        type="text"
                        className="form-select"
                        placeholder="e.g. SentimentHawk, GoalPredictor, CryptoOracle..."
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        maxLength={32}
                        style={{ fontFamily: 'var(--font-sans)' }}
                    />
                </div>

                {/* Category Selection */}
                <div className="form-group">
                    <label className="form-label">Category</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.4rem' }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCategoryId(cat.id)}
                                style={{
                                    padding: '0.5rem 0.4rem',
                                    borderRadius: 'var(--radius-xs)',
                                    border: categoryId === cat.id ? '2px solid var(--accent-indigo)' : '1px solid var(--border-card)',
                                    background: categoryId === cat.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)',
                                    color: categoryId === cat.id ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    transition: 'all 0.2s',
                                    lineHeight: 1.3,
                                }}
                            >
                                <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{cat.icon}</div>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sub-Category (Sports only) */}
                {selectedCategory?.subCategories && (
                    <div className="form-group">
                        <label className="form-label">{selectedCategory.name} — Discipline</label>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {selectedCategory.subCategories.map(sub => (
                                <button
                                    key={sub.id}
                                    onClick={() => setSubCategoryId(sub.id)}
                                    style={{
                                        padding: '0.35rem 0.6rem',
                                        borderRadius: 'var(--radius-round)',
                                        border: subCategoryId === sub.id ? '2px solid var(--accent-cyan)' : '1px solid var(--border-card)',
                                        background: subCategoryId === sub.id ? 'rgba(34,211,238,0.1)' : 'var(--bg-input)',
                                        color: subCategoryId === sub.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {sub.icon} {sub.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Market Selection */}
                {categoryId && availableMarkets.length > 0 && (
                    <div className="form-group">
                        <label className="form-label">Select Market</label>
                        <select className="form-select" value={marketId} onChange={(e) => setMarketId(e.target.value)}>
                            <option value="">— Choose a market —</option>
                            {availableMarkets.map(m => (
                                <option key={m.id} value={m.id}>{m.title}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Outcome Selection */}
                {selectedMarket && (
                    <div className="form-group">
                        <label className="form-label">Target Outcome</label>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {selectedMarket.outcomes.map((out, i) => (
                                <button
                                    key={i}
                                    onClick={() => setSelectedOutcome(i)}
                                    style={{
                                        padding: '0.4rem 0.65rem',
                                        borderRadius: 'var(--radius-round)',
                                        border: selectedOutcome === i ? '2px solid var(--accent-green)' : '1px solid var(--border-card)',
                                        background: selectedOutcome === i ? 'rgba(16,185,129,0.1)' : 'var(--bg-input)',
                                        color: selectedOutcome === i ? 'var(--accent-green)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {out}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Direction */}
                {marketId && (
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
                )}

                {/* Strategy Prompt */}
                {marketId && (
                    <div className="form-group">
                        <label className="form-label">Strategy Prompt</label>
                        <textarea
                            className="form-textarea"
                            placeholder={`e.g. "Analyze social sentiment for ${selectedMarket?.title || 'this market'} and take ${direction} positions when bullish confidence exceeds 65%"`}
                            value={strategy}
                            onChange={(e) => setStrategy(e.target.value)}
                            maxLength={256}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {strategy.length}/256
                        </div>
                    </div>
                )}

                {/* Risk Level */}
                {marketId && (
                    <div className="form-group">
                        <label className="form-label">Risk Level: {riskLevel}/5</label>
                        <input type="range" className="risk-slider" min={1} max={5} value={riskLevel} onChange={(e) => setRiskLevel(Number(e.target.value))} />
                        <div className="risk-levels">
                            <span>Conservative</span><span>Moderate</span><span>Aggressive</span>
                        </div>
                    </div>
                )}

                {/* Model Tier */}
                <div className="form-group">
                    <label className="form-label">Model Tier</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {MODEL_TIERS.map(tier => (
                            <button
                                key={tier.id}
                                onClick={() => setModelTierId(tier.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: 'var(--radius-xs)',
                                    border: modelTierId === tier.id ? `2px solid ${tier.color}` : '1px solid var(--border-card)',
                                    background: modelTierId === tier.id ? 'var(--bg-card-hover)' : 'var(--bg-input)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span style={{ fontSize: '1.3rem' }}>{tier.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{tier.name}</span>
                                        <span style={{
                                            fontSize: '0.5rem', fontWeight: 800, padding: '1px 6px',
                                            borderRadius: 'var(--radius-round)',
                                            background: `${tier.color}20`, color: tier.color,
                                            letterSpacing: '0.05em',
                                        }}>{tier.badge}</span>
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                        {tier.dataSources} sources · {tier.updateFreq} · {tier.price}
                                    </div>
                                </div>
                                {modelTierId === tier.id && (
                                    <span style={{ color: tier.color, fontSize: '1rem' }}>✓</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Deploy Button */}
                <button
                    className="btn-primary"
                    onClick={handleDeploy}
                    disabled={!canDeploy}
                    style={{ marginTop: '0.5rem' }}
                >
                    {!connected ? '🔗 Connect Wallet First' : !canDeploy ? '⚠️ Complete All Fields' : `🚀 Deploy "${agentName || 'Agent'}" — ${selectedTier.badge} Tier`}
                </button>

                {!connected && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        Connect your Solana wallet to deploy on devnet
                    </div>
                )}

                {/* Scope info */}
                {categoryId && selectedMarket && (
                    <div style={{
                        marginTop: '0.6rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--gradient-card)',
                        border: '1px solid var(--border-card)',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                    }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 }}>
                            📌 Agent Scope
                        </div>
                        {selectedCategory?.icon} {selectedCategory?.name}
                        {selectedCategory?.subCategories && subCategoryId && ` → ${selectedCategory.subCategories.find(s => s.id === subCategoryId)?.name}`}
                        {` → ${selectedMarket.title}`}
                        <br />
                        This agent will only analyze data relevant to this specific market. It will not interfere with agents scoped to other categories.
                    </div>
                )}
            </div>
        );
    }

    // ===== DEPLOYING / ACTIVE STEP =====
    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">🤖</span> {agent?.name || 'Agent'}</h3>
                {agent && <span className={`agent-status ${agent.status}`}><span className="status-dot" />{statusLabels[agent.status]}</span>}
            </div>

            {/* Agent context banner */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.6rem',
            }}>
                <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-indigo)' }}>
                    {selectedCategory?.icon} {selectedCategory?.name}
                </span>
                {subCategoryId && selectedCategory?.subCategories && (
                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>
                        {selectedCategory.subCategories.find(s => s.id === subCategoryId)?.icon} {selectedCategory.subCategories.find(s => s.id === subCategoryId)?.name}
                    </span>
                )}
                <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)' }}>
                    {selectedMarket?.title}
                </span>
                <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-round)',
                    background: `${selectedTier.color}15`, color: selectedTier.color,
                    fontWeight: 700,
                }}>
                    {selectedTier.icon} {selectedTier.badge}
                </span>
            </div>

            {/* Stats */}
            {agent && agent.trades.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Trades', value: `${agent.trades.length}`, color: 'var(--text-primary)' },
                        { label: 'P&L', value: `${agent.totalPnl >= 0 ? '+' : ''}${agent.totalPnl.toFixed(3)}`, color: agent.totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                        { label: 'Accuracy', value: `${agent.accuracy.toFixed(0)}%`, color: 'var(--accent-cyan)' },
                    ].map(s => (
                        <div key={s.label} style={{
                            flex: 1, minWidth: 80, textAlign: 'center', padding: '0.45rem',
                            borderRadius: 'var(--radius-xs)', background: 'var(--gradient-card)', border: '1px solid var(--border-card)',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Console */}
            <div className="agent-console">
                {agent?.logs.map((log, i) => (
                    <div key={i} className={`agent-log ${log.type}`}>
                        <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.message}
                    </div>
                ))}
                {step === 'deploying' && (
                    <div className="agent-log info"><span className="spinner" /> Processing...</div>
                )}
            </div>

            {/* Terminate */}
            <button
                className="btn-primary"
                onClick={handleTerminate}
                style={{ marginTop: '0.75rem', background: 'rgba(239,68,68,0.12)', color: 'var(--accent-red)' }}
            >
                ✕ Terminate & Build New Agent
            </button>
        </div>
    );
}
