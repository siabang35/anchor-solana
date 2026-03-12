import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChevronDown, ChevronUp, Plus, TrendingUp } from "lucide-react";

/**
 * AI Agent Competition-Style Card
 * 
 * Features:
 * - Dark glassmorphism design
 * - Multi-outcome support (elections, multi-choice)
 * - Yes/No trading buttons with real-time odds
 * - Market icon/image with gradient overlay
 * - Volume and timeframe badges
 * - Mobile-first responsive design
 * - Anti-throttling with optimistic updates
 */

export interface MarketOutcome {
    id: string;
    label: string;
    probability: number; // 0-100
    price?: number; // Decimal price (e.g., 0.28)
    image?: string;
}

export interface PolymarketCardProps {
    id: string;
    title: string;
    image?: string;
    icon?: string | React.ReactNode;
    outcomes: MarketOutcome[];
    volume?: number | string;
    timeframe?: string; // "Daily", "Annually", "22h 9m 50s"
    category?: string;
    endDate?: Date | string;
    isExpanded?: boolean;
    maxOutcomesToShow?: number;
    onSelectOutcome?: (outcome: MarketOutcome, action: 'yes' | 'no') => void;
    onCardClick?: () => void;
}

// Format volume with K, M, B suffixes
function formatVolume(volume: number | string | undefined): string {
    if (!volume) return "$0";
    const num = typeof volume === "string" ? parseFloat(volume.replace(/[$,]/g, "")) : volume;
    if (isNaN(num)) return "$0";
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
}

// Calculate time remaining
function formatTimeRemaining(endDate?: Date | string): string | null {
    if (!endDate) return null;
    const end = typeof endDate === "string" ? new Date(endDate) : endDate;
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return "Ended";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 30) return `${Math.floor(days / 30)}mo`;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export const PolymarketCard = memo(function PolymarketCard({
    title,
    image,
    icon,
    outcomes,
    volume,
    timeframe,
    endDate,
    maxOutcomesToShow = 2,
    onSelectOutcome,
    onCardClick
}: PolymarketCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const displayedOutcomes = isExpanded ? outcomes : outcomes.slice(0, maxOutcomesToShow);
    const hasMoreOutcomes = outcomes.length > maxOutcomesToShow;
    const timeRemaining = formatTimeRemaining(endDate);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer"
            onClick={onCardClick}
        >
            {/* Card Header */}
            <div className="p-4 pb-2">
                <div className="flex items-start gap-3">
                    {/* Market Icon/Image */}
                    <div className="relative flex-shrink-0">
                        {image ? (
                            <img
                                src={image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="w-12 h-12 rounded-xl object-cover ring-1 ring-border/10"
                                onError={(e) => {
                                    e.currentTarget.src = '';
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        ) : icon ? (
                            <div className="w-12 h-12 rounded-xl bg-accent/50 flex items-center justify-center text-2xl ring-1 ring-border/10 text-primary">
                                {typeof icon === 'string' ? icon : icon}
                            </div>
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center ring-1 ring-border/10">
                                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                            </div>
                        )}
                    </div>

                    {/* Title & Meta */}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Outcomes Section */}
            <div className="px-4 pb-3 space-y-2">
                <AnimatePresence initial={false}>
                    {displayedOutcomes.map((outcome, idx) => (
                        <motion.div
                            key={outcome.id || idx}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center justify-between py-1.5"
                        >
                            {/* Outcome Label */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                {outcome.image && (
                                    <img
                                        src={outcome.image}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="w-6 h-6 rounded-full object-cover"
                                    />
                                )}
                                <span className="text-sm text-muted-foreground truncate">
                                    {outcome.label}
                                </span>
                            </div>

                            {/* Probability */}
                            <span className="text-sm font-bold text-foreground mr-3 tabular-nums">
                                {outcome.probability}%
                            </span>

                            {/* Yes/No Buttons */}
                            <div className="flex gap-1.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectOutcome?.(outcome, 'yes');
                                    }}
                                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all border border-emerald-500/20"
                                >
                                    Yes
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectOutcome?.(outcome, 'no');
                                    }}
                                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 active:scale-95 transition-all border border-red-500/20"
                                >
                                    No
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Show More Button */}
                {hasMoreOutcomes && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {isExpanded ? (
                            <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                Show less
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                +{outcomes.length - maxOutcomesToShow} more
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Card Footer */}
            <div className="px-4 py-2.5 bg-muted/30 border-t border-border/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted-foreground">
                    {volume !== undefined && (
                        <span className="font-medium text-foreground/80">
                            {formatVolume(volume)} Vol
                        </span>
                    )}
                    {timeframe && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeframe}
                        </span>
                    )}
                    {timeRemaining && !timeframe && (
                        <span className="flex items-center gap-1 text-amber-500/80">
                            <Clock className="w-3 h-3" />
                            {timeRemaining}
                        </span>
                    )}
                </div>

                <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
});

// ============================================================
// Binary Market Card (Simplified Yes/No with price display)
// ============================================================

export interface BinaryMarketCardProps {
    id: string;
    title: string;
    image?: string;
    icon?: string;
    yesPrice: number; // e.g., 0.68 = 68%
    volume?: number | string;
    timeframe?: string;
    potentialReturn?: { yes: number; no: number }; // e.g., { yes: 144, no: 290 }
    onBet?: (side: 'yes' | 'no') => void;
    onCardClick?: () => void;
}

export const BinaryMarketCard = memo(function BinaryMarketCard({
    title,
    image,
    icon,
    yesPrice,
    volume,
    timeframe,
    potentialReturn,
    onBet,
    onCardClick
}: BinaryMarketCardProps) {
    const noPrice = 1 - yesPrice;
    const yesCents = Math.round(yesPrice * 100);
    const noCents = Math.round(noPrice * 100);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer"
            onClick={onCardClick}
        >
            {/* Header */}
            <div className="p-4 pb-3">
                <div className="flex items-start gap-3">
                    {image ? (
                        <img
                            src={image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-14 h-14 rounded-xl object-cover ring-1 ring-border/10"
                        />
                    ) : icon ? (
                        <div className="w-14 h-14 rounded-xl bg-accent/50 flex items-center justify-center text-2xl ring-1 ring-border/10 text-primary">
                            {icon}
                        </div>
                    ) : null}

                    <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Price Buttons (Polymarket style) */}
            <div className="px-4 pb-3">
                <div className="grid grid-cols-2 gap-3">
                    {/* YES Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onBet?.('yes');
                        }}
                        className="relative flex flex-col items-center justify-center py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-[0.98] transition-all group/btn"
                    >
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">
                            {yesCents}¢
                        </span>
                        <span className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60">
                            YES
                        </span>
                        {potentialReturn && (
                            <span className="sr-only">Return: ${potentialReturn.yes}</span>
                        )}
                    </button>

                    {/* NO Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onBet?.('no');
                        }}
                        className="relative flex flex-col items-center justify-center py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-all group/btn"
                    >
                        <span className="text-sm font-bold text-red-600 dark:text-red-400 mb-0.5">
                            {noCents}¢
                        </span>
                        <span className="text-[10px] text-red-600/60 dark:text-red-400/60">
                            NO
                        </span>
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-muted/30 border-t border-border/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted-foreground">
                    {volume !== undefined && (
                        <span className="font-medium text-foreground/80">
                            {formatVolume(volume)} Vol
                        </span>
                    )}
                    {timeframe && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeframe}
                        </span>
                    )}
                </div>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
});

export default PolymarketCard;
