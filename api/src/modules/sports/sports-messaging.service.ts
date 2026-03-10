/**
 * Sports Messaging Service
 * 
 * Handles real-time updates for sports data.
 * Uses internal EventEmitter for local messaging and optional RabbitMQ for distributed messaging.
 * 
 * This service is designed to work independently without external messaging packages.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SportsEvent, SportsMarket, EventStatus, SportType } from './types/sports.types.js';
import { EventEmitter } from 'events';

// Message types for sports domain
export interface SportsEventMessage {
    eventId: string;
    externalId: string;
    sport: SportType;
    status: EventStatus;
    homeScore?: number;
    awayScore?: number;
    homeTeam?: string;
    awayTeam?: string;
    startTime: string;
    updatedAt: string;
}

export interface SportsMarketMessage {
    marketId: string;
    eventId: string;
    title: string;
    question: string;
    outcomes: string[];
    outcomePrices: number[];
    yesPrice: number;
    noPrice: number;
    volume: number;
    resolved: boolean;
    outcome?: boolean;
    updatedAt: string;
}

export interface SportsResolutionMessage {
    marketId: string;
    eventId: string;
    outcome: boolean;
    resolutionSource: string;
    resolutionProof?: string;
    resolvedAt: string;
}

export interface SportsSyncMessage {
    syncType: 'leagues' | 'events' | 'live' | 'full';
    sport?: SportType;
    recordsFetched: number;
    recordsCreated: number;
    recordsUpdated: number;
    durationMs: number;
    completedAt: string;
}

/**
 * Routing keys for sports messages
 */
export const SPORTS_ROUTING_KEYS = {
    EVENT_CREATED: 'sports.event.created',
    EVENT_UPDATED: 'sports.event.updated',
    EVENT_LIVE: 'sports.event.live',
    EVENT_FINISHED: 'sports.event.finished',
    MARKET_CREATED: 'sports.market.created',
    MARKET_UPDATED: 'sports.market.updated',
    MARKET_RESOLVED: 'sports.market.resolved',
    ODDS_UPDATED: 'sports.odds.updated',
    SYNC_COMPLETED: 'sports.sync.completed',
} as const;

