import React from 'react';
import { Card, CardContent } from "@/app/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Wifi } from 'lucide-react';

interface MarketStatsProps {
    latestItem?: any;
    isConnected?: boolean;
}

export const MarketStats: React.FC<MarketStatsProps> = ({ latestItem, isConnected = true }) => {
    // If no item, show placeholder or return null
    // But we might want to show "Live" status at least

    const sentiment = latestItem?.sentiment || 'neutral';
    const isBullish = sentiment.toLowerCase() === 'bullish';
    const isBearish = sentiment.toLowerCase() === 'bearish';

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <div className={`flex items-center gap-1 font-medium ${isConnected ? 'text-green-500' : 'text-yellow-500'}`}>
                            <Wifi className="h-3 w-3" />
                            <span className="text-sm">{isConnected ? 'Live' : 'Connecting'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">Current Sentiment</p>
                        <div className={`flex items-center gap-1 font-medium ${isBullish ? 'text-green-500' : isBearish ? 'text-red-500' : 'text-yellow-500'}`}>
                            {isBullish ? <TrendingUp className="h-3 w-3" /> : isBearish ? <TrendingDown className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                            <span className="text-sm capitalize">{sentiment}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
