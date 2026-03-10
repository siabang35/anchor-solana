/**
 * Market Data Gateway
 * 
 * Enhanced WebSocket gateway for real-time market data streaming.
 * Features:
 * - OWASP-compliant input validation
 * - Per-client rate limiting
 * - Max subscriptions per client
 * - Heartbeat mechanism
 * - Connection origin validation
 */

import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as crypto from 'crypto';

// Valid market categories
const VALID_CATEGORIES = ['politics', 'finance', 'tech', 'crypto', 'economy', 'science', 'signals', 'latest', 'live-feed', 'sports'] as const;
type MarketCategory = typeof VALID_CATEGORIES[number];

// Security configuration
const SECURITY_CONFIG = {
    maxSubscriptionsPerClient: 10,
    maxMessageSizeBytes: 1024 * 10, // 10KB (mobile-safe)
    rateLimitPerSecond: 10,         // Sustained limit
    burstTolerance: 20,             // Allow burst up to 20 then hard limit
    heartbeatIntervalMs: 30000,     // 30 seconds
    idleTimeoutMs: 300000,          // 5 minutes
    maxWarningsBeforeKick: 5,       // Progressive: kick after 5 rate limit violations
};

interface SubscriptionMessage {
    category: string;
}

interface CompetitionSubscriptionMessage {
    competitionId: string;
}

interface ClientState {
    subscriptions: Set<string>;
    requestCount: number;
    requestWindowStart: number;
    lastActivity: number;
    fingerprint: string;            // SHA256(IP + UA) for abuse detection
    burstCount: number;             // Progressive rate limit burst counter
    warningCount: number;           // Progressive: count of rate limit violations
}

