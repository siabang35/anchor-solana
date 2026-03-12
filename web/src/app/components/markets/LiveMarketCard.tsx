import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { MarketMessage } from '@/hooks/useMarketSocket';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface LiveMarketCardProps {
    message: MarketMessage | any; // Handle both types
    isBetting?: boolean;
}

export const LiveMarketCard: React.FC<LiveMarketCardProps> = ({ message, isBetting = true }) => {
    // Normalize data (handle both socket message structure and raw API items)
    const data = message.data || message;
    const timestamp = message.timestamp || message.published_at || new Date().toISOString();

    // Outcome probabilities (mocked if not present)
    const yesPrice = data.yes_price || 0.50;
    const noPrice = data.no_price || 0.50;

    // Determine sentiment color and icon
    const getSentimentConfig = (sentiment?: string) => {
        switch (sentiment?.toLowerCase()) {
            case 'bullish':
                return { color: 'text-green-500', bg: 'bg-green-500/10', icon: TrendingUp, label: 'Bullish' };
            case 'bearish':
                return { color: 'text-red-500', bg: 'bg-red-500/10', icon: TrendingDown, label: 'Bearish' };
            default:
                return { color: 'text-gray-500', bg: 'bg-gray-500/10', icon: Minus, label: 'Neutral' };
        }
    };

    const sentimentConfig = getSentimentConfig(data.sentiment);
    const Icon = sentimentConfig.icon;
    const isHighImpact = data.impact === 'high' || data.impact === 'critical';

    // Betting Actions
    const handleBet = (outcome: 'YES' | 'NO', e: React.MouseEvent) => {
        e.stopPropagation();
        // Open betting modal or execute transaction
        console.log(`Betting ${outcome} on ${data.id}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            layout
        >
            <Card className={`overflow-hidden border-l-4 ${isHighImpact ? 'border-l-yellow-500' : 'border-l-transparent'} hover:shadow-lg transition-shadow duration-200`}>
                <CardHeader className="p-4 pb-2 space-y-0">
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs uppercase tracking-wider font-mono opacity-70">
                                {message.category}
                            </Badge>
                            <Badge variant="secondary" className={`${sentimentConfig.color} ${sentimentConfig.bg} border-0 flex items-center gap-1`}>
                                <Icon className="w-3 h-3" />
                                <span className="text-xs">{sentimentConfig.label}</span>
                            </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                        </span>
                    </div>
                    <CardTitle className="text-base font-semibold mt-2 leading-tight line-clamp-2">
                        {data.title || data.name}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                        {data.description || data.content || (
                            data.value ? `Value: ${data.value} ${data.unit || ''}` : ''
                        )}
                    </p>

                    {data.imageUrl && (
                        <div className="mt-3 relative h-32 w-full overflow-hidden rounded-md">
                            <img
                                src={data.imageUrl}
                                alt={data.title}
                                className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                            />
                        </div>
                    )}
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-between items-center text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        {data.sourceName && (
                            <span className="font-medium text-foreground/80">
                                {data.sourceName || 'Polymarket'}
                            </span>
                        )}
                    </div>

                    {isBetting && (
                        <div className="flex bg-secondary/30 rounded-lg p-1 gap-2 w-full mt-2 border border-border/40">
                            <button
                                onClick={(e) => handleBet('YES', e)}
                                className="flex-1 px-3 py-2 bg-green-500/5 hover:bg-green-500/15 border border-green-500/20 rounded-md text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 group"
                            >
                                <span className="text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform">YES</span>
                                <span className="text-green-700 dark:text-green-300 text-sm tracking-tight">{Math.round(yesPrice * 100)}%</span>
                            </button>
                            <button
                                onClick={(e) => handleBet('NO', e)}
                                className="flex-1 px-3 py-2 bg-red-500/5 hover:bg-red-500/15 border border-red-500/20 rounded-md text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 group"
                            >
                                <span className="text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform">NO</span>
                                <span className="text-red-700 dark:text-red-300 text-sm tracking-tight">{Math.round(noPrice * 100)}%</span>
                            </button>
                        </div>
                    )}
                </CardFooter>
            </Card>
        </motion.div>
    );
};
