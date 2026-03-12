import { motion } from 'framer-motion';
import type { LiveFeedItem } from '../../../hooks/useLiveFeed';

interface Props {
    feeds: LiveFeedItem[];
    connected?: boolean;
    categoryLabel?: string;
}

const impactStyles = {
    high: 'border-l-red-500 bg-red-500/5',
    medium: 'border-l-amber-500 bg-amber-500/5',
    low: 'border-l-blue-500 bg-blue-500/5',
};

const impactBadge = {
    high: 'bg-red-500/15 text-red-400',
    medium: 'bg-amber-500/15 text-amber-400',
    low: 'bg-blue-500/15 text-blue-400',
};

export function LiveFeedPanel({ feeds, connected = false, categoryLabel = 'All' }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                    <span>📡</span> Live Feed — {categoryLabel}
                </h3>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                    {connected ? '● Live' : '○ Connecting'}
                </span>
            </div>

            {/* Empty State */}
            {feeds.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    No feed data for {categoryLabel} yet.
                </div>
            )}

            {/* Feed List */}
            <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {feeds.map((item) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border-l-2 ${impactStyles[item.impact]}`}
                    >
                        <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {item.source}
                            </div>
                            <div className="text-xs text-foreground/90 leading-relaxed line-clamp-2 mt-0.5">
                                {item.text}
                            </div>
                        </div>
                        <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${impactBadge[item.impact]}`}>
                            {item.impact.toUpperCase()}
                        </span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
