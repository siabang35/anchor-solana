'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { apiFetch } from '@/lib/supabase';
import {
    CATEGORIES,
    MODEL_TIERS,
    getMarketsForCategory,
    MarketTemplate,
} from '@/lib/dummy-data';

interface AgentType {
    id: string;
    name: string;
    slug: string;
    description: string;
    sector: string;
    default_strategy: string;
    example_prompts: string[];
    icon_emoji: string;
    color_hex: string;
}

interface DeployedAgentResponse {
    id: string;
    name: string;
    status: string;
    strategy_prompt: string;
    target_outcome: string;
    direction: string;
    risk_level: number;
    deploy_number: number;
    accuracy_score: number;
    total_trades: number;
    total_pnl: number;
    win_rate: number;
    deployed_at: string;
    agent_type?: AgentType;
}

interface AgentLog {
    timestamp: number;
    type: 'info' | 'analysis' | 'trade' | 'signal';
    message: string;
}

interface QuotaInfo {
    total_deployed: number;
    max_deploys: number;
    deploys_remaining: number;
    active_agents: number;
}

type BuilderStep = 'config' | 'deploying' | 'active';

export default function DeployAgent({ initialCategory }: { initialCategory?: string }) {
    const { connected, publicKey } = useWallet();
    const { agents: realtimeAgents } = useRealtimeAgents(publicKey?.toString() || null);

    // Builder state
    const [categoryId, setCategoryId] = useState(initialCategory || '');
    const { competitions } = useCompetitions(categoryId);
    
    const [agentMode, setAgentMode] = useState<'trader' | 'forecaster'>('forecaster');
    const [agentName, setAgentName] = useState('');
    const [subCategoryId, setSubCategoryId] = useState('');
    const [marketIds, setMarketIds] = useState<string[]>([]);
    const [autoSelectedCategory, setAutoSelectedCategory] = useState<string | null>(null);
    const [isMarketsExpanded, setIsMarketsExpanded] = useState(false);
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const [selectedOutcome, setSelectedOutcome] = useState(0);
    const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
    const [strategy, setStrategy] = useState('');
    const [riskLevel, setRiskLevel] = useState(3);
    const [modelTierId, setModelTierId] = useState('free');
    const [step, setStep] = useState<BuilderStep>('config');

    // Agent state
    const [deployedAgent, setDeployedAgent] = useState<DeployedAgentResponse | null>(null);
    const [logs, setLogs] = useState<AgentLog[]>([]);
    const [quota, setQuota] = useState<QuotaInfo | null>(null);
    const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
    const [deploying, setDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedCategory = useMemo(() => CATEGORIES.find(c => c.id === categoryId), [categoryId]);
    const availableMarkets = useMemo(() => {
        return competitions
            .filter(c => c.sector === categoryId)
            .map(c => ({
                id: c.id,
                title: c.title,
                outcomes: c.outcomes || ['Bullish', 'Neutral', 'Bearish'],
                subCategoryId: undefined,
            }));
    }, [competitions, categoryId]);
    const selectedMarket = useMemo(() => availableMarkets.find(m => marketIds.length > 0 && m.id === marketIds[0]), [availableMarkets, marketIds]);
    const selectedTier = useMemo(() => MODEL_TIERS.find(t => t.id === modelTierId) || MODEL_TIERS[0], [modelTierId]);

    // Apply init category if props change
    useEffect(() => {
        if (initialCategory) setCategoryId(initialCategory);
    }, [initialCategory]);

    // Reset dependent fields on category/subcategory change
    useEffect(() => { setSubCategoryId(''); setSelectedOutcome(0); }, [categoryId]);

    // Auto-select all available markets when they load for the selected category
    useEffect(() => {
        if (autoSelectedCategory !== categoryId) {
            if (availableMarkets.length > 0) {
                setMarketIds(availableMarkets.map(m => m.id));
                setAutoSelectedCategory(categoryId);
            } else {
                setMarketIds([]);
            }
        }
    }, [availableMarkets, categoryId, autoSelectedCategory]);
    useEffect(() => { setMarketIds([]); setSelectedOutcome(0); }, [subCategoryId]);
    useEffect(() => { setSelectedOutcome(0); }, [marketIds]);

    // Fetch agent types and quota from backend
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const types = await apiFetch<AgentType[]>('/agents/types');
                if (types) setAgentTypes(types);
            } catch { /* Backend may not be running */ }
            try {
                const q = await apiFetch<QuotaInfo>('/agents/quota', {
                    headers: publicKey ? { 'x-user-id': publicKey.toString() } : {}
                });
                if (q) setQuota(q);
            } catch { /* Backend may not be running */ }
        };
        fetchMeta();
    }, [deployedAgent, publicKey]); // Refresh quota after deploy or wallet change

    const canDeploy = connected && agentName.trim() && categoryId && marketIds.length > 0 && strategy.trim()
        && (!quota || quota.deploys_remaining > 0);

    // ========================
    // Deploy via Backend API
    // ========================
    const handleDeploy = useCallback(async () => {
        if (!canDeploy || !selectedMarket) return;
        setStep('deploying');
        setDeploying(true);
        setError(null);
        setLogs([]);

        // Simulate deployment progress logs
        const deployLogs: AgentLog[] = [
            { timestamp: Date.now(), type: 'info', message: '🚀 Initializing AI Agent deployment...' },
            { timestamp: Date.now() + 500, type: 'info', message: `📝 Strategy loaded: "${strategy.slice(0, 80)}${strategy.length > 80 ? '...' : ''}"` },
            { timestamp: Date.now() + 1200, type: 'info', message: '🔗 Connecting to backend API...' },
        ];

        // Show initial logs
        for (let i = 0; i < deployLogs.length; i++) {
            await new Promise(r => setTimeout(r, 800));
            setLogs(prev => [...prev, deployLogs[i]]);
        }

        try {
            // Find matching agent type from backend
            const matchingType = agentTypes.find(t => t.sector === categoryId) || agentTypes[0];

            const isForecaster = agentMode === 'forecaster';
            const body = isForecaster ? {
                name: agentName.trim(),
                system_prompt: strategy,
                competition_ids: marketIds
            } : {
                name: agentName.trim(),
                agent_type_id: matchingType?.id || categoryId,
                market_ids: marketIds,
                strategy_prompt: strategy,
                target_outcome: selectedMarket.outcomes[selectedOutcome] || 'home',
                direction: direction === 'UP' ? 'long' : 'short',
                risk_level: riskLevel,
            };

            const endpoint = isForecaster ? '/agents/deploy-forecaster' : '/agents/deploy';

            // Call backend API
            const result = await apiFetch<DeployedAgentResponse>(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                },
                body: JSON.stringify(body),
            });

            setDeployedAgent(result);
            setLogs(prev => [
                ...prev,
                { timestamp: Date.now(), type: 'info', message: '✅ Backend deployment successful!' },
                { timestamp: Date.now() + 100, type: 'info', message: `🆔 Agent ID: ${result.id}` },
                { timestamp: Date.now() + 200, type: 'info', message: `📊 Deploy #${result.deploy_number} — Quota: ${quota ? `${quota.total_deployed + 1}/${quota.max_deploys}` : 'N/A'}` },
                { timestamp: Date.now() + 300, type: 'info', message: '🔗 On-chain registration queued (Solana devnet)...' },
                { timestamp: Date.now() + 500, type: 'signal', message: '✨ Agent is now LIVE — monitoring feeds and generating signals...' },
            ]);
            setStep('active');
        } catch (err: any) {
            setError(err.message || 'Deployment failed');
            setLogs(prev => [
                ...prev,
                { timestamp: Date.now(), type: 'info', message: `❌ API Error: ${err.message || 'Unknown error'}` },
                { timestamp: Date.now() + 100, type: 'info', message: '⚡ Falling back to local simulation mode...' },
            ]);
            // Fallback: create a simulated agent
            setDeployedAgent({
                id: `local-${Date.now()}`,
                name: agentName.trim(),
                status: 'active',
                strategy_prompt: strategy,
                target_outcome: selectedMarket.outcomes[selectedOutcome],
                direction: direction === 'UP' ? 'long' : 'short',
                risk_level: riskLevel,
                deploy_number: 0,
                accuracy_score: 0,
                total_trades: 0,
                total_pnl: 0,
                win_rate: 0,
                deployed_at: new Date().toISOString(),
            });
            setStep('active');
        } finally {
            setDeploying(false);
        }
    }, [canDeploy, agentName, strategy, selectedOutcome, direction, riskLevel, selectedMarket, agentTypes, categoryId, marketIds, quota]);

    const handleTerminate = async () => {
        if (deployedAgent && !deployedAgent.id.startsWith('local-')) {
            try {
                await apiFetch(`/agents/${deployedAgent.id}/toggle`, { 
                    method: 'PATCH',
                    headers: publicKey ? { 'x-user-id': publicKey.toString() } : {}
                });
            } catch { /* Best-effort */ }
        }
        setDeployedAgent(null);
        setAgentName('');
        setStrategy('');
        setLogs([]);
        setError(null);
        setStep('config');
    };

    const statusLabels: Record<string, string> = {
        deploying: '🚀 Deploying...',
        analyzing: '🧠 Analyzing Data...',
        trading: '📊 Executing Trades...',
        active: '✅ Active & Trading',
        paused: '⏸ Paused',
        terminated: '🛑 Terminated',
    };

    // ===== RENDER CONTENT HELPER =====
    const renderContent = () => {
        if (step === 'config') {
            return (
                <div className="glass-card card-body animate-in" style={{ height: '100%', overflowY: 'auto' }}>
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 className="section-title"><span className="icon">🔓</span> Build AI Agent</h3>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                            {quota ? `${quota.deploys_remaining}/${quota.max_deploys} deploys left` : 'Max 7 free deploys (7 prompts each)'}
                        </span>
                    </div>
                    {isMobileDrawerOpen && (
                        <button 
                            onClick={() => setIsMobileDrawerOpen(false)}
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)',
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '1.2rem',
                                padding: 0,
                                flexShrink: 0
                            }}
                            aria-label="Close Deploy Drawer"
                        >
                            &times;
                        </button>
                    )}
                </div>

                {/* Quota Warning */}
                {quota && quota.deploys_remaining <= 2 && (
                    <div style={{
                        padding: '0.4rem 0.65rem', marginBottom: '0.5rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                        fontSize: '0.6rem', color: 'var(--accent-amber)',
                    }}>
                        ⚠️ {quota.deploys_remaining === 0
                            ? 'Deploy limit reached! Terminate an active agent to free a slot.'
                            : `Only ${quota.deploys_remaining} deploy(s) remaining in free tier.`}
                    </div>
                )}

                {/* Agent Mode Toggle */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 'var(--radius-round)', padding: '0.2rem' }}>
                        <button
                            onClick={() => setAgentMode('forecaster')}
                            style={{
                                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                background: agentMode === 'forecaster' ? 'var(--accent-primary)' : 'transparent',
                                color: agentMode === 'forecaster' ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                            }}
                        >
                            🧠 Qwen Forecaster
                        </button>
                        <button
                            onClick={() => setAgentMode('trader')}
                            style={{
                                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                background: agentMode === 'trader' ? 'var(--accent-indigo)' : 'transparent',
                                color: agentMode === 'trader' ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                            }}
                        >
                            ⚡ Trading Agent
                        </button>
                    </div>
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
                        {CATEGORIES.filter(cat => !initialCategory || cat.id === initialCategory).map(cat => (
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

                {/* Market Selection (Multi-Select) */}
                {categoryId && availableMarkets.length > 0 && (
                    <div className="form-group">
                        <div 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '0.6rem 0.8rem',
                                background: 'var(--bg-input)',
                                borderRadius: 'var(--radius-xs)',
                                border: '1px solid var(--border-card)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => setIsMarketsExpanded(!isMarketsExpanded)}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Target Markets</label>
                                <span style={{ fontSize: '0.65rem', color: marketIds.length === availableMarkets.length ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 600 }}>
                                    {marketIds.length} of {availableMarkets.length} markets selected
                                </span>
                            </div>
                            <div style={{
                                transform: isMarketsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease',
                                color: 'var(--text-muted)',
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '24px',
                                height: '24px',
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: '50%'
                            }}>
                                ▼
                            </div>
                        </div>

                        {/* Dropdown / Collapsible Content */}
                        {isMarketsExpanded && (
                            <div style={{ 
                                marginTop: '0.4rem',
                                padding: '0.6rem',
                                background: 'rgba(0,0,0,0.1)',
                                borderRadius: 'var(--radius-xs)',
                                border: '1px solid var(--border-card)'
                            }}>
                                {/* Select All / Deselect All (Moved to top for better UX) */}
                                {availableMarkets.length > 1 && (
                                    <button
                                        onClick={() => {
                                            if (marketIds.length === availableMarkets.length) {
                                                setMarketIds([]);
                                            } else {
                                                setMarketIds(availableMarkets.map(m => m.id));
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem 0.6rem',
                                            borderRadius: 'var(--radius-xs)',
                                            border: '1px dashed var(--border-card)',
                                            background: 'rgba(0,0,0,0.2)',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            marginBottom: '0.6rem'
                                        }}
                                    >
                                        {marketIds.length === availableMarkets.length ? '✕ Deselect All Markets' : '✓ Select All Markets'}
                                    </button>
                                )}

                                <div className="feed-scroll" style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '0.4rem', 
                                    maxHeight: '220px', 
                                    overflowY: 'auto',
                                    paddingRight: '6px'
                                }}>
                                    {availableMarkets.map(m => {
                                        const isSelected = marketIds.includes(m.id);
                                        return (
                                            <button
                                                key={m.id}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setMarketIds(prev => prev.filter(id => id !== m.id));
                                                    } else {
                                                        setMarketIds(prev => [...prev, m.id]);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    borderRadius: 'var(--radius-xs)',
                                                    border: isSelected ? '1px solid var(--accent-indigo)' : '1px solid var(--border-card)',
                                                    background: isSelected ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)',
                                                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    textAlign: 'left',
                                                    width: '100%'
                                                }}
                                            >
                                                <div style={{
                                                    width: '14px',
                                                    height: '14px',
                                                    borderRadius: '3px',
                                                    border: '1px solid',
                                                    borderColor: isSelected ? 'var(--accent-indigo)' : 'var(--border-card)',
                                                    background: isSelected ? 'var(--accent-indigo)' : 'transparent',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    {isSelected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>}
                                                </div>
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                
                                {marketIds.length === 0 && (
                                    <div style={{ width: '100%', fontSize: '0.6rem', color: 'var(--accent-amber)', marginTop: '0.4rem', fontStyle: 'italic', textAlign: 'center' }}>
                                        ⚠️ You must select at least one market to deploy the agent.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Outcome Selection */}
                {selectedMarket && agentMode === 'trader' && (
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
                {marketIds.length > 0 && agentMode === 'trader' && (
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
                {marketIds.length > 0 && (
                    <div className="form-group">
                        <label className="form-label">{agentMode === 'forecaster' ? 'System Prompt / Knowledge Base' : 'Strategy Prompt'}</label>
                        <textarea
                            className="form-textarea"
                            placeholder={agentMode === 'forecaster' ? `e.g. "Focus deeply on regulatory announcements and ignore short-term market noise."` : `e.g. "Analyze social sentiment for ${selectedMarket?.title || 'this market'} and take ${direction} positions when bullish confidence exceeds 65%"`}
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
                {marketIds.length > 0 && agentMode === 'trader' && (
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
                    disabled={!canDeploy || deploying}
                    style={{ marginTop: '0.5rem' }}
                >
                    {!connected ? '🔗 Connect Wallet First'
                        : quota && quota.deploys_remaining <= 0 ? '⚠️ Deploy Limit Reached'
                        : !canDeploy ? '⚠️ Complete All Fields'
                        : deploying ? '⏳ Deploying...'
                        : `🚀 Deploy "${agentName || 'Agent'}" — ${selectedTier.badge} Tier`}
                </button>

                {!connected && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        Connect your Solana wallet to deploy on devnet
                    </div>
                )}

                {/* Scope info */}
                {categoryId && marketIds.length > 0 && (
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
                        {` → ${marketIds.length} Market${marketIds.length > 1 ? 's' : ''} Selected`}
                        <br />
                        🔗 Deploys via NestJS API → Supabase (realtime) + Solana devnet (on-chain)
                    </div>
                )}
            </div>
            );
        }

        // ===== DEPLOYING / ACTIVE STEP =====
        return (
            <div className="glass-card card-body animate-in" style={{ height: '100%', overflowY: 'auto' }}>
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h3 className="section-title"><span className="icon">🤖</span> {deployedAgent?.name || 'Agent'}</h3>
                    {deployedAgent && <span className={`agent-status ${deployedAgent.status}`}><span className="status-dot" />{statusLabels[deployedAgent.status] || deployedAgent.status}</span>}
                </div>
                {isMobileDrawerOpen && (
                    <button 
                        onClick={() => setIsMobileDrawerOpen(false)}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-secondary)',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: 0,
                            flexShrink: 0
                        }}
                    >
                        &times;
                    </button>
                )}
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
                {marketIds.length > 0 && (
                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)' }}>
                        {marketIds.length} Markets Targeted
                    </span>
                )}
                <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-round)',
                    background: `${selectedTier.color}15`, color: selectedTier.color,
                    fontWeight: 700,
                }}>
                    {selectedTier.icon} {selectedTier.badge}
                </span>
                {deployedAgent?.id && !deployedAgent.id.startsWith('local-') && (
                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-indigo)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem' }}>
                        ID: {deployedAgent.id.slice(0, 8)}...
                    </span>
                )}
            </div>

            {/* Stats */}
            {deployedAgent && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Trades', value: `${deployedAgent.total_trades}`, color: 'var(--text-primary)' },
                        { label: 'P&L', value: `${deployedAgent.total_pnl >= 0 ? '+' : ''}${deployedAgent.total_pnl.toFixed(3)}`, color: deployedAgent.total_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                        { label: 'Accuracy', value: `${deployedAgent.accuracy_score.toFixed(0)}%`, color: 'var(--accent-cyan)' },
                        { label: 'Deploy #', value: `${deployedAgent.deploy_number}`, color: 'var(--accent-amber)' },
                    ].map(s => (
                        <div key={s.label} style={{
                            flex: 1, minWidth: 70, textAlign: 'center', padding: '0.45rem',
                            borderRadius: 'var(--radius-xs)', background: 'var(--gradient-card)', border: '1px solid var(--border-card)',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '0.35rem 0.6rem', marginBottom: '0.5rem',
                    borderRadius: 'var(--radius-xs)',
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                    fontSize: '0.6rem', color: 'var(--accent-amber)',
                }}>
                    ⚠️ Running in simulation mode — backend API not available
                </div>
            )}

            {/* Console */}
            <div className="agent-console">
                {logs.map((log, i) => (
                    <div key={i} className={`agent-log ${log.type}`}>
                        <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.message}
                    </div>
                ))}
                {step === 'deploying' && (
                    <div className="agent-log info"><span className="spinner" /> Processing...</div>
                )}
            </div>

            {/* Wagering Section */}
            {deployedAgent && step === 'active' && (
                <div style={{
                    marginTop: '0.75rem',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-xs)',
                    background: 'rgba(99,102,241,0.05)',
                    border: '1px solid rgba(99,102,241,0.2)',
                }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                        🎲 Agent Wager (Optional)
                    </div>
                    <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                        Bet on your agent's performance vs others. <strong style={{ color: '#10b981' }}>50% refund on loss</strong> — we believe in fair competition.
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                            type="number"
                            placeholder="SOL amount"
                            min={0.01}
                            step={0.01}
                            className="form-select"
                            style={{ flex: 1, fontSize: '0.7rem' }}
                        />
                        <button
                            className="btn-primary"
                            style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap' }}
                            onClick={() => {
                                // Wager creation would call /agents/wager endpoint
                                setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '🎲 Wager submitted! Tracking your agent...' }]);
                            }}
                        >
                            Place Wager
                        </button>
                    </div>
                    <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Max 7 free prompts per agent · Brier Score evaluation · Leaderboard ranking
                    </div>
                </div>
            )}

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
    };

    return (
        <>
            {/* Mobile Toggle Button */}
            <button 
                className="btn-primary mobile-deploy-toggle"
                onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
                style={{
                    position: 'fixed',
                    right: isMobileDrawerOpen ? '10px' : '-4px', // Slight inset when closed
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 999,
                    width: 'auto',
                    padding: '0.8rem 0.5rem 0.8rem 0.8rem',
                    borderRadius: '12px 0 0 12px',
                    boxShadow: 'var(--shadow-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.3s ease',
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                }}
            >
                <div style={{ transform: isMobileDrawerOpen ? 'rotate(180deg) translateY(-2px)' : 'rotate(0deg)' }}>◀</div>
                {!isMobileDrawerOpen && (
                    <span style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>DEPLOY AI</span>
                )}
            </button>

            {/* Main Wrapper */}
            <div className={`deploy-agent-wrapper ${isMobileDrawerOpen ? 'mobile-open' : ''}`}>
                {renderContent()}
            </div>
        </>
    );
}