@Injectable()
export class SportsMessagingService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SportsMessagingService.name);
    private readonly eventEmitter = new EventEmitter();
    private isEnabled: boolean = false;
    private readonly exchange: string = 'exoduze.sports';

    // Message handlers registry
    private readonly handlers: Map<string, Array<(message: unknown) => Promise<void>>> = new Map();

    constructor(private readonly configService: ConfigService) {
        // Set max listeners to prevent memory leak warnings
        this.eventEmitter.setMaxListeners(50);
    }

    async onModuleInit(): Promise<void> {
        const enableMessaging = this.configService.get('SPORTS_ENABLE_MESSAGING', 'false');

        if (enableMessaging === 'true') {
            this.isEnabled = true;
            this.logger.log('Sports messaging enabled (local EventEmitter mode)');
        } else {
            this.logger.log('Sports messaging disabled. Set SPORTS_ENABLE_MESSAGING=true to enable.');
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.eventEmitter.removeAllListeners();
        this.handlers.clear();
        this.logger.log('Sports messaging service destroyed');
    }

    // ========================
    // Publishers
    // ========================

    /**
     * Publish event update (live scores, status changes)
     */
    async publishEventUpdate(event: SportsEvent): Promise<void> {
        const message: SportsEventMessage = {
            eventId: event.id,
            externalId: event.externalId,
            sport: event.sport,
            status: event.status,
            homeScore: event.homeScore,
            awayScore: event.awayScore,
            homeTeam: event.metadata?.homeTeamName as string,
            awayTeam: event.metadata?.awayTeamName as string,
            startTime: event.startTime.toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const routingKey = this.getEventRoutingKey(event.status);
        await this.publish(routingKey, message);

        this.logger.debug(`Published event update: ${event.id} (${event.status})`);
    }

    /**
     * Publish market creation
     */
    async publishMarketCreated(market: SportsMarket): Promise<void> {
        const message: SportsMarketMessage = {
            marketId: market.id,
            eventId: market.eventId,
            title: market.title,
            question: market.question,
            outcomes: market.outcomes,
            outcomePrices: market.outcomePrices,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            volume: market.volume,
            resolved: market.resolved,
            updatedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.MARKET_CREATED, message);
        this.logger.debug(`Published market created: ${market.id}`);
    }

    /**
     * Publish market resolution
     */
    async publishMarketResolved(
        market: SportsMarket,
        outcome: boolean,
        resolutionSource: string,
        proof?: string
    ): Promise<void> {
        const message: SportsResolutionMessage = {
            marketId: market.id,
            eventId: market.eventId,
            outcome,
            resolutionSource,
            resolutionProof: proof,
            resolvedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.MARKET_RESOLVED, message);
        this.logger.log(`Published market resolved: ${market.id} → ${outcome}`);
    }

    /**
     * Publish odds/prices update
     */
    async publishOddsUpdated(market: SportsMarket): Promise<void> {
        const message: SportsMarketMessage = {
            marketId: market.id,
            eventId: market.eventId,
            title: market.title,
            question: market.question,
            outcomes: market.outcomes,
            outcomePrices: market.outcomePrices,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            volume: market.volume,
            resolved: market.resolved,
            updatedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.ODDS_UPDATED, message);
        this.logger.debug(`Published odds update: ${market.id}`);
    }

    /**
     * Publish sync completion notification
     */
    async publishSyncCompleted(
        syncType: 'leagues' | 'events' | 'live' | 'full',
        result: {
            sport?: SportType;
            recordsFetched: number;
            recordsCreated: number;
            recordsUpdated: number;
            durationMs: number;
        }
    ): Promise<void> {
        const message: SportsSyncMessage = {
            syncType,
            sport: result.sport,
            recordsFetched: result.recordsFetched,
            recordsCreated: result.recordsCreated,
            recordsUpdated: result.recordsUpdated,
            durationMs: result.durationMs,
            completedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.SYNC_COMPLETED, message);
        this.logger.log(`Published sync completed: ${syncType}`);
    }

    /**
     * Publish sync complete (from ETL orchestrator)
     */
    async publishSyncComplete(result: {
        syncType: string;
        totalFetched: number;
        sportsProcessed: number;
        durationMs: number;
    }): Promise<void> {
        const message = {
            ...result,
            completedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.SYNC_COMPLETED, message);
        this.logger.log(`Published ETL sync complete: ${result.syncType} (${result.totalFetched} fetched)`);
    }

    /**
     * Publish live score update
     */
    async publishLiveScoreUpdate(event: SportsEvent): Promise<void> {
        const message: SportsEventMessage = {
            eventId: event.id,
            externalId: event.externalId,
            sport: event.sport,
            status: event.status,
            homeScore: event.homeScore,
            awayScore: event.awayScore,
            homeTeam: event.metadata?.homeTeamName as string,
            awayTeam: event.metadata?.awayTeamName as string,
            startTime: event.startTime.toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await this.publish(SPORTS_ROUTING_KEYS.EVENT_LIVE, message);
        this.logger.debug(`Published live score: ${event.id} (${event.homeScore}-${event.awayScore})`);
    }

    // ========================
    // Consumers
    // ========================

    /**
     * Register a handler for a specific message type
     */
    registerHandler<T>(routingKey: string, handler: (message: T) => Promise<void>): void {
        const handlers = this.handlers.get(routingKey) || [];
        handlers.push(handler as (message: unknown) => Promise<void>);
        this.handlers.set(routingKey, handlers);
        this.logger.log(`Registered handler for: ${routingKey}`);
    }

    /**
     * Process incoming message
     */
    private async processMessage(routingKey: string, message: unknown): Promise<void> {
        const handlers = this.handlers.get(routingKey) || [];

        for (const handler of handlers) {
            try {
                await handler(message);
            } catch (error) {
                this.logger.error(`Handler error for ${routingKey}:`, error);
            }
        }
    }

    // ========================
    // Utility Methods
    // ========================

    /**
     * Get routing key based on event status
     */
    private getEventRoutingKey(status: EventStatus): string {
        switch (status) {
            case EventStatus.LIVE:
            case EventStatus.HALFTIME:
                return SPORTS_ROUTING_KEYS.EVENT_LIVE;
            case EventStatus.FINISHED:
                return SPORTS_ROUTING_KEYS.EVENT_FINISHED;
            default:
                return SPORTS_ROUTING_KEYS.EVENT_UPDATED;
        }
    }

    /**
     * Publish message via EventEmitter (internal messaging)
     */
    private async publish(routingKey: string, message: unknown): Promise<void> {
        if (!this.isEnabled) {
            // Messaging disabled, just log
            this.logger.debug(`[${routingKey}] Messaging disabled, skipping publish`);
            return;
        }

        try {
            // Emit event locally for WebSocket Gateway and other listeners
            this.eventEmitter.emit(routingKey, message);

            // Also process through registered handlers
            await this.processMessage(routingKey, message);

            this.logger.debug(`[${routingKey}] Published via EventEmitter`);
        } catch (error) {
            this.logger.error(`Failed to publish message (${routingKey}):`, error);
        }
    }

    /**
     * Subscribe to messages for a specific routing key
     */
    subscribe(routingKey: string, callback: (message: unknown) => void): void {
        this.eventEmitter.on(routingKey, callback);
        this.logger.debug(`Subscribed to ${routingKey}`);
    }

    /**
     * Unsubscribe from messages
     */
    unsubscribe(routingKey: string, callback: (message: unknown) => void): void {
        this.eventEmitter.off(routingKey, callback);
    }

    /**
     * Check if messaging is enabled
     */
    isHealthy(): boolean {
        return this.isEnabled;
    }

    /**
     * Get messaging status
     */
    getStatus(): {
        enabled: boolean;
        exchange: string;
        handlersCount: number;
    } {
        return {
            enabled: this.isEnabled,
            exchange: this.exchange,
            handlersCount: this.handlers.size,
        };
    }
}

