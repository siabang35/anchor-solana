# Sports Data API Integration Guide

> Technical documentation for integrating external sports data APIs: TheSportsDB and API-Sports (11 endpoints).

---

## Overview

The ExoDuZe platform integrates with **multiple external sports data providers** to fetch real-time scores, fixtures, and team information. Data is combined through an ETL pipeline with intelligent deduplication.

| Provider | Coverage | Rate Limit (Free) | Best For | Priority |
|----------|----------|-------------------|----------|----------|
| TheSportsDB | 12 Sports | 1000 req/day | Breadth of sports | 50 |
| API-Sports | 11 Sports (11 endpoints) | 100 req/day (shared) | Detailed data | 100 |

---

## TheSportsDB

### Configuration

```env
THESPORTSDB_API_KEY=3  # Free tier key
```

### Base URL
```
https://www.thesportsdb.com/api/v1/json/{API_KEY}/
```

### Supported Sports Mapping

| Sport ID | Sport Name | League Examples |
|----------|------------|-----------------|
| AFL | Australian Football | AFL Premiership |
| Baseball | Baseball | MLB, NPB |
| Basketball | Basketball | NBA, EuroLeague |
| Soccer | Football/Soccer | Premier League, La Liga |
| Motorsport | Formula 1 | F1 World Championship |
| Handball | Handball | EHF Champions League |
| Ice Hockey | Ice Hockey | NHL, KHL |
| Fighting | MMA | UFC, Bellator |
| American Football | NFL | NFL, CFL |
| Rugby | Rugby | Six Nations, Super Rugby |
| Volleyball | Volleyball | CEV Champions League |

### Key Endpoints

#### Get All Leagues for a Sport
```
GET search_all_leagues.php?s={sport}
```

**Example Response:**
```json
{
  "countries": [
    {
      "idLeague": "4328",
      "strLeague": "English Premier League",
      "strSport": "Soccer",
      "strCountry": "England",
      "strBadge": "https://..."
    }
  ]
}
```

#### Get Teams in a League
```
GET lookup_all_teams.php?id={league_id}
```

**Example Response:**
```json
{
  "teams": [
    {
      "idTeam": "133604",
      "strTeam": "Arsenal",
      "strTeamShort": "ARS",
      "strTeamBadge": "https://...",
      "strStadium": "Emirates Stadium"
    }
  ]
}
```

#### Get Upcoming Events
```
GET eventsnextleague.php?id={league_id}
```

**Example Response:**
```json
{
  "events": [
    {
      "idEvent": "1234567",
      "strEvent": "Arsenal vs Chelsea",
      "idHomeTeam": "133604",
      "idAwayTeam": "133610",
      "dateEvent": "2026-01-20",
      "strTime": "15:00:00",
      "strStatus": "Not Started"
    }
  ]
}
```

#### Get Live Scores
```
GET livescore.php?s={sport}
```

**Example Response:**
```json
{
  "events": [
    {
      "idEvent": "1234567",
      "strEvent": "Arsenal vs Chelsea",
      "intHomeScore": "2",
      "intAwayScore": "1",
      "strProgress": "65'",
      "strStatus": "1H"
    }
  ]
}
```

### Client Implementation

```typescript
// apps/api/src/modules/sports/clients/thesportsdb.client.ts

export class TheSportsDBClient extends BaseSportsClient {
  private readonly baseUrl: string;
  
  constructor() {
    super();
    const apiKey = process.env.THESPORTSDB_API_KEY || '3';
    this.baseUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}`;
  }
  
  async getLeagues(sport: SportType): Promise<SportsLeague[]> {
    const sportName = this.mapSportToApiName(sport);
    const response = await this.rateLimitedRequest(() =>
      fetch(`${this.baseUrl}/search_all_leagues.php?s=${sportName}`)
    );
    
    const data = await response.json();
    return (data.countries || []).map(this.transformLeague);
  }
  
  async getLiveEvents(sport?: SportType): Promise<SportsEvent[]> {
    const sportName = sport ? this.mapSportToApiName(sport) : 'Soccer';
    const response = await this.rateLimitedRequest(() =>
      fetch(`${this.baseUrl}/livescore.php?s=${sportName}`)
    );
    
    const data = await response.json();
    return (data.events || []).map(this.transformEvent);
  }
}
```

---

## API-Football

### Configuration

```env
APIFOOTBALL_API_KEY=your_api_key_here
```

### Base URL & Headers
```
Base: https://v3.football.api-sports.io/

