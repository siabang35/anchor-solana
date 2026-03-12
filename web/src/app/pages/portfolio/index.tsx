

import { useState } from "react";
import { Settings, Download, Upload, Search, Filter, EyeOff, Eye, ArrowRight, TrendingUp, Copy } from "lucide-react";
import { useAuth } from "../../components/auth/AuthContext";
import { useDeposit } from "../../contexts/DepositContext";
import { ProfileButton } from "../../components/ProfileButton";
import { WithdrawModal } from "../../components/WithdrawModal";
import { Button } from "../../components/ui/button";
import { AssetActionModal } from "../../components/AssetActionModal";

export function PortfolioPage() {
    const { user, isAuthenticated } = useAuth();
    const { balance, openDepositModal, refreshBalance } = useDeposit();
    const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history'>('positions');
    const [hideValues, setHideValues] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAsset, setSelectedAsset] = useState<any>(null);

    if (!isAuthenticated || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
                <h2 className="text-xl font-bold mb-2">Portfolio</h2>
                <p className="text-muted-foreground mb-4">Sign in to view your portfolio</p>
            </div>
        );
    }

    return (
        <div className="pb-24 pt-4 px-4 w-full lg:max-w-7xl mx-auto min-h-screen text-foreground bg-background transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border/50">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-sm text-primary-foreground font-bold">
                                    {user.fullName?.[0] || 'U'}
                                </div>
                            )}
                        </div>
                        <div>
                            <h1 className="font-bold text-xl">{user.fullName || 'Portfolio'}</h1>
                            {user.bio && (
                                <p className="text-xs text-muted-foreground max-w-[200px] truncate">{user.bio}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setHideValues(!hideValues)}
                        className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground"
                    >
                        {hideValues ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <ProfileButton user={user} mobile triggerOnly>
                        <button className="p-2 hover:bg-accent rounded-full transition-colors">
                            <Settings className="w-6 h-6 text-muted-foreground" />
                        </button>
                    </ProfileButton>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">

                {/* Left Column: Dashboard Card */}
                <div className="lg:col-span-2">
                    <div className="relative overflow-hidden bg-card border border-border/50 rounded-2xl p-6 shadow-xl h-full transition-all hover:shadow-2xl">
                        {/* Background decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 h-full">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Portfolio Value</span>
                                    <div className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded text-[10px] font-bold flex items-center">
                                        <TrendingUp className="w-3 h-3 mr-1" />
                                        +2.4%
                                    </div>
                                </div>

                                <div className="flex items-baseline gap-1 mb-1">
                                    <h2 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight tabular-nums">
                                        {hideValues ? '****' : (
                                            (() => {
                                                const usdc = parseFloat(balance?.availableBalance || '0');
                                                const assetsVal = balance?.assets?.reduce((acc: number, curr: any) => acc + parseFloat(curr.valueUsd || '0'), 0) || 0;
                                                return `$${(usdc + assetsVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                            })()
                                        )}
                                    </h2>
                                </div>
                                <div className="text-sm text-muted-foreground font-medium pl-1">
                                    {hideValues ? '****' : '+$124.50 (24h)'}
                                </div>
                            </div>

                            <div className="flex flex-col gap-5 items-stretch md:items-end">
                                {/* Timeframe Selector */}
                                <div className="flex bg-black/20 p-1 rounded-lg border border-white/5 self-start md:self-end">
                                    {['1H', '1D', '1W', '1M', '1Y', 'ALL'].map((tf) => (
                                        <button
                                            key={tf}
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${tf === '1M'
                                                ? 'bg-accent text-accent-foreground shadow-sm ring-1 ring-border'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                                }`}
                                        >
                                            {tf}
                                        </button>
                                    ))}
                                </div>

                                {/* Quick Actions */}
                                <div className="flex gap-3">
                                    <Button
                                        className="h-10 px-6 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                                        onClick={() => openDepositModal()}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Deposit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-10 px-6 text-sm font-semibold border-border hover:bg-accent hover:text-accent-foreground rounded-lg transition-all"
                                        onClick={() => setShowWithdrawModal(true)}
                                    >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Withdraw
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Crypto Assets */}
                <div className="lg:col-span-1">
                    {balance?.assets && balance?.assets.length > 0 && (
                        <div className="bg-card/50 border border-border/50 rounded-2xl p-4 h-[420px] flex flex-col backdrop-blur-md transition-all">
                            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                                <h3 className="text-sm font-semibold text-muted-foreground px-1 uppercase tracking-wider text-[10px]">Crypto Assets</h3>
                                <div className="relative group/search">
                                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/search:text-primary transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Search asset..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-accent/50 border border-border/50 rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-foreground w-28 focus:w-40 transition-all focus:outline-none focus:border-primary/30 focus:bg-accent placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1 overflow-y-auto pr-1 flex-1 -mr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
                                {balance?.assets
                                    ?.filter((asset: any) =>
                                        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        asset.chain.toLowerCase().includes(searchQuery.toLowerCase())
                                    )
                                    .map((asset: any) => {
                                        // Asset Configuration Helper
                                        const getAssetConfig = (symbol: string) => {
                                            const s = symbol.toUpperCase();
                                            if (s === 'ETH' || s === 'ETHEREUM') return { icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=035', color: 'bg-[#627EEA]/10 text-[#627EEA]' };
                                            if (s === 'SOL' || s === 'SOLANA') return { icon: 'https://cryptologos.cc/logos/solana-sol-logo.png?v=035', color: 'bg-[#14F195]/10 text-[#14F195]' };
                                            if (s === 'SUI') return { icon: 'https://cryptologos.cc/logos/sui-sui-logo.png?v=035', color: 'bg-[#6FBCF0]/10 text-[#6FBCF0]' };
                                            if (s === 'BASE') return { icon: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4', color: 'bg-[#0052FF]/10 text-[#0052FF]' };

                                            // New Tokens
                                            if (s === 'USDC') return { icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=035', color: 'bg-[#2775CA]/10 text-[#2775CA]' };
                                            if (s === 'USDT') return { icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png?v=035', color: 'bg-[#50AF95]/10 text-[#50AF95]' };
                                            if (s === 'WBTC') return { icon: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png?v=035', color: 'bg-[#F7931A]/10 text-[#F7931A]' };
                                            if (s === 'DAI') return { icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png?v=035', color: 'bg-[#F5AC37]/10 text-[#F5AC37]' };

                                            return { icon: '', color: 'bg-primary/10 text-primary' };
                                        };
                                        const config = getAssetConfig(asset.symbol);

                                        return (
                                            <div
                                                key={asset.chain + asset.symbol}
                                                className="group/row flex items-center justify-between p-2.5 rounded-xl hover:bg-accent/50 border border-transparent hover:border-border/30 transition-all cursor-pointer"
                                                onClick={() => setSelectedAsset(asset)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center p-1.5 ${config.color || 'bg-accent'} transition-transform group-hover/row:scale-105`}>
                                                        {config.icon ? <img src={config.icon} alt={asset.symbol} className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} /> : <span className="font-bold text-[10px] text-foreground">{asset.symbol[0]}</span>}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-foreground">{asset.symbol === 'ETHEREUM' ? 'ETH' : asset.symbol}</div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            {asset.chain}
                                                            {asset.address && (
                                                                <div
                                                                    className="opacity-0 group-hover/row:opacity-100 transition-opacity p-0.5 hover:text-foreground"
                                                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(asset.address); }}
                                                                    title="Copy Address"
                                                                >
                                                                    <Copy className="w-2.5 h-2.5" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-sm tabular-nums text-foreground">{hideValues ? '****' : asset.balance}</div>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className={`text-[10px] font-medium ${parseFloat(asset.valueUsd) > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                                            {hideValues ? '****' : `$${asset.valueUsd || '0.00'}`}
                                                        </span>
                                                        <ArrowRight className="w-2.5 h-2.5 text-primary opacity-0 -translate-x-1 group-hover/row:opacity-100 group-hover/row:translate-x-0 transition-all" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Asset Detail/Action Modal */}
            <AssetActionModal
                asset={selectedAsset}
                onClose={() => setSelectedAsset(null)}
                onSuccess={refreshBalance}
            />

            {/* Content Tabs */}
            <div className="flex items-center border-b border-border/50 mb-4">
                <button
                    onClick={() => setActiveTab('positions')}
                    className={`pb-3 px-1 mr-6 text-sm font-medium transition-all relative ${activeTab === 'positions' ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                    Positions
                    {activeTab === 'positions' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`pb-3 px-1 mr-6 text-sm font-medium transition-all relative ${activeTab === 'orders' ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                    Open orders
                    {activeTab === 'orders' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-3 px-1 text-sm font-medium transition-all relative ${activeTab === 'history' ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                    History
                    {activeTab === 'history' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Filter/Search Bar */}
            <div className="flex items-center gap-2 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search"
                        className="w-full bg-accent/30 border border-border/30 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                </div>
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/30 bg-accent/30 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <Filter className="w-4 h-4" />
                    <span className="hidden sm:inline">Current value</span>
                </button>
            </div>

            {/* Empty State */}
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <span className="text-sm">No {activeTab} found.</span>
            </div>

            <WithdrawModal
                isOpen={showWithdrawModal}
                onClose={() => setShowWithdrawModal(false)}
                onSuccess={() => {
                    // Refresh balance if context exposes a refresh method, or just wait for next poll
                    // Assuming useDeposit context might verify balance internally or we can trigger it
                    // balance.refetch() ?
                }}
            />
        </div >
    );
}
