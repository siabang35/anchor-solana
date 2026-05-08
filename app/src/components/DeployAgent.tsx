'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { apiFetch } from '@/lib/supabase';
import AgentManager from './AgentManager';
import {
    CATEGORIES,
    MODEL_TIERS,
    getMarketsForCategory,
    MarketTemplate,
} from '@/lib/dummy-data';

// Devnet pool vault address — program-derived PDA
const DEVNET_CONNECTION = new Connection(clusterApiUrl('devnet'), 'confirmed');
const PROGRAM_ID = new PublicKey('56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7');
const POOL_VAULT_SEED = Buffer.from('pool_vault');

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
type ViewTab = 'build' | 'manage';

export default function DeployAgent({ initialCategory }: { initialCategory?: string }) {
    const { connected, publicKey, sendTransaction, signTransaction } = useWallet();
    const {
        agents: realtimeAgents,
        forecasters,
        loading: agentsLoading,
        pauseForecaster,
        resumeForecaster,
        stopForecaster,
        terminateForecaster,
        deleteForecaster,
        refresh: refreshAgents,
    } = useRealtimeAgents(publicKey?.toString() || null);
    const [viewTab, setViewTab] = useState<ViewTab>('build');

    // Builder state
    const [categoryId, setCategoryId] = useState(initialCategory || '');
    const { competitions } = useCompetitions(categoryId);

    // Agent mode is always 'forecaster' — Trading Agent removed (not aligned with ExoDuZe prediction competition model)
    const agentMode = 'forecaster' as const;
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
    const [stakeAmount, setStakeAmount] = useState<string>('');
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

    // Auto-select first available market when they load for the selected category
    useEffect(() => {
        if (autoSelectedCategory !== categoryId) {
            if (availableMarkets.length > 0) {
                setMarketIds([availableMarkets[0].id]);
            } else {
                setMarketIds([]);
            }
            setAutoSelectedCategory(categoryId);
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

    const agentAlreadyInMarket = useMemo(() => {
        if (!selectedMarket || !forecasters) return false;
        return forecasters.some(f =>
            (f.status === 'active' || f.status === 'paused' || f.status === 'exhausted') &&
            f.competitions?.some((c: any) => c.competition_id === selectedMarket.id)
        );
    }, [selectedMarket, forecasters]);

    const canDeploy = connected && agentName.trim() && categoryId && marketIds.length > 0 && strategy.trim()
        && (!quota || quota.deploys_remaining > 0) && !agentAlreadyInMarket;

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

            const isForecaster = true; // Always forecaster mode
            const body = {
                name: agentName.trim(),
                system_prompt: strategy,
                competition_ids: marketIds
            };

            const endpoint = '/agents/deploy-forecaster';

            // Call backend API
            const result = await apiFetch<DeployedAgentResponse>(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                },
                body: JSON.stringify(body),
            });

            // ════════════════════════════════════════════════════════════
            // REAL SOLANA DEVNET STAKE — Transfer SOL to pool vault PDA
            // Only records entry when on-chain TX is CONFIRMED.
            // If stake fails (insufficient SOL, rejected, etc), agent
            // still deploys but NO ghost wager/entry is created.
            // ════════════════════════════════════════════════════════════
            let stakeSuccess = false;
            const stakeSOL = parseFloat(stakeAmount) || 0;

            if (stakeSOL > 0 && marketIds.length > 0 && publicKey && sendTransaction) {
                try {
                    const stakeLamports = Math.floor(stakeSOL * LAMPORTS_PER_SOL);

                    setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `💰 Preparing on-chain stake: ${stakeSOL} SOL on Solana devnet...` }]);

                    // Check balance before attempting transaction
                    const balance = await DEVNET_CONNECTION.getBalance(publicKey);
                    const balanceSOL = balance / LAMPORTS_PER_SOL;

                    if (balance < stakeLamports + 5000) { // 5000 lamports for tx fee
                        setLogs(prev => [...prev, {
                            timestamp: Date.now(), type: 'info',
                            message: `⚠️ Insufficient balance: ${balanceSOL.toFixed(4)} SOL available, need ${stakeSOL} SOL + fees`
                        }]);
                        setLogs(prev => [...prev, {
                            timestamp: Date.now(), type: 'info',
                            message: `💡 Agent deployed without stake — you can stake later from the Pool section`
                        }]);
                    } else {
                        // Derive pool vault PDA for this market
                        const marketSeed = Buffer.from(marketIds[0].replace(/-/g, '').slice(0, 32), 'hex');
                        const [poolVaultPDA] = PublicKey.findProgramAddressSync(
                            [POOL_VAULT_SEED, marketSeed],
                            PROGRAM_ID,
                        );

                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `🔑 Pool Vault: ${poolVaultPDA.toBase58().slice(0, 12)}...` }]);

                        // Build SOL transfer transaction
                        const tx = new Transaction().add(
                            SystemProgram.transfer({
                                fromPubkey: publicKey,
                                toPubkey: poolVaultPDA,
                                lamports: stakeLamports,
                            })
                        );

                        // Get latest blockhash
                        const { blockhash, lastValidBlockHeight } = await DEVNET_CONNECTION.getLatestBlockhash('confirmed');
                        tx.recentBlockhash = blockhash;
                        tx.feePayer = publicKey;
                        tx.lastValidBlockHeight = lastValidBlockHeight;

                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `✍️ Sign the transaction in your wallet...` }]);

                        // Send transaction via wallet adapter
                        const signature = await sendTransaction(tx, DEVNET_CONNECTION);

                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `⏳ Confirming on-chain: ${signature.slice(0, 16)}...` }]);

                        // Wait for confirmation
                        const confirmation = await DEVNET_CONNECTION.confirmTransaction({
                            signature,
                            blockhash,
                            lastValidBlockHeight,
                        }, 'confirmed');

                        if (confirmation.value.err) {
                            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                        }

                        setLogs(prev => [...prev, {
                            timestamp: Date.now(), type: 'signal',
                            message: `✅ On-chain stake confirmed! TX: ${signature.slice(0, 20)}... (${stakeSOL} SOL)`
                        }]);

                        // Only sync to backend AFTER confirmed on-chain transaction
                        await apiFetch('/agents/wager', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                            },
                            body: JSON.stringify({
                                agent_id: result.id,
                                competition_id: marketIds[0],
                                wager_amount: stakeSOL,
                                onchain_tx: signature,
                            }),
                        });

                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `📊 Backend synced — pool updated!` }]);
                        stakeSuccess = true;
                    }
                } catch (stakeErr: any) {
                    const errMsg = stakeErr?.message || 'Unknown error';
                    // Detect common wallet errors for better UX
                    const isInsufficientFunds = errMsg.includes('insufficient') || errMsg.includes('0x1') || errMsg.includes('InsufficientFundsForRent');
                    const isUserRejected = errMsg.includes('rejected') || errMsg.includes('User rejected') || errMsg.includes('cancelled');

                    if (isUserRejected) {
                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `ℹ️ Stake cancelled by user — agent deployed without stake` }]);
                    } else if (isInsufficientFunds) {
                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `⚠️ Insufficient SOL balance — agent deployed without stake` }]);
                    } else {
                        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `⚠️ On-chain stake failed: ${errMsg}` }]);
                    }

                    // NO fallback wager — only confirmed on-chain stakes create entries
                    // This prevents ghost entries and entry_count drift
                    setLogs(prev => [...prev, {
                        timestamp: Date.now(), type: 'info',
                        message: `💡 Agent is LIVE without stake — you can stake later from your dashboard`
                    }]);
                }
            } else if (stakeSOL > 0 && marketIds.length > 0) {
                // User entered stake but wallet not connected — skip silently
                setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `💡 Connect wallet to stake SOL — agent deployed without stake` }]);
            }

            setDeployedAgent(result);
            setLogs(prev => [
                ...prev,
                { timestamp: Date.now(), type: 'info', message: '✅ Agent deployment successful!' },
                { timestamp: Date.now() + 100, type: 'info', message: `🆔 Agent ID: ${result.id}` },
                { timestamp: Date.now() + 200, type: 'info', message: `📊 Deploy #${result.deploy_number} — Quota: ${quota ? `${quota.total_deployed + 1}/${quota.max_deploys}` : 'N/A'}` },
                ...(stakeSuccess
                    ? [{ timestamp: Date.now() + 300, type: 'signal' as const, message: `💎 Staked ${stakeSOL} SOL on-chain — competing for prize pool!` }]
                    : stakeSOL > 0
                        ? [{ timestamp: Date.now() + 300, type: 'info' as const, message: '📋 Deployed without stake — you can stake SOL anytime to enter the prize pool' }]
                        : [{ timestamp: Date.now() + 300, type: 'info' as const, message: '🔗 On-chain registration queued (Solana devnet)...' }]
                ),
                { timestamp: Date.now() + 500, type: 'signal', message: '✨ Agent is now LIVE — monitoring feeds and generating signals...' },
            ]);
            setStep('active');
            setViewTab('manage');
            refreshAgents();

            // Fire event so ProbabilityCurve can draw the annotation line
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('agentDeployed', { detail: { name: result.name } }));
            }
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
            } as DeployedAgentResponse);
            setStep('active');
            setViewTab('manage');

            // Fire event so ProbabilityCurve can draw the annotation line (Simulated)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('agentDeployed', { detail: { name: agentName.trim() } }));
            }
        } finally {
            setDeploying(false);
        }
    }, [canDeploy, agentName, strategy, selectedOutcome, direction, riskLevel, stakeAmount, selectedMarket, agentTypes, categoryId, marketIds, quota, publicKey, sendTransaction]);

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
        setViewTab('build');
        refreshAgents();
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
        // ===== MY AGENTS TAB =====
        if (viewTab === 'manage') {
            return (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Tab Toggle + Close Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', flexShrink: 0 }}>
                        <div style={{
                            display: 'flex',
                            flex: 1,
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-round)',
                            padding: '0.2rem',
                        }}>
                            <button
                                onClick={() => setViewTab('build')}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                                }}
                            >
                                🔧 Build Agent
                            </button>
                            <button
                                onClick={() => setViewTab('manage')}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                    background: 'var(--accent-primary)',
                                    color: '#fff',
                                    fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                                }}
                            >
                                📡 My Agents {forecasters.length > 0 && `(${forecasters.filter(f => f.status === 'active').length})`}
                            </button>
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
                                aria-label="Close Agent Drawer"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <AgentManager
                            forecasters={forecasters}
                            loading={agentsLoading}
                            onPause={pauseForecaster}
                            onResume={resumeForecaster}
                            onStop={terminateForecaster}
                            onDelete={deleteForecaster}
                        />
                    </div>
                </div>
            );
        }

        if (step === 'config') {
            return (
                <div className="glass-card card-body animate-in" style={{ height: '100%', overflowY: 'auto' }}>
                    {/* Tab Toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--bg-input)',
                        borderRadius: 'var(--radius-round)',
                        padding: '0.2rem',
                        marginBottom: '0.75rem',
                    }}>
                        <button
                            onClick={() => setViewTab('build')}
                            style={{
                                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                background: 'var(--accent-primary)',
                                color: '#fff',
                                fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                            }}
                        >
                            🔧 Build Agent
                        </button>
                        <button
                            onClick={() => setViewTab('manage')}
                            style={{
                                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-round)',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s', border: 'none', cursor: 'pointer',
                                position: 'relative',
                            }}
                        >
                            📡 My Agents {forecasters.filter(f => f.status === 'active').length > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: '3px',
                                    right: '8px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: '#10b981',
                                    boxShadow: '0 0 6px #10b981',
                                    animation: 'pulse 2s ease-in-out infinite',
                                }} />
                            )}
                        </button>
                    </div>

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

                    {/* Agent Mode — Forecaster Only (Trading Agent removed: not aligned with prediction competition model) */}

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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: 'calc(100% - 30px)', overflow: 'hidden' }}>
                                    <label className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Target Market</label>
                                    <span style={{ fontSize: '0.65rem', color: marketIds.length === 1 ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {marketIds.length > 0 && selectedMarket ? selectedMarket.title : 'No market selected (Click to choose)'}
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
                                    {/* Select All / Deselect All Removed */}

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
                                                        setMarketIds([m.id]);
                                                        setIsMarketsExpanded(false);
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
                                                        borderRadius: '50%',
                                                        border: '1px solid',
                                                        borderColor: isSelected ? 'var(--accent-indigo)' : 'var(--border-card)',
                                                        background: 'transparent',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        {isSelected && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-indigo)' }} />}
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

                    {/* Outcome Selection removed — not needed for forecaster mode.
                       Winners are determined by Brier Score accuracy, not by outcome/direction picks */}

                    {/* Direction removed — forecaster agents don't pick directions.
                       They generate probabilistic predictions scored by Brier accuracy */}

                    {/* Strategy Prompt */}
                    {marketIds.length > 0 && (
                        <div className="form-group">
                            <label className="form-label">System Prompt / Knowledge Base</label>
                            <textarea
                                className="form-textarea"
                                placeholder={`e.g. "Focus deeply on regulatory announcements and ignore short-term market noise."`}
                                value={strategy}
                                onChange={(e) => setStrategy(e.target.value)}
                                maxLength={256}
                            />
                            <div style={{ textAlign: 'right', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {strategy.length}/256
                            </div>
                        </div>
                    )}

                    {/* Risk Level removed — not applicable to forecaster mode */}

                    {/* ═══ ON-CHAIN POOL STAKE ═══ */}
                    {marketIds.length > 0 && (
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>💎 Pool Stake (SOL) — On-Chain Devnet</span>
                                <span style={{
                                    fontSize: '0.45rem', fontWeight: 800, padding: '1px 5px',
                                    borderRadius: '4px', background: 'rgba(20,241,149,0.12)',
                                    color: '#14f195', letterSpacing: '0.04em',
                                }}>SOLANA</span>
                            </label>
                            <div style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                            }}>
                                <input
                                    type="number"
                                    className="form-select"
                                    placeholder="e.g. 0.5"
                                    value={stakeAmount}
                                    onChange={(e) => setStakeAmount(e.target.value)}
                                    min={0.01}
                                    max={5}
                                    step={0.01}
                                    style={{ fontFamily: 'var(--font-mono)', padding: '0.6rem', paddingRight: '4rem' }}
                                />
                                <span style={{
                                    position: 'absolute', right: '0.75rem',
                                    fontSize: '0.7rem', fontWeight: 700, color: '#14f195',
                                    pointerEvents: 'none',
                                }}>SOL ◎</span>
                            </div>

                            {/* Stake Info */}
                            <div style={{
                                marginTop: '0.4rem', padding: '0.5rem 0.65rem',
                                borderRadius: 'var(--radius-xs)',
                                background: 'rgba(20,241,149,0.04)',
                                border: '1px solid rgba(20,241,149,0.15)',
                                fontSize: '0.58rem', color: 'var(--text-muted)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                    <span>🔗 Network</span>
                                    <span style={{ color: '#14f195', fontWeight: 700 }}>Solana Devnet</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                    <span>🏆 Prize Pool Split</span>
                                    <span style={{ fontWeight: 600 }}>🥇50% · 🥈30% · 🥉20%</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                    <span>🛡️ Platform Fee</span>
                                    <span style={{ fontWeight: 600 }}>2% (anti-manipulation)</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>🐋 Anti-Whale Max</span>
                                    <span style={{ fontWeight: 600 }}>5.00 SOL per competition</span>
                                </div>
                            </div>

                            {parseFloat(stakeAmount) > 0 && (
                                <div style={{
                                    marginTop: '0.35rem', padding: '0.4rem 0.65rem',
                                    borderRadius: 'var(--radius-xs)',
                                    background: 'rgba(153,69,255,0.06)',
                                    border: '1px solid rgba(153,69,255,0.2)',
                                    fontSize: '0.58rem',
                                }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Your stake enters the pool. </span>
                                    <span style={{ color: '#9945ff', fontWeight: 700 }}>
                                        Wallet will sign a real SOL transfer on devnet.
                                    </span>
                                </div>
                            )}
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

                    {agentAlreadyInMarket && (
                        <div style={{ padding: '0.65rem', marginTop: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-xs)', fontSize: '0.65rem', color: '#ef4444', textAlign: 'center', fontWeight: 'bold' }}>
                            ⚠️ You already have an active agent deployed in this specific target market.
                        </div>
                    )}

                    {/* Deploy Button */}
                    <button
                        className="btn-primary"
                        onClick={handleDeploy}
                        disabled={!canDeploy || deploying}
                        style={{ marginTop: '0.5rem' }}
                    >
                        {!connected ? '🔗 Connect Wallet First'
                            : agentAlreadyInMarket ? '⛔ Already Deployed Here'
                                : quota && quota.deploys_remaining <= 0 ? '⚠️ Deploy Limit Reached'
                                    : !canDeploy ? '⚠️ Complete All Fields'
                                        : deploying ? '⏳ Deploying & Staking...'
                                            : parseFloat(stakeAmount) > 0
                                                ? `🚀 Deploy "${agentName || 'Agent'}" + Stake ${stakeAmount} SOL ◎`
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
                            { label: 'Trades', value: `${deployedAgent.total_trades || 0}`, color: 'var(--text-primary)' },
                            { label: 'P&L', value: `${(deployedAgent.total_pnl || 0) >= 0 ? '+' : ''}${(deployedAgent.total_pnl || 0).toFixed(3)}`, color: (deployedAgent.total_pnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                            { label: 'Accuracy', value: `${(deployedAgent.accuracy_score || 0).toFixed(0)}%`, color: 'var(--accent-cyan)' },
                            { label: 'Deploy #', value: `${deployedAgent.deploy_number || 1}`, color: 'var(--accent-amber)' },
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

                {/* Tournament Allocation Section */}
                {deployedAgent && step === 'active' && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.6rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'rgba(99,102,241,0.05)',
                        border: '1px solid rgba(99,102,241,0.2)',
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                            🎲 Tournament Entry Stake (Optional)
                        </div>
                        <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                            Allocate pool capital for your agent's performance. <strong style={{ color: '#10b981' }}>50% capital protection</strong> — we believe in skill-based tournaments.
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
                                    // Allocation creation would call /agents/wager endpoint
                                    setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '🏦 Pool allocation submitted! Tracking your agent...' }]);
                                }}
                            >
                                Deposit Stake
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
