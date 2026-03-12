import {
    Trophy,
    Flame,
    Bike,
    CircleDot,
} from 'lucide-react';

// All 12 supported sports matching the backend
export const sportsCategories = [
    { id: 'live', label: 'Live', icon: Flame, color: 'text-red-500', emoji: '🔴' },
    { id: 'afl', label: 'AFL', icon: Trophy, color: 'text-yellow-600', emoji: '🏉' },
    { id: 'baseball', label: 'Baseball', icon: CircleDot, color: 'text-red-600', emoji: '⚾' },
    { id: 'basketball', label: 'Basketball', icon: CircleDot, color: 'text-orange-500', emoji: '🏀' },
    { id: 'football', label: 'Football', icon: CircleDot, color: 'text-green-500', emoji: '⚽' },
    { id: 'formula1', label: 'Formula 1', icon: Bike, color: 'text-red-500', emoji: '🏎️' },
    { id: 'handball', label: 'Handball', icon: CircleDot, color: 'text-blue-500', emoji: '🤾' },
    { id: 'hockey', label: 'Hockey', icon: Trophy, color: 'text-blue-300', emoji: '🏒' },
    { id: 'mma', label: 'MMA', icon: Trophy, color: 'text-red-600', emoji: '🥊' },
    { id: 'nba', label: 'NBA', icon: Trophy, color: 'text-orange-500', emoji: '🏀' },
    { id: 'nfl', label: 'NFL', icon: Trophy, color: 'text-blue-500', emoji: '🏈' },
    { id: 'rugby', label: 'Rugby', icon: Trophy, color: 'text-green-600', emoji: '🏉' },
    { id: 'volleyball', label: 'Volleyball', icon: CircleDot, color: 'text-yellow-500', emoji: '🏐' },
];

interface SportsSidebarProps {
    activeSport: string;
    onSelectSport: (id: string) => void;
}

export function SportsSidebar({ activeSport, onSelectSport }: SportsSidebarProps) {
    const popularSports = sportsCategories.slice(0, 7); // Live + first 6 sports
    const allSports = sportsCategories.slice(7); // Remaining sports

    return (
        <aside className="w-60 flex-shrink-0 hidden lg:flex flex-col gap-1 pr-6 border-r border-border/40 h-[calc(100vh-80px)] overflow-y-auto sticky top-20 scrollbar-hide">

            <div className="font-bold text-xs text-muted-foreground/70 uppercase tracking-widest mb-3 px-3 pt-2">
                Trending
            </div>

            <nav className="space-y-0.5">
                {popularSports.map((sport) => {
                    const isActive = activeSport === sport.id;
                    return (
                        <button
                            key={sport.id}
                            onClick={() => onSelectSport(sport.id)}
                            className={`
                                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                                ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200'
                                }
                            `}
                        >
                            <span className={`
                                w-6 h-6 flex items-center justify-center text-lg transition-transform duration-200 group-hover:scale-110
                                ${isActive ? 'scale-110' : ''}
                            `}>
                                {sport.emoji}
                            </span>
                            <span>{sport.label}</span>
                            {sport.id === 'live' && (
                                <span className="ml-auto flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="mt-6 font-bold text-xs text-muted-foreground/70 uppercase tracking-widest mb-3 px-3">
                All Sports
            </div>

            <nav className="space-y-0.5">
                {allSports.map((sport) => {
                    const isActive = activeSport === sport.id;
                    return (
                        <button
                            key={sport.id}
                            onClick={() => onSelectSport(sport.id)}
                            className={`
                                w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group
                                ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200'
                                }
                            `}
                        >
                            <span className="w-6 h-6 flex items-center justify-center text-lg transition-transform duration-200 group-hover:scale-110">
                                {sport.emoji}
                            </span>
                            <span>{sport.label}</span>
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
}

