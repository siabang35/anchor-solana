import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../../config';

// WebSocket URL from centralized config

export type SportsSocketEvent = 'sports.update' | 'market.update';

// Strict Payload Types (Anti-Hack: Type Safety)
export interface MarketUpdatePayload {
    id: string;
    price?: number;
    volume?: number;
    [key: string]: unknown; // Allow extensibility but ban `any`
}

export interface SportsUpdatePayload {
    eventId: string;
    homeScore?: number;
    awayScore?: number;
    status?: string;
    [key: string]: unknown;
}

interface UseSportsSocketProps {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onMarketUpdate?: (data: MarketUpdatePayload) => void;
    onSportsUpdate?: (data: SportsUpdatePayload) => void;
}

export function useSportsSocket({
    onConnect,
    onDisconnect,
    onMarketUpdate,
    onSportsUpdate
}: UseSportsSocketProps = {}) {
    const socketRef = useRef<Socket | null>(null);

    // Initialize Socket connection
    useEffect(() => {
        // Connect to the /sports namespace
        const socket = io(`${WS_URL}/sports`, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to Sports WebSocket');
            onConnect?.();
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from Sports WebSocket');
            onDisconnect?.();
        });

        socket.on('connect_error', (err) => {
            console.error('WebSocket connection error:', err);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    // Handle Event Listeners
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const handleMarketUpdate = (data: any) => {
            // console.log('Market Update:', data);
            onMarketUpdate?.(data);
        };

        const handleSportsUpdate = (data: any) => {
            // console.log('Sports Update:', data);
            onSportsUpdate?.(data);
        };

        socket.on('market.update', handleMarketUpdate);
        socket.on('sports.update', handleSportsUpdate);

        return () => {
            socket.off('market.update', handleMarketUpdate);
            socket.off('sports.update', handleSportsUpdate);
        };
    }, [onMarketUpdate, onSportsUpdate]);

    // Methods to Join/Leave Rooms
    const joinSport = useCallback((sport: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('join-sport', sport);
        }
    }, []);

    const leaveSport = useCallback((sport: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('leave-sport', sport);
        }
    }, []);

    const joinEvent = useCallback((eventId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('join-event', eventId);
        }
    }, []);

    const leaveEvent = useCallback((eventId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('leave-event', eventId);
        }
    }, []);

    return {
        socket: socketRef.current,
        isConnected: socketRef.current?.connected ?? false,
        joinSport,
        leaveSport,
        joinEvent,
        leaveEvent
    };
}
