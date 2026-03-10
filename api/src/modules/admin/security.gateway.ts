/**
 * Security Gateway
 * 
 * WebSocket gateway for real-time security monitoring dashboard.
 * 
 * SECURITY FEATURES:
 * - Requires JWT authentication
 * - Admin role verification
 * - CORS origin validation
 * - Rate limiting
 * - Audit logging
 * 
 * OWASP A01:2021 - Broken Access Control
 */

import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// Security configuration
const SECURITY_CONFIG = {
    maxConnectionsPerIp: 5,
    rateLimitPerSecond: 20,
    idleTimeoutMs: 600000, // 10 minutes for admin dashboard
};

interface AdminUser {
    id: string;
    email: string;
    isAdmin: boolean;
}

interface ClientState {
    user: AdminUser;
    connectedAt: number;
    lastActivity: number;
    requestCount: number;
    requestWindowStart: number;
}

@WebSocketGateway({
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || [
                'http://localhost:3000',
                'http://localhost:5173',
            ];

            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else {
                callback(new Error('Origin not allowed'), false);
            }
        },
        credentials: true,
    },
    namespace: 'security',
    pingInterval: 30000,
    pingTimeout: 10000,
})
export class SecurityGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SecurityGateway.name);
    private readonly clientStates = new Map<string, ClientState>();
    private readonly ipConnections = new Map<string, number>();
    private cleanupInterval?: NodeJS.Timeout;
    private activeConnections = 0;

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {
        // Setup idle connection cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, 60000);
    }

    async handleConnection(client: Socket) {
        const clientIp = this.getClientIp(client);

        try {
            // Rate limit connections per IP
            const currentConnections = this.ipConnections.get(clientIp) || 0;
            if (currentConnections >= SECURITY_CONFIG.maxConnectionsPerIp) {
                this.logger.warn(`Connection rejected: too many connections from ${clientIp}`);
                client.emit('error', { message: 'Too many connections from your IP' });
                client.disconnect(true);
                return;
            }

            // Extract and validate token
            const token = this.extractToken(client);

            if (!token) {
                this.logger.warn(`Connection rejected: no token from ${clientIp}`);
                client.emit('error', { message: 'Authentication required' });
                client.disconnect(true);
                return;
            }

            // Verify token
            let payload: any;
            try {
                payload = await this.jwtService.verifyAsync(token, {
                    secret: this.configService.get('JWT_SECRET'),
                });
            } catch (err) {
                this.logger.warn(`Connection rejected: invalid token from ${clientIp}`);
                client.emit('error', { message: 'Invalid or expired token' });
                client.disconnect(true);
                return;
            }

            // Verify admin role - CRITICAL SECURITY CHECK
            if (!payload.isAdmin) {
                this.logger.warn(`Connection rejected: non-admin user ${payload.sub} from ${clientIp}`);
                client.emit('error', { message: 'Admin access required' });
                client.disconnect(true);
                return;
            }

            // Store client state
            const user: AdminUser = {
                id: payload.sub,
                email: payload.email,
                isAdmin: true,
            };

            this.clientStates.set(client.id, {
                user,
                connectedAt: Date.now(),
                lastActivity: Date.now(),
                requestCount: 0,
                requestWindowStart: Date.now(),
            });

            // Track IP connections
            this.ipConnections.set(clientIp, currentConnections + 1);

            // Join admin dashboard room
            client.join('admin-dashboard');

            this.activeConnections++;
            this.logger.log(`Admin connected: ${user.email} (${client.id}) from ${clientIp}`);

            // Send welcome and initial status
            client.emit('authenticated', {
                user: { id: user.id, email: user.email },
                serverTime: new Date().toISOString(),
            });

            this.emitSystemStatus();

        } catch (err) {
            this.logger.error(`Connection error: ${(err as Error).message}`);
            client.emit('error', { message: 'Connection failed' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        const state = this.clientStates.get(client.id);

        if (state) {
            const clientIp = this.getClientIp(client);
            const currentConnections = this.ipConnections.get(clientIp) || 1;
            this.ipConnections.set(clientIp, Math.max(0, currentConnections - 1));

            this.logger.log(`Admin disconnected: ${state.user.email} (${client.id})`);
            this.clientStates.delete(client.id);
        }

        this.activeConnections = Math.max(0, this.activeConnections - 1);
    }

    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket) {
        const state = this.clientStates.get(client.id);
        if (state) {
            state.lastActivity = Date.now();
        }
        return { event: 'pong', data: { serverTime: new Date().toISOString() } };
    }

    @SubscribeMessage('request-update')
    handleRequestUpdate(@ConnectedSocket() client: Socket) {
        const state = this.clientStates.get(client.id);
        if (!state) {
            return { event: 'error', data: 'Not authenticated' };
        }

        // Rate limit check
        if (!this.checkRateLimit(client.id)) {
            return { event: 'error', data: 'Rate limit exceeded' };
        }

        state.lastActivity = Date.now();
        this.emitSystemStatus();
        return { event: 'update-sent' };
    }

    /**
     * Extract token from various sources
     */
    private extractToken(client: Socket): string | null {
        // Query parameter
        const queryToken = client.handshake.query.token;
        if (queryToken && typeof queryToken === 'string') {
            return queryToken;
        }

        // Authorization header
        const authHeader = client.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Auth object (Socket.IO v4+)
        const authToken = (client.handshake as any).auth?.token;
        if (authToken && typeof authToken === 'string') {
            return authToken;
        }

        return null;
    }

    /**
     * Get client IP address
     */
    private getClientIp(client: Socket): string {
        const forwarded = client.handshake.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
            return ips.trim();
        }
        return client.handshake.address || 'unknown';
    }

    /**
     * Check rate limit for client
     */
    private checkRateLimit(clientId: string): boolean {
        const state = this.clientStates.get(clientId);
        if (!state) return false;

        const now = Date.now();
        const windowMs = 1000;

        if (now - state.requestWindowStart >= windowMs) {
            state.requestCount = 0;
            state.requestWindowStart = now;
        }

        if (state.requestCount >= SECURITY_CONFIG.rateLimitPerSecond) {
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
            if (now - state.lastActivity > SECURITY_CONFIG.idleTimeoutMs) {
                try {
                    const socket = this.server.sockets.sockets?.get(clientId);
                    if (socket) {
                        socket.emit('idle_timeout', { message: 'Session expired due to inactivity' });
                        socket.disconnect(true);
                    }
                } catch (error) {
                    this.logger.debug(`Error cleaning up socket ${clientId}`);
                }
                this.clientStates.delete(clientId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.log(`Cleaned up ${cleanedCount} idle admin connections`);
        }
    }

    // ========================================================================
    // EMISSION METHODS
    // ========================================================================

    /**
     * Emits traffic stats to admin dashboard
     */
    emitTrafficStats(stats: any) {
        this.server.to('admin-dashboard').emit('traffic_update', stats);
    }

    /**
     * Emits threat alert to admin dashboard
     */
    emitThreatAlert(alert: any) {
        this.server.to('admin-dashboard').emit('threat_detected', {
            ...alert,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Emits system health status
     */
    emitSystemStatus() {
        this.server.to('admin-dashboard').emit('system_status', {
            online: true,
            connections: this.activeConnections,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Get connected admins for monitoring
     */
    getConnectedAdmins(): { id: string; email: string; connectedAt: number }[] {
        return Array.from(this.clientStates.values()).map(state => ({
            id: state.user.id,
            email: state.user.email,
            connectedAt: state.connectedAt,
        }));
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

