import { Clock, Share2, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { Signal } from "../utils/mockData";
import { motion } from "framer-motion";

export function SignalsCard({ signal }: { signal: Signal }) {
    const sentimentColor =
        signal.sentiment === 'BULLISH' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' :
            signal.sentiment === 'BEARISH' ? 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' :
                'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20';

    const impactColor =
        signal.impact === 'HIGH' ? 'text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/20' :
            signal.impact === 'MEDIUM' ? 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30 bg-orange-100 dark:bg-orange-500/20' :
                'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 bg-blue-100 dark:bg-blue-500/20';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            onClick={() => {
                if (signal.url) window.open(signal.url, '_blank', 'noopener,noreferrer');
            }}
            className="group relative flex flex-col h-full bg-white dark:bg-card/60 backdrop-blur-md border border-zinc-200 dark:border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 cursor-pointer"
        >
            {/* Image Banner or Gradient Fallback */}
            <div className="relative h-44 w-full overflow-hidden">
                {signal.image ? (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 opacity-60" />
                        <img
                            src={signal.image}
                            alt={signal.title}
                            loading="lazy"
                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.classList.add('hidden');
                            }}
                        />
                    </>
                ) : (
                    <div className={`w-full h-full bg-gradient-to-br transition-colors duration-500 ${signal.sentiment === 'BULLISH' ? 'from-emerald-50 to-teal-100 dark:from-emerald-900/40 dark:to-background' :
                        signal.sentiment === 'BEARISH' ? 'from-rose-50 to-red-100 dark:from-red-900/40 dark:to-background' :
                            'from-blue-50 to-indigo-100 dark:from-blue-900/40 dark:to-background'
                        } flex items-center justify-center`}>
                        <Zap className={`w-12 h-12 opacity-20 ${signal.sentiment === 'BULLISH' ? 'text-emerald-500' : signal.sentiment === 'BEARISH' ? 'text-rose-500' : 'text-blue-500'}`} />
                    </div>
                )}

                {/* Floating Badges */}
                <div className="absolute top-3 left-3 z-20 flex gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border backdrop-blur-md shadow-sm ${impactColor}`}>
                        {signal.impact} IMPACT
                    </span>
                </div>

                <div className="absolute top-3 right-3 z-20">
                    <button className="p-2 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-colors border border-white/20 shadow-sm">
                        <Share2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/5">
                        {signal.sourceIcon ? (
                            <img src={signal.sourceIcon} alt={signal.source} className="w-3.5 h-3.5 object-contain rounded-sm" />
                        ) : signal.url ? (
                            <img src={`https://www.google.com/s2/favicons?domain=${new URL(signal.url).hostname}&sz=32`} alt={signal.source} className="w-3.5 h-3.5 object-contain rounded-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : null}
                        {signal.source}
                    </div>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">•</span>
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <Clock className="w-3 h-3" />
                        {signal.timeAgo}
                    </div>
                </div>

                <h3 className="text-lg font-bold leading-tight mb-3 text-zinc-900 dark:text-zinc-100 group-hover:text-primary transition-colors line-clamp-2">
                    {signal.title}
                </h3>

                {/* Tags & Sentiment */}
                <div className="mt-auto pt-4 flex items-center justify-between border-t border-zinc-100 dark:border-white/5">
                    <div className="flex gap-2">
                        {signal.tags?.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 px-2 py-1 rounded-md">
                                #{tag}
                            </span>
                        ))}
                    </div>

                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${sentimentColor}`}>
                        {signal.sentiment === 'BULLISH' && <TrendingUp className="w-3.5 h-3.5" />}
                        {signal.sentiment === 'BEARISH' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {signal.sentiment === 'NEUTRAL' && <Activity className="w-3.5 h-3.5" />}
                        {signal.sentiment}
                    </div>
                </div>
            </div>

            {/* Hover Action Overlay (Mobile: Always visible button) */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none p-4">
                <div className="w-full h-10 mt-auto opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                    {/* Decorative glow used to be here, could add a button if needed */}
                </div>
            </div>
        </motion.div>
    );
}

function Activity(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    );
}
