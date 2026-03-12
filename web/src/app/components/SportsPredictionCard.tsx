/**
 * Sports AI Agent Card - Competition Style
 * 
 * Premium AI agent competition card with:
 * - Yes/No AI agent position buttons with dynamic pricing
 * - Live score updates
 * - Responsive design (mobile + desktop)
 * - Anti-throttling with optimistic updates
 * - Professional glassmorphism UI
 */

import { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import {
    TrendingUp,
    Clock,
    Users,
    Zap,
    ChevronRight,
    Timer,
    Trophy
} from 'lucide-react';
import { usePredictionMarket } from '../hooks/usePredictionMarket';
import { useWallet } from '../hooks/useWallet';

export interface PredictionMarket {
    id: string;
    eventId: string;
    question: string;
    description?: string;
    homeTeam: {
        name: string;
        logo?: string;
        shortName?: string;
        score?: number;
    };
    awayTeam: {
        name: string;
        logo?: string;
        shortName?: string;
        score?: number;
    };
    sport: string;
    league?: string;
    leagueLogo?: string;
    startTime: string;
    endTime?: string;
    status: 'scheduled' | 'live' | 'halftime' | 'finished';
    statusDetail?: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
    participants: number;
    isFeatured?: boolean;
}

interface SportsPredictionCardProps {
    market: PredictionMarket;
    onPredict?: (marketId: string, outcome: 'yes' | 'no', amount?: number) => void;
    onViewDetails?: (marketId: string) => void;
    className?: string;
    variant?: 'default' | 'compact' | 'featured';
}

export function SportsPredictionCard({
    market,
    onPredict,
    onViewDetails,
    className,
    variant = 'default'
}: SportsPredictionCardProps) {
    const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no' | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const isLive = market.status === 'live' || market.status === 'halftime';
    const isFinished = market.status === 'finished';

    // Format prices as percentages
    const yesPercent = Math.round(market.yesPrice * 100);
    const noPercent = Math.round(market.noPrice * 100);

    // Format volume
    const formatVolume = (vol: number) => {
        if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
        return `$${vol.toFixed(0)}`;
    };

    // Format time
    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const { buyShares, isTransacting, lastTxHash } = usePredictionMarket();
    const { isConnected, connect } = useWallet();

    const handlePredict = useCallback(async (outcome: 'yes' | 'no') => {
        if (isPending || isFinished || isTransacting) return;

        // 1. Ensure Wallet Connected
        if (!isConnected) {
            connect();
            return;
        }

        setSelectedOutcome(outcome);
        setIsPending(true);

        try {
            // 2. Blockchain Transaction (Non-custodial)
            // Mocking cost/shares for demo: 10 shares for 0.01 ETH
            // In prod, this comes from an AMM calculation hook
            const outcomeId = outcome === 'yes' ? 0 : 1;
            const mockShares = 10;
            const mockCost = "0.01";

            // Generate a numeric ID from UUID (hash) or assume market.id is numeric for contract
            // For this demo, we use a fixed ID or hash the string
            const numericMarketId = 1; // Placeholder for contract mapping

            await buyShares(numericMarketId, outcomeId, mockShares, mockCost);

            // 3. Success Callback
            onPredict?.(market.id, outcome);
        } catch (err) {
            console.error("AI agent action failed:", err);
            // Optionally show toast error here
        } finally {
            setIsPending(false);
            // Don't clear selected outcome immediately so user sees their choice
        }
    }, [market.id, onPredict, isPending, isFinished, isTransacting, isConnected, connect, buyShares]);

    return (
        <div
            className={cn(
                "group relative overflow-hidden rounded-2xl border transition-all duration-300",
                "bg-gradient-to-br from-card/95 via-card to-card/90",
                "backdrop-blur-xl shadow-lg",
                isLive && "border-red-500/30 shadow-red-500/5",
                !isLive && "border-border/40 hover:border-primary/30",
                isHovered && "shadow-xl scale-[1.01]",
                variant === 'featured' && "ring-2 ring-primary/20",
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Premium Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Header Bar */}
            <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-gradient-to-r from-transparent via-background/30 to-transparent">
                <div className="flex items-center gap-2">
                    {/* League Badge */}
                    {market.leagueLogo ? (
                        <img src={market.leagueLogo} alt={market.league} className="w-5 h-5 object-contain" />
                    ) : (
                        <Trophy className="w-4 h-4 text-primary/60" />
                    )}
                    <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                        {market.league || market.sport}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    {isLive ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                            </span>
                            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                                {market.statusDetail || 'LIVE'}
                            </span>
                        </div>
                    ) : isFinished ? (
                        <div className="px-2.5 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground">
                            Finished
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/50 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatTime(market.startTime)}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="relative p-4">
                {/* Teams Matchup */}
                <div className="flex items-center justify-between gap-4 mb-4">
                    {/* Home Team */}
                    <div className="flex-1 flex flex-col items-center text-center">
                        <div className="relative mb-2">
                            {market.homeTeam.logo ? (
                                <img
                                    src={market.homeTeam.logo}
                                    alt={market.homeTeam.name}
                                    className="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl font-black text-primary/80 border border-primary/10 shadow-inner">
                                    {market.homeTeam.shortName?.charAt(0) || market.homeTeam.name.charAt(0)}
                                </div>
                            )}
                            {isLive && market.homeTeam.score !== undefined && (
                                <div className="absolute -bottom-1 -right-1 min-w-[24px] h-6 px-1 bg-foreground text-background rounded-md flex items-center justify-center text-sm font-bold shadow-lg">
                                    {market.homeTeam.score}
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-semibold line-clamp-1 leading-tight">
                            {market.homeTeam.shortName || market.homeTeam.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Home</span>
                    </div>

                    {/* VS Separator */}
                    <div className="flex flex-col items-center gap-1 px-3">
                        <span className="text-lg font-black text-muted-foreground/30">VS</span>
                        {isLive && (
                            <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                                <Timer className="w-3 h-3 animate-pulse" />
                                {market.statusDetail}
                            </div>
                        )}
                    </div>

                    {/* Away Team */}
                    <div className="flex-1 flex flex-col items-center text-center">
                        <div className="relative mb-2">
                            {market.awayTeam.logo ? (
                                <img
                                    src={market.awayTeam.logo}
                                    alt={market.awayTeam.name}
                                    className="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/10 flex items-center justify-center text-2xl font-black text-secondary-foreground/80 border border-secondary/10 shadow-inner">
                                    {market.awayTeam.shortName?.charAt(0) || market.awayTeam.name.charAt(0)}
                                </div>
                            )}
                            {isLive && market.awayTeam.score !== undefined && (
                                <div className="absolute -bottom-1 -left-1 min-w-[24px] h-6 px-1 bg-foreground text-background rounded-md flex items-center justify-center text-sm font-bold shadow-lg">
                                    {market.awayTeam.score}
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-semibold line-clamp-1 leading-tight">
                            {market.awayTeam.shortName || market.awayTeam.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Away</span>
                    </div>
                </div>

                {/* Market Question */}
                <div className="mb-4 text-center">
                    <h3 className="text-base font-semibold text-foreground/90 line-clamp-2 leading-snug">
                        {market.question}
                    </h3>
                </div>

                {/* AI Agent Position Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* Transaction Link */}
                    {lastTxHash && (
                        <div className="col-span-2 text-center mb-2">
                            <a
                                href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-primary hover:underline"
                            >
                                View Transaction: {lastTxHash.slice(0, 6)}...{lastTxHash.slice(-4)}
                            </a>
                        </div>
                    )}
                    {/* YES Button */}
                    <Button
                        variant="outline"
                        disabled={isFinished || isPending || isTransacting}
                        onClick={() => handlePredict('yes')}
                        className={cn(
                            "relative h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl font-medium transition-all duration-200",
                            "border-2 hover:scale-[1.02] active:scale-[0.98]",
                            selectedOutcome === 'yes'
                                ? "bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/20"
                                : "bg-green-500/5 border-green-500/30 text-green-600 hover:bg-green-500/10 hover:border-green-500/50"
                        )}
                    >
                        <span className="text-xs uppercase tracking-wider opacity-80">{isTransacting && selectedOutcome === 'yes' ? 'Signing...' : 'Yes'}</span>
                        <span className="text-xl font-bold">{yesPercent}¢</span>
                    </Button>

                    {/* NO Button */}
                    <Button
                        variant="outline"
                        disabled={isFinished || isPending || isTransacting}
                        onClick={() => handlePredict('no')}
                        className={cn(
                            "relative h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl font-medium transition-all duration-200",
                            "border-2 hover:scale-[1.02] active:scale-[0.98]",
                            selectedOutcome === 'no'
                                ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20"
                                : "bg-red-500/5 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:border-red-500/50"
                        )}
                    >
                        <span className="text-xs uppercase tracking-wider opacity-80">{isTransacting && selectedOutcome === 'no' ? 'Signing...' : 'No'}</span>
                        <span className="text-xl font-bold">{noPercent}¢</span>
                    </Button>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/30">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="font-medium">{formatVolume(market.volume)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{market.participants.toLocaleString()}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => onViewDetails?.(market.id)}
                        className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Featured Badge */}
            {market.isFeatured && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-[10px] font-bold">
                    <Zap className="w-3 h-3" />
                    HOT
                </div>
            )}
        </div>
    );
}

export default SportsPredictionCard;
