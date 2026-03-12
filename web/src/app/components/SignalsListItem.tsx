
import { motion } from "framer-motion";
import { Signal } from "../hooks/useMarketData";
import { Clock, TrendingUp, AlertTriangle, Activity, ExternalLink } from "lucide-react";

export function SignalsListItem({ signal, index }: { signal: Signal; index: number }) {
    const sentimentColor =
        signal.sentiment === 'BULLISH' ? 'text-emerald-500' :
            signal.sentiment === 'BEARISH' ? 'text-rose-500' :
                'text-blue-500';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "50px" }}
            transition={{ delay: index % 10 * 0.05 }}
            onClick={() => {
                if (signal.url) window.open(signal.url, '_blank', 'noopener,noreferrer');
            }}
            className="group relative flex items-center gap-4 p-4 bg-white/50 dark:bg-card/40 hover:bg-white dark:hover:bg-card/80 border-b border-zinc-100 dark:border-white/5 last:border-0 transition-colors cursor-pointer"
        >
            {/* Image / Icon Section */}
            <div className="flex-shrink-0 relative w-20 h-20 sm:w-32 sm:h-24 rounded-xl overflow-hidden bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 shadow-sm">
                {signal.image ? (
                    <img
                        src={signal.image}
                        alt={signal.title}
                        loading="lazy"
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('fallback-icon');
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-200 dark:from-white/5 dark:to-white/10 group-hover:bg-zinc-100 transition-colors">
                        <Activity className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2 mb-1">
                    {(signal.source_icon || signal.sourceIcon) && (
                        <img src={signal.source_icon || signal.sourceIcon} alt="source" className="w-4 h-4 rounded-full object-contain bg-white dark:bg-white/10 p-0.5" onError={(e) => e.currentTarget.style.display = 'none'} />
                    )}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary/80 dark:text-primary/70">
                        {signal.source_type || signal.source}
                    </span>
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        {signal.published_at
                            ? new Date(signal.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : signal.timeAgo}
                    </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 leading-tight group-hover:text-primary transition-colors line-clamp-2 pr-4">
                    {signal.title}
                </h3>

                {/* Mobile Bottom Row */}
                <div className="flex sm:hidden items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium flex items-center gap-1 ${sentimentColor}`}>
                        {signal.sentiment}
                    </span>
                </div>
            </div>

            {/* Metadata Section (Desktop) */}
            <div className="hidden sm:flex flex-col items-end gap-2 min-w-[120px]">
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${signal.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                    signal.sentiment === 'BEARISH' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' :
                        'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                    } flex items-center gap-1.5`}>
                    {signal.sentiment === 'BULLISH' && <TrendingUp className="w-3 h-3" />}
                    {signal.sentiment === 'BEARISH' && <AlertTriangle className="w-3 h-3" />}
                    {signal.sentiment}
                </div>

                <div className="flex gap-2">
                    {signal.tags.slice(0, 1).map(tag => (
                        <span key={tag} className="text-[10px] text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-white/5 px-2 py-0.5 rounded">
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* Action Arrow */}
            <div className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300 text-zinc-400">
                <ExternalLink className="w-5 h-5" />
            </div>
        </motion.div>
    );
}
