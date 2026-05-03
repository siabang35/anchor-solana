# RabbitMQ Integration Guide

> Comprehensive guide for the ExoDuZe messaging infrastructure using RabbitMQ.

## Overview

RabbitMQ provides the backbone for real-time event distribution, decoupled service communication, and reliable message delivery in the ExoDuZe platform.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PUBLISHERS                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ SportsSync  │  │  Markets    │  │   Orders    │                 │
│  │  Service    │  │  Service    │  │   Service   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RABBITMQ BROKER                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     EXCHANGES                                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │exoduze.sports │  │exoduze.domain │  │exoduze.direct │       │   │
│  │  │   (topic)    │  │   (topic)    │  │   (direct)   │       │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │   │
│  └─────────┼─────────────────┼─────────────────┼────────────────┘   │
│            │ sports.*        │ market.*        │                    │
│            ▼                 ▼                 ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      QUEUES                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │sports.events │  │market.events │  │notifications │       │   │
│  │  │    .queue    │  │    .queue    │  │    .queue    │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │  ┌──────────────┐  ┌──────────────┐                         │   │
│  │  │ sports.live  │  │ sports.dlq   │  (Dead Letter)          │   │
│  │  │    .queue    │  │              │                         │   │
│  │  └──────────────┘  └──────────────┘                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CONSUMERS                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Sports    │  │ Resolution  │  │   Email     │                 │
│  │   Gateway   │  │  Service    │  │  Service    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
packages/messaging/src/
├── index.ts                 # Main exports
├── exchanges.ts             # Exchange definitions
├── queues.ts                # Queue definitions
├── messaging.config.ts      # Connection configuration
├── messaging.types.ts       # TypeScript interfaces
├── message-bus.ts           # High-level message bus
└── rabbitmq/
    ├── rabbitmq.client.ts   # Low-level client
    └── index.ts
```

---

## Exchanges

### Domain Events Exchange
General domain events for the platform.

```typescript
export const DOMAIN_EVENTS_EXCHANGE: ExchangeConfig = {
  name: 'exoduze.domain.events',
  type: 'topic',
  durable: true,
  autoDelete: false,
};
```

### Sports Exchange
Dedicated exchange for sports-related events.

```typescript
export const SPORTS_EXCHANGE: ExchangeConfig = {
  name: 'exoduze.sports',
  type: 'topic',
  durable: true,
  autoDelete: false,
};
```

### Direct Exchange
For direct service-to-service communication.

```typescript
export const DIRECT_EXCHANGE: ExchangeConfig = {
  name: 'exoduze.direct',
  type: 'direct',
  durable: true,
  autoDelete: false,
};
```

---

## Routing Keys

### Sports Events
```typescript
SPORTS_EVENT_CREATED: 'sports.event.created'
SPORTS_EVENT_UPDATED: 'sports.event.updated'
SPORTS_EVENT_LIVE: 'sports.event.live'
SPORTS_EVENT_FINISHED: 'sports.event.finished'
SPORTS_MARKET_CREATED: 'sports.market.created'
SPORTS_MARKET_RESOLVED: 'sports.market.resolved'
SPORTS_ODDS_UPDATED: 'sports.odds.updated'
SPORTS_SYNC_COMPLETED: 'sports.sync.completed'
```

### Market Events
```typescript
MARKET_CREATED: 'market.created'
MARKET_UPDATED: 'market.updated'
MARKET_RESOLVED: 'market.resolved'
MARKET_STATUS_CHANGED: 'market.status_changed'
```

### Order Events
```typescript
ORDER_PLACED: 'order.placed'
ORDER_MATCHED: 'order.matched'
ORDER_CANCELLED: 'order.cancelled'
ORDER_FILLED: 'order.filled'
```

### Wildcards
```typescript
ALL_SPORTS_EVENTS: 'sports.*'
ALL_MARKET_EVENTS: 'market.*'
ALL_ORDER_EVENTS: 'order.*'
ALL_EVENTS: '#'
```

---

## Queues

### Sports Queues

```typescript
// General sports events
export const SPORTS_EVENTS_QUEUE: QueueConfig = {
  name: 'sports.events.queue',
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    'x-dead-letter-exchange': 'exoduze.dlx',
    'x-dead-letter-routing-key': 'sports.dlq',
    'x-message-ttl': 86400000, // 24 hours
  },
};

