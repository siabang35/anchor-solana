import { motion } from 'framer-motion';
import type { Competition } from '../../../hooks/useCompetitions';

interface Props {
    competition: Competition;
    isSelected?: boolean;
    categoryColor?: string;
    onClick?: () => void;
}

function getCompetitionStatus(comp: Competition): 'live' | 'upcoming' | 'ended' {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now >= start && now <= end) return 'live';
    if (now < start) return 'upcoming';
    return 'ended';
}

function getHorizonLabel(comp: Competition): string {
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours <= 2) return '2H';
    if (hours <= 7) return '7H';
    if (hours <= 12) return '12H';
    if (hours <= 24) return '24H';
    if (hours <= 72) return '3D';
    return '7D';
}

function getTimeRemaining(comp: Competition): string {
    const now = Date.now();
    const status = getCompetitionStatus(comp);
    if (status === 'ended') return 'Finished';
    const target = status === 'upcoming'
        ? new Date(comp.competition_start).getTime()
        : new Date(comp.competition_end).getTime();
    const diff = target - now;
    if (diff <= 0) return status === 'upcoming' ? 'Starting...' : 'Settling...';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function getProgressPct(comp: Competition): number {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
}

const statusConfig = {
    live: { label: '● LIVE', bgClass: 'bg-emerald-500/15 text-emerald-400', animate: true },
    upcoming: { label: '⏳ UPCOMING', bgClass: 'bg-amber-500/15 text-amber-400', animate: false },
    ended: { label: '✓ ENDED', bgClass: 'bg-muted/30 text-muted-foreground', animate: false },
};

export function CompetitionCard({ competition, isSelected = false, categoryColor = '#6366f1', onClick }: Props) {
    const status = getCompetitionStatus(competition);
    const cfg = statusConfig[status];
    const horizon = getHorizonLabel(competition);
    const timeLeft = getTimeRemaining(competition);
    const progress = getProgressPct(competition);
    const probLabels = competition.outcomes || ['Yes', 'No'];
    const probs = competition.probabilities || [5000, 5000];

    const probColors = ['#818cf8', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

    return (
        <motion.article
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={`
                rounded-2xl border backdrop-blur-md p-4 cursor-pointer transition-all duration-200
                ${isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/5 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/20'
                    : 'border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/60'
                }
                ${status === 'ended' ? 'opacity-65' : ''}
            `}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span
                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                        style={{ color: categoryColor, background: `${categoryColor}15` }}
                    >
                        {horizon}
                    </span>
                    {isSelected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
                            📊 Viewing
                        </span>
                    )}
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${cfg.bgClass} ${cfg.animate ? 'animate-pulse' : ''}`}>
                    {cfg.label}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-sm font-bold text-foreground mb-1 line-clamp-2 leading-snug">
                {competition.title}
            </h3>
            {competition.description && (
                <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2 leading-relaxed">
                    {competition.description}
                </p>
            )}

            {/* Progress bar */}
            {status === 'live' && (
                <div className="w-full h-1 rounded-full bg-border/30 overflow-hidden my-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${categoryColor}, ${categoryColor}99)` }}
                    />
                </div>
            )}

            {/* Probabilities */}
            <div className="flex gap-1.5 flex-wrap mt-2">
                {probLabels.map((label, i) => (
                    <div
                        key={i}
                        className="flex-1 min-w-[60px] text-center py-1.5 px-2 rounded-lg bg-muted/30 border border-border/30"
                    >
                        <div className="text-[9px] text-muted-foreground font-semibold truncate">{label}</div>
                        <div
                            className="text-sm font-extrabold font-mono"
                            style={{ color: probColors[i % probColors.length] }}
                        >
                            {((probs[i] || 0) / 100).toFixed(1)}%
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 text-[10px]">
                <span className="text-muted-foreground">
                    💰 {competition.prize_pool || 0} SOL · 👥 {competition.entry_count || 0}/{competition.max_entries || 100}
                </span>
                <span className={`font-bold ${
                    status === 'live' ? 'text-emerald-400' :
                    status === 'upcoming' ? 'text-amber-400' : 'text-muted-foreground'
                }`}>
                    {status === 'live' ? `⏱ ${timeLeft}` : status === 'upcoming' ? `Starts ${timeLeft}` : '✓ Ended'}
                </span>
            </div>
        </motion.article>
    );
}
