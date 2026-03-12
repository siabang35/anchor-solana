import { ArrowUpRight, TrendingUp } from "lucide-react";
import { Signal } from "../utils/mockData";
import { motion } from "framer-motion";

interface HeroSectionProps {
  signals?: Signal[];
  isLoading?: boolean;
}

export function HeroSection({ signals = [], isLoading = false }: HeroSectionProps) {
  // Use first 3 signals if available, otherwise fallback/empty
  const mainSignal = signals[0];
  const sideSignal1 = signals[1];
  const sideSignal2 = signals[2];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full md:h-[400px]">
          {/* Main Skeleton */}
          <div className="relative overflow-hidden rounded-3xl bg-card/50 border border-border/50 h-full min-h-[300px] animate-pulse">
            <div className="absolute inset-0 bg-secondary/30" />
            <div className="absolute bottom-0 left-0 p-8 w-full space-y-4">
              <div className="h-6 w-24 bg-secondary/50 rounded-full" />
              <div className="h-10 w-3/4 bg-secondary/50 rounded-lg" />
              <div className="h-10 w-32 bg-secondary/50 rounded-full" />
            </div>
          </div>
          {/* Side Skeletons */}
          <div className="grid grid-cols-1 gap-4 h-full">
            <div className="relative overflow-hidden rounded-3xl bg-card/50 border border-border/50 h-full min-h-[190px] animate-pulse" />
            <div className="relative overflow-hidden rounded-3xl bg-card/50 border border-border/50 h-full min-h-[190px] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="rounded-3xl bg-gradient-to-br from-background to-secondary/20 border border-border/50 p-12 text-center h-[300px] flex flex-col items-center justify-center">
          <TrendingUp className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold text-muted-foreground">Waiting for specific market signals...</h2>
          <p className="text-muted-foreground/60 max-w-md mx-auto mt-2">
            Our AI is scanning global sources for high-impact events. Check back in a few moments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full md:h-[400px]">
        {/* Main Hero Card */}
        {mainSignal && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative overflow-hidden rounded-3xl group cursor-pointer h-full min-h-[300px]"
          >
            {/* Background Image */}
            <div className="absolute inset-0">
              {mainSignal.image ? (
                <img
                  src={mainSignal.image}
                  alt={mainSignal.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${getGradient(mainSignal.sentiment)}`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full z-20">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 text-xs font-bold bg-red-600 text-white rounded-full animate-pulse shadow-lg shadow-red-900/20">
                  LIVE SIGNAL
                </span>
                <span className="px-3 py-1 text-xs font-medium bg-black/40 backdrop-blur-md text-white/90 rounded-full border border-white/10 uppercase tracking-wide">
                  {mainSignal.source}
                </span>
              </div>

              <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight drop-shadow-lg line-clamp-3">
                {mainSignal.title}
              </h2>

              <div className="flex flex-wrap items-center gap-4 mt-4 md:mt-6">
                <button className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors shadow-lg shadow-white/10">
                  Read Analysis <ArrowUpRight className="w-4 h-4" />
                </button>
                <span className="text-white/60 text-sm font-medium backdrop-blur-sm bg-black/20 px-3 py-1 rounded-lg">
                  {mainSignal.timeAgo}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Right Column Stack */}
        <div className="grid grid-cols-1 gap-4 h-full">
          {/* Side Signal 1 */}
          {sideSignal1 && <SideSignalCard signal={sideSignal1} delay={0.1} />}

          {/* Side Signal 2 */}
          {sideSignal2 && <SideSignalCard signal={sideSignal2} delay={0.2} />}
        </div>
      </div>
    </div>
  );
}

function SideSignalCard({ signal, delay }: { signal: Signal; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="relative overflow-hidden rounded-3xl bg-card border border-border/50 h-full min-h-[190px] group cursor-pointer shadow-sm hover:shadow-md transition-all"
    >
      <div className="absolute inset-0">
        {signal.image ? (
          <div className="absolute inset-0 z-0">
            <img src={signal.image} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 to-transparent" />
          </div>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(signal.sentiment)} opacity-30`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent md:bg-gradient-to-r md:from-black/80 md:via-black/20 md:to-transparent" />
      </div>

      <div className="relative z-10 p-5 md:p-6 flex flex-col justify-center h-full">
        <div className="flex gap-2 mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full backdrop-blur-sm ${signal.impact === 'HIGH' ? 'bg-red-500/20 text-red-200 border border-red-500/30' :
            'bg-blue-500/20 text-blue-200 border border-blue-500/30'
            }`}>
            {signal.impact} IMPACT
          </span>
        </div>
        <h3 className="text-lg md:text-xl font-bold text-white mb-2 line-clamp-2 leading-snug group-hover:text-primary-foreground/80 transition-colors">
          {signal.title}
        </h3>
        <p className="text-white/60 text-sm line-clamp-1">{signal.source} • {signal.timeAgo}</p>
      </div>
    </motion.div>
  );
}

function getGradient(sentiment: string) {
  switch (sentiment) {
    case 'BULLISH': return 'from-green-900 to-emerald-900';
    case 'BEARISH': return 'from-red-900 to-rose-900';
    default: return 'from-blue-900 to-indigo-900';
  }
}