// High-priority live updates
export const SPORTS_LIVE_QUEUE: QueueConfig = {
  name: 'sports.live.queue',
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    'x-max-priority': 10,
    'x-message-ttl': 300000, // 5 minutes
  },
};

// Market resolution processing
export const SPORTS_RESOLUTION_QUEUE: QueueConfig = {
  name: 'sports.resolution.queue',
  durable: true,
  exclusive: false,
  autoDelete: false,
};

// Dead letter queue
export const DLQ_SPORTS: QueueConfig = {
  name: 'sports.dlq',
  durable: true,
  exclusive: false,
  autoDelete: false,
};
```

---

## Client Usage

### Connection

```typescript
import { RabbitMQClient } from '@exoduze/messaging';

const client = new RabbitMQClient({
  host: 'localhost',
  port: 5672,
  username: 'guest',
  password: 'guest',
  vhost: '/',
});

await client.connect();
```

### Publishing Messages

```typescript
// Publish sports event update
await client.publish({
  exchange: 'exoduze.sports',
  routingKey: 'sports.event.updated',
  message: {
    id: 'event-123',
    sport: 'nba',
    homeScore: 95,
    awayScore: 88,
    status: 'live',
    elapsedTime: '3Q 5:30'
  },
  options: {
    persistent: true,
    timestamp: Date.now(),
  }
});
```

### Consuming Messages

```typescript
// Subscribe to all sports events
await client.subscribe({
  queue: 'sports.events.queue',
  handler: async (message) => {
    console.log('Received:', message);
    
    // Process the message
    await processSportsEvent(message);
    
    return true; // ACK
  },
  options: {
    prefetch: 10,
  }
});
```

### WebSocket Bridge (Sports Gateway)

```typescript
@WebSocketGateway({ namespace: 'sports' })
export class SportsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private rabbitMQClient: RabbitMQClient) {
    this.setupSubscription();
  }

  private async setupSubscription() {
    await this.rabbitMQClient.subscribe({
      queue: 'sports.events.queue',
      handler: async (message) => {
        // Broadcast to WebSocket clients
        this.server.to(`sport:${message.sport}`).emit('sports.update', message);
        return true;
      }
    });
  }
}
```

### Sports Messaging Service

Dedicated service for publishing sports events to RabbitMQ.

**File**: `apps/api/src/modules/sports/sports-messaging.service.ts`

```typescript
@Injectable()
export class SportsMessagingService implements OnModuleInit {
  private readonly exchange = 'exoduze.sports';
  private isConnected = false;

  // Routing keys
  static ROUTING_KEYS = {
    EVENT_CREATED: 'sports.event.created',
    EVENT_UPDATED: 'sports.event.updated',
    EVENT_LIVE: 'sports.event.live',
    EVENT_FINISHED: 'sports.event.finished',
    MARKET_CREATED: 'sports.market.created',
    MARKET_RESOLVED: 'sports.market.resolved',
    ODDS_UPDATED: 'sports.odds.updated',
    SYNC_COMPLETED: 'sports.sync.completed',
  };

  /**
   * Publish event update (live scores, status changes)
   */
  async publishEventUpdate(event: SportsEvent): Promise<void> {
    const message = {
      eventId: event.id,
      externalId: event.externalId,
      sport: event.sport,
      status: event.status,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      updatedAt: new Date().toISOString(),
    };

    const routingKey = this.getEventRoutingKey(event.status);
    await this.publish(routingKey, message);
  }

  /**
   * Publish market resolution
   */
  async publishMarketResolved(
    market: SportsMarket,
    outcome: boolean,
    source: string
  ): Promise<void> {
    await this.publish(ROUTING_KEYS.MARKET_RESOLVED, {
      marketId: market.id,
      eventId: market.eventId,
      outcome,
      resolutionSource: source,
      resolvedAt: new Date().toISOString(),
    });
  }

