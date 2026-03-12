import { PolymarketMarket } from '../../services/polymarket';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { TrendingUp, Clock } from 'lucide-react';

export function SportsMarketRow({ market }: { market: PolymarketMarket }) {
    const outcome1 = market.outcomes?.[0] || 'Yes';
    const outcome2 = market.outcomes?.[1] || 'No';

    const price1 = market.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : 0;
    const price2 = market.outcomePrices?.[1] ? parseFloat(market.outcomePrices[1]) : 0;

    const price1Display = (price1 * 100).toFixed(0) + '¢';
    const price2Display = (price2 * 100).toFixed(0) + '¢';

    return (
        <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/20 hover:bg-card/80 transition-all duration-300 shadow-sm hover:shadow-md">

            {/* Header / Meta Row */}
            <div className="flex items-center gap-2 px-3 pt-3 text-xs text-muted-foreground/80">
                {market.active ? (
                    <div className="flex items-center gap-1.5 text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-full">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                        </span>
                        <span>LIVE</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" />
                        {market.endDate ? new Date(market.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Soon'}
                    </div>
                )}

                <span className="flex items-center gap-1 ml-auto font-mono text-[10px] bg-secondary/30 px-1.5 py-0.5 rounded">
                    <TrendingUp className="w-3 h-3" />
                    ${parseInt(market.volume || '0').toLocaleString()}
                </span>
            </div>

            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 p-3 md:p-4">
                {/* Visual Matchup Area */}
                {/* Visual Matchup Area */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-4">
                    <div className="flex items-center justify-between gap-4">
                        {/* Team 1 - Poster Style */}
                        <div className="flex-1 flex items-center gap-3 min-w-0 group/team p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                            <div className="relative w-12 h-12 flex-shrink-0">
                                {market.team1?.icon ? (
                                    <img
                                        src={market.team1.icon}
                                        alt={market.team1.name}
                                        className="w-full h-full object-contain drop-shadow-md transform group-hover/team:scale-110 transition-transform duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 text-orange-500 rounded-xl flex items-center justify-center text-lg font-black border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                                        {market.team1?.symbol?.substring(0, 1) || market.outcomes?.[0]?.substring(0, 1) || '1'}
                                    </div>
                                )}
                                {price1 > price2 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-card flex items-center justify-center shadow-sm">
                                        <span className="text-[8px]">👑</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-base truncate leading-tight group-hover/team:text-primary transition-colors">
                                    {market.team1?.name || outcome1}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground font-medium">HOME</span>
                                    {price1 > price2 && <span className="text-[10px] text-green-500 font-bold tracking-wide bg-green-500/10 px-1.5 rounded">FAVORED</span>}
                                </div>
                            </div>
                        </div>

                        {/* VS Badge */}
                        <div className="flex flex-col items-center justify-center px-2">
                            <span className="text-xs font-black text-muted-foreground/30 italic">VS</span>
                        </div>

                        {/* Team 2 - Poster Style */}
                        <div className="flex-1 flex flex-row-reverse md:flex-row items-center gap-3 min-w-0 group/team p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-right md:text-left">
                            <div className="flex flex-col min-w-0 md:items-end lg:items-start">
                                <span className="font-bold text-base truncate leading-tight group-hover/team:text-primary transition-colors">
                                    {market.team2?.name || outcome2}
                                </span>
                                <div className="flex items-center justify-end md:justify-start gap-2 mt-0.5">
                                    {price2 > price1 && <span className="text-[10px] text-green-500 font-bold tracking-wide bg-green-500/10 px-1.5 rounded">FAVORED</span>}
                                    <span className="text-xs text-muted-foreground font-medium">AWAY</span>
                                </div>
                            </div>
                            <div className="relative w-12 h-12 flex-shrink-0">
                                {market.team2?.icon ? (
                                    <img
                                        src={market.team2.icon}
                                        alt={market.team2.name}
                                        className="w-full h-full object-contain drop-shadow-md transform group-hover/team:scale-110 transition-transform duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 text-blue-500 rounded-xl flex items-center justify-center text-lg font-black border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                                        {market.team2?.symbol?.substring(0, 1) || market.outcomes?.[1]?.substring(0, 1) || '2'}
                                    </div>
                                )}
                                {price2 > price1 && (
                                    <div className="absolute -top-1 -left-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-card flex items-center justify-center shadow-sm">
                                        <span className="text-[8px]">👑</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Outcome Buttons - Grid on mobile, Flex on desktop */}
                <div className="grid grid-cols-2 md:flex gap-2 w-full md:w-auto mt-1 md:mt-0">
                    <Button
                        variant="outline"
                        size="lg"
                        className={cn(
                            "relative h-12 md:h-10 md:w-32 justify-between font-mono border-muted bg-card hover:bg-accent hover:border-primary/50 transition-all",
                            price1 > price2 ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10" : ""
                        )}
                    >
                        <span className="uppercase text-[10px] font-bold text-muted-foreground mr-2 absolute top-1 left-2 tracking-tighter">
                            {outcome1.substring(0, 3)}
                        </span>
                        <span className="text-sm font-bold w-full text-right md:text-center mt-3 md:mt-0">{price1Display}</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className={cn(
                            "relative h-12 md:h-10 md:w-32 justify-between font-mono border-muted bg-card hover:bg-accent hover:border-primary/50 transition-all",
                            price2 > price1 ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10" : ""
                        )}
                    >
                        <span className="uppercase text-[10px] font-bold text-muted-foreground mr-2 absolute top-1 left-2 tracking-tighter">
                            {outcome2.substring(0, 3)}
                        </span>
                        <span className="text-sm font-bold w-full text-right md:text-center mt-3 md:mt-0">{price2Display}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
