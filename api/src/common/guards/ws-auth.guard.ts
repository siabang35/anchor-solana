/**
 * WebSocket Authentication Guard
 * 
 * Provides JWT-based authentication for WebSocket gateways.
 * Validates tokens from query params or Authorization header.
 * 
 * OWASP A07:2021 - Identification and Authentication Failures
 */

import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

export interface WsUser {
    id: string;
    email?: string;
    walletAddress?: string;
    isAdmin?: boolean;
}

@Injectable()
export class WsAuthGuard implements CanActivate {
    private readonly logger = new Logger(WsAuthGuard.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const client: Socket = context.switchToWs().getClient();
        const token = this.extractToken(client);

        if (!token) {
            this.logger.warn(`WS connection rejected: no token from ${this.getClientIp(client)}`);
            throw new WsException('Authentication required');
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get('JWT_SECRET'),
            });

            // Attach user to socket data
            client.data.user = {
                id: payload.sub,
                email: payload.email,
                walletAddress: payload.walletAddress,
                isAdmin: payload.isAdmin || false,
            } as WsUser;

            return true;
        } catch (error) {
            this.logger.warn(`WS auth failed from ${this.getClientIp(client)}: ${(error as Error).message}`);
            throw new WsException('Invalid or expired token');
        }
    }

    /**
     * Extract token from query params or Authorization header
     */
    private extractToken(client: Socket): string | null {
        // Try query parameter first (common for WebSocket)
        const queryToken = client.handshake.query.token;
        if (queryToken && typeof queryToken === 'string') {
            return queryToken;
        }

        // Try Authorization header
        const authHeader = client.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Try auth object (Socket.IO v4+)
        const authToken = (client.handshake as any).auth?.token;
        if (authToken && typeof authToken === 'string') {
            return authToken;
        }

        return null;
    }

    /**
     * Get client IP for logging
     */
    private getClientIp(client: Socket): string {
        const forwarded = client.handshake.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
            return ips.trim();
        }
        return client.handshake.address || 'unknown';
    }
}

/**
 * Admin-only WebSocket Guard
 * Extends WsAuthGuard to also verify admin role
 */
@Injectable()
export class WsAdminGuard extends WsAuthGuard {
    private readonly adminLogger = new Logger(WsAdminGuard.name);

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // First, verify authentication
        const isAuthenticated = await super.canActivate(context);
        if (!isAuthenticated) {
            return false;
        }

        // Then verify admin role
        const client: Socket = context.switchToWs().getClient();
        const user = client.data.user as WsUser;

        if (!user?.isAdmin) {
            this.adminLogger.warn(`Admin access denied for user ${user?.id}`);
            throw new WsException('Admin access required');
        }

        return true;
    }
}
