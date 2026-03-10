/**
 * Sports Gateway
 * 
 * WebSocket gateway for real-time sports data streaming.
 * Subscribes to SportsMessagingService events and broadcasts updates to connected clients.
 * 
 * Security Features:
 * - CORS origin validation (configurable via CORS_ORIGINS env)
 * - Per-client rate limiting
 * - Input validation and sanitization
 * - Max subscriptions per client
 * - Idle connection cleanup
 * 
 * Events:
 * - sports.update: Real-time score/time updates
 * - market.update: Market odds/status updates
 */

import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SportsMessagingService, SPORTS_ROUTING_KEYS, SportsEventMessage, SportsMarketMessage } from './sports-messaging.service.js';
import { EventStatus } from './types/sports.types.js';

// Security configuration
const WS_SECURITY_CONFIG = {
    maxSubscriptionsPerClient: 20,
    rateLimitPerSecond: 10,
    idleTimeoutMs: 300000, // 5 minutes
    maxRoomNameLength: 50,
};

// Valid sports for validation
const VALID_SPORTS = ['soccer', 'basketball', 'tennis', 'baseball', 'hockey', 'football', 'mma', 'boxing', 'cricket', 'rugby', 'live'] as const;
type ValidSport = typeof VALID_SPORTS[number];

interface ClientState {
    subscriptions: Set<string>;
    requestCount: number;
    requestWindowStart: number;
    lastActivity: number;
}

