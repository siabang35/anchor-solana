'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useCompetitions, Competition } from '@/hooks/useCompetitions';
import { apiFetch } from '@/lib/supabase';
import AgentManager from './AgentManager';
import { Agents3DIcon } from '@/components/Agents3DIcon';
import {
    CATEGORIES,
    MODEL_TIERS,
    getMarketsForCategory,
    MarketTemplate,
} from '@/lib/dummy-data';

// ═══════════════════════════════════════════════════════════════════════
// TREASURY SECURITY: Stakes are sent to the Treasury wallet (not PDA).
// The backend disburses prize claims from this same Treasury keypair.
// PDA derivation is retained for on-chain audit reference only.
// ═══════════════════════════════════════════════════════════════════════
const DEVNET_CONNECTION = new Connection(clusterApiUrl('devnet'), 'confirmed');
const PROGRAM_ID = new PublicKey('56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7');
const POOL_VAULT_SEED = Buffer.from('pool_vault');

// Treasury wallet — stakes fund this wallet, claims disburse from it
// MUST match the pubkey derived from SOLANA_TREASURY_PRIVATE_KEY in the backend
const TREASURY_PUBKEY = new PublicKey(
    process.env.NEXT_PUBLIC_TREASURY_PUBKEY || 'F4XPPgs4LA6kH4DBF12C3uzp7KYLCxcfWddGSkSw1nQE'
);

// Anti-exploit: stake limits (must match backend pool config)
const MIN_STAKE_SOL = 0.1;
const MAX_STAKE_SOL = 5.0;
const TX_FEE_BUFFER_LAMPORTS = 10_000; // 10k lamports for TX fee headroom

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
    type: 'info' | 'analysis' | 'trade' | 'signal' | 'error';
    message: string;
}

interface QuotaInfo {
    total_deployed: number;
    max_deploys: number;
    deploys_remaining: number;
    active_agents: number;
}

