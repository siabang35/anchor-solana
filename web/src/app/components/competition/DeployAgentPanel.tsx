import { useState } from 'react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../../../services/supabase';
import { useWallet } from '../../hooks/useWallet';

interface Props {
    initialCategory?: string;
}

const CATEGORIES = [
    { id: 'politics', label: 'Politics', icon: '🏛️' },
    { id: 'finance', label: 'Finance', icon: '📈' },
    { id: 'crypto', label: 'Crypto', icon: '₿' },
    { id: 'tech', label: 'Tech', icon: '💻' },
    { id: 'economy', label: 'Economy', icon: '🌍' },
    { id: 'science', label: 'Science', icon: '🔬' },
    { id: 'sports', label: 'Sports', icon: '⚽' },
];

const MODES = [
    { id: 'forecaster', label: 'Forecaster', icon: '🔮', desc: 'AI analyzes data and predicts outcomes' },
    { id: 'trader', label: 'Trader', icon: '📊', desc: 'AI trades based on probability shifts' },
];

export function DeployAgentPanel({ initialCategory = 'finance' }: Props) {
    const [category, setCategory] = useState(initialCategory);
    const [mode, setMode] = useState('forecaster');
    const [isDeploying, setIsDeploying] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const { address, isConnected } = useWallet();

    const handleDeploy = async () => {
        if (!isConnected) {
            setStatus('error');
            setStatusMsg('Please connect your wallet first');
            return;
        }

        setIsDeploying(true);
        setStatus('idle');
        setStatusMsg('');

        try {
            const endpoint = mode === 'forecaster'
                ? `${API_BASE_URL}/agents/deploy-forecaster`
                : `${API_BASE_URL}/agents/deploy`;

            const payload = mode === 'forecaster' ? {
                name: `Qwen-${category.charAt(0).toUpperCase() + category.slice(1)}-Agent`,
                system_prompt: `Analyze the ${category} market and generate probability updates.`,
                competition_ids: []
            } : {
                // Warning: Deploying a trader agent needs a valid agent_type_id (UUID), this may fail
                // We're stubbing it here for the UI to attempt
                agent_type_id: '00000000-0000-0000-0000-000000000000',
                name: `Trader-${category}`,
                strategy_prompt: `Trade in the ${category} market`,
                market_ids: [],
                target_outcome: 'home',
                direction: 'long',
                risk_level: 3
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(address ? { 'x-user-id': address } : {})
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                setStatus('success');
                setStatusMsg(data.message || 'Agent deployed successfully!');
            } else {
                const err = await res.json().catch(() => ({ message: 'Deployment failed' }));
                setStatus('error');
                setStatusMsg(err.message || 'Deployment failed');
            }
        } catch (err: any) {
            setStatus('error');
            setStatusMsg(err.message || 'Network error');
        } finally {
            setIsDeploying(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                    <span>🤖</span> Deploy AI Agent
                </h3>
                <span className="text-[10px] text-muted-foreground font-semibold">Qwen-Powered</span>
            </div>

            {/* Category Selection */}
            <div className="mb-4">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Category
                </label>
                <div className="flex gap-1.5 flex-wrap">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={`
                                px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                                ${category === cat.id
                                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400'
                                    : 'bg-muted/20 border border-transparent text-muted-foreground hover:bg-muted/40'
                                }
                            `}
                        >
                            {cat.icon} {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mode Selection */}
            <div className="mb-4">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Agent Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className={`
                                p-3 rounded-xl border text-left transition-all duration-200
                                ${mode === m.id
                                    ? 'bg-indigo-500/10 border-indigo-500/30 ring-1 ring-indigo-500/20'
                                    : 'bg-muted/10 border-border/30 hover:bg-muted/30'
                                }
                            `}
                        >
                            <div className="text-xl mb-1">{m.icon}</div>
                            <div className="text-xs font-bold text-foreground">{m.label}</div>
                            <div className="text-[9px] text-muted-foreground mt-0.5">{m.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Deploy Button */}
            <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className={`
                    w-full py-3 rounded-xl font-bold text-sm transition-all duration-200
                    ${isDeploying
                        ? 'bg-indigo-500/20 text-indigo-300 cursor-wait'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
                    }
                `}
            >
                {isDeploying ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Deploying...
                    </span>
                ) : (
                    '🚀 Deploy Agent'
                )}
            </button>

            {/* Status */}
            {status !== 'idle' && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 p-3 rounded-lg text-xs font-semibold ${status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                >
                    {status === 'success' ? '✅' : '❌'} {statusMsg}
                </motion.div>
            )}
        </motion.div>
    );
}
