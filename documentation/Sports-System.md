# Sports AI Agent Competition System Documentation

> Comprehensive technical documentation for the Sports Data Scraping, AI Agent Competition Integration, and Real-time Streaming System.

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [ETL Pipeline](#etl-pipeline)
4. [Database Schema](#database-schema)
5. [Backend Implementation](#backend-implementation)
6. [API Integration](#api-integration)
7. [RabbitMQ Messaging](#rabbitmq-messaging)
8. [Frontend Integration](#frontend-integration)
9. [Market Resolution](#market-resolution)
10. [Security & Rate Limiting](#security--rate-limiting)
11. [Deployment](#deployment)

---

## System Overview

The Sports AI Agent Competition System enables users to deploy AI agents and compete in competitions based on real-time sports data. It integrates with **multiple external APIs** (TheSportsDB + 11 API-Sports endpoints) to fetch comprehensive live sports data, processes events through RabbitMQ for real-time distribution, and provides a professional frontend experience.

### Key Features
- **12 Supported Sports**: AFL, Baseball, Basketball, Football, Formula 1, Handball, Hockey, MMA, NBA, NFL, Rugby, Volleyball
- **Multi-Source ETL Pipeline**: Combines data from TheSportsDB + API-Sports with intelligent deduplication
- **Priority-Based Deduplication**: API-Sports data takes priority over TheSportsDB when duplicates found
- **Real-time Updates**: WebSocket streaming via Socket.io
- **Anti-Throttling**: Global rate limiting and circuit breaker patterns
- **Automatic Scheduled Sync**: Hourly games sync, daily leagues sync, 2-minute live score sync
- **Market Resolution**: Automatic market settlement based on event outcomes
- **Mobile-first Design**: Responsive UI optimized for all devices

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
│  ┌───────────────────┐    ┌─────────────────────────────────────────────┐   │
│  │   TheSportsDB     │    │            API-Sports (11 endpoints)        │   │
│  │   (12 Sports)     │    │  Football│Basketball│NBA│NFL│Hockey│MMA│F1  │   │
│  │   Free: 1000/day  │    │  Rugby│Volleyball│Handball│AFL              │   │
│  └─────────┬─────────┘    └───────────────────┬─────────────────────────┘   │
└────────────┼──────────────────────────────────┼─────────────────────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (NestJS API)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     ETL Orchestrator Service                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ TheSportsDB │  │ API-Sports  │  │ Deduplicator│  │  Priority   │  │  │
│  │  │   Client    │  │   Client    │  │  (by name)  │  │   Merger    │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │  │
│  │         │                │                │                │         │  │
│  │         └────────────────┴────────────────┴────────────────┘         │  │
│  │                              │                                       │  │
│  │                              ▼                                       │  │
│  │  ┌───────────────────────────────────────────────────────────────┐  │  │
│  │  │                   Sports Sync Service                          │  │  │
│  │  │  • Cron Jobs  • Rate Limiting  • Circuit Breaker  • Logging   │  │  │
│  │  └────────────────────────────┬──────────────────────────────────┘  │  │
│  │                               │                                     │  │
│  │                               ▼                                     │  │
│  │  ┌───────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Sports Service                              │  │  │
│  │  │  • CRUD Operations  • Market Creation  • Resolution           │  │  │
│  │  └────────────────────────────┬──────────────────────────────────┘  │  │
│  └───────────────────────────────┼─────────────────────────────────────┘  │
└──────────────────────────────────┼────────────────────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│      Supabase       │  │      RabbitMQ       │  │      Frontend       │
│    (PostgreSQL)     │  │     (Messaging)     │  │    (React/Vite)     │
│                     │  │                     │  │                     │
│ • sports_leagues    │  │ • sports.events     │  │ • SportsMarketPage  │
│ • sports_teams      │  │ • sports.live       │  │ • useSportsMarkets  │
│ • sports_events     │  │ • sports.resolve    │  │ • SportsSidebar     │
│ • sports_markets    │  │ • sports.sync       │  │ • WebSocket Client  │
│ • sports_sync_logs  │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## ETL Pipeline

The Sports ETL (Extract-Transform-Load) Orchestrator combines data from multiple sources with intelligent deduplication.

### Data Sources

| Source | Sports Covered | Rate Limit | Priority |
|--------|---------------|------------|----------|
| **TheSportsDB** | All 12 sports | 1000 req/day | 50 |
| **API-Sports** (11 endpoints) | Football, Basketball, NBA, NFL, Hockey, MMA, F1, Rugby, Volleyball, Handball, AFL | 100 req/day | 100 |

### API-Sports Endpoints

| Sport | API Version | Base URL |
|-------|-------------|----------|
| Football | v3 | `v3.football.api-sports.io` |
| Basketball | v1 | `v1.basketball.api-sports.io` |
| NBA | v2 | `v2.nba.api-sports.io` |
| NFL | v1 | `v1.american-football.api-sports.io` |
| Hockey | v1 | `v1.hockey.api-sports.io` |
| MMA | v1 | `v1.mma.api-sports.io` |
| Formula-1 | v1 | `v1.formula-1.api-sports.io` |
| Rugby | v1 | `v1.rugby.api-sports.io` |
| Volleyball | v1 | `v1.volleyball.api-sports.io` |
| Handball | v1 | `v1.handball.api-sports.io` |
| AFL | v1 | `v1.afl.api-sports.io` |

### ETL Flow

```
1. EXTRACT: Fetch from both sources in parallel
       │
       ▼
2. TRANSFORM: Normalize data to internal format
       │
       ▼
3. DEDUPLICATE: Match by (sport + date + home_team + away_team)
       │
       ▼
4. MERGE: API-Sports wins (priority 100 > TheSportsDB 50)
       │
       ▼
5. LOAD: Upsert to Supabase database
       │
       ▼
6. PUBLISH: Send to RabbitMQ for real-time streaming
```

### Deduplication Logic

When data comes from multiple sources, the ETL orchestrator:

1. **Normalizes keys** - Creates unique identifiers:
   - Leagues: `{sport}:{country}:{normalized_name}`
   - Events: `{sport}:{date}:{home_team}:{away_team}`

2. **Priority ordering** - Sorts by source priority:
   - API-Sports endpoints: **100** (highest)
   - TheSportsDB: **50**
   - Manual: **25**

3. **Merges data** - Higher priority wins, but fills in missing fields from lower priority

```typescript
// Example deduplication
const DATA_SOURCE_PRIORITY: Record<DataSource, number> = {
    [DataSource.APIFOOTBALL]: 100,
    [DataSource.APIBASKETBALL]: 100,
    [DataSource.APINBA]: 100,
    // ... all API-Sports = 100
    [DataSource.THESPORTSDB]: 50,
    [DataSource.MANUAL]: 25,
};
```

### Scheduled Sync Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| **Games Sync** | Every hour | Syncs upcoming games from all sources |
| **Leagues Sync** | Daily at 3 AM | Full leagues refresh |
| **Live Scores** | Every 2 minutes | Updates live game scores |

### ETL API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sports/etl/status` | Get ETL status and API usage |
| POST | `/api/v1/sports/etl/sync` | Trigger full ETL sync for all sports |
| POST | `/api/v1/sports/etl/sync/:sport` | Sync specific sport from all sources |
| POST | `/api/v1/sports/etl/sync/live` | Sync live scores for all sports |

### Usage Example

```bash
# Check ETL status
curl http://localhost:3001/api/v1/sports/etl/status

# Response
{
  "isSyncing": false,
  "lastSyncTime": "2026-01-15T00:17:00Z",
  "config": {
    "enableTheSportsDB": true,
    "enableAPISports": true,
    "deduplicateByName": true
  },
  "apiSportsUsage": {
    "dailyCount": 5,
    "dailyLimit": 100,
    "remaining": 95,
    "percentUsed": 5
  }
}

# Trigger ETL sync for football
curl -X POST "http://localhost:3001/api/v1/sports/etl/sync/football?type=games"
```

---

## Database Schema

### File Location
- `apps/api/supabase/migrations/013_sports_data.sql` - Main schema
- `apps/api/supabase/migrations/018_update_data_sources.sql` - Multi-source enum update

### Tables

#### `sports_leagues`
Stores league/competition information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| external_id | VARCHAR(100) | ID from external API |
| sport | sport_type | Sport enum (afl, baseball, etc.) |
| name | VARCHAR(255) | League name |
| country | VARCHAR(100) | Country of origin |
| logo_url | TEXT | League logo URL |
| is_active | BOOLEAN | Whether league is active |
| is_featured | BOOLEAN | Featured on homepage |
| data_source | data_source | API source (thesportsdb, api_football) |

#### `sports_teams`
Stores team information with branding.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| league_id | UUID | FK to sports_leagues |
| external_id | VARCHAR(100) | ID from external API |
| name | VARCHAR(255) | Team name |
| name_short | VARCHAR(50) | Abbreviated name |
| logo_url | TEXT | Team logo URL |
| primary_color | VARCHAR(7) | Hex color code |
| stadium | VARCHAR(255) | Home stadium name |

#### `sports_events`
Stores matches/fixtures with live scores.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| league_id | UUID | FK to sports_leagues |
| home_team_id | UUID | FK to sports_teams |
| away_team_id | UUID | FK to sports_teams |
| external_id | VARCHAR(100) | ID from external API |
| name | VARCHAR(255) | Event display name |
| start_time | TIMESTAMPTZ | Scheduled start time |
| status | event_status | scheduled, live, finished, etc. |
| status_detail | VARCHAR(100) | "45' - First Half" |
| home_score | INTEGER | Home team score |
| away_score | INTEGER | Away team score |
| venue | VARCHAR(255) | Event venue |
| has_market | BOOLEAN | Has AI agent competition |
| metadata | JSONB | Additional data |

#### `sports_markets`
Stores AI agent competitions linked to events.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| event_id | UUID | FK to sports_events |
| market_id | UUID | FK to main markets table |
| market_type | sports_market_type | winner, spread, total, prop |
| title | VARCHAR(255) | Market question |
| outcomes | JSONB | Possible outcomes |
| outcome_prices | JSONB | Current prices |
| resolved | BOOLEAN | Whether resolved |
| outcome | BOOLEAN | Resolution outcome |
| closes_at | TIMESTAMPTZ | Betting deadline |

#### `sports_sync_logs`
Audit trail for all sync operations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| sync_type | VARCHAR(50) | leagues, events, live, etc. |
| sport | sport_type | Sport being synced |
| data_source | data_source | API used |
| status | sync_status | pending, running, success, failed |
| records_created | INTEGER | New records count |
| records_updated | INTEGER | Updated records count |
| error_message | TEXT | Error details if failed |
| started_at | TIMESTAMPTZ | Sync start time |
| completed_at | TIMESTAMPTZ | Sync completion time |

### Enums

```sql
CREATE TYPE sport_type AS ENUM (
    'afl', 'baseball', 'basketball', 'football', 
    'formula1', 'handball', 'hockey', 'mma', 
    'nba', 'nfl', 'rugby', 'volleyball'
);

CREATE TYPE event_status AS ENUM (
    'scheduled', 'live', 'halftime', 'finished', 
    'postponed', 'cancelled', 'suspended'
);

CREATE TYPE data_source AS ENUM (
    'thesportsdb', 'apifootball', 'apibasketball', 'apiafl',
    'apiformula1', 'apihandball', 'apihockey', 'apimma',
    'apinba', 'apinfl', 'apirugby', 'apivolleyball', 'manual'
);

CREATE TYPE sports_market_type AS ENUM (
    'winner', 'spread', 'total', 'prop', 'custom'
);
```

### Key Database Functions

```sql
-- Get upcoming events for a sport
SELECT * FROM get_upcoming_events('nba', 10);

-- Get live events
SELECT * FROM get_live_events('football');

-- Auto-resolve market based on event outcome
SELECT auto_resolve_sports_market(market_id, TRUE);
```

---

## Backend Implementation

### Module Structure

```
apps/api/src/modules/sports/
├── clients/
│   ├── base-sports.client.ts       # Base class with rate limiting
│   ├── thesportsdb.client.ts       # TheSportsDB API client (12 sports)
│   ├── api-football.client.ts      # API-Football client (legacy)
│   ├── api-sports.client.ts        # Unified API-Sports client (11 sports) ★ NEW
│   └── index.ts
├── dto/
│   ├── sports.dto.ts               # Request/Response DTOs
│   └── index.ts
├── types/
│   └── sports.types.ts             # TypeScript types & DataSource enums
├── sports.module.ts                # NestJS module
├── sports.controller.ts            # REST endpoints + ETL endpoints
├── sports.service.ts               # Business logic
├── sports-sync.service.ts          # Sync orchestration
├── sports-etl-orchestrator.service.ts  # Multi-source ETL pipeline ★ NEW
├── sports-messaging.service.ts     # RabbitMQ publishers
├── sports-cleaner.service.ts       # Data validation & deduplication
└── sports.gateway.ts               # WebSocket gateway
```

### Key Services

#### SportsService
Core business logic for CRUD operations.

```typescript
class SportsService {
  // Get paginated events with filters
  async getEvents(query: SportsEventsQuery): Promise<PaginatedResponse<SportsEvent>>;
  
  // Get live events for a sport
  async getLiveEvents(sport?: SportType): Promise<SportsEvent[]>;
  
  // Create an AI agent competition from an event
  async createMarketFromEvent(eventId: string, dto: CreateSportsMarketDto): Promise<SportsMarket>;
  
  // Get paginated markets with filters and sorting
  async getMarkets(query: SportsMarketsQuery): Promise<PaginatedResponse<SportsMarket>>;

  // Resolve a market based on event outcome
  async resolveMarket(marketId: string, outcome: boolean): Promise<SportsMarket>;
}
```

#### SportsCleanerService

Responsible for the **Transform** phase of the ETL pipeline. Ensures data integrity before storage.

**Pipeline Steps:**
1.  **Validation**: strict checks for required fields (start time, team names, sport type).
2.  **Normalization**: Standardizes team names (e.g., "Man Utd" -> "Manchester United", "PSG" -> "Paris Saint-Germain").
3.  **Deduplication**: Identifies duplicate events across multiple sources using fuzzy matching on team names and match dates. source reliability scoring determines which version to keep.

```typescript
// Deduplication Logic
deduplicateEvents(events: SportsEvent[]): SportsEvent[] {
    const seen = new Map<string, SportsEvent>();
    for (const event of events) {
        // Create unique key based on teams and date
        const key = `${event.homeTeamId}-${event.awayTeamId}-${event.startTime.toDateString()}`;
        if (!seen.has(key) || this.isMoreReliable(event, seen.get(key))) {
            seen.set(key, event);
        }
    }
    return Array.from(seen.values());
}
```

#### SportsSyncService
Orchestrates fully automated data synchronization using NestJS `@Cron` decorators.

**Key Features:**
- **Automated Scheduling**:
  - `Live Scores`: Every 5 minutes (`*/5 * * * *`)
  - `Upcoming Events`: Every hour (`0 * * * *`)
  - `Leagues`: Daily at midnight (`0 0 * * *`)
- **Incremental Sync**: Fetches only new/updated data to minimize API usage.
- **Error Recovery**: Automatic retries and error logging via `sports_sync_logs`.

```typescript
// Cron implementation example
@Cron(CronExpression.EVERY_5_MINUTES)
async handleLiveSync() {
    if (!this.shouldRunSync()) return;
    await this.syncLiveScores();
}
```

#### SportsGateway
Handles real-time data broadcasting to frontend clients.

- **Technology**: Socket.io / `@nestjs/websockets`
- **Integration**: Subscribes to `SportsMessagingService` events.
- **Rooms**:
  - `sport:{sportName}`: Updates for specific sport.
  - `event:{eventId}`: Updates for specific match.
  - `sport:live`: aggregated live scores.

```typescript
@SubscribeMessage('subscribe_live')
handleSubscribeLive(client: Socket, payload: any) {
    client.join('live');
}

// Broadcasts updates when SportsService emits an event
broadcastEventUpdate(event: any) {
    this.server.to(`event:${event.id}`).emit('sports.update', event);
}
```

### REST API Endpoints

#### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sports/categories` | List all 12 sport categories |
| GET | `/api/v1/sports/leagues` | Get leagues (paginated) |
| GET | `/api/v1/sports/leagues/:id` | Get single league |
| GET | `/api/v1/sports/events` | Get events (paginated, filterable) |
| GET | `/api/v1/sports/events/live` | Get live events only |
| GET | `/api/v1/sports/events/upcoming` | Get upcoming events |
| GET | `/api/v1/sports/events/:id` | Get single event with details |
| GET | `/api/v1/sports/markets` | Get sports markets (supports search, sort, filter) |

#### Admin Sync Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sports/markets` | Create market from event |
| POST | `/api/v1/sports/sync/leagues` | Trigger league sync |
| POST | `/api/v1/sports/sync/events` | Trigger event sync |
| POST | `/api/v1/sports/sync/live` | Trigger live scores sync |
| POST | `/api/v1/sports/sync/odds` | Trigger odds sync |
| POST | `/api/v1/sports/sync/all` | Trigger full sync |

#### Multi-Source Sync Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sports/sync/usage` | Get API-Sports usage statistics |
| POST | `/api/v1/sports/sync/sport/:sport` | Sync specific sport from API-Sports |
| POST | `/api/v1/sports/sync/multi` | Sync all sports with priority |

#### ETL Orchestrator Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sports/etl/status` | Get ETL status, config, and API usage |
| POST | `/api/v1/sports/etl/sync` | Trigger ETL sync for all sports |
| POST | `/api/v1/sports/etl/sync/:sport` | ETL sync for specific sport |
| POST | `/api/v1/sports/etl/sync/live` | Sync live scores from all sources |

---

## API Integration

### TheSportsDB

**Base URL**: `https://www.thesportsdb.com/api/v1/json/{API_KEY}/`

**Supported Sports**: All 12 (AFL, Baseball, Basketball, Football, Formula 1, Handball, Hockey, MMA, NBA, NFL, Rugby, Volleyball)

**Key Endpoints Used**:
- `search_all_leagues.php?s={sport}` - Get leagues
- `lookup_all_teams.php?id={league_id}` - Get teams
- `eventsnextleague.php?id={league_id}` - Upcoming events
- `eventspastleague.php?id={league_id}` - Past events
- `livescore.php?s={sport}` - Live scores

**Rate Limiting**: 
- Free tier: 3 req/min
- Implementation: Token bucket with 1000ms delay between requests

### API-Football

**Base URL**: `https://v3.football.api-sports.io/`

**Headers**:
```
x-rapidapi-key: {API_KEY}
x-rapidapi-host: v3.football.api-sports.io
```

**Supported Sports**: Football/Soccer only (more detailed data)

**Key Endpoints Used**:
- `GET /leagues` - Competition data
- `GET /teams?league={id}&season={year}` - Teams in league
- `GET /fixtures?live=all` - Live matches
- `GET /fixtures?league={id}&season={year}` - Fixtures
- `GET /odds?fixture={id}` - Betting odds

**Rate Limiting**:
- 300 requests/day (free tier)
- Implementation: Request counting with daily reset

### Data Transformation

Both APIs return different data structures. The sync service normalizes them:

```typescript
// TheSportsDB event → Internal SportsEvent
function transformTheSportsDBEvent(raw: any): SportsEvent {
  return {
    externalId: raw.idEvent,
    name: raw.strEvent,
    homeTeamId: raw.idHomeTeam,
    awayTeamId: raw.idAwayTeam,
    startTime: new Date(raw.strTimestamp || `${raw.dateEvent}T${raw.strTime}`),
    status: mapStatus(raw.strStatus),
    homeScore: parseInt(raw.intHomeScore) || 0,
    awayScore: parseInt(raw.intAwayScore) || 0,
    // ... more fields
  };
}
```

---

## RabbitMQ Messaging

### Configuration

**File**: `packages/messaging/src/`

### Exchanges

| Exchange | Type | Purpose |
|----------|------|---------|
| `exoduze.sports` | topic | Sports event routing |
| `exoduze.domain.events` | topic | General domain events |

### Routing Keys

```typescript
const ROUTING_KEYS = {
  // Sports events
  SPORTS_EVENT_CREATED: 'sports.event.created',
  SPORTS_EVENT_UPDATED: 'sports.event.updated',
  SPORTS_EVENT_LIVE: 'sports.event.live',
  SPORTS_EVENT_FINISHED: 'sports.event.finished',
  
  // Markets
  SPORTS_MARKET_CREATED: 'sports.market.created',
  SPORTS_MARKET_RESOLVED: 'sports.market.resolved',
  SPORTS_ODDS_UPDATED: 'sports.odds.updated',
  
  // Wildcards
  ALL_SPORTS_EVENTS: 'sports.*',
};
```

### Queues

| Queue | Binding | Purpose |
|-------|---------|---------|
| `sports.events.queue` | `sports.event.*` | General event processing |
| `sports.live.queue` | `sports.event.live` | High-priority live updates |
| `sports.resolution.queue` | `sports.market.resolved` | Market settlement |
| `sports.dlq` | Dead letter | Failed message handling |

### Message Flow

```
1. Sync Service fetches new data
       │
       ▼
2. Publishes to RabbitMQ
   { exchange: 'exoduze.sports', routingKey: 'sports.event.updated', message: {...} }
       │
       ▼
3. Sports Gateway subscribes to queue
       │
       ▼
4. Broadcasts to WebSocket clients
   io.to('sport:nba').emit('sports.update', eventData)
       │
       ▼
5. Frontend receives and updates UI
```

---

## Frontend Integration

### Service Layer

**File**: `apps/web/src/services/sports.service.ts`

```typescript
class SportsApiService {
  // Fetch events with pagination
  async getEvents(params?: SportsEventsQuery): Promise<PaginatedResponse<SportsEvent>>;
  
  // Fetch markets with strict Zod validation
  async getMarkets(options: SportsMarketsOptions): Promise<PaginatedResponse<SportsMarket>>;
}

export const SportsService = new SportsApiService();
```

### React Hooks (Modern Architecture)

#### useSportsMarkets
Top-level hook for fetching markets with **React Query** and **Zod Validation**.

- **Anti-Throttling**: Automatically de-dupes requests and caches data for 30 seconds (`staleTime`).
- **Anti-Hack**: Validates incoming data against `MarketSchema`. Logs warnings for schema mismatches.
- **Smart Retries**: Fails fast on 404/429 errors.

```typescript
// Usage
const { markets, loading, isRateLimited } = useSportsMarkets({
  sport: 'nba',
  isActive: true,
  refreshInterval: 10000 // Auto-refresh every 10s
});

// The hook internally uses useQuery:
useQuery({
    queryKey: ['sportsMarkets', { sport, ... }],
    queryFn: () => SportsService.getMarkets(...),
    staleTime: 30000, // 30s cache
});
```

#### useSportsSocket
Custom hook for managing WebSocket connections and real-time subscriptions with automatic cleanup.

```typescript
const { joinSport, leaveSport } = useSportsSocket({
    onMarketUpdate: (update) => {
        // Optimistically update UI via React State
        setRealTimeMarkets(prev => mergeUpdate(prev, update));
    }
});
```

### Components

#### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `SportsMarketPage` | `SportsMarketPage.tsx` | Main page with all sports components integrated |
| `SportsPredictionCard` | `SportsPredictionCard.tsx` | AI Agent Competition-style card with Yes/No buttons |
| `BetSlip` | `BetSlip.tsx` | Desktop sidebar for managing selections |
| `MobileBetSlip` | `MobileBetSlip.tsx` | Mobile bottom sheet for bet management |
| `SportsSidebar` | `SportsSidebar.tsx` | Navigation for 12 sports categories |
| `SportsTicker` | `SportsTicker.tsx` | Live scores ticker |
| `SportsCard` | `SportsCard.tsx` | Basic event card |

#### SportsPredictionCard

Premium AI Agent Competition-style card with:

```tsx
interface AgentCompetition {
  id: string;
  eventId: string;
  question: string;
  homeTeam: { name: string; logo?: string; score?: number };
  awayTeam: { name: string; logo?: string; score?: number };
  sport: string;
  league?: string;
  status: 'scheduled' | 'live' | 'halftime' | 'finished';
  statusDetail?: string;
  yesPrice: number;    // 0.00 - 1.00
  noPrice: number;     // 0.00 - 1.00
  volume: number;
  participants: number;
  isFeatured?: boolean;
}
```

**Features:**
- Team matchup display with logos
- Live score indicators (pulsing red dot)
- AI agent position buttons with dynamic pricing
- Glassmorphism design
- Volume and participant stats
- Featured badge for hot markets

```tsx
<SportsPredictionCard
  market={market}
  onPredict={(marketId, outcome) => addToSlip(marketId, outcome)}
  variant="featured"
/>
```

#### BetSlip

Desktop sidebar for managing AI agent positions:

```tsx
interface BetSelection {
  id: string;
  marketId: string;
  question: string;
  outcome: 'yes' | 'no';
  price: number;
}

<BetSlip
  selections={betSelections}
  onRemove={(id) => removeSelection(id)}
  onClearAll={() => clearAllSelections()}
  onPlaceBet={(selections, amounts) => placeBet(selections, amounts)}
  balance={userBalance}
/>
```

**Features:**
- Selection management with remove buttons  
- Amount input with quick-add buttons (+$5, +$10, +$25)
- Automatic payout calculations
- Balance validation with warning
- Submit button with loading state

#### MobileBetSlip

Floating bottom bar for mobile with expandable full bet slip:

```tsx
<MobileBetSlip
  selections={betSelections}
  onRemove={handleRemove}
  onClearAll={handleClearAll}
  onPlaceBet={handlePlaceBet}
  balance={userBalance}
/>
```

**Features:**
- Collapsed bar showing selection count
- Positioned above mobile navigation
- Swipe/tap to expand into full bet slip
- Backdrop overlay when expanded

### UI/UX Improvements (v2.1)

> Updated: January 16, 2026

The Sports UI has been significantly upgraded to provide a **premium, Polymarket-inspired experience** across all devices.

#### Design Philosophy

| Principle | Implementation |
|-----------|----------------|
| **Glassmorphism** | Semi-transparent cards with `backdrop-blur-md` for a modern, layered look. |
| **Visual Hierarchy** | Clear separation of sports categories, market cards, and bet slip. |
| **Micro-interactions** | Hover effects, scale transforms on icons, and animated entry for cards (Framer Motion). |
| **Accessibility** | High contrast text, clear tap targets, and keyboard-navigable elements. |

#### Layout: 3-Column (Desktop)

For large screens (`2xl` breakpoint and above), the page now features a 3-column layout:

1.  **Left Sidebar (`SportsSidebar`)**: Sticky navigation for 12 sport categories.
2.  **Main Feed**: Displays market cards in a responsive grid.
3.  **Right Sidebar (Bet Slip/Trending)**: Displays the user's bet slip and trending markets.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              Sports Market Page                               │
├───────────────┬───────────────────────────────────────────────┬───────────────┤
│   SportsSidebar  │                                               │   BetSlip /    │
│   (sticky)       │               Market Feed                     │   Trending     │
│   - Live 🔴      │       ┌────────┐  ┌────────┐  ┌────────┐      │   (sticky)     │
│   - AFL          │       │ Card 1 │  │ Card 2 │  │ Card 3 │      │                │
│   - Basketball   │       └────────┘  └────────┘  └────────┘      │                │
│   - Football     │                                               │                │
│   - MMA          │                                               │                │
│   ...            │                                               │                │
└───────────────┴───────────────────────────────────────────────┴───────────────┘
```

On medium screens, the right sidebar is hidden, and on mobile, the left sidebar is replaced with a horizontal scroll bar for category selection.

#### SportsMarketCard Enhancements

The `SportsMarketCard` component has been refactored with:

| Feature | Description |
|---------|-------------|
| **Probability Bar** | A visual progress bar inside each outcome button showing the current odds. |
| **Colored Outcomes** | First outcome uses `emerald` (positive), second uses `rose` (negative) colors. |
| **Modern Padding** | Increased padding (`p-5`) and rounded corners (`rounded-2xl`) for a premium feel. |
| **Hover Animation** | Uses `framer-motion` for `whileHover` lift effect. |
| **Metadata Display** | Shows Volume and Start Time with icons (`Activity`, `Clock`). |

#### SportsSidebar Enhancements

| Feature | Description |
|---------|-------------|
| **Sticky Positioning** | The sidebar is `sticky top-20` so it remains visible during scroll. |
| **Refined Active State** | Active category has `bg-blue-50 dark:bg-blue-500/10` with text color change. |
| **Icon Scaling** | Emojis scale on hover (`group-hover:scale-110`). |
| **Live Pulse** | "Live" category has an animated pulsing red dot. |

#### Anti-Throttling UI

The `useSportsMarkets` hook now tracks API rate limits. When a 429 (Too Many Requests) response is received:

1.  `isRateLimited` state is set to `true`.
2.  `rateLimitReset` stores the timestamp when fetching can resume.
3.  The `SportsMarketPage` displays an **orange alert banner** with a countdown timer.
4.  The "Refresh" button becomes disabled and shows the remaining wait time.

This provides a **user-friendly experience** during high traffic, avoiding jarring error messages.

```tsx
// useSportsMarkets.ts
interface UseSportsMarketsReturn {
    // ... other properties
    isRateLimited: boolean;
    rateLimitReset: Date | null;
}
```

```tsx
// SportsMarketPage.tsx - Rate Limit UI
{isRateLimited && (
    <motion.div className="...">
        <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
        <div>High Traffic Volume</div>
        <div className="font-mono">00:{cooldownSeconds}</div>
    </motion.div>
)}
```

---


## Market Resolution

### Automatic Resolution Flow

```
1. Event finishes (status = 'finished')
       │
       ▼
2. Sync service detects final score
       │
       ▼
3. Find linked sports_markets
       │
       ▼
4. Determine outcome based on market_type:
   • winner: homeScore > awayScore
   • spread: (homeScore - awayScore) > spread
   • total: (homeScore + awayScore) > line
       │
       ▼
5. Call auto_resolve_sports_market()
       │
       ▼
6. Publish SPORTS_MARKET_RESOLVED event
       │
       ▼
7. Settlement service processes payouts
```

### Manual Resolution

Admins can manually resolve disputed markets:

```typescript
// POST /api/sports/markets/:id/resolve
{
  "outcome": true,
  "reason": "Manual override - VAR decision"
}
```

---

## Security & Rate Limiting

### API Key Management
- Store in `.env` file (never commit)
- `THESPORTSDB_API_KEY=3` (free tier)
- `APIFOOTBALL_API_KEY=xxx`

### Rate Limiting Implementation

```typescript
// Base client with token bucket
class BaseSportsClient {
  private requestQueue: Promise<void> = Promise.resolve();
  private minDelayMs = 1000;
  
  protected async rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve) => {
      this.requestQueue = this.requestQueue.then(async () => {
        await sleep(this.minDelayMs);
        resolve(await fn());
      });
    });
  }
}
```

### Row Level Security

All sports tables have RLS enabled:

```sql
-- Public read access
CREATE POLICY "sports_leagues_select" ON sports_leagues
  FOR SELECT TO authenticated, anon USING (true);

-- Admin write access
CREATE POLICY "sports_leagues_insert" ON sports_leagues
  FOR INSERT TO authenticated 
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

---

## Deployment

### Environment Variables

```env
# ===========================================
# API Keys
# ===========================================
THESPORTSDB_API_KEY=3
APIFOOTBALL_API_KEY=your_api_sports_key_here

# ===========================================
# Rate Limiting
# ===========================================
APISPORTS_REQUESTS_PER_DAY=100
APISPORTS_REQUESTS_PER_MINUTE=30

# ===========================================
# ETL Configuration
# ===========================================
ETL_ENABLE_THESPORTSDB=true
ETL_ENABLE_APISPORTS=true
ETL_ENABLE_SCHEDULED_SYNC=true
ETL_ENABLE_LIVE_SYNC=true
ETL_SYNC_INTERVAL=60
ETL_DEDUPLICATE_BY_NAME=true

# ===========================================
# Legacy Sync Configuration
# ===========================================
SPORTS_SYNC_INTERVAL_LIVE=300000      # 5 minutes
SPORTS_SYNC_INTERVAL_UPCOMING=3600000 # 1 hour
SPORTS_SYNC_INTERVAL_LEAGUES=86400000 # 24 hours
SPORTS_ENABLE_SCHEDULED_SYNC=true

# ===========================================
# Messaging
# ===========================================
SPORTS_ENABLE_MESSAGING=true
RABBITMQ_URL=amqp://localhost:5672
```

### Database Migration

```bash
# Option 1: Using Supabase CLI
cd apps/api
npx supabase db push

# Option 2: Run migrations manually in Supabase SQL Editor
# 1. apps/api/supabase/migrations/013_sports_data.sql
# 2. apps/api/supabase/migrations/018_update_data_sources.sql
```

### Starting the System

```bash
# 1. Start RabbitMQ (Docker)
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 2. Start Backend
cd apps/api
npm run start:dev

# 3. Start Frontend
cd apps/web
npm run dev

# 4. Trigger initial ETL sync
curl -X POST "http://localhost:3001/api/v1/sports/etl/sync?type=leagues"

# 5. Check ETL status
curl http://localhost:3001/api/v1/sports/etl/status
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| No sports data | Trigger ETL sync: `curl -X POST http://localhost:3001/api/v1/sports/etl/sync` |
| API rate limit exceeded | Check usage with `/sports/etl/status`, wait for daily reset |
| Duplicate data | Ensure `ETL_DEDUPLICATE_BY_NAME=true` in env |
| WebSocket disconnects | Check CORS settings in gateway |
| Market not resolving | Check event status is 'finished' |
| TheSportsDB not working | Check `THESPORTSDB_API_KEY` is set (use `3` for free tier) |

### Logs to Check

```bash
# Backend logs
tail -f apps/api/logs/combined.log

# ETL-specific logs
grep "SportsETLOrchestrator" apps/api/logs/combined.log

# Sync-specific logs
grep "SportsSyncService" apps/api/logs/combined.log

# API-Sports client logs
grep "APISportsClient" apps/api/logs/combined.log
```

### Health Check

```bash
# Check ETL status
curl http://localhost:3001/api/v1/sports/etl/status

# Check API usage
curl http://localhost:3001/api/v1/sports/sync/usage

# List all categories
curl http://localhost:3001/api/v1/sports/categories
```

---

*Last Updated: January 15, 2026*
*Version: 2.0 - Multi-Source ETL Pipeline*
