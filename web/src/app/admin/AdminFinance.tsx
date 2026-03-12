import { useEffect, useState } from 'react';
import { adminApi, WithdrawalRequest } from '../../services/adminApi';
import {
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
    ArrowRight,
    RefreshCw,
    TrendingUp,
    DollarSign,
    Activity,
    Wallet,
    CreditCard,
    Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../components/shared/ToastProvider';
import { ResponsiveTable } from '../components/shared/ResponsiveTable';
import { SkeletonTable } from '../components/shared/SkeletonLoader';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

// Mock data for sparklines
const mockTrendData = Array.from({ length: 20 }, () => ({
    value: Math.floor(Math.random() * 1000) + 500
}));

export function AdminFinance() {
    const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txHash, setTxHash] = useState('');

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getPendingWithdrawals();
            setWithdrawals(data);
        } catch (error) {
            console.error('Failed to fetch withdrawals', error);
            // toast.error('Failed to load pending withdrawals');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWithdrawals();
        // Poll for updates every 30s
        const interval = setInterval(fetchWithdrawals, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async () => {
        if (!selectedWithdrawal) return;
        setIsSubmitting(true);
        try {
            await adminApi.approveWithdrawal(selectedWithdrawal.id, txHash);
            toast.success('Withdrawal approved successfully');
            setSelectedWithdrawal(null);
            setTxHash(''); // Reset
            fetchWithdrawals();
        } catch (error: any) {
            toast.error(error.message || 'Failed to approve withdrawal');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!selectedWithdrawal) return;
        if (!rejectReason.trim()) {
            toast.error('Please provide a reason for rejection');
            return;
        }
        setIsSubmitting(true);
        try {
            await adminApi.rejectWithdrawal(selectedWithdrawal.id, rejectReason);
            toast.error('Withdrawal rejected');
            setSelectedWithdrawal(null);
            setRejectReason(''); // Reset
            fetchWithdrawals();
        } catch (error: any) {
            toast.error(error.message || 'Failed to reject withdrawal');
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns = [
        {
            key: 'user',
            header: 'User & Identity',
            render: (w: WithdrawalRequest) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold ring-2 ring-white/10">
                        {w.userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="font-semibold text-white/90 text-sm">{w.userEmail}</div>
                        <div className="text-[10px] text-neutral-500 font-mono tracking-wide flex items-center gap-1">
                            ID: <span className="bg-white/5 px-1 rounded">{w.userId.slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: 'amount',
            header: 'Amount',
            render: (w: WithdrawalRequest) => (
                <div className="flex flex-col">
                    <span className="font-mono text-white font-bold text-sm tracking-tight flex items-center gap-1">
                        ${w.amount.toLocaleString()}
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">{w.currency}</span>
                    </span>
                    <span className="text-[10px] text-neutral-500">
                        ≈ ${(w.amount * 1.0).toLocaleString()} USD
                    </span>
                </div>
            )
        },
        {
            key: 'chain',
            header: 'Network',
            render: (w: WithdrawalRequest) => (
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${w.chain === 'ethereum' ? 'bg-purple-500' : w.chain === 'solana' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                    <span className="text-xs text-neutral-300 capitalize">{w.chain}</span>
                </div>
            )
        },
        {
            key: 'riskScore',
            header: 'Risk Analysis',
            render: (w: WithdrawalRequest) => (
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${w.riskScore > 75 ? 'bg-red-500' : w.riskScore > 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{ width: `${w.riskScore}%` }}
                        />
                    </div>
                    <span className={`text-xs font-bold ${w.riskScore > 75 ? 'text-red-400' : w.riskScore > 40 ? 'text-orange-400' : 'text-green-400'}`}>
                        {w.riskScore}/100
                    </span>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (_: WithdrawalRequest) => (
                <span className="inline-flex items-center gap-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <Clock size={10} className="animate-pulse" />
                    Pending Approval
                </span>
            )
        },
        {
            key: 'createdAt',
            header: 'Submitted',
            align: 'right' as const,
            render: (w: WithdrawalRequest) => <span className="text-neutral-500 text-xs font-mono">{new Date(w.createdAt).toLocaleString()}</span>
        }
    ];

    const totalPending = withdrawals.reduce((acc, curr) => acc + curr.amount, 0);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">

            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                        Financial Operations
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                    </h1>
                    <p className="text-neutral-400 text-sm max-w-2xl">Monitor liquidity pools, approve pending withdrawals, and manage treasury assets.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchWithdrawals}
                        className="p-2.5 glass-card rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all border-glow group"
                        title="Refresh Data"
                    >
                        <RefreshCw size={20} className={`group-hover:rotate-180 transition-transform duration-700 ${loading ? "animate-spin text-blue-400" : ""}`} />
                    </button>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center gap-2">
                        <Wallet size={16} />
                        Treasury Wallet
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Pending Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-white/5 bg-neutral-900/50 backdrop-blur-sm p-6">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign size={80} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm font-medium text-blue-400 mb-1 flex items-center gap-2">
                            <Clock size={14} /> Total Pending Value
                        </p>
                        <h3 className="text-3xl font-bold text-white tracking-tight">${totalPending.toLocaleString()}</h3>
                        <div className="mt-4 h-12 w-full opacity-50">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={mockTrendData}>
                                    <defs>
                                        <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#colorBlue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Requests Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-white/5 bg-neutral-900/50 backdrop-blur-sm p-6">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Activity size={80} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm font-medium text-purple-400 mb-1 flex items-center gap-2">
                            <AlertTriangle size={14} /> Requests Actionable
                        </p>
                        <h3 className="text-3xl font-bold text-white tracking-tight">{withdrawals.length}</h3>
                        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                            <div className="flex -space-x-2 overflow-hidden">
                                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-neutral-900 bg-neutral-800"></div>
                                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-neutral-900 bg-neutral-700"></div>
                                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-neutral-900 bg-neutral-600"></div>
                            </div>
                            <span>Awaiting review</span>
                        </div>
                    </div>
                </div>

                {/* Liquidity Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-white/5 bg-neutral-900/50 backdrop-blur-sm p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                    <div className="relative z-10">
                        <p className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-2">
                            <TrendingUp size={14} /> System Liquidity
                        </p>
                        <h3 className="text-3xl font-bold text-emerald-400 tracking-tight flex items-center gap-3">
                            $4.5M
                            <span className="text-xs font-bold text-neutral-900 bg-emerald-400 px-2 py-0.5 rounded-full">HEALTHY</span>
                        </h3>
                        <p className="text-xs text-neutral-500 mt-2">
                            Available across 6 chains. No rebalancing needed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Pending Withdrawals Table */}
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/5 bg-neutral-900/40 relative">
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-lg">
                            <CreditCard className="text-orange-500" size={20} />
                        </div>
                        <div>
                            <h2 className="font-semibold text-white">Pending Withdrawals</h2>
                            <p className="text-xs text-neutral-500">Transactions requiring manual admin approval</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="text-xs px-3 py-1 bg-neutral-800 rounded-full text-neutral-400 border border-white/5">
                            Auto-refreshing
                        </div>
                    </div>
                </div>

                <div className="relative">
                    {loading ? (
                        <div className="p-8">
                            <SkeletonTable rows={5} />
                        </div>
                    ) : (
                        <ResponsiveTable
                            data={withdrawals}
                            columns={columns}
                            keyField="id"
                            onRowClick={(w) => setSelectedWithdrawal(w)}
                            emptyMessage="No pending withdrawals. All caught up!"
                            actions={(w) => (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedWithdrawal(w);
                                    }}
                                    className="group flex items-center gap-2 text-white/80 hover:text-white text-xs bg-blue-600/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg border border-blue-500/30 transition-all font-medium whitespace-nowrap"
                                >
                                    Review Request
                                    <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            )}
                        />
                    )}
                </div>
            </div>

            {/* Review Modal */}
            <AnimatePresence>
                {selectedWithdrawal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedWithdrawal(null)}
                            className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl z-50 flex flex-col max-h-[90vh]"
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                        <Shield className="text-blue-400" size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Security Review</h3>
                                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                                            <span>ID: {selectedWithdrawal.id}</span>
                                            <span className="w-1 h-1 bg-neutral-600 rounded-full"></span>
                                            <span className="font-mono">{new Date(selectedWithdrawal.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedWithdrawal(null)} className="p-2 hover:bg-white/5 rounded-full text-neutral-400 hover:text-white transition-colors">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                                {/* Amount & chain Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-neutral-950/50 p-4 rounded-2xl border border-white/5">
                                        <span className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Withdrawal Amount</span>
                                        <div className="text-3xl font-bold text-white mt-1 font-mono tracking-tight">
                                            {selectedWithdrawal.amount.toLocaleString()} <span className="text-lg text-neutral-500">{selectedWithdrawal.currency}</span>
                                        </div>
                                        <div className="text-xs text-emerald-400 mt-1">
                                            Current Balance: $5,240.23 (Coverage &gt; 100%)
                                        </div>
                                    </div>
                                    <div className="bg-neutral-950/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Destination</span>
                                            <span className="bg-blue-500/20 text-blue-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{selectedWithdrawal.chain}</span>
                                        </div>
                                        <div className="font-mono text-xs text-neutral-300 break-all bg-neutral-900 p-2 rounded border border-white/5 select-all">
                                            {selectedWithdrawal.toAddress}
                                        </div>
                                    </div>
                                </div>

                                {/* Risk Assessment */}
                                <div className={`border rounded-2xl p-5 ${selectedWithdrawal.riskScore > 50 ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2 rounded-lg ${selectedWithdrawal.riskScore > 50 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                            <Activity size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className={`font-bold ${selectedWithdrawal.riskScore > 50 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {selectedWithdrawal.riskScore > 50 ? 'High Risk Detected' : 'Low Risk Assessment'}
                                                </h4>
                                                <span className={`text-sm font-black ${selectedWithdrawal.riskScore > 50 ? 'text-red-500' : 'text-green-500'}`}>
                                                    SCORE: {selectedWithdrawal.riskScore}/100
                                                </span>
                                            </div>
                                            <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden mb-3">
                                                <div
                                                    className={`h-full rounded-full ${selectedWithdrawal.riskScore > 50 ? 'bg-red-500' : 'bg-green-500'}`}
                                                    style={{ width: `${selectedWithdrawal.riskScore}%` }}
                                                />
                                            </div>
                                            <p className="text-sm text-neutral-400 leading-relaxed">
                                                {selectedWithdrawal.riskScore > 50
                                                    ? "This transaction has been flagged for potential risk factors. Please verify the user's recent activity, IP address stability, and withdrawal patterns before approving."
                                                    : "This transaction appears to be within normal user behavior patterns. No specific security flags were triggered."}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Console */}
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <label className="text-xs text-neutral-400 font-medium ml-1">Transaction Hash (Optional)</label>
                                            <span className="text-[10px] text-neutral-600">Generated automatically if empty</span>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="0x..."
                                            value={txHash}
                                            onChange={(e) => setTxHash(e.target.value)}
                                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-white font-mono placeholder-neutral-700 transition-all font-medium"
                                        />
                                    </div>

                                    {(rejectReason || !txHash) && (
                                        <div className="space-y-2">
                                            <label className="text-xs text-neutral-400 font-medium ml-1">Rejection Reason</label>
                                            <input
                                                type="text"
                                                placeholder="Required if rejecting..."
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 text-white transition-all font-medium"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-white/5 bg-neutral-900/50 flex gap-4">
                                <button
                                    onClick={handleReject}
                                    disabled={isSubmitting}
                                    className="flex-1 py-4 rounded-xl bg-red-500/5 hover:bg-red-500/10 text-red-500 border border-red-500/10 hover:border-red-500/30 transition-all font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                    {isSubmitting ? <span className="animate-spin">◌</span> : <XCircle size={18} className="group-hover:scale-110 transition-transform" />}
                                    REJECT REQUEST
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={isSubmitting}
                                    className="flex-[2] py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 transition-all font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group border border-blue-400/20"
                                >
                                    {isSubmitting ? <span className="animate-spin">◌</span> : <CheckCircle size={18} className="group-hover:scale-110 transition-transform" />}
                                    APPROVE TRANSFER
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