type BuilderStep = 'config' | 'deploying' | 'active' | 'failed';
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
        let filtered = competitions.filter(c => c.sector === categoryId);

        // If a specific discipline (sub-category) is selected, filter by it using tags + title heuristic
        if (subCategoryId && selectedCategory?.subCategories) {
            const subCat = selectedCategory.subCategories.find(s => s.id === subCategoryId);
            filtered = filtered.filter(c => {
                // Layer 1: Exact tag match
                if (c.tags && c.tags.includes(subCategoryId)) return true;

                // Layer 2: Title-based heuristic — match sport name prefix like "Football:", "Tennis:", "NHL:", etc.
                if (subCat && c.title) {
                    const titleLower = c.title.toLowerCase();
                    const nameParts = subCat.name.toLowerCase().split(/[\/\s]+/); // e.g. "Football / Soccer" → ["football", "soccer"]
                    for (const part of nameParts) {
                        if (part.length >= 3 && titleLower.includes(part)) return true;
                    }
                    // Additional keyword mapping for common API labels
                    const extraKeywords: Record<string, string[]> = {
                        'football': ['soccer', 'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'champions league'],
                        'basketball': ['nba', 'basketball', 'euroleague'],
                        'cfl': ['nfl', 'cfl', 'american football', 'nhl', 'hockey', 'ice hockey', 'baseball', 'rugby', 'motorsport'],
                        'cricket': ['ipl', 'cricket', 'test match', 't20'],
                        'tennis': ['atp', 'wta', 'wimbledon', 'us open', 'roland garros', 'grand slam'],
                        'mma': ['ufc', 'mma', 'boxing', 'fighting', 'bellator'],
                        'esports': ['esports', 'lol', 'dota', 'csgo', 'valorant', 'overwatch', 'league of legends'],
                    };
                    const keywords = extraKeywords[subCategoryId] || [];
                    for (const kw of keywords) {
                        if (titleLower.includes(kw)) return true;
                    }
                }
                return false;
            });
        }

        return filtered.map(c => {
            // Find the sub-category ID from tags OR title to highlight the correct discipline pill
            let mappedSubCategory: string | undefined = undefined;
            if (selectedCategory?.subCategories) {
                // First try tags
                if (c.tags) {
                    const matchedCat = selectedCategory.subCategories.find(sub => c.tags?.includes(sub.id));
                    if (matchedCat) mappedSubCategory = matchedCat.id;
                }
                // Fallback: match by title
                if (!mappedSubCategory && c.title) {
                    const titleLower = c.title.toLowerCase();
                    for (const sub of selectedCategory.subCategories) {
                        const nameParts = sub.name.toLowerCase().split(/[\/\s]+/);
                        if (nameParts.some(p => p.length >= 3 && titleLower.includes(p))) {
                            mappedSubCategory = sub.id;
                            break;
                        }
                    }
                }
            }

            return {
                id: c.id,
                title: c.title,
                outcomes: c.outcomes || ['Bullish', 'Neutral', 'Bearish'],
                subCategoryId: mappedSubCategory,
            };
        });
    }, [competitions, categoryId, subCategoryId, selectedCategory]);
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

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const resumeAgentName = params.get('resumeAgentName');
            if (resumeAgentName) {
                setAgentName(decodeURIComponent(resumeAgentName));
                setIsMobileDrawerOpen(true);
            }
        }
    }, []);

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

    const parsedStake = useMemo(() => {
        const normalized = stakeAmount.replace(',', '.');
        return parseFloat(normalized) || 0;
    }, [stakeAmount]);

    const isStakeValid = useMemo(() => {
        return stakeAmount.trim() !== '' && parsedStake >= 0.1;
    }, [stakeAmount, parsedStake]);

    const canDeploy = connected && agentName.trim() && categoryId && marketIds.length > 0 && strategy.trim()
        && (!quota || quota.deploys_remaining > 0) && !agentAlreadyInMarket && isStakeValid;

    // ========================
    // Deploy via Backend API (Verify -> Reserve -> Commit)
    // ========================
    const handleDeploy = useCallback(async () => {
        if (!canDeploy || !selectedMarket) return;
        setStep('deploying');
        setDeploying(true);
        setError(null);
        setLogs([]);

        // Show initial progress logs
        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '🚀 Initializing AI Agent deployment...' }]);
        await new Promise(r => setTimeout(r, 600));
        setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `📝 Strategy loaded: "${strategy.slice(0, 80)}${strategy.length > 80 ? '...' : ''}"` }]);
        await new Promise(r => setTimeout(r, 600));

        let createdAgent: DeployedAgentResponse | null = null;
        let signature = '';

        try {
            if (!publicKey || !sendTransaction) {
                throw new Error('Wallet not connected or transaction helper not available.');
            }

            // ═══ ANTI-EXPLOIT: Strict input sanitization ═══
            const normalizedStake = stakeAmount.toString().replace(',', '.');
            const stakeSOL = parseFloat(normalizedStake) || 0;
            
            if (!isFinite(stakeSOL) || stakeSOL < MIN_STAKE_SOL) {
                throw new Error(`Minimum stake amount is ${MIN_STAKE_SOL} SOL.`);
            }
            if (stakeSOL > MAX_STAKE_SOL) {
                throw new Error(`Maximum stake amount is ${MAX_STAKE_SOL} SOL (anti-whale protection).`);
            }

            const stakeLamports = Math.floor(stakeSOL * LAMPORTS_PER_SOL);
            if (stakeLamports <= 0) {
                throw new Error('Invalid stake amount.');
            }

            setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `💰 Checking wallet balance for ${stakeSOL} SOL...` }]);

            // ═══ ANTI-EXPLOIT: Pre-flight balance check ═══
            const balance = await DEVNET_CONNECTION.getBalance(publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            const requiredLamports = stakeLamports + TX_FEE_BUFFER_LAMPORTS;

            if (balance < requiredLamports) {
                throw new Error(
                    `Insufficient Devnet SOL. You have ${balanceSOL.toFixed(4)} SOL, ` +
                    `but need at least ${(requiredLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL (stake + TX fee).`
                );
            }

            // Step 1 & 2: Verify & Reserve (Register agent in database BEFORE staking)
            // If this fails, no SOL leaves the user's wallet — critical for stake integrity.
            setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '🔗 Pre-registering agent with backend database...' }]);

            const body = {
                name: agentName.trim(),
                system_prompt: strategy,
                competition_ids: marketIds,
                stake_amount: stakeSOL,
            };

            try {
                createdAgent = await apiFetch<DeployedAgentResponse>('/agents/deploy-forecaster', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                    },
                    body: JSON.stringify(body),
                });
            } catch (apiErr: any) {
                throw new Error(`Agent pre-registration failed: ${apiErr?.message || 'Database rejected request.'}`);
            }

            const activeAgent = createdAgent;
            if (!activeAgent || !activeAgent.id) {
                throw new Error('Backend failed to return a valid agent reference.');
            }

            setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `🆔 Reserved Agent ID: ${activeAgent.id}` }]);

            // ═══════════════════════════════════════════════════════════════
            // TREASURY TRANSFER: Send stake SOL → Treasury wallet
            // The backend's sendPrizeTransfer() pays claims from this same
            // Treasury keypair, so funds MUST arrive here for claims to work.
            //
            // PDA derivation is retained as audit reference — the on-chain
            // pool vault PDA tracks competition-level accounting in the
            // smart contract, but actual custody is via Treasury.
            // ═══════════════════════════════════════════════════════════════
            setLogs(prev => [
                ...prev, 
                { timestamp: Date.now(), type: 'info', message: `🏦 Treasury: ${TREASURY_PUBKEY.toBase58().slice(0, 12)}...` },
                { timestamp: Date.now(), type: 'info', message: `✍️ Please approve the ${stakeSOL} SOL stake in your wallet...` }
            ]);

            // Construct transaction — SOL goes to Treasury for prize pool funding
            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: TREASURY_PUBKEY,
                    lamports: stakeLamports,
                })
            );

            const { blockhash, lastValidBlockHeight } = await DEVNET_CONNECTION.getLatestBlockhash('confirmed');
            tx.recentBlockhash = blockhash;
            tx.feePayer = publicKey;
            tx.lastValidBlockHeight = lastValidBlockHeight;

            // Send transaction
            try {
                signature = await sendTransaction(tx, DEVNET_CONNECTION);
            } catch (walletErr: any) {
                // Clean up reserved agent if transaction is rejected / denied
                setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '⚠️ Transaction rejected. Cleaning up reserved database records...' }]);
                try {
                    await apiFetch(`/agents/forecasters/${activeAgent.id}/hard`, {
                        method: 'DELETE',
                        headers: {
                            ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                        }
                    });
                } catch (delErr) {
                    console.error('Failed to clean up pending agent:', delErr);
                }
                throw new Error(`Transaction rejected or failed in wallet: ${walletErr?.message || 'Signature denied.'}`);
            }

            setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `⏳ Confirming on-chain: ${signature.slice(0, 16)}...` }]);

            // Wait for confirmation
            const confirmation = await DEVNET_CONNECTION.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight,
            }, 'confirmed');

            if (confirmation.value.err) {
                // Clean up reserved agent if transaction fails to confirm on-chain
                setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '⚠️ Transaction failed to confirm. Cleaning up reserved database records...' }]);
                try {
                    await apiFetch(`/agents/forecasters/${activeAgent.id}/hard`, {
                        method: 'DELETE',
                        headers: {
                            ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                        }
                    });
                } catch (delErr) {
                    console.error('Failed to clean up pending agent:', delErr);
                }
                throw new Error(`On-chain transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            setLogs(prev => [...prev, {
                timestamp: Date.now(), type: 'signal',
                message: `✅ On-chain stake confirmed! TX: ${signature.slice(0, 20)}... (${stakeSOL} SOL)`
            }]);

            // Sync the wager (Commit step)
            setLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: '📊 Syncing on-chain wager & activating agent...' }]);
            try {
                await apiFetch('/agents/wager', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(publicKey ? { 'x-user-id': publicKey.toString() } : {})
                    },
                    body: JSON.stringify({
                        agent_id: activeAgent.id,
                        competition_id: marketIds[0],
                        wager_amount: stakeSOL,
                        onchain_tx: signature,
                    }),
                });
            } catch (wagerErr: any) {
                throw new Error(`Wager sync failed (SOL staked, TX: ${signature}). Error: ${wagerErr?.message}`);
            }

            setDeployedAgent(activeAgent);
            setLogs(prev => [
                ...prev,
                { timestamp: Date.now(), type: 'info', message: '✅ Agent deployment successful!' },
                { timestamp: Date.now() + 100, type: 'info', message: `🆔 Agent ID: ${activeAgent.id}` },
                { timestamp: Date.now() + 200, type: 'info', message: `📊 Deploy Completed — Quota updated` },
                { timestamp: Date.now() + 300, type: 'signal', message: '✨ Agent is now LIVE — monitoring feeds and generating signals...' },
            ]);
            
            setStep('active');
            setViewTab('manage');
            refreshAgents();

            // Fire event so ProbabilityCurve can draw the annotation line
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('agentDeployed', { detail: { name: createdAgent.name } }));
            }

        } catch (err: any) {
            console.error('Deployment flow failed:', err);
            const errMsg = err.message || 'Deployment failed';
            setError(errMsg);
            setLogs(prev => [
                ...prev,
                { timestamp: Date.now(), type: 'error', message: `❌ Error: ${errMsg}` }
            ]);
            setStep('failed');
        } finally {
            setDeploying(false);
        }
    }, [canDeploy, agentName, strategy, selectedOutcome, direction, riskLevel, stakeAmount, selectedMarket, agentTypes, categoryId, marketIds, quota, publicKey, sendTransaction, refreshAgents]);

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
                                        onClick={() => setSubCategoryId(subCategoryId === sub.id ? '' : sub.id)}
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
                                placeholder={`e.g. "Focus deeply on regulatory announcements and ignore short-term market noise."\n\nYou can now write up to 2048 characters to define your agent's exact forecasting methodology, risk weighting, and analytical lens.`}
                                value={strategy}
                                onChange={(e) => setStrategy(e.target.value)}
                                maxLength={2048}
                                style={{ minHeight: '120px' }}
                            />
                            <div style={{ textAlign: 'right', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {strategy.length}/2048
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
                                    type="text"
                                    inputMode="decimal"
                                    className="form-select"
                                    placeholder="e.g. 0.5"
                                    value={stakeAmount}
                                    onChange={(e) => {
                                        // Only allow numbers, dots, and commas
                                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                                        setStakeAmount(val);
                                    }}
                                    style={{ fontFamily: 'var(--font-mono)', padding: '0.6rem', paddingRight: '4rem' }}
                                />
                                <span style={{
                                    position: 'absolute', right: '0.75rem',
                                    fontSize: '0.7rem', fontWeight: 700, color: '#14f195',
                                    pointerEvents: 'none',
                                }}>SOL ◎</span>
                            </div>

                            {/* Validation warning message */}
                            {stakeAmount.trim() !== '' && parsedStake < 0.1 && (
                                <div style={{
                                    marginTop: '0.35rem', padding: '0.4rem 0.65rem',
                                    borderRadius: 'var(--radius-xs)',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    fontSize: '0.6rem', color: '#ef4444',
                                    fontWeight: 600,
                                }}>
                                    ⚠️ Minimum stake amount is 0.1 SOL to deploy an agent.
                                </div>
                            )}

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
                                    <span>🏆 Prize Pool Model</span>
                                    <span style={{ fontWeight: 600 }}>Stake × Rank Weighted</span>
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

                            {selectedCategory?.icon} {selectedCategory?.name}
                            {selectedCategory?.subCategories && subCategoryId && ` → ${selectedCategory.subCategories.find(s => s.id === subCategoryId)?.name}`}
                            {` → ${marketIds.length} Market${marketIds.length > 1 ? 's' : ''} Selected`}
                            <br />

                        </div>
                    )}
                </div>
            );
        }

        if (step === 'failed') {
            return (
                <div className="glass-card card-body animate-in" style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    padding: '2rem 1.5rem',
                    overflowY: 'auto',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.05) 0%, rgba(11, 13, 24, 0.95) 100%)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(239, 68, 68, 0.05)'
                }}>
                    <div style={{
                        position: 'relative',
                        width: '80px',
                        height: '80px',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {/* Outer pulsing ring */}
                        <div style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            border: '2px solid rgba(239, 68, 68, 0.4)',
                            animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                        }} />
                        {/* Inner glowing circle */}
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '2px solid #ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)',
                            animation: 'pulse 2s infinite',
                        }}>
                            <span style={{
                                fontSize: '1.8rem',
                                color: '#ef4444',
                                fontWeight: 'bold',
                                animation: 'shake 0.5s ease-in-out infinite',
                            }}>✕</span>
                        </div>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '0.02em' }}>
                        Deployment Blocked
                    </h3>

                    <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: '280px', marginBottom: '1.5rem' }}>
                        {error || 'The on-chain stake transaction failed. Your AI agent could not be registered on-chain.'}
                    </p>

                    {logs.length > 0 && (
                        <div className="agent-console" style={{
                            width: '100%',
                            height: '120px',
                            marginBottom: '1.5rem',
                            textAlign: 'left',
                            background: 'rgba(7, 8, 15, 0.8)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            padding: '0.6rem',
                            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                        }}>
                            {logs.map((log, i) => (
                                <div key={i} className={`agent-log ${log.type}`} style={{
                                    fontSize: '0.58rem',
                                    lineHeight: 1.4,
                                    color: log.type === 'error' ? '#fca5a5' : 'var(--text-muted)'
                                }}>
                                    <span className="log-time" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                        [{new Date(log.timestamp).toLocaleTimeString()}]
                                    </span>{' '}
                                    {log.message}
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        className="btn-primary"
                        onClick={() => {
                            setStep('config');
                            setError(null);
                            setLogs([]);
                        }}
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            padding: '0.6rem 1.5rem',
                            borderRadius: 'var(--radius-round)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)',
                        }}
                    >
                        🔄 Return to Configuration
                    </button>
                </div>
            );
        }

        // ===== DEPLOYING / ACTIVE STEP =====
        return (
            <div className="glass-card card-body animate-in" style={{ height: '100%', overflowY: 'auto' }}>
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="icon" style={{ display: 'flex', alignItems: 'center' }}><Agents3DIcon size={14} /></span> {deployedAgent?.name || 'Agent'}</h3>
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
            {/* Backdrop overlay when drawer is open (mobile) */}
            <div
                className={`deploy-agent-backdrop ${isMobileDrawerOpen ? 'visible' : ''}`}
                onClick={() => setIsMobileDrawerOpen(false)}
            />

            {/* Mobile Toggle Button */}
            <button
                className="btn-primary mobile-deploy-toggle"
                onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
                aria-label={isMobileDrawerOpen ? 'Close deploy panel' : 'Open deploy panel'}
                style={{
                    position: 'fixed',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 95,
                    width: 'auto',
                    padding: '0.6rem 0.4rem 0.6rem 0.65rem',
                    borderRadius: '12px 0 0 12px',
                    boxShadow: 'var(--shadow-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.3s ease',
                    writingMode: 'vertical-rl' as const,
                    textOrientation: 'mixed' as const,
                }}
            >
                <div style={{ transform: isMobileDrawerOpen ? 'rotate(180deg) translateY(-2px)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>◀</div>
                {!isMobileDrawerOpen && (
                    <span style={{ fontSize: '0.75rem', letterSpacing: '1px', fontWeight: 700 }}>DEPLOY AI</span>
                )}
            </button>

            {/* Drawer Wrapper */}
            <div className={`deploy-agent-wrapper ${isMobileDrawerOpen ? 'mobile-open' : ''}`}>
                {renderContent()}
            </div>
        </>
    );
}
