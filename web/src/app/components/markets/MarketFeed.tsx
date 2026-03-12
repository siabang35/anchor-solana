import React, { useEffect, useState, useRef } from 'react';
import { CompactMarketCard } from './CompactMarketCard';
import { MarketMessage, MarketCategory } from '@/hooks/useMarketSocket';
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { Wifi, Trash2 } from 'lucide-react';
import { Button } from "@/app/components/ui/button";
import { AnimatePresence } from 'framer-motion';

interface MarketFeedProps {
    category: MarketCategory;
    items: any[];
    isConnected?: boolean;
}

export const MarketFeed: React.FC<MarketFeedProps> = ({ category, items = [], isConnected = true }) => {
    const [feedItems, setFeedItems] = useState<MarketMessage[]>([]);
    const feedRef = useRef<HTMLDivElement>(null);

    // Sync items from props
    useEffect(() => {
        if (items.length > 0) {
            const formattedItems = items.map(item => {
                if (item.type && item.data) return item as MarketMessage;
                return {
                    category: category as string,
                    type: 'market_update',
                    data: item,
                    timestamp: item.published_at || new Date().toISOString(),
                    source: 'api'
                } as MarketMessage;
            });

            // Sort by timestamp desc
            formattedItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setFeedItems(formattedItems);
        }
    }, [items, category]);

    const handleClearFeed = () => {
        setFeedItems([]);
    };

    return (
        <div className="h-full flex flex-col bg-transparent">
            <div className="flex justify-between items-center px-1 mb-3">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {isConnected ? 'Live Updates' : 'Connecting...'}
                    </span>
                    <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-md font-mono">
                        {feedItems.length}
                    </span>
                </div>
                {feedItems.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClearFeed}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors"
                        title="Clear Feed"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            <ScrollArea className="flex-1 -mr-3 pr-3" ref={feedRef}>
                {feedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50 text-xs">
                        <Wifi className="h-8 w-8 mb-2 opacity-20" />
                        <p>Waiting for market data...</p>
                    </div>
                ) : (
                    <div className="space-y-1 pb-4">
                        <AnimatePresence initial={false}>
                            {feedItems.map((item, index) => (
                                <CompactMarketCard
                                    key={`${item.timestamp}-${index}`}
                                    message={item}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