  /**
   * Publish sync completion
   */
  async publishSyncCompleted(
    syncType: 'leagues' | 'events' | 'live' | 'full',
    result: SyncResult
  ): Promise<void> {
    await this.publish(ROUTING_KEYS.SYNC_COMPLETED, {
      syncType,
      recordsFetched: result.recordsFetched,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      durationMs: result.durationMs,
      completedAt: new Date().toISOString(),
    });
  }

  private getEventRoutingKey(status: EventStatus): string {
    switch (status) {
      case 'live':
      case 'halftime':
        return ROUTING_KEYS.EVENT_LIVE;
      case 'finished':
        return ROUTING_KEYS.EVENT_FINISHED;
      default:
        return ROUTING_KEYS.EVENT_UPDATED;
    }
  }
}
```

### Usage Example

```typescript
// Inject and use in sync service
@Injectable()
export class SportsSyncService {
  constructor(
    private messagingService: SportsMessagingService,
  ) {}

  async syncLiveEvents(): Promise<SyncResult> {
    const result = await this.performSync();
    
    // Publish sync completion
    await this.messagingService.publishSyncCompleted('live', result);
    
    // Publish each updated event
    for (const event of result.updatedEvents) {
      await this.messagingService.publishEventUpdate(event);
    }
    
    return result;
  }
}
```

---

## Message Formats

### Sports Event Message

```typescript
interface SportsEventMessage {
  id: string;
  type: 'created' | 'updated' | 'live' | 'finished';
  sport: SportType;
  event: {
    id: string;
    name: string;
    homeTeam: string;
    awayTeam: string;
    homeScore?: number;
    awayScore?: number;
    status: EventStatus;
    startTime: string;
  };
  timestamp: number;
  source: 'thesportsdb' | 'api_football';
}
```

### Market Resolution Message

```typescript
interface MarketResolutionMessage {
  id: string;
  type: 'resolved';
  marketId: string;
  eventId: string;
  outcome: boolean;
  resolutionDetails: {
    homeScore: number;
    awayScore: number;
    marketType: string;
  };
  timestamp: number;
}
```

---

## Error Handling

### Dead Letter Queue

Messages that fail processing are routed to the DLQ:

```typescript
export const DEAD_LETTER_EXCHANGE: ExchangeConfig = {
  name: 'exoduze.dlx',
  type: 'direct',
  durable: true,
};

// Queue with DLQ configuration
const queueArgs = {
  'x-dead-letter-exchange': 'exoduze.dlx',
  'x-dead-letter-routing-key': 'failed.messages',
};
```

### Retry Strategy

```typescript
async function processWithRetry(message: any, maxRetries = 3) {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      await processMessage(message);
      return true;
    } catch (error) {
      attempts++;
      await delay(Math.pow(2, attempts) * 1000); // Exponential backoff
    }
  }
  
  // Send to DLQ after max retries
  return false;
}
```

---

## Monitoring

### Management UI

RabbitMQ Management UI available at: `http://localhost:15672`

- **Default credentials**: guest / guest
- **Monitor**: Queue depths, message rates, connections

### Health Check

```typescript
async function healthCheck(): Promise<boolean> {
  try {
    const status = await rabbitMQClient.getStatus();
    return status.connected && status.channelOpen;
  } catch {
    return false;
  }
}
```

---

## Environment Configuration

```env
# RabbitMQ Connection
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# Connection Options
RABBITMQ_HEARTBEAT=60
RABBITMQ_CONNECTION_TIMEOUT=10000
RABBITMQ_RECONNECT_DELAY=5000
```

---

## Docker Setup

```yaml
# docker-compose.yml
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  rabbitmq_data:
```

---

## Best Practices

1. **Message Persistence**: Always set `persistent: true` for important messages
2. **Prefetch Count**: Limit prefetch to prevent consumer overload
3. **Acknowledgment**: Always ACK/NACK messages explicitly
4. **Dead Letter Queues**: Use DLQ for failed message recovery
5. **Monitoring**: Set up alerts for queue depth thresholds
6. **Connection Pooling**: Reuse connections, don't create per-message

---

*Last Updated: January 2026*