@WebSocketGateway({
    namespace: 'sports',
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow requests with no origin (mobile apps, server-to-server)
            if (!origin) {
                callback(null, true);
                return;
            }

            // Parse allowed origins from environment
            const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || [
                'http://localhost:3000',
                'http://localhost:5173',
                'http://localhost:3001',
            ];

            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else {
                callback(new Error('Origin not allowed'), false);
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingInterval: 30000,
    pingTimeout: 10000,
})
export class SportsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SportsGateway.name);
    private readonly clientStates = new Map<string, ClientState>();
    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        private readonly sportsMessagingService: SportsMessagingService,
    ) { }

    afterInit(server: Server) {
        this.logger.log('Sports WebSocket Gateway initialized');
        this.logger.log(`Security: Max ${WS_SECURITY_CONFIG.maxSubscriptionsPerClient} subs/client, ${WS_SECURITY_CONFIG.rateLimitPerSecond} req/s`);
        this.setupSubscriptions();

        // Setup idle connection cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, 60000);
    }

    handleConnection(client: Socket) {
        const origin = client.handshake.headers.origin;
        this.logger.debug(`Client connected: ${client.id} from ${origin || 'unknown'}`);

        // Initialize client state
        this.clientStates.set(client.id, {
            subscriptions: new Set(),
            requestCount: 0,
            requestWindowStart: Date.now(),
            lastActivity: Date.now(),
        });

        client.emit('connection', {
            status: 'connected',
            message: 'Welcome to Sports Stream',
            maxSubscriptions: WS_SECURITY_CONFIG.maxSubscriptionsPerClient,
        });
    }

    handleDisconnect(client: Socket) {
        this.logger.debug(`Client disconnected: ${client.id}`);
        this.clientStates.delete(client.id);
    }

    @SubscribeMessage('join-sport')
    handleJoinSport(
        @ConnectedSocket() client: Socket,
        @MessageBody() sport: unknown,
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { event: 'error', data: 'Rate limit exceeded. Please slow down.' };
        }

        // Input validation
        const validation = this.validateSportInput(sport);
        if (!validation.valid) {
            return { event: 'error', data: validation.error };
        }

        const state = this.clientStates.get(client.id);
        if (!state) {
            return { event: 'error', data: 'Client state not found' };
        }

        // Check max subscriptions
        if (state.subscriptions.size >= WS_SECURITY_CONFIG.maxSubscriptionsPerClient) {
            return { event: 'error', data: `Maximum ${WS_SECURITY_CONFIG.maxSubscriptionsPerClient} subscriptions reached` };
        }

        const room = `sport:${validation.sanitized}`;

        // Check if already subscribed
        if (state.subscriptions.has(room)) {
            return { event: 'joined', data: room, message: 'Already subscribed' };
        }

        client.join(room);
        state.subscriptions.add(room);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} joined ${room} (total: ${state.subscriptions.size})`);
        return { event: 'joined', data: room };
    }

    @SubscribeMessage('leave-sport')
    handleLeaveSport(
        @ConnectedSocket() client: Socket,
        @MessageBody() sport: unknown,
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { event: 'error', data: 'Rate limit exceeded' };
        }

        const validation = this.validateSportInput(sport);
        if (!validation.valid) {
            return { event: 'error', data: validation.error };
        }

        const state = this.clientStates.get(client.id);
        if (!state) {
            return { event: 'error', data: 'Client state not found' };
        }

        const room = `sport:${validation.sanitized}`;
        client.leave(room);
        state.subscriptions.delete(room);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} left ${room}`);
        return { event: 'left', data: room };
    }

    @SubscribeMessage('join-event')
    handleJoinEvent(
        @ConnectedSocket() client: Socket,
        @MessageBody() eventId: unknown,
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { event: 'error', data: 'Rate limit exceeded' };
        }

        // Validate event ID (should be UUID-like or alphanumeric)
        const validation = this.validateEventId(eventId);
        if (!validation.valid) {
            return { event: 'error', data: validation.error };
        }

        const state = this.clientStates.get(client.id);
        if (!state) {
            return { event: 'error', data: 'Client state not found' };
        }

        // Check max subscriptions
        if (state.subscriptions.size >= WS_SECURITY_CONFIG.maxSubscriptionsPerClient) {
            return { event: 'error', data: `Maximum ${WS_SECURITY_CONFIG.maxSubscriptionsPerClient} subscriptions reached` };
        }

        const room = `event:${validation.sanitized}`;

        if (state.subscriptions.has(room)) {
            return { event: 'joined', data: room, message: 'Already subscribed' };
        }

        client.join(room);
        state.subscriptions.add(room);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} joined ${room}`);
        return { event: 'joined', data: room };
    }

    @SubscribeMessage('leave-event')
    handleLeaveEvent(
        @ConnectedSocket() client: Socket,
        @MessageBody() eventId: unknown,
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { event: 'error', data: 'Rate limit exceeded' };
        }

        const validation = this.validateEventId(eventId);
        if (!validation.valid) {
            return { event: 'error', data: validation.error };
        }

        const state = this.clientStates.get(client.id);
        if (!state) {
            return { event: 'error', data: 'Client state not found' };
        }

        const room = `event:${validation.sanitized}`;
        client.leave(room);
        state.subscriptions.delete(room);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} left ${room}`);
        return { event: 'left', data: room };
    }

    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket) {
        const state = this.clientStates.get(client.id);
        if (state) {
            state.lastActivity = Date.now();
        }
        return { event: 'pong', data: { serverTime: new Date().toISOString() } };
    }

    /**
     * Validate sport input
     */
    private validateSportInput(sport: unknown): { valid: boolean; error?: string; sanitized?: string } {
        if (typeof sport !== 'string') {
            return { valid: false, error: 'Sport must be a string' };
        }

        if (sport.length > WS_SECURITY_CONFIG.maxRoomNameLength) {
            return { valid: false, error: 'Sport name too long' };
        }

        // Sanitize: lowercase, trim, remove non-alphanumeric except hyphen
        const sanitized = sport.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

        if (!sanitized) {
            return { valid: false, error: 'Invalid sport name' };
        }

        // Validate against allowed sports (optional strictness)
        // if (!VALID_SPORTS.includes(sanitized as ValidSport)) {
        //     return { valid: false, error: `Invalid sport. Valid: ${VALID_SPORTS.join(', ')}` };
        // }

        return { valid: true, sanitized };
    }

    /**
     * Validate event ID
     */
    private validateEventId(eventId: unknown): { valid: boolean; error?: string; sanitized?: string } {
        if (typeof eventId !== 'string') {
            return { valid: false, error: 'Event ID must be a string' };
        }

        if (eventId.length > 100) {
            return { valid: false, error: 'Event ID too long' };
        }

        // Sanitize: remove dangerous characters, allow UUID format and alphanumeric
        const sanitized = eventId.trim().replace(/[^a-zA-Z0-9-_]/g, '');

        if (!sanitized || sanitized.length < 1) {
            return { valid: false, error: 'Invalid event ID' };
        }

        return { valid: true, sanitized };
    }

    /**
     * Check rate limit for client
     */
    private checkRateLimit(clientId: string): boolean {
        const state = this.clientStates.get(clientId);
        if (!state) return false;

        const now = Date.now();
        const windowMs = 1000; // 1 second window

        // Reset counter if window expired
        if (now - state.requestWindowStart >= windowMs) {
            state.requestCount = 0;
            state.requestWindowStart = now;
        }

        // Check limit
        if (state.requestCount >= WS_SECURITY_CONFIG.rateLimitPerSecond) {
            this.logger.debug(`Rate limit exceeded for client ${clientId}`);
            return false;
        }

        state.requestCount++;
        return true;
    }

    /**
     * Cleanup idle connections
     */
    private cleanupIdleConnections(): void {
        if (!this.server || !this.server.sockets) {
            return;
        }

        const now = Date.now();
        let cleanedCount = 0;

        for (const [clientId, state] of this.clientStates.entries()) {
            if (now - state.lastActivity > WS_SECURITY_CONFIG.idleTimeoutMs) {
                try {
                    const socket = this.server.sockets.sockets?.get(clientId);
                    if (socket) {
                        socket.emit('idle_timeout', { message: 'Connection closed due to inactivity' });
                        socket.disconnect(true);
                    }
                } catch (error) {
                    this.logger.debug(`Error cleaning up socket ${clientId}: ${(error as Error).message}`);
                }
                this.clientStates.delete(clientId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} idle connections`);
        }
    }

    /**
     * Setup subscriptions to SportsMessagingService
     */
    private setupSubscriptions() {
        // Subscribe to event updates (Live, Finished, Updated)
        this.sportsMessagingService.registerHandler<SportsEventMessage>(
            SPORTS_ROUTING_KEYS.EVENT_LIVE,
            async (msg) => this.broadcastEventUpdate(msg)
        );

        this.sportsMessagingService.registerHandler<SportsEventMessage>(
            SPORTS_ROUTING_KEYS.EVENT_UPDATED,
            async (msg) => this.broadcastEventUpdate(msg)
        );

        this.sportsMessagingService.registerHandler<SportsEventMessage>(
            SPORTS_ROUTING_KEYS.EVENT_FINISHED,
            async (msg) => this.broadcastEventUpdate(msg)
        );

        // Subscribe to market updates
        this.sportsMessagingService.registerHandler<SportsMarketMessage>(
            SPORTS_ROUTING_KEYS.ODDS_UPDATED,
            async (msg) => this.broadcastMarketUpdate(msg)
        );

        this.sportsMessagingService.registerHandler<SportsMarketMessage>(
            SPORTS_ROUTING_KEYS.MARKET_RESOLVED,
            async (msg) => this.broadcastMarketUpdate(msg)
        );
    }

    /**
     * Broadcast event update to subscribers
     */
    public broadcastEventUpdate(event: SportsEventMessage) {
        // Broadcast to specific sport room
        if (event.sport) {
            this.server.to(`sport:${event.sport}`).emit('sports.update', event);
        }

        // Broadcast to specific event room
        this.server.to(`event:${event.eventId}`).emit('sports.update', event);

        // Broadcast to global 'live' room if event is active
        if (event.status === EventStatus.LIVE || event.status === EventStatus.HALFTIME) {
            this.server.to('sport:live').emit('sports.update', event);
        }
    }

    /**
     * Broadcast market update to subscribers
     */
    public broadcastMarketUpdate(market: SportsMarketMessage) {
        // Broadcast to event room
        this.server.to(`event:${market.eventId}`).emit('market.update', market);
    }

    /**
     * Get stats for monitoring
     */
    getStats(): { totalClients: number; subscriptionsByRoom: Record<string, number> } {
        const roomCount: Record<string, number> = {};

        for (const state of this.clientStates.values()) {
            for (const room of state.subscriptions) {
                roomCount[room] = (roomCount[room] || 0) + 1;
            }
        }

        return {
            totalClients: this.clientStates.size,
            subscriptionsByRoom: roomCount,
        };
    }

    /**
     * Cleanup on module destroy
     */
    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

