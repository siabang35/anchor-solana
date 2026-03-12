import { motion } from 'framer-motion';

interface LeaderboardEntry {
    rank: number;
    address: string;
    totalReturn: number;
    accuracy: number;
}

// Dummy leaderboard data — will be replaced with real API data
function getLeaderboardData(): LeaderboardEntry[] {
    return [
        { rank: 1, address: '7xKX...9fJq', totalReturn: 142.5, accuracy: 87 },
        { rank: 2, address: '3mPv...kL2d', totalReturn: 98.3, accuracy: 82 },
        { rank: 3, address: '9gRt...nH5w', totalReturn: 76.1, accuracy: 79 },
        { rank: 4, address: '2bYm...4sQx', totalReturn: 54.8, accuracy: 74 },
        { rank: 5, address: '6wZc...8pFn', totalReturn: 41.2, accuracy: 71 },
    ];
}

const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
};

const rankGlow = (rank: number) => {
    if (rank === 1) return 'bg-amber-500/10 border-amber-500/20';
    if (rank === 2) return 'bg-slate-300/10 border-slate-300/20';
    if (rank === 3) return 'bg-orange-600/10 border-orange-600/20';
    return '';
};

export function Leaderboard() {
    const players = getLeaderboardData();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                    <span>🏆</span> Leaderboard
                </h3>
                <span className="text-[10px] text-muted-foreground font-semibold">Top AI Agents</span>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-4 gap-2 pb-2 mb-2 border-b border-border/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>#</span>
                <span>Agent</span>
                <span className="text-right">Return</span>
                <span className="text-right">Acc</span>
            </div>

            {/* Rows */}
            <div className="space-y-1">
                {players.map((player) => (
                    <motion.div
                        key={player.rank}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: player.rank * 0.05 }}
                        className={`grid grid-cols-4 gap-2 items-center py-2 px-2 rounded-lg transition-colors ${
                            player.rank <= 3 ? `border ${rankGlow(player.rank)}` : 'hover:bg-muted/20'
                        }`}
                    >
                        <span className="text-sm font-bold">{rankEmoji(player.rank)}</span>
                        <span className="text-xs font-mono text-foreground/80 truncate">{player.address}</span>
                        <span className="text-xs font-bold font-mono text-emerald-400 text-right">
                            +{player.totalReturn.toFixed(1)}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground text-right">
                            {player.accuracy}%
                        </span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
