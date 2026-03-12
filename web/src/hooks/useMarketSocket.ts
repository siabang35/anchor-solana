import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export type MarketCategory = 'crypto' | 'tech' | 'politics' | 'finance' | 'science' | 'economy' | 'signals' | 'latest';

export interface MarketMessage {
    category: MarketCategory;
    type: string;
    data: any;
    timestamp: string;
    source: string;
}

interface UseMarketSocketOptions {
    url?: string;
    autoConnect?: boolean;
    onMessage?: (message: MarketMessage) => void;
}

export const useMarketSocket = ({
    url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
    autoConnect = true,
    onMessage
}: UseMarketSocketOptions = {}) => {
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<MarketMessage | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const subscriptionsRef = useRef<Set<string>>(new Set());

    // Initialize socket
    useEffect(() => {
        if (!autoConnect) return;

        // Create socket connection
        // Strip /api/v1 or trailing slash to get base URL
        const baseUrl = url.replace(/\/api\/v[0-9]+$/, '').replace(/\/+$/, '');
        // Append namespace to URL as per Socket.IO client spec for namespaced connections
        const socketUrl = `${baseUrl}/market-data`;

        const socketIo = io(socketUrl, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socketIo;

        // Event listeners
        socketIo.on('connect', () => {
            console.log('[Socket] Connected');
            setIsConnected(true);
            setError(null);

            // Resubscribe to existing subscriptions on reconnect
            subscriptionsRef.current.forEach(category => {
                socketIo.emit('subscribe', { category });
            });
        });

        socketIo.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            setIsConnected(false);
        });

        socketIo.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err);
            setError(err);
            setIsConnected(false);
        });

        socketIo.on('market_update', (message: MarketMessage) => {
            setLastMessage(message);
            onMessage?.(message);
        });

        // Batch update handler
        socketIo.on('market_batch', (messages: MarketMessage[]) => {
            messages.forEach(msg => {
                setLastMessage(msg);
                onMessage?.(msg);
            });
        });

        socketIo.on('exception', (error) => {
            console.warn('[Socket] Server exception:', error);
        });

        // Cleanup
        return () => {
            if (socketIo) {
                socketIo.disconnect();
            }
        };
    }, [url, autoConnect]); // Removed onMessage dependency to avoid reconnects

    // Subscribe to a category
    const subscribe = useCallback((category: MarketCategory) => {
        if (!socketRef.current) return;

        if (!subscriptionsRef.current.has(category)) {
            console.log(`[Socket] Subscribing to ${category}`);
            socketRef.current.emit('subscribe', { category });
            subscriptionsRef.current.add(category);
        }
    }, []);

    // Unsubscribe from a category
    const unsubscribe = useCallback((category: MarketCategory) => {
        if (!socketRef.current) return;

        if (subscriptionsRef.current.has(category)) {
            console.log(`[Socket] Unsubscribing from ${category}`);
            socketRef.current.emit('unsubscribe', { category });
            subscriptionsRef.current.delete(category);
        }
    }, []);

    return {
        socket: socketRef.current,
        isConnected,
        lastMessage,
        error,
        subscribe,
        unsubscribe,
    };
};
