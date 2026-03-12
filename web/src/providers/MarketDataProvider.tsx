import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useMarketSocket, MarketMessage, MarketCategory } from '../hooks/useMarketSocket';

interface MarketDataState {
    latestData: Record<string, MarketMessage>; // Keyed by category
    isConnected: boolean;
    error: Error | null;
}

interface MarketDataContextType extends MarketDataState {
    subscribe: (category: MarketCategory) => void;
    unsubscribe: (category: MarketCategory) => void;
    getLatestByCategory: (category: MarketCategory) => MarketMessage | null;
}

const MarketDataContext = createContext<MarketDataContextType | null>(null);

interface MarketDataProviderProps {
    children: ReactNode;
}

export const MarketDataProvider: React.FC<MarketDataProviderProps> = ({ children }) => {
    const { socket, isConnected, lastMessage, error, subscribe, unsubscribe } = useMarketSocket();
    const [latestData, setLatestData] = useState<Record<string, MarketMessage>>({});

    // Update state when new message arrives
    useEffect(() => {
        if (lastMessage) {
            setLatestData(prev => ({
                ...prev,
                [lastMessage.category]: lastMessage
            }));
        }
    }, [lastMessage]);

    const getLatestByCategory = useCallback((category: MarketCategory) => {
        return latestData[category] || null;
    }, [latestData]);

    const value = {
        latestData,
        isConnected,
        error,
        subscribe,
        unsubscribe,
        getLatestByCategory
    };

    return (
        <MarketDataContext.Provider value={value}>
            {children}
        </MarketDataContext.Provider>
    );
};

export const useMarketData = () => {
    const context = useContext(MarketDataContext);
    if (!context) {
        throw new Error('useMarketData must be used within a MarketDataProvider');
    }
    return context;
};