Headers:
  x-rapidapi-key: {API_KEY}
  x-rapidapi-host: v3.football.api-sports.io
```

### Rate Limits

| Plan | Requests/Day | Features |
|------|--------------|----------|
| Free | 100 | Limited leagues, shared across all sports |
| Pro | 3000 | All leagues + odds |
| Ultra | Unlimited | Real-time + stats |

---

## API-Sports Multi-Sport Client

### Overview

The unified API-Sports client supports **11 different sports** through a single interface with shared rate limiting.

### Supported Endpoints

| Sport | API Version | Base URL | Endpoint Suffix |
|-------|-------------|----------|----------------|
| Football | v3 | `v3.football.api-sports.io` | leagues, fixtures |
| Basketball | v1 | `v1.basketball.api-sports.io` | leagues, games |
| NBA | v2 | `v2.nba.api-sports.io` | leagues, games |
| NFL | v1 | `v1.american-football.api-sports.io` | leagues, games |
| Hockey | v1 | `v1.hockey.api-sports.io` | leagues, games |
| MMA | v1 | `v1.mma.api-sports.io` | leagues, fights |
| Formula-1 | v1 | `v1.formula-1.api-sports.io` | competitions, races |
| Rugby | v1 | `v1.rugby.api-sports.io` | leagues, games |
| Volleyball | v1 | `v1.volleyball.api-sports.io` | leagues, games |
| Handball | v1 | `v1.handball.api-sports.io` | leagues, games |
| AFL | v1 | `v1.afl.api-sports.io` | leagues, games |

### Global Rate Limiter

All 11 API-Sports endpoints **share a single rate limit** of 100 requests per day (free tier).

```typescript
// Singleton rate limiter for all API-Sports endpoints
class GlobalRateLimiter {
    private static instance: GlobalRateLimiter;
    private dailyCount = 0;
    private dailyLimit: number;
    private lastResetDate: string;

    static getInstance(): GlobalRateLimiter {
        if (!this.instance) {
            this.instance = new GlobalRateLimiter();
        }
        return this.instance;
    }

    canMakeRequest(): boolean {
        this.checkDailyReset();
        return this.dailyCount < this.dailyLimit;
    }

    recordRequest(): void {
        this.dailyCount++;
    }

    getUsageStats() {
        return {
            dailyCount: this.dailyCount,
            dailyLimit: this.dailyLimit,
            remaining: this.dailyLimit - this.dailyCount,
            percentUsed: Math.round((this.dailyCount / this.dailyLimit) * 100),
        };
    }
}
```

### Configuration

```env
# Shared API key for all API-Sports endpoints
APIFOOTBALL_API_KEY=your_api_sports_key_here

# Rate limiting
APISPORTS_REQUESTS_PER_DAY=100
APISPORTS_REQUESTS_PER_MINUTE=30
```

### Headers

```
x-apisports-key: {API_KEY}
```

### Client Implementation

```typescript
// apps/api/src/modules/sports/clients/api-sports.client.ts

export class APISportsClient extends BaseSportsClient {
    private currentSport: string = 'football';
    private globalLimiter = GlobalRateLimiter.getInstance();
    
    setSport(sport: string): void {
        this.currentSport = sport;
    }
    
    async getLeagues(): Promise<SportsLeague[]> {
        if (!this.globalLimiter.canMakeRequest()) {
            throw new Error('Daily API-Sports limit exceeded');
        }
        
        const config = SPORT_API_CONFIGS[this.currentSport];
        const response = await this.makeRequest(`${config.baseUrl}/${config.endpoints.leagues}`);
        this.globalLimiter.recordRequest();
        
        return response.response.map(this.transformLeague);
    }
    
