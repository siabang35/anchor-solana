import { motion } from 'motion/react';
// import { useAuth } from './auth/AuthContext';
// import { usePredictionMarket } from '../hooks/usePredictionMarket';
// import { useWallet } from '../hooks/useWallet';
import { Activity, Clock, Check } from 'lucide-react';
import { useBetSlip } from '../contexts/BetSlipContext';

// Sport-specific emoji mapping
const SPORT_EMOJIS: Record<string, string> = {
    'afl': '🏉',
    'mma': '🥊',
    'football': '⚽',
    'basketball': '🏀',
    'nba': '🏀',
    'nfl': '🏈',
    'hockey': '🏒',
    'baseball': '⚾',
    'formula1': '🏎️',
    'handball': '🤾',
    'rugby': '🏉',
    'volleyball': '🏐',
};

// Define Interface for Market Data
interface SportsMarket {
    id: string;
    eventId: string;
    title: string;
    subtitle?: string; // e.g. "English Premier League"
    outcomes: string[];
    outcomePrices: number[];
    volume: number;
    liquidity?: number;
    image?: string;
    isLive?: boolean;
    sport?: string; // AFL, MMA, football, etc.
    weightClass?: string; // MMA-specific: weight class
    organization?: string; // MMA-specific: UFC, Bellator, etc.
    event?: any; // API response structure
    metadata?: any;
    startTime?: string | Date;
}

interface SportsMarketCardProps {
    market: SportsMarket;
    onClick?: (marketId: string) => void;
    onOpenAuth?: (mode?: 'login' | 'signup') => void;
}

const SportsMarketCard: React.FC<SportsMarketCardProps> = ({ market, onClick }) => {
    // const { isAuthenticated } = useAuth(); // Removed for now to allow adding to slip without auth
    const { addToBetSlip, selections, removeFromBetSlip } = useBetSlip();

    const handleMarketClick = () => {
        if (onClick) {
            onClick(market.id);
        }
    };

    const handleOutcomeClick = (e: React.MouseEvent, outcome: string, price: number) => {
        e.stopPropagation();

        const selectionId = `${market.id}-${outcome}`;
        const isSelected = selections.some(s => s.id === selectionId);

        if (isSelected) {
            removeFromBetSlip(selectionId);
        } else {
            addToBetSlip({
                id: selectionId,
                marketId: market.id,
                question: market.title,
                outcome: outcome as 'yes' | 'no', // Simplified casting
                price: price,
                sport: market.sport
            });
        }
    };

    const formatProbability = (price: number) => `${Math.round(price * 100)}%`;
    const sportKey = (market.sport || market.event?.sport || 'football').toLowerCase();
    const sportEmoji = SPORT_EMOJIS[sportKey] || '⚽';
    const isMMA = sportKey === 'mma';
    const imageUrl = market.image || market.event?.thumbnailUrl;
    const weightClass = market.weightClass || market.event?.metadata?.weightClass || market.event?.metadata?.weight_class;
    const organization = market.organization || market.event?.metadata?.leagueName || market.event?.metadata?.organization;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4, boxShadow: "0 10px 40px -10px rgba(0,0,0,0.1)" }}
            className="group relative flex flex-col bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-white/5 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:border-blue-500/30"
            onClick={handleMarketClick}
        >
            {/* Header Section */}
            <div className="p-5 flex items-start gap-4">
                <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-2xl overflow-hidden shadow-inner border border-black/5 dark:border-white/5">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Market" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                            <span>{sportEmoji}</span>
                        )}
                        {!imageUrl && <span>{sportEmoji}</span>}
                    </div>
                    {market.isLive && (
                        <div className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white dark:border-zinc-900"></span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {market.subtitle && (
                            <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-blue-400 uppercase bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-500/20 truncate max-w-full">
                                {market.subtitle}
                            </span>
                        )}
                        {isMMA && (weightClass || organization) && (
                            <span className="text-[10px] font-bold tracking-wider text-purple-600 dark:text-purple-400 uppercase bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-500/20 truncate">
                                {organization} {weightClass}
                            </span>
                        )}
                    </div>

                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight text-base group-hover:text-blue-500 transition-colors line-clamp-2">
                        {market.title}
                    </h3>
                </div>
            </div>

            {/* Outcomes Section */}
            <div className="px-5 pb-5 flex-1 flex flex-col gap-2.5">
                {market.outcomes.map((outcome, index) => {
                    const price = market.outcomePrices[index] || 0;
                    // Determine color scheme based solely on index for now (0=Yes/Green, 1=No/Red) or default to Blue
                    // For typical binary markets: 0 is usually 'Yes' or 'Home', 1 is 'No' or 'Away' - simplified logic
                    const isPositive = index === 0;
                    const barColor = isPositive ? 'bg-emerald-500' : 'bg-rose-500';
                    const textColor = isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';

                    const selectionId = `${market.id}-${outcome}`;
                    const isSelected = selections.some(s => s.id === selectionId);

                    return (
                        <button
                            key={index}
                            onClick={(e) => handleOutcomeClick(e, outcome, price)}
                            className={`
                                group/btn relative flex items-center justify-between p-3 rounded-lg text-sm font-medium transition-all duration-200
                                border 
                                ${isSelected
                                    ? `border-${isPositive ? 'emerald' : 'rose'}-500 bg-${isPositive ? 'emerald' : 'rose'}-50 dark:bg-${isPositive ? 'emerald' : 'rose'}-900/10`
                                    : 'border-transparent bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10'
                                }
                            `}
                        >
                            {/* Probability Bar Background */}
                            <div
                                className={`absolute left-0 top-0 bottom-0 opacity-10 dark:opacity-20 rounded-l-lg transition-all duration-500 ${barColor}`}
                                style={{ width: `${price * 100}%` }}
                            />

                            <span className="relative z-10 text-gray-700 dark:text-gray-300 font-medium truncate pr-4 flex items-center gap-2">
                                {isSelected && <Check className={`w-3.5 h-3.5 ${textColor}`} />}
                                {outcome}
                            </span>

                            <div className="relative z-10 flex items-center gap-3">
                                <span className={`text-xs font-bold ${textColor}`}>
                                    {formatProbability(price)}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Footer / Stats */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        <span>${market.volume?.toLocaleString() ?? 0} Vol.</span>
                    </div>
                    {market.startTime && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(market.startTime).toLocaleDateString()}</span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default SportsMarketCard;
