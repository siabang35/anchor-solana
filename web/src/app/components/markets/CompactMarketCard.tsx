import React from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { MarketMessage } from '@/hooks/useMarketSocket';

interface CompactMarketCardProps {
    message: MarketMessage | any;
    isBetting?: boolean; // Kept for interface compatibility but unused for visual distinction
}

export const CompactMarketCard: React.FC<CompactMarketCardProps> = ({ message }) => {
    const data = message.data || message;
    const timestamp = message.timestamp || message.published_at || new Date().toISOString();

    // Sentiment Config
    const isHighImpact = data.impact === 'high' || data.impact === 'critical';
    const sentiment = data.sentiment?.toLowerCase();

    let SentimentIcon = Minus;
    let sentimentColor = 'text-muted-foreground';

    if (sentiment === 'bullish') {
        SentimentIcon = TrendingUp;
        sentimentColor = 'text-green-500';
    } else if (sentiment === 'bearish') {
        SentimentIcon = TrendingDown;
        sentimentColor = 'text-red-500';
    }

    // Determine target URL (if available)
    const targetUrl = data.url || (data.id ? `/markets/${data.id}` : '#');
    const isExternal = !!data.url;

    return (
        <motion.a
            href={targetUrl}
            target={isExternal ? "_blank" : "_self"}
            rel={isExternal ? "noopener noreferrer" : undefined}
            layout
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="group block relative pl-4 pr-2 py-3 border-l-[3px] border-l-border/30 hover:border-l-primary hover:bg-accent/20 transition-all cursor-pointer rounded-r-md"
        >
            {/* Timestamp & Source Header */}
            <div className="flex justify-between items-center mb-1.5 text-[10px] text-muted-foreground/80">
                <div className="flex items-center gap-2">
                    <span className="font-medium uppercase tracking-wider text-foreground/70">
                        {message.category || 'NEWS'}
                    </span>
                    {(isHighImpact || sentiment) && (
                        <SentimentIcon className={`w-3 h-3 ${sentimentColor}`} />
                    )}
                </div>
                <span>
                    {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                </span>
            </div>

            {/* Title */}
            <h4 className="text-[13px] font-medium text-foreground/90 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {data.title || data.name}
            </h4>

            {/* Subtext / Metadata (No Buttons) */}
            <div className="mt-1.5 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground line-clamp-1 flex-1 pr-2">
                    {data.description || data.summary || "New market update available"}
                </p>
                <ExternalLink className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </motion.a>
    );
};
