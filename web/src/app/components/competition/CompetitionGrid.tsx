import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Competition } from '../../../hooks/useCompetitions';
import { CompetitionCard } from './CompetitionCard';

interface Props {
    competitions: Competition[];
    loading?: boolean;
    selectedCompId?: string | null;
    categoryColor?: string;
    categoryLabel?: string;
    onSelectCompetition?: (id: string) => void;
}

function getCompetitionStatus(comp: Competition): 'live' | 'upcoming' | 'ended' {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now >= start && now <= end) return 'live';
    if (now < start) return 'upcoming';
    return 'ended';
}

export function CompetitionGrid({
    competitions,
    loading = false,
    selectedCompId,
    categoryColor = '#6366f1',
    categoryLabel = 'Competitions',
    onSelectCompetition,
}: Props) {
    const sorted = useMemo(() => [...competitions].sort((a, b) => {
        const order = { live: 0, upcoming: 1, ended: 2 };
        const diff = order[getCompetitionStatus(a)] - order[getCompetitionStatus(b)];
        if (diff !== 0) return diff;
        return new Date(a.competition_start).getTime() - new Date(b.competition_start).getTime();
    }), [competitions]);

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    Active {categoryLabel} ({sorted.length})
                </h3>
                {liveCount > 0 && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 animate-pulse">
                        {liveCount} live now
                    </span>
                )}
            </div>

            {/* Loading State */}
            {loading && sorted.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    <div className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                        Loading competitions...
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && sorted.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    No competitions yet. They will be auto-created from live data feeds.
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sorted.map((comp) => (
                    <CompetitionCard
                        key={comp.id}
                        competition={comp}
                        isSelected={comp.id === selectedCompId}
                        categoryColor={categoryColor}
                        onClick={() => onSelectCompetition?.(comp.id)}
                    />
                ))}
            </div>
        </motion.section>
    );
}
