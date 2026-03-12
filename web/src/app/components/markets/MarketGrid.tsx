import { memo, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { PolymarketCard, PolymarketCardProps, BinaryMarketCard, BinaryMarketCardProps } from "./PolymarketCard";

/**
 * Responsive Market Grid Layout
 * 
 * Features:
 * - Responsive columns (1/2/3/4 based on screen)
 * - Staggered animation on load
 * - Anti-throttling with debounced updates
 * - Skeleton loading states
 */

export interface MarketGridProps {
    markets: (Partial<PolymarketCardProps> & { type?: 'multi' | 'binary' })[];
    isLoading?: boolean;
    onSelectOutcome?: (marketId: string, outcome: any, action: 'yes' | 'no') => void;
    onCardClick?: (marketId: string) => void;
    skeletonCount?: number;
}

// Skeleton Card for loading state
const MarketCardSkeleton = memo(function MarketCardSkeleton() {
    return (
        <div className="bg-[#1a1d24] border border-[#2a2e38] rounded-2xl overflow-hidden animate-pulse">
            <div className="p-4 pb-2">
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#2a2e38]" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-[#2a2e38] rounded w-3/4" />
                        <div className="h-4 bg-[#2a2e38] rounded w-1/2" />
                    </div>
                </div>
            </div>
            <div className="px-4 pb-3 space-y-2">
                <div className="flex items-center justify-between py-1.5">
                    <div className="h-4 bg-[#2a2e38] rounded w-24" />
                    <div className="flex gap-1.5">
                        <div className="h-6 w-10 bg-[#2a2e38] rounded-lg" />
                        <div className="h-6 w-10 bg-[#2a2e38] rounded-lg" />
                    </div>
                </div>
                <div className="flex items-center justify-between py-1.5">
                    <div className="h-4 bg-[#2a2e38] rounded w-20" />
                    <div className="flex gap-1.5">
                        <div className="h-6 w-10 bg-[#2a2e38] rounded-lg" />
                        <div className="h-6 w-10 bg-[#2a2e38] rounded-lg" />
                    </div>
                </div>
            </div>
            <div className="px-4 py-2.5 bg-[#15171c] border-t border-[#2a2e38] flex items-center justify-between">
                <div className="h-3 bg-[#2a2e38] rounded w-16" />
                <div className="h-3 bg-[#2a2e38] rounded w-12" />
            </div>
        </div>
    );
});

// Container animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3 }
    }
};

export const MarketGrid = memo(function MarketGrid({
    markets,
    isLoading = false,
    onSelectOutcome,
    onCardClick,
    skeletonCount = 8
}: MarketGridProps) {
    // Show skeletons during initial load
    if (isLoading && markets.length === 0) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <MarketCardSkeleton key={`skeleton-${i}`} />
                ))}
            </div>
        );
    }

    // Empty state
    if (markets.length === 0) {
        return (
            <div className="text-center py-16 text-gray-500">
                <p className="text-lg">No markets available</p>
                <p className="text-sm mt-1">Check back soon for new AI agent competitions</p>
            </div>
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
            {markets.map((market, idx) => (
                <motion.div key={market.id || idx} variants={itemVariants}>
                    {market.type === 'binary' && 'yesPrice' in market ? (
                        <BinaryMarketCard
                            id={market.id || `market-${idx}`}
                            title={market.title || 'Untitled Market'}
                            image={market.image}
                            icon={market.icon as string}
                            yesPrice={(market as any).yesPrice || 0.5}
                            volume={market.volume}
                            timeframe={market.timeframe}
                            potentialReturn={(market as any).potentialReturn}
                            onBet={(side) => onSelectOutcome?.(market.id!, null, side)}
                            onCardClick={() => onCardClick?.(market.id!)}
                        />
                    ) : (
                        <PolymarketCard
                            id={market.id || `market-${idx}`}
                            title={market.title || 'Untitled Market'}
                            image={market.image}
                            icon={market.icon}
                            outcomes={market.outcomes || []}
                            volume={market.volume}
                            timeframe={market.timeframe}
                            category={market.category}
                            endDate={market.endDate}
                            onSelectOutcome={(outcome, action) => onSelectOutcome?.(market.id!, outcome, action)}
                            onCardClick={() => onCardClick?.(market.id!)}
                        />
                    )}
                </motion.div>
            ))}
        </motion.div>
    );
});

export default MarketGrid;
