/**
 * useSportsRealtime Hook
 * 
 * Manages WebSocket connection for real-time sports updates.
 * merges updates into the existing events state.
 */

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SportsEvent, SportType } from '../../services/sports.service';
import { WS_URL } from '../../config';

// Extended type to include 'live' as a special room
type SportRoom = SportType | 'live';

interface UseSportsRealtimeOptions {
    activeSport?: SportRoom;
    onEventUpdate?: (event: SportsEvent) => void;
    enabled?: boolean;
}

export function useSportsRealtime({
    activeSport,
    onEventUpdate,
    enabled = true
}: UseSportsRealtimeOptions) {
    const socketRef = useRef<Socket | null>(null);
    const activeSportRef = useRef(activeSport);

    // Keep activeSport ref updated for joining rooms
    useEffect(() => {
        activeSportRef.current = activeSport;
    }, [activeSport]);

    // Initialize socket connection
    useEffect(() => {
        if (!enabled) return;

        // Create socket connection
        const socket = io(`${WS_URL}/sports`, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to Sports Gateway');

            // Join global live room
            socket.emit('join-sport', 'live');

            // Join active sport room if selected
            if (activeSportRef.current && activeSportRef.current !== 'live') {
                socket.emit('join-sport', activeSportRef.current);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from Sports Gateway');
        });

        socket.on('sports.update', (updatedEvent: SportsEvent) => {
            // console.log('Received sports update:', updatedEvent);
            if (onEventUpdate) {
                onEventUpdate(updatedEvent);
            }
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [enabled]);

    // Handle sport switching (joining/leaving rooms)
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected || !activeSport) return;

        // Leave previous rooms if necessary (logic depends on how we want to manage subs)
        // For now, we mainly join. In a complex app, we'd track joined rooms.

        if (activeSport !== 'live') {
            socket.emit('join-sport', activeSport);
        }

        return () => {
            if (activeSport !== 'live') {
                socket.emit('leave-sport', activeSport);
            }
        };
    }, [activeSport]);

    return {
        isConnected: socketRef.current?.connected || false,
    };
}