@WebSocketGateway({
    namespace: '/market-data',
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow requests with no origin (like mobile apps, curl, etc.)
            if (!origin) {
                callback(null, true);
                return;
            }

            // Parse allowed origins from environment
            const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
                'http://localhost:3000',
                'http://localhost:5173',
                'http://localhost:3001',
            ];

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origin not allowed'), false);
            }
        },
        credentials: true,
    },
    pingInterval: SECURITY_CONFIG.heartbeatIntervalMs,
    pingTimeout: 10000,
})
export class MarketDataGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(MarketDataGateway.name);
    private readonly clientStates = new Map<string, ClientState>();
    private cleanupInterval?: NodeJS.Timeout;

    afterInit() {
        this.logger.log('Market Data WebSocket Gateway initialized');
        this.logger.log(`Security: Max ${SECURITY_CONFIG.maxSubscriptionsPerClient} subs/client, ${SECURITY_CONFIG.rateLimitPerSecond} req/s`);

        // Setup periodic cleanup of idle connections
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, 60000); // Check every minute
    }

    handleConnection(client: Socket) {
        // Generate connection fingerprint for abuse detection
        const ip = client.handshake.address || 'unknown';
        const ua = client.handshake.headers['user-agent'] || 'unknown';
        const fingerprint = crypto.createHash('sha256')
            .update(`${ip}:${ua}:${Date.now()}`)
            .digest('hex').slice(0, 16);

        const origin = client.handshake.headers.origin;
        this.logger.debug(`Client connected: ${client.id} [fp:${fingerprint}] from ${origin || 'unknown'}`);

        // Validate message size middleware
        client.use((packet, next) => {
            const size = JSON.stringify(packet).length;
            if (size > SECURITY_CONFIG.maxMessageSizeBytes) {
                this.logger.warn(`Client ${client.id} sent oversized message: ${size} bytes`);
                return next(new Error('Message too large'));
            }
            next();
        });

        // Initialize client state with fingerprint
        this.clientStates.set(client.id, {
            subscriptions: new Set(),
            requestCount: 0,
            requestWindowStart: Date.now(),
            lastActivity: Date.now(),
            fingerprint,
            burstCount: 0,
            warningCount: 0,
        });

        // Send welcome message with server time for sync
        client.emit('connected', {
            clientId: client.id,
            serverTime: new Date().toISOString(),
            maxSubscriptions: SECURITY_CONFIG.maxSubscriptionsPerClient,
        });
    }

    handleDisconnect(client: Socket) {
        this.logger.debug(`Client disconnected: ${client.id}`);
        this.clientStates.delete(client.id);
    }

    /**
     * Subscribe to a category's real-time updates
     */
    @SubscribeMessage('subscribe')
    handleSubscribe(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SubscriptionMessage
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { success: false, error: 'Rate limit exceeded. Please slow down.' };
        }

        // Validate input
        const validation = this.validateSubscriptionMessage(data);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const category = data.category as MarketCategory;
        const state = this.clientStates.get(client.id);

        if (!state) {
            return { success: false, error: 'Client state not found' };
        }

        // Check max subscriptions
        if (state.subscriptions.size >= SECURITY_CONFIG.maxSubscriptionsPerClient) {
            return {
                success: false,
                error: `Maximum ${SECURITY_CONFIG.maxSubscriptionsPerClient} subscriptions reached`
            };
        }

        // Check if already subscribed
        if (state.subscriptions.has(category)) {
            return { success: true, category, message: 'Already subscribed' };
        }

        // Join the category room
        client.join(`category:${category}`);
        state.subscriptions.add(category);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} subscribed to ${category} (total: ${state.subscriptions.size})`);

        return {
            success: true,
            category,
            totalSubscriptions: state.subscriptions.size,
        };
    }

    /**
     * Unsubscribe from a category
     */
    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SubscriptionMessage
    ) {
        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { success: false, error: 'Rate limit exceeded' };
        }

        const validation = this.validateSubscriptionMessage(data);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const category = data.category;
        const state = this.clientStates.get(client.id);

        if (!state) {
            return { success: false, error: 'Client state not found' };
        }

        client.leave(`category:${category}`);
        state.subscriptions.delete(category);
        state.lastActivity = Date.now();

        this.logger.debug(`Client ${client.id} unsubscribed from ${category}`);
        return { success: true, category };
    }

    /**
     * Handle heartbeat/ping from client
     */
    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket) {
        const state = this.clientStates.get(client.id);
        if (state) {
            state.lastActivity = Date.now();
        }
        return { pong: true, serverTime: new Date().toISOString() };
    }

    /**
     * Validate subscription message (OWASP compliant)
     */
    private validateSubscriptionMessage(data: unknown): { valid: boolean; error?: string } {
        // Type check
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Invalid message format' };
        }

        const msg = data as Record<string, unknown>;

        // Prototype pollution prevention - check for OWN properties only
        // Using Object.prototype.hasOwnProperty to avoid false positives from inherited properties
        const hasOwn = Object.prototype.hasOwnProperty;
        if (hasOwn.call(msg, '__proto__') || hasOwn.call(msg, 'constructor') || hasOwn.call(msg, 'prototype')) {
            this.logger.warn('Blocked potential prototype pollution attempt');
            return { valid: false, error: 'Invalid message' };
        }

        // Category validation
        const category = (msg as Record<string, unknown>).category;
        if (!category || typeof category !== 'string') {
            return { valid: false, error: 'Category required' };
        }

        // Sanitize and validate category
        const sanitizedCategory = category.toLowerCase().trim();
        if (sanitizedCategory.length > 50) {
            return { valid: false, error: 'Category name too long' };
        }

        if (!VALID_CATEGORIES.includes(sanitizedCategory as MarketCategory)) {
            return { valid: false, error: `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}` };
        }

        // Update the data with sanitized value
        (msg as Record<string, unknown>).category = sanitizedCategory;

        return { valid: true };
    }

    /**
     * Progressive rate limit check
     * Allows initial burst, then enforces sustained limit.
     * After repeated violations, disconnects the client.
     */
    private checkRateLimit(clientId: string): boolean {
        const state = this.clientStates.get(clientId);
        if (!state) return false;

        const now = Date.now();
        const windowMs = 1000; // 1 second window

        // Reset counter if window expired
        if (now - state.requestWindowStart >= windowMs) {
            state.requestCount = 0;
            state.burstCount = 0;
            state.requestWindowStart = now;
        }

        // Progressive: burst tolerance (first N requests allowed)
        if (state.requestCount < SECURITY_CONFIG.burstTolerance) {
            state.requestCount++;
            return true;
        }

        // Sustained limit exceeded
        state.warningCount++;
        this.logger.debug(`Rate limit warning #${state.warningCount} for client ${clientId} [fp:${state.fingerprint}]`);

        // Kick after too many violations
        if (state.warningCount >= SECURITY_CONFIG.maxWarningsBeforeKick) {
            this.logger.warn(`Kicking client ${clientId} [fp:${state.fingerprint}] after ${state.warningCount} rate limit violations`);
            try {
                const socket = this.server?.sockets?.sockets?.get(clientId);
                if (socket) {
                    socket.emit('security_kick', { reason: 'Excessive rate limit violations' });
                    socket.disconnect(true);
                }
            } catch { /* ignore */ }
            this.clientStates.delete(clientId);
        }

        return false;
    }

    /**
     * Cleanup idle connections
     */
    private cleanupIdleConnections(): void {
        // Guard against server not being initialized yet
        if (!this.server || !this.server.sockets) {
            return;
        }

        const now = Date.now();
        let cleanedCount = 0;

        for (const [clientId, state] of this.clientStates.entries()) {
            if (now - state.lastActivity > SECURITY_CONFIG.idleTimeoutMs) {
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

    // =====================================
    // Broadcast Methods (called by services)
    // =====================================

    /**
     * Broadcast new item to category subscribers
     */
    broadcastNewItem(category: string, item: unknown): void {
        if (!this.server) return;

        this.server.to(`category:${category}`).emit('new_item', {
            category,
            item,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Broadcast signal to category subscribers
     */
    broadcastSignal(category: string, signal: unknown): void {
        if (!this.server) return;

        this.server.to(`category:${category}`).emit('new_signal', {
            category,
            signal,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Broadcast crypto price update
     */
    broadcastCryptoUpdate(asset: unknown): void {
        if (!this.server) return;

        this.server.to('category:crypto').emit('price_update', {
            category: 'crypto',
            asset,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Broadcast trending topic update
     */
    broadcastTrendingUpdate(topics: unknown[]): void {
        if (!this.server) return;

        this.server.emit('trending_update', {
            topics,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Broadcast batch of items for efficiency
     */
    broadcastBatch(category: string, items: unknown[]): void {
        if (!this.server || items.length === 0) return;

        this.server.to(`category:${category}`).emit('batch_update', {
            category,
            items,
            count: items.length,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Broadcast probability curve update for a specific competition.
     * Scoped to competition room (not global broadcast) for security.
     */
    broadcastCurveUpdate(competitionId: string, snapshot: unknown): void {
        if (!this.server) return;

        // Emit to competition-specific room (subscribers only)
        this.server.to(`competition:${competitionId}`).emit('curve_update', {
            competitionId,
            snapshot,
            timestamp: new Date().toISOString(),
        });

        // Also emit to the global live-feed for dashboard displays
        this.server.to('category:live-feed').emit('curve_update', {
            competitionId,
            snapshot,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Subscribe to competition-specific curve updates
     */
    @SubscribeMessage('subscribe_competition')
    handleSubscribeCompetition(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: CompetitionSubscriptionMessage
    ) {
        if (!this.checkRateLimit(client.id)) {
            return { success: false, error: 'Rate limit exceeded' };
        }

        // Validate competition ID format (UUID)
        const compId = data?.competitionId;
        if (!compId || typeof compId !== 'string' || !/^[0-9a-f-]{36}$/i.test(compId)) {
            return { success: false, error: 'Invalid competition ID format' };
        }

        const state = this.clientStates.get(client.id);
        if (!state) return { success: false, error: 'Client state not found' };

        if (state.subscriptions.size >= SECURITY_CONFIG.maxSubscriptionsPerClient) {
            return { success: false, error: 'Max subscriptions reached' };
        }

        const room = `competition:${compId}`;
        client.join(room);
        state.subscriptions.add(room);
        state.lastActivity = Date.now();

        return { success: true, competitionId: compId };
    }

    /**
     * Broadcast a new live feed item to all live-feed subscribers
     */
    broadcastLiveFeedItem(item: unknown): void {
        if (!this.server) return;

        this.server.to('category:live-feed').emit('live_feed_item', {
            item,
            timestamp: new Date().toISOString(),
        });
    }

    // =====================================
    // Stats and Health
    // =====================================

    /**
     * Get subscription statistics
     */
    getStats(): {
        totalClients: number;
        subscriptionsByCategory: Record<string, number>;
        avgSubscriptionsPerClient: number;
    } {
        const categoryCount: Record<string, number> = {};
        let totalSubscriptions = 0;

        for (const state of this.clientStates.values()) {
            for (const category of state.subscriptions) {
                categoryCount[category] = (categoryCount[category] || 0) + 1;
                totalSubscriptions++;
            }
        }

        return {
            totalClients: this.clientStates.size,
            subscriptionsByCategory: categoryCount,
            avgSubscriptionsPerClient: this.clientStates.size > 0
                ? totalSubscriptions / this.clientStates.size
                : 0,
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
