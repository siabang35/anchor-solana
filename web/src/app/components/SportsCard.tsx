
import { PolymarketMarket } from '../../services/polymarket';
import { Button } from './ui/button';

interface SportsCardProps {
    market: PolymarketMarket;
}

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

// Sport-specific accent colors
const SPORT_COLORS: Record<string, string> = {
    'afl': 'bg-yellow-500/10 text-yellow-500',
    'mma': 'bg-red-500/10 text-red-500',
    'football': 'bg-green-500/10 text-green-500',
    'basketball': 'bg-orange-500/10 text-orange-500',
    'nba': 'bg-orange-500/10 text-orange-500',
    'nfl': 'bg-blue-500/10 text-blue-500',
    'hockey': 'bg-cyan-500/10 text-cyan-500',
    'baseball': 'bg-red-500/10 text-red-500',
    'formula1': 'bg-red-500/10 text-red-500',
    'handball': 'bg-blue-500/10 text-blue-500',
    'rugby': 'bg-green-600/10 text-green-600',
    'volleyball': 'bg-yellow-500/10 text-yellow-500',
};

export function SportsCard({ market }: SportsCardProps) {
    // Parse outcomes and prices. 
    // API usually returns outcomes as ["Yes", "No"] or team names, and prices as strings "0.45", etc.
    // We need to map them safely.

    const outcome1 = market.outcomes?.[0] || 'Yes';
    const outcome2 = market.outcomes?.[1] || 'No';

    const price1 = market.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : 0;
    const price2 = market.outcomePrices?.[1] ? parseFloat(market.outcomePrices[1]) : 0;

    const price1Display = (price1 * 100).toFixed(1) + '¢';
    const price2Display = (price2 * 100).toFixed(1) + '¢';

    // Get sport-specific styling
    const sportKey = (market.sport || 'sports').toLowerCase();
    const sportEmoji = SPORT_EMOJIS[sportKey] || '🏆';
    const sportColorClass = SPORT_COLORS[sportKey] || 'bg-blue-500/10 text-blue-500';

    // Check if this is an MMA fight (by sport type or question containing 'vs')
    const isMMA = sportKey === 'mma';
    const isAFL = sportKey === 'afl';

    return (
        <div className="bg-card border border-border/40 rounded-xl p-4 hover:border-border transition-colors group flex flex-col h-full bg-gradient-to-b from-card to-background/50">
            <div className="flex justify-between items-start mb-3 gap-3">
                {/* Logo / Image */}
                <div className="flex gap-3 items-start flex-1 min-w-0">
                    {market.image && (
                        <div className="w-10 h-10 rounded-full bg-accent/20 p-1 flex-shrink-0">
                            <img src={market.image} alt="Market" className="w-full h-full object-contain rounded-full" />
                        </div>
                    )}
                    <div>
                        <h3 className="font-semibold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
                            {market.question}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1.5">
                            {market.groupItemTitle && <span className="text-foreground/80 font-medium">{market.groupItemTitle}</span>}
                            {/* MMA Weight Class Badge */}
                            {isMMA && (market as any).weightClass && (
                                <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded text-[10px] font-medium">
                                    {(market as any).weightClass}
                                </span>
                            )}
                            {/* AFL Quarter Badge */}
                            {isAFL && market.active && (
                                <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 rounded text-[10px] font-medium">
                                    Q{(market as any).quarter || '?'}
                                </span>
                            )}
                            <span>{market.volume ? `$${parseInt(market.volume).toLocaleString()} Vol.` : 'New Market'}</span>
                            {market.liquidity && <span>${parseInt(market.liquidity).toLocaleString()} Liq.</span>}
                        </div>
                    </div>
                </div>

                {/* Live Indicator */}
                {market.active && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-wider animate-pulse flex-shrink-0">
                        <span className="w-1 h-1 rounded-full bg-red-500" />
                        LIVE
                    </div>
                )}
            </div>

            {/* Outcomes Grid */}
            <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                <Button
                    variant="outline"
                    className="h-10 flex items-center justify-between px-3 border-border/40 hover:bg-green-500/5 hover:border-green-500/30 hover:text-green-500 transition-all font-normal"
                >
                    <span className="text-xs text-foreground/80 truncate pr-2">{outcome1}</span>
                    <span className="text-sm font-bold">{price1Display}</span>
                </Button>
                <Button
                    variant="outline"
                    className="h-10 flex items-center justify-between px-3 border-border/40 hover:bg-red-500/5 hover:border-red-500/30 hover:text-red-500 transition-all font-normal"
                >
                    <span className="text-xs text-foreground/80 truncate pr-2">{outcome2}</span>
                    <span className="text-sm font-bold">{price2Display}</span>
                </Button>
            </div>

            {/* Footer / Actions */}
            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
                <div className="flex items-center gap-2">
                    {/* Sport Icon with dynamic color */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${sportColorClass}`}>
                        {sportEmoji}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {isMMA ? 'MMA' : isAFL ? 'AFL' : market.sport || 'Sports'}
                    </span>
                </div>
                <span className="text-[10px] text-muted-foreground">Ends {market.endDate ? new Date(market.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Soon'}</span>
            </div>
        </div>
    );
}