    async getUpcomingGames(): Promise<SportsEvent[]> {
        const config = SPORT_API_CONFIGS[this.currentSport];
        const response = await this.makeRequest(
            `${config.baseUrl}/${config.endpoints.games}?date=${today}`
        );
        return response.response.map(this.transformGame);
    }
    
    async getLiveGames(): Promise<SportsEvent[]> {
        const config = SPORT_API_CONFIGS[this.currentSport];
        const response = await this.makeRequest(
            `${config.baseUrl}/${config.endpoints.games}?live=all`
        );
        return response.response.map(this.transformGame);
    }
    
    getUsageStats() {
        return this.globalLimiter.getUsageStats();
    }
}
```

### Usage Example

```typescript
// Fetch NBA games
const client = new APISportsClient(configService);
client.setSport('nba');
const nbaGames = await client.getUpcomingGames();

// Check usage
const usage = client.getUsageStats();
console.log(`API calls: ${usage.dailyCount}/${usage.dailyLimit}`);
```

### Key Endpoints

#### Get Leagues
```
GET /leagues?season=2026
```

**Example Response:**
```json
{
  "response": [
    {
      "league": {
        "id": 39,
        "name": "Premier League",
        "type": "League",
        "logo": "https://..."
      },
      "country": {
        "name": "England",
        "code": "GB",
        "flag": "https://..."
      },
      "seasons": [...]
    }
  ]
}
```

#### Get Fixtures (Matches)
```
GET /fixtures?league={league_id}&season={year}
```

**Live matches:**
```
GET /fixtures?live=all
```

**Example Response:**
```json
{
  "response": [
    {
      "fixture": {
        "id": 868123,
        "date": "2026-01-20T15:00:00+00:00",
        "status": {
          "long": "First Half",
          "short": "1H",
          "elapsed": 35
        },
        "venue": {
          "name": "Emirates Stadium",
          "city": "London"
        }
      },
      "teams": {
        "home": {
          "id": 42,
          "name": "Arsenal",
          "logo": "https://..."
        },
        "away": {
          "id": 49,
          "name": "Chelsea",
          "logo": "https://..."
        }
      },
      "goals": {
        "home": 2,
        "away": 1
      }
    }
  ]
}
```

#### Get Betting Odds
```
GET /odds?fixture={fixture_id}
```

**Example Response:**
```json
{
  "response": [
    {
      "bookmakers": [
        {
          "name": "Bet365",
          "bets": [
            {
              "name": "Match Winner",
              "values": [
                { "value": "Home", "odd": "1.85" },
                { "value": "Draw", "odd": "3.40" },
                { "value": "Away", "odd": "4.20" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Client Implementation

```typescript
// apps/api/src/modules/sports/clients/api-football.client.ts

export class APIFootballClient extends BaseSportsClient {
  private readonly baseUrl = 'https://v3.football.api-sports.io';
  private readonly headers: Record<string, string>;
  
  constructor() {
    super();
    this.headers = {
      'x-rapidapi-key': process.env.APIFOOTBALL_API_KEY || '',
      'x-rapidapi-host': 'v3.football.api-sports.io',
    };
  }
  
  async getFixtures(leagueId: number, season: number): Promise<SportsEvent[]> {
    const response = await this.rateLimitedRequest(() =>
      fetch(`${this.baseUrl}/fixtures?league=${leagueId}&season=${season}`, {
        headers: this.headers,
      })
    );
    
    const data = await response.json();
    return data.response.map(this.transformFixture);
  }
  
  async getLiveFixtures(): Promise<SportsEvent[]> {
    const response = await this.rateLimitedRequest(() =>
      fetch(`${this.baseUrl}/fixtures?live=all`, {
        headers: this.headers,
      })
    );
    
    const data = await response.json();
    return data.response.map(this.transformFixture);
  }
  
  async getOdds(fixtureId: number): Promise<OddsData> {
    const response = await this.rateLimitedRequest(() =>
      fetch(`${this.baseUrl}/odds?fixture=${fixtureId}`, {
        headers: this.headers,
      })
    );
    
    const data = await response.json();
    return this.extractBestOdds(data.response);
  }
}
```

---

## Rate Limiting Implementation

### Token Bucket Algorithm

```typescript
// apps/api/src/modules/sports/clients/base-sports.client.ts

export abstract class BaseSportsClient {
  private requestQueue: Promise<void> = Promise.resolve();
  private minDelayMs = 1000; // 1 second between requests
  
  protected async rateLimitedRequest<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        try {
          await this.delay(this.minDelayMs);
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Retry Logic

```typescript
protected async withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await this.delay(delay);
      
      this.logger.warn(`Retry ${attempt + 1}/${maxRetries}: ${error.message}`);
    }
  }
  
  throw lastError!;
}
```

---

## Circuit Breaker Pattern

The API clients implement a circuit breaker to prevent cascading failures when external APIs are unavailable.

### States

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, requests pass through |
| **OPEN** | Fail fast, no requests sent (API down) |
| **HALF_OPEN** | Testing recovery, limited requests |

### Configuration

```typescript
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,      // Failures before opening
  successThreshold: 3,      // Successes to close from half-open
  resetTimeoutMs: 30000,    // Time in OPEN before testing (30s)
};
```

### Implementation

```typescript
// apps/api/src/modules/sports/clients/base-sports.client.ts

enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class BaseSportsClient {
  private circuitState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  
  protected async makeRequest<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state before making request
    if (!this.checkCircuitBreaker()) {
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }
    
    try {
      const result = await this.rateLimitedRequest(fn);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  private checkCircuitBreaker(): boolean {
    if (this.circuitState === CircuitBreakerState.CLOSED) {
      return true;
    }
    
    if (this.circuitState === CircuitBreakerState.OPEN) {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.circuitState = CircuitBreakerState.HALF_OPEN;
        this.logger.log('Circuit breaker → HALF_OPEN (testing recovery)');
        return true;
      }
      return false;
    }
    
    // HALF_OPEN: allow limited requests
    return true;
  }
  
  private recordSuccess(): void {
    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.logger.log('Circuit breaker → CLOSED (recovered)');
      }
    }
  }
  
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      this.circuitState = CircuitBreakerState.OPEN;
      this.successCount = 0;
      this.logger.warn('Circuit breaker → OPEN (failed during recovery)');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.circuitState = CircuitBreakerState.OPEN;
      this.logger.warn('Circuit breaker → OPEN (threshold reached)');
    }
  }
  
  // Admin method to manually reset
  public resetCircuitBreaker(): void {
    this.circuitState = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.logger.log('Circuit breaker manually reset');
  }
  
  // Get current status for monitoring
  public getCircuitBreakerStatus() {
    return {
      state: this.circuitState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
```

### Monitoring

```typescript
// Check circuit breaker status
const status = theSportsDBClient.getCircuitBreakerStatus();
console.log(status);
// { state: 'CLOSED', failureCount: 0, successCount: 0, lastFailureTime: 0 }
```

---

## Data Transformation

### Unified Event Model

Both APIs return different structures. We normalize to a single format:

```typescript
interface SportsEvent {
  id: string;
  externalId: string;
  sport: SportType;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  name: string;
  startTime: Date;
  status: EventStatus;
  statusDetail: string;
  homeScore: number;
  awayScore: number;
  venue?: string;
  metadata: Record<string, any>;
}
```

### TheSportsDB Transformation

```typescript
private transformEvent(raw: any): Partial<SportsEvent> {
  return {
    externalId: raw.idEvent,
    name: raw.strEvent,
    homeTeamId: raw.idHomeTeam,
    awayTeamId: raw.idAwayTeam,
    startTime: this.parseDateTime(raw.dateEvent, raw.strTime),
    status: this.mapStatus(raw.strStatus),
    statusDetail: raw.strProgress || raw.strStatus,
    homeScore: parseInt(raw.intHomeScore) || 0,
    awayScore: parseInt(raw.intAwayScore) || 0,
    venue: raw.strVenue,
  };
}

private mapStatus(status: string): EventStatus {
  const statusMap: Record<string, EventStatus> = {
    'Not Started': 'scheduled',
    'Match Finished': 'finished',
    '1H': 'live',
    '2H': 'live',
    'HT': 'halftime',
    'Postponed': 'postponed',
    'Cancelled': 'cancelled',
  };
  return statusMap[status] || 'scheduled';
}
```

### API-Football Transformation

```typescript
private transformFixture(raw: any): Partial<SportsEvent> {
  return {
    externalId: String(raw.fixture.id),
    name: `${raw.teams.home.name} vs ${raw.teams.away.name}`,
    startTime: new Date(raw.fixture.date),
    status: this.mapAPIFootballStatus(raw.fixture.status.short),
    statusDetail: `${raw.fixture.status.elapsed}' - ${raw.fixture.status.long}`,
    homeScore: raw.goals.home || 0,
    awayScore: raw.goals.away || 0,
    venue: raw.fixture.venue?.name,
    metadata: {
      homeTeamLogo: raw.teams.home.logo,
      awayTeamLogo: raw.teams.away.logo,
      referee: raw.fixture.referee,
    },
  };
}
```

---

## Sync Scheduling

### Cron Jobs

```typescript
// apps/api/src/modules/sports/sports-sync.service.ts

@Injectable()
export class SportsSyncService {
  private syncIntervals = {
    live: 5 * 60 * 1000,      // 5 minutes
    upcoming: 60 * 60 * 1000, // 1 hour
    leagues: 24 * 60 * 60 * 1000, // 24 hours
  };
  
  startScheduledSync() {
    // Live events - high frequency
    setInterval(() => this.syncLiveEvents(), this.syncIntervals.live);
    
    // Upcoming events - medium frequency
    setInterval(() => this.syncUpcomingEvents(), this.syncIntervals.upcoming);
    
    // Leagues - low frequency
    setInterval(() => this.syncLeagues(), this.syncIntervals.leagues);
    
    this.logger.log('Scheduled sync started');
  }
}
```

---

## Error Handling

### API Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process data |
| 429 | Rate limited | Wait and retry |
| 401 | Invalid API key | Check credentials |
| 500 | Server error | Retry with backoff |

### Error Logging

```typescript
try {
  const data = await this.fetchFromAPI(endpoint);
  return data;
} catch (error) {
  await this.logSyncError({
    syncType: 'events',
    sport,
    dataSource: 'thesportsdb',
    errorMessage: error.message,
    stackTrace: error.stack,
  });
  throw error;
}
```

---

## ETL Integration

### Multi-Source Sync

The ETL Orchestrator combines data from both TheSportsDB and API-Sports:

```typescript
// apps/api/src/modules/sports/sports-etl-orchestrator.service.ts

async syncSport(sport: SportType, syncType: 'leagues' | 'games' | 'live') {
    const allData: SportsEvent[] = [];
    
    // 1. Fetch from TheSportsDB
    if (this.config.enableTheSportsDB) {
        const tsdbData = await this.theSportsDBClient.getEventsByDate(today, sport);
        allData.push(...tsdbData);
    }
    
    // 2. Fetch from API-Sports
    if (this.config.enableAPISports && this.apiSportsClient.canMakeRequest()) {
        this.apiSportsClient.setSport(sport);
        const apiData = await this.apiSportsClient.getUpcomingGames();
        allData.push(...apiData);
    }
    
    // 3. Deduplicate (API-Sports priority = 100 > TheSportsDB = 50)
    const deduplicated = this.deduplicateEvents(allData);
    
    // 4. Upsert to database
    await this.sportsService.upsertEvents(deduplicated.items);
    
    // 5. Publish to RabbitMQ
    for (const event of deduplicated.items) {
        await this.sportsMessagingService.publishEventUpdate(event);
    }
}
```

### Deduplication

```typescript
const DATA_SOURCE_PRIORITY: Record<DataSource, number> = {
    [DataSource.APIFOOTBALL]: 100,
    [DataSource.APIBASKETBALL]: 100,
    [DataSource.APINBA]: 100,
    [DataSource.APINFL]: 100,
    // ... all API-Sports = 100
    [DataSource.THESPORTSDB]: 50,
    [DataSource.MANUAL]: 25,
};
```

---

*Last Updated: January 15, 2026*
*Version: 2.0 - Multi-Sport API Integration*
