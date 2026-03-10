/**
 * Market Messaging Service
 * 
 * Bridges RabbitMQ messages to WebSocket for real-time market data streaming.
 * Implements OWASP security standards, rate limiting, and message batching.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataGateway } from './market-data.gateway.js';
import { ProbabilityEngineService } from './probability-engine.service.js';

// Define explicit categories to match frontend tabsfor streaming
const MARKET_CATEGORIES = ['crypto', 'tech', 'politics', 'finance', 'science', 'economy', 'signals', 'latest'] as const;
type MarketCategory = typeof MARKET_CATEGORIES[number];

// Message types
interface MarketMessage {
    category: MarketCategory;
    type: 'new_item' | 'update' | 'signal' | 'price_update';
    data: unknown;
    timestamp: string;
    source?: string;
}

// Rate limiting configuration
interface RateLimitConfig {
    maxMessagesPerSecond: number;
    batchIntervalMs: number;
    maxBatchSize: number;
}

@Injectable()
export class MarketMessagingService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MarketMessagingService.name);
    private isEnabled: boolean = false;
    private rabbitMQUrl?: string;
    private connection: any = null;
    private channel: any = null;
    private isConnecting: boolean = false;
    private reconnectTimeout?: NodeJS.Timeout;

    // Message batching for anti-throttling
    private messageBatches: Map<MarketCategory, MarketMessage[]> = new Map();
    private batchTimers: Map<MarketCategory, NodeJS.Timeout> = new Map();

    // Rate limiting
    private readonly rateLimitConfig: RateLimitConfig = {
        maxMessagesPerSecond: 50,
        batchIntervalMs: 100, // Batch messages every 100ms
        maxBatchSize: 20,
    };

    // Message counters for rate limiting
    private messageCounters: Map<MarketCategory, { count: number; resetTime: number }> = new Map();

    constructor(
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => MarketDataGateway))
        private readonly marketDataGateway: MarketDataGateway,
        @Inject(forwardRef(() => ProbabilityEngineService))
        private readonly probabilityEngine: ProbabilityEngineService,
    ) {
        // Initialize batches and counters for each category
        for (const category of MARKET_CATEGORIES) {
            this.messageBatches.set(category, []);
            this.messageCounters.set(category, { count: 0, resetTime: Date.now() + 1000 });
        }

        // Check if messaging is enabled
        this.rabbitMQUrl = this.configService.get<string>('RABBITMQ_URL');
        this.isEnabled = this.configService.get<string>('MARKET_MESSAGING_ENABLED') === 'true';

        // Load rate limit config from environment
        const maxMsgPerSec = this.configService.get<number>('WS_RATE_LIMIT');
        const batchInterval = this.configService.get<number>('WS_BATCH_INTERVAL');
        if (maxMsgPerSec) this.rateLimitConfig.maxMessagesPerSecond = maxMsgPerSec;
        if (batchInterval) this.rateLimitConfig.batchIntervalMs = batchInterval;
    }

    async onModuleInit() {
        this.logger.log(`MarketMessaging: enabled=${this.isEnabled}, hasUrl=${!!this.rabbitMQUrl}`);

        if (!this.isEnabled) {
            this.logger.debug('Market messaging disabled (MARKET_MESSAGING_ENABLED != true)');
            return;
        }

        if (!this.rabbitMQUrl) {
            this.logger.debug('RABBITMQ_URL not configured. Market messaging will not start.');
            return;
        }

        // Log the masked URL for debugging
        const maskedUrl = this.rabbitMQUrl.replace(/:[^:@]+@/, ':****@');
        this.logger.log(`Connecting to RabbitMQ: ${maskedUrl}`);

        // Connect with timeout - wait up to 15 seconds for initial connection
        try {
            await Promise.race([
                this.connect(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
                )
            ]);
            this.logger.log('✅ RabbitMQ connection established successfully');
        } catch (err) {
            this.logger.warn(`❌ Initial RabbitMQ connection failed: ${(err as Error).message}`);
            // Schedule background reconnect
            this.scheduleReconnect();
        }
    }

    async onModuleDestroy() {
        this.logger.log('Market Messaging Service shutting down...');

        // Clear all timers
        for (const timer of this.batchTimers.values()) {
            clearTimeout(timer);
        }
        this.batchTimers.clear();

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        await this.disconnect();
    }

    /**
     * Connect to RabbitMQ
     */
    private async connect(): Promise<void> {
        if (this.isConnecting || this.connection) {
            return;
        }

        this.isConnecting = true;

        try {
            // Dynamic import of amqplib to avoid issues if not installed
            const amqp = await import('amqplib');

            this.connection = await amqp.connect(this.rabbitMQUrl!);
            this.logger.log('Connected to RabbitMQ');

            this.connection.on('error', (error: Error) => {
                this.logger.error(`RabbitMQ connection error: ${error.message}`);
            });

            this.connection.on('close', () => {
                this.logger.warn('RabbitMQ connection closed');
                this.connection = null;
                this.channel = null;
                this.scheduleReconnect();
            });

            // Create channel
            this.channel = await this.connection.createChannel();
            await this.channel.prefetch(10);
            this.logger.log('RabbitMQ channel created');

            // Setup queues and start consuming
            await this.setupQueues();
            await this.startConsuming();

        } catch (error) {
            this.logger.error(`Failed to connect to RabbitMQ: ${(error as Error).message}`);
            this.connection = null;
            this.scheduleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            return;
        }

        const delay = 5000; // 5 seconds
        this.logger.log(`Scheduling RabbitMQ reconnection in ${delay}ms`);

        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = undefined;
            await this.connect();
        }, delay);
    }

    /**
     * Disconnect from RabbitMQ
     */
    private async disconnect(): Promise<void> {
        if (this.channel) {
            try {
                await this.channel.close();
            } catch (error) {
                this.logger.error(`Error closing channel: ${(error as Error).message}`);
            }
            this.channel = null;
        }

        if (this.connection) {
            try {
                await this.connection.close();
            } catch (error) {
                this.logger.error(`Error closing connection: ${(error as Error).message}`);
            }
            this.connection = null;
        }
    }

    /**
     * Setup queues for each market category
     */
    private async setupQueues(): Promise<void> {
        if (!this.channel) return;

        // Declare exchange for market data
        await this.channel.assertExchange('market.data', 'topic', { durable: true });

        // Declare queues for each category
        for (const category of MARKET_CATEGORIES) {
            const queueName = `market.${category}.stream`;
            await this.channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                    'x-message-ttl': 60000, // Messages expire after 60 seconds
                    'x-max-length': 1000, // Max 1000 messages in queue
                },
            });

            // Bind queue to exchange
            const routingKey = category === 'latest' ? 'market.#' : `market.${category}.#`;
            await this.channel.bindQueue(queueName, 'market.data', routingKey);
            this.logger.debug(`Queue setup: ${queueName} (key: ${routingKey})`);
        }

        this.logger.log('All market queues configured');
    }

    /**
     * Start consuming messages from all queues
     */
    private async startConsuming(): Promise<void> {
        if (!this.channel) return;

        for (const category of MARKET_CATEGORIES) {
            const queueName = `market.${category}.stream`;

            await this.channel.consume(queueName, async (msg: any) => {
                if (msg) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        await this.handleMessage(category, content);
                        this.channel.ack(msg);
                    } catch (error) {
                        this.logger.error(`Failed to process message: ${(error as Error).message}`);
                        this.channel.nack(msg, false, false); // Don't requeue bad messages
                    }
                }
            });

            this.logger.debug(`Started consuming from ${queueName}`);
        }

        this.logger.log('All consumers started');
    }

    /**
     * Handle incoming message with rate limiting and batching
     */
    private async handleMessage(category: MarketCategory, content: unknown): Promise<void> {
        // Validate message
        if (!this.validateMessage(content)) {
            this.logger.warn(`Invalid message received for ${category}`);
            return;
        }

        // Check rate limit
        if (!this.checkRateLimit(category)) {
            this.logger.debug(`Rate limit exceeded for ${category}, dropping message`);
            return;
        }

        // Create market message
        const messageType = this.determineMessageType(content);
        const data = this.sanitizeData(content);
        
        const message: MarketMessage = {
            category,
            type: messageType,
            data,
            timestamp: new Date().toISOString(),
            source: 'rabbitmq',
        };

        // If this is a new signal/news item, trigger Probability Engine
        // (Assuming data has id/marketId and a title/description for the signal)
        if (messageType === 'signal' || messageType === 'new_item') {
            const dataObj = data as Record<string, any>;
            const signalText = dataObj.title || dataObj.description;
            const marketId = dataObj.marketId || dataObj.id; // Usually mapped by ETL
            
            if (signalText && marketId) {
                 this.logger.debug(`Triggering Bayesian probability update for market ${marketId} in ${category}`);
                 // Run asynchronously so it doesn't block the queue
                 this.probabilityEngine.processRealtimeSignal(marketId, signalText).catch(err => {
                     this.logger.error(`Failed to process realtime signal through ProbabilityEngine: ${err.message}`);
                 });
            }
        }

        // Add to batch
        this.addToBatch(category, message);
    }

    /**
     * Validate incoming message (OWASP compliant)
     */
    private validateMessage(content: unknown): boolean {
        if (!content || typeof content !== 'object') {
            return false;
        }

        // Check for required fields
        const msg = content as Record<string, unknown>;

        // Prevent prototype pollution - check for OWN properties only
        const hasOwn = Object.prototype.hasOwnProperty;
        if (hasOwn.call(msg, '__proto__') || hasOwn.call(msg, 'constructor') || hasOwn.call(msg, 'prototype')) {
            this.logger.warn('Potential prototype pollution attempt blocked');
            return false;
        }

        return true;
    }

    /**
     * Sanitize data to prevent XSS and injection attacks
     */
    private sanitizeData(content: unknown): unknown {
        if (typeof content === 'string') {
            // Escape HTML entities
            return content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }

        if (Array.isArray(content)) {
            return content.map(item => this.sanitizeData(item));
        }

        if (content && typeof content === 'object') {
            const sanitized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
                // Sanitize keys as well
                const safeKey = key.replace(/[<>'"&]/g, '');
                sanitized[safeKey] = this.sanitizeData(value);
            }
            return sanitized;
        }

        return content;
    }

    /**
     * Determine message type from content
     */
    private determineMessageType(content: unknown): MarketMessage['type'] {
        const msg = content as Record<string, unknown>;

        if (msg.type === 'signal') return 'signal';
        if (msg.price !== undefined) return 'price_update';
        if (msg.id && msg.updatedAt) return 'update';
        return 'new_item';
    }

    /**
     * Check rate limit for category
     */
    private checkRateLimit(category: MarketCategory): boolean {
        const counter = this.messageCounters.get(category)!;
        const now = Date.now();

        // Reset counter if window expired
        if (now >= counter.resetTime) {
            counter.count = 0;
            counter.resetTime = now + 1000;
        }

        // Check if within limit
        if (counter.count >= this.rateLimitConfig.maxMessagesPerSecond) {
            return false;
        }

        counter.count++;
        return true;
    }

    /**
     * Add message to batch for efficient broadcasting
     */
    private addToBatch(category: MarketCategory, message: MarketMessage): void {
        const batch = this.messageBatches.get(category)!;
        batch.push(message);

        // If batch is full, flush immediately
        if (batch.length >= this.rateLimitConfig.maxBatchSize) {
            this.flushBatch(category);
            return;
        }

        // Start batch timer if not already running
        if (!this.batchTimers.has(category)) {
            const timer = setTimeout(() => {
                this.flushBatch(category);
            }, this.rateLimitConfig.batchIntervalMs);
            this.batchTimers.set(category, timer);
        }
    }

    /**
     * Flush batch to WebSocket clients
     */
    private flushBatch(category: MarketCategory): void {
        const timer = this.batchTimers.get(category);
        if (timer) {
            clearTimeout(timer);
            this.batchTimers.delete(category);
        }

        const batch = this.messageBatches.get(category)!;
        if (batch.length === 0) return;

        // Get messages and clear batch
        const messages = [...batch];
        batch.length = 0;

        // Broadcast based on message type
        for (const msg of messages) {
            switch (msg.type) {
                case 'new_item':
                    this.marketDataGateway.broadcastNewItem(category, msg.data);
                    break;
                case 'signal':
                    this.marketDataGateway.broadcastSignal(category, msg.data);
                    break;
                case 'price_update':
                    if (category === 'crypto') {
                        this.marketDataGateway.broadcastCryptoUpdate(msg.data);
                    }
                    break;
                default:
                    this.marketDataGateway.broadcastNewItem(category, msg.data);
            }
        }

        this.logger.debug(`Flushed ${messages.length} messages for ${category}`);
    }

    /**
     * Publish a message to RabbitMQ (for use by ETL orchestrators)
     */
    async publishMessage(category: MarketCategory, data: unknown, type: string = 'new_item'): Promise<boolean> {
        if (!this.channel) {
            // Use debug level to avoid spamming logs when RabbitMQ is not connected
            this.logger.debug('Cannot publish: not connected to RabbitMQ');
            return false;
        }

        try {
            const message = {
                type,
                data,
                timestamp: new Date().toISOString(),
            };

            const routingKey = `market.${category}.${type}`;

            this.channel.publish(
                'market.data',
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );

            return true;
        } catch (error) {
            this.logger.error(`Failed to publish message: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus(): { connected: boolean; enabled: boolean; queues: string[] } {
        return {
            connected: this.connection !== null && this.channel !== null,
            enabled: this.isEnabled,
            queues: MARKET_CATEGORIES.map(c => `market.${c}.stream`),
        };
    }
}
