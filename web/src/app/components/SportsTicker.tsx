import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TickerItem {
    id: string;
    team1: string;
    team2: string;
    score1?: number;
    score2?: number;
    status: 'LIVE' | 'Upcoming' | 'Final';
    time?: string;
    odds1?: number;
    odds2?: number;
}

// Mock data for the ticker simulation
const tickerData: TickerItem[] = [
    { id: '1', team1: 'AST', team2: 'OLY', score1: 1, score2: 0, status: 'LIVE', odds1: 50, odds2: 50 },
    { id: '2', team1: 'MOUZN', team2: 'ALGO1', score1: 1, score2: 0, status: 'LIVE', odds1: 50, odds2: .1 },
    { id: '3', team1: 'NGA', team2: 'MOZ', score1: 0, score2: 0, status: 'Upcoming', time: '2:00 AM', odds1: 78, odds2: 8 },
    { id: '4', team1: 'MON', team2: 'USD', score1: 0, score2: 0, status: 'Upcoming', time: '2:45 AM', odds1: 39, odds2: 32 },
    { id: '5', team1: 'LEI', team2: 'WBA', score1: 0, score2: 0, status: 'Upcoming', time: '3:00 AM', odds1: 38, odds2: 37 },
    { id: '6', team1: 'COLMB', team2: 'CORNEL', score1: 0, score2: 0, status: 'Upcoming', time: '5:00 AM', odds1: 43, odds2: 59 },
    // Add more to overflow
    { id: '7', team1: 'Boulter', team2: 'Staro', score1: 0, score2: 0, status: 'Upcoming', time: '5:30 AM', odds1: 54, odds2: 47 },
];

export function SportsTicker() {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = 300;
            current.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
        }
    };

    return (
        <div className="relative border-b border-border/40 bg-card/30 backdrop-blur-sm mb-4 -mx-4 px-4 overflow-hidden group">
            <button
                onClick={() => scroll('left')}
                className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <button
                onClick={() => scroll('right')}
                className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <ChevronRight className="w-5 h-5" />
            </button>

            <div ref={scrollRef} className="flex overflow-x-auto gap-4 py-2 scrollbar-hide items-center text-xs">
                {tickerData.map((item) => (
                    <div key={item.id} className="flex gap-3 flex-shrink-0 items-center pr-4 border-r border-border/20 last:border-0 min-w-[200px]">
                        <div className="flex flex-col gap-0.5 w-[50px] flex-shrink-0">
                            {item.status === 'LIVE' ? (
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">LIVE</span>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-medium">{item.time}</span>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col gap-1">
                            {/* Team 1 */}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-accent/50 flex items-center justify-center text-[6px]">T1</span>
                                    <span className="font-semibold">{item.team1}</span>
                                </div>
                                <div className="flex gap-2">
                                    {item.status === 'LIVE' && <span className="text-muted-foreground">{item.score1}</span>}
                                    <span className={`font-mono ${item.odds1 && item.odds1 > 50 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                        {item.odds1}¢
                                    </span>
                                </div>
                            </div>
                            {/* Team 2 */}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-accent/50 flex items-center justify-center text-[6px]">T2</span>
                                    <span className="font-semibold">{item.team2}</span>
                                </div>
                                <div className="flex gap-2">
                                    {item.status === 'LIVE' && <span className="text-muted-foreground">{item.score2}</span>}
                                    <span className={`font-mono ${item.odds2 && item.odds2 > 50 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                        {item.odds2}¢
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
