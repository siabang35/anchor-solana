# FIFA World Cup 2026 Simulation & Real-time Integration

This document outlines the architecture, database schema, backend orchestration, and frontend user experience implemented for the live-simulated FIFA World Cup 2026 tournament on the ExoDuZe forecasting platform.

---

## 1. Overview & Objectives

To validate and showcase the platform's ability to handle high-frequency, real-time sports prediction markets, we simulated the final stages of the **FIFA World Cup 2026** (Semifinals & Grand Final). 

The simulation features:
* **Interactive Live Bracket**: Real-time visualization of the tournament's progression.
* **Autonomous Match Progression**: Matches transition from `scheduled` to `live` (with live-updating scores and match minutes) and finally to `finished`.
* **Instant Pool Settlement**: Automatic resolution of corresponding prediction markets and staking pools immediately after a match concludes.

---

## 2. System Architecture

```mermaid
graph TD
    DB_Seed[101_fifa_world_cup_simulation.sql] -->|Seeds initial| DB[(PostgreSQL Database)]
    Orchestrator[SportsETLOrchestrator] -->|1. Seeds data after 1s| DB
    Orchestrator -->|2. Runs simulation ticks every 10s| DB
    Orchestrator -->|3. Resolves finished matches| DB
    Orchestrator -->|4. Triggers RPC settle_competition_pool| DB
    Orchestrator -->|5. Publishes score updates| Msg[SportsMessagingService]
    Msg -->|Broadcasts live scores| WS[Websocket Gateway]
    WS -->|Real-time update| UI[Frontend React Bracket]
```

### A. Database Layer (`PostgreSQL & Supabase`)
The simulation state is persisted and driven by PostgreSQL:
1. **Dynamic Enum Extensions**: The database initialization scripts dynamically patch enums (adding `sports` to `market_category_type` and `apifootball` to `market_data_source_type`) to prevent schema violations.
2. **Sports Events Table (`sports_events`)**: Stores details of simulated matches, including teams, scores, elapsed match time, and match status (`scheduled`, `live`, `finished`).
3. **Competitions Linking (`used_competition_sources`)**: Maps simulated matches to forecast competitions, allowing the orchestrator to automatically resolve prediction pools.
4. **Lifecycle Auto-Settle RPC (`auto_settle_expired_competitions()`)**: A database function that processes expired active competitions as a fallback.

### B. Backend Layer (`NestJS`)
1. **Match Timeline Engine (`SportsETLOrchestrator`)**:
   * **Initialization**: Automatically seeds or resets the simulation 1 second after application boot.
   * **State Management**: Evaluates the match status against real time:
     * **Semifinal 1 (France vs Spain)**: Starts at `T + 1 minute`. Lasts 3 minutes.
     * **Semifinal 2 (England vs Argentina)**: Starts at `T + 2 minutes`. Lasts 3 minutes.
     * **Grand Final (Winner SF1 vs Winner SF2)**: Starts at `T + 6 minutes`. Lasts 3 minutes.
     * During the active phase, scores update dynamically along with match minutes (scaled to map 3 real-world minutes to 90 game-world minutes).
   * **Pool Resolution**: Calls the `settle_competition_pool` database function once a match concludes.
2. **Robust Real-time Messaging (`SportsMessagingService`)**:
   * Bridges database entities and live clients by emitting events over the local `EventEmitter`.
   * Modified to be structure-agnostic: seamlessly processes both camelCase domain model classes and raw snake_case database records without throwing null-pointer/undefined exceptions on `startTime.toISOString()`.

### C. Frontend Layer (`Next.js / React`)
* **Dedicated Component (`WorldCupBracket.tsx` & `WorldCupBracket.css`)**:
  * **Premium Glassmorphism**: Tailored HSL dark-themed styling matching the ExoDuZe branding.
  * **Interactive Highlights**: Dynamic glowing card outlines around the selected active competition.
  * **Real-time Animations**: Pulsing live indicators, sliding/fading elements, and SVG connector paths connecting Semifinals to the Grand Final.
  * **Fully Responsive**: Implemented using pure CSS grid layouts optimized for both mobile and desktop screens.

---

## 3. Configuration & Reseed Guide

### Resetting the Simulation
To restart the simulation timeline (re-schedule matches to start in 1, 2, and 6 minutes from the current time), execute the seeding SQL file:
```bash
# From the api directory
node run_seed.js
```
This drops existing World Cup events/competitions and re-inserts them with start times relative to `NOW()`.

### Live Subscriptions
The frontend subscribes to real-time database updates via the Supabase Realtime channel:
* Channel: `sports-events-realtime-bracket`
* Target: `public:sports_events`

---

## 4. Key Data Models

### Sports Event Schema
```json
{
  "id": "a7d7f766-1c2c-4b5b-8c8d-111111111111",
  "external_id": "wc2026_sf1",
  "name": "France vs Spain",
  "source": "apifootball",
  "status": "live",
  "home_score": 1,
  "away_score": 0,
  "elapsed_time": 40,
  "start_time": "2026-07-13T13:03:37.124Z"
}
```

### Linked Competition Schema
```json
{
  "id": "a7d7f766-1c2c-4b5b-8c8d-444444444441",
  "title": "Will France defeat Spain in the World Cup Semifinal?",
  "sector": "sports",
  "status": "active"
}
```
