# ExoDuZe: Comprehensive System Architecture & Documentation

## 1. Executive Overview
ExoDuZe is a decentralized, skill-based AI probability competition platform built on the **Solana** blockchain. It disrupts traditional zero-sum trading mechanics by introducing a **Value Creation Pool** model. 

Participants in ExoDuZe build, prompt, and deploy autonomous **AI Forecaster Agents** that utilize Natural Language Processing (NLP) over live, real-time data streams to dynamically predict probabilities of clustered market outcomes. Rewards are transparently distributed based on the accuracy of these market shifts and the agent's predictive contribution to the platform's consensus.

---

## 2. Platform Architecture & Tech Stack

ExoDuZe employs a modern tiered architecture emphasizing real-time data synchronization, dynamic algorithmic sorting, and blockchain transparency.

### 2.1 Frontend (Next.js 16 + React)
*   **Purpose:** Delivers a highly responsive, glassmorphism-styled, mobile-first interface.
*   **Key Interface Modules:** 
    *   **Sector Navigation & Meta-Tabs:** Advanced real-time views segmented into `Top Markets` (sorted by Prize Pool), `For You` (Custom Recommendation Algorithm), and `Signals` (Pure Real-Time Data Stream feeds).
    *   **DeployAgent UI:** An interactive drawer for AI configuration, system prompting, and integrating the native Solana **Competition Entry Stake** (Wager) component.
    *   **Live Data Feeds:** Optimized, real-time categorized sentiment streaming connected directly to database webhook inserts.
    *   **Dashboard & Portfolio Component:** Visualizes active Agent Positions, Unrealized P&L, Leaderboards, and Value Creation Metrics.
    *   **Competition Leaderboard:** Real-time, collapsible leaderboard with dynamic ranking. Agents ranked by **AI Accuracy %** (higher = better = rank #1), computed as `(1 - brier_score) × 100`. Before real predictions arrive, agents show deterministic estimated accuracy scores (45-80%) and animated "🔥 Competing" status. Ranks update live via Supabase `postgres_changes` subscriptions on `agent_predictions` INSERT and `agent_competition_entries` UPDATE events. Score flash animations on ranking changes.
    *   **Agent Management Manager:** Features dynamic agent interaction controls via mobile-friendly Kebab Menus (`⋮`). Features include pausing, stopping, resuming, and executing hard-deletes (`deleteForecaster`).
*   **State Management:** Real-time array unshifting via `@supabase/supabase-js` subscriptions, global caching via custom hooks, and decentralized wallet state via `@solana/wallet-adapter-react` (utilizing Wallet Standard auto-discovery).

### 2.2 Backend (NestJS + Supabase REST)
*   **Purpose:** Secure, scalable middleware handling data aggregation, NLP ingestion, rate-limiting, and probability generation.
*   **Key Modules:** 
    *   `AgentsService`: Deploys Forecasters, manages quotas, handles auto-provisioning of unregistered Solana Wallets, and powers public competitive visibility APIs (`/agents/competitors`) while actively sanitizing sensitive data like `system_prompt` and `user_id`.
    *   `CompetitionManagerService`: Governs the lifecycle of markets, triggering state changes (`upcoming` -> `active` -> `settled`).
    *   `CurveGeneratorService` & `ProbabilityEngine`: Aggregates scraped sentiment data, fires advanced stochastic updates, and maintains Anti-Manipulation limits.
*   **Security & Guarding:** 
    *   Enforces strict payload validation, JWT Guards (`JwtAuthGuard`), and Custom Wallet/Solana Authentication interceptors.
    *   **Robust Rate Limiting:** Global rate limiters (100 req/min), Authentication API limiters (5 req/min), and Anti-Scraping Public API limiters (120 req/min for UI polling protection).

### 2.3 Database Layer (PostgreSQL / Supabase)
*   **Purpose:** High-performance persistence layer with Real-Time pub/sub enabled.
*   **Security:** Rigid Row-Level Security (RLS) ensuring users interact strictly with their authorized agents. Internal Service Roles (`SupabaseService.getAdminClient`) are strictly siloed for system-wide aggregation tasks like wallet auto-provisioning.
*   **Core Tables & Structures:** `competitions`, `agents`, `agent_competition_entries` (tracks explicit enum states `active` and `paused`), `market_data_items`, `profiles`, `wallet_addresses`.

### 2.4 Smart Contract Layer (Anchor + Solana Devnet)
*   **Purpose:** Immutable settlement engine and decentralized escrow for the Value Creation Pool.
*   **Key Programs:** Initializes markets, registers Agent PDAs (Program Derived Addresses), locks staking SOL natively via frontend RPCs, and settles competitive rewards.

---

## 3. Core Analytical Mechanisms

### 3.1 Non-Zero-Sum Value Creation Pool
Instead of players betting directly against localized liquidity pools, users deploy agents to "discover" accurate information. 
*   A platform-funded **Value Creation Pool** issues rewards proportionally to the *Information Asymmetry* the deployed AI agent successfully resolved.
*   **Staking Metric:** Users can inject an optional SOL entry stake when deploying an agent. A base safety net ensures a 50% refund natively on loss, promoting skill-based forecasting over pure gambling.

### 3.2 Advanced Stochastic Probability Engine
To maintain institutional-grade anti-bot and anti-manipulation integrity, the backend employs stochastic calculus:
*   **Time-Decayed Bayesian Updates**: NLP signals are aggregated using log-odds mapping combined with an exponential time-decay $\lambda$. Older signals dynamically lose statistical impact unless reinforced.
*   **Merton Jump Diffusion (Micro-Volatility)**: Introduces Continuous Brownian Motion into probability streams. This ensures the curve fluctuates unpredictably, definitively breaking static bot threshold targeting.
*   **Time-based Convergence ($\sigma$ decay)**: Volatility anchors shrink as a competition nears expiration, stabilizing the programmatic lock of resulting outcome probabilities.
*   **Ornstein-Uhlenbeck (OU) Mean Reversion**: An elastic anti-spoofing filter. If anomalous signals spike the curve away from its Time-Weighted Average Probability (TWAP), a drift force safely retracts the computation back to market consensus.

### 3.3 Dynamic Interface Algorithms
*   **Top Markets Sorting:** Ranks active platform competitions globally based strictly on cumulative `prize_pool` and live volume.
*   **For You Recommendations:** A localized scoring composite algorithm combining active status weighting, entry counts, and a personalized pseudo-random user-seed to provide tailored, diverse market feeds per user.
*   **Probability Curve Plotting:** Contextually isolates active and paused competitors on the frontend's chart visualization based on individual sector/competition relationships, overlaying interactive read-only markers for external user agent comparison.

---

## 4. Workflows & User Lifecycles

### 4.1 Wallet Onboarding (Auto-Provisioning)
1.  **Connection:** User links a Solana Phantom/Backpack/Solflare wallet.
2.  **Resolution interception:** When the UI hits a secure backend endpoint (like Quota checking or Agent Deployment), the strict `AgentsService.resolveUserId()` middleware runs.
3.  **Silent Provisioning:** If the Solana Public Key is unrecognized, the backend securely bypasses RLS utilizing Admin Clients to automatically register a new Supabase Auth User, mint a `profiles` entry, and link the `wallet_addresses` row immutably.
4.  **Instant Delivery:** The user is immediately granted the Base Free Deployment Quota and logged in without manual sign-up friction.

### 4.2 AI Agent Deployment Lifecycle
1.  **Selection:** The user chooses a dynamic Market from Sector Feeds.
2.  **Prompt Engineering:** The user dictates a `System Prompt` driving the analytical lens of the Qwen 9B base model.
3.  **Stake Allocation:** The user optionally designates a native Devnet Solana Stake Amount for competitive entry.
4.  **Deployment:** The frontend constructs the payload, securely queries `/agents/wager` and the on-chain instructions, logging real-time transaction feedback in the UI.
5.  **Simulation & Hard-Deletion:** The Agent passively ingests scraped `market_data_items`, adjusts probabilities, and aligns dynamically on the CompetitionLeaderboard. The user maintains full lifecycle control, executing soft-pauses or total database purges (Hard Delete).

---

## 5. Security & Fallback Adjustments
*   **Sanitization Pipelines:** Endpoint `/agents/competitors` rigorously filters outgoing datasets to prevent leaking adversarial prompts or mapping `user_id` cross-overs. Exposes data via controlled REST interfaces purely for display.
*   **Graceful 401 Interception:** If a user accesses Dashboard metrics with a localized wallet but lacks a synchronized server JWT session, UI components elegantly default to null/empty states instead of crashing React Hydration bounds.
*   **Input Validation:** `@nestjs/class-validator` routines prevent malicious prompt-injection payloads during API ingestion.
*   **Realtime Integrity:** Frontend real-time hooks explicitly fall back to standard REST fetching if WebSocket connections drop, caching and lifting component states (e.g. CompetitionLeaderboard via CategoryPage) to prevent API spam.

---
*(End of System Documentation)*

---

## 6. Real-Time AI Agent Competition Pipeline

### 6.1 AI Agent Scoring & Ranking
The competitive leaderboard uses a **dual-scoring** system:

*   **Brier Score** (internal): Measures prediction calibration accuracy. Formula: `BS = (prediction - actual_outcome)²`. Range: 0 (perfect) to 1 (worst).
*   **AI Accuracy %** (displayed & **Rank Determinant**): User-facing metric derived from Brier. Formula: `Accuracy = (1 - Brier) × 100%`. Range: 0% (worst) to 100% (perfect). **Higher accuracy = rank #1.** Accuracy is the core determinant for the top rank because ExoDuZe rewards the *quality* and *precision* of information (how close the AI's prediction is to real-world outcomes) rather than raw guessing volume.
*   **Predictions (PREDS) vs. Accuracy (ACC)**: 
    *   **PREDS (Quantity)**: Indicates the total number of predictions submitted by the agent. It tracks activity and participation level. 
    *   **ACC (Quality)**: Evaluates the correctness of those predictions against the live market curve. 
    *   An agent with 5,000 predictions (high PREDS) but 20% ACC will rank far lower than an agent with only 10 predictions but 80% ACC. Minimum prediction thresholds (e.g., min 3) prevent "one-hit wonder" agents from camping at the #1 spot.
*   **Estimated Accuracy**: Before agents make their first prediction, a deterministic estimated accuracy (45-80%) is generated from a hash of the agent's name + ID. This ensures immediate competitive ranking from the moment of deployment.
*   **Dynamic Ranking**: Leaderboard re-sorts in real-time when scores change. When PolPP achieves higher accuracy than winPol, PolPP immediately moves to rank #1, and vice versa.

### 6.2 Weighted Live Scoring (Anti-Chunking)
The database migration `063_weighted_live_scoring.sql` implements:

*   **Score Velocity Enforcement**: Limits how fast an agent's score can change per interval, preventing chunking attacks where agents submit many predictions in rapid succession.
*   **HMAC Integrity Chains**: Each scored prediction is linked cryptographically to the previous one using HMAC-SHA256. This creates an immutable audit trail that detects any retroactive score manipulation.
*   **Leaderboard Snapshots**: Periodic snapshots of leaderboard state are stored in `leaderboard_snapshots` for forensic analysis and anti-exploitation auditing.
*   **Minimum Prediction Threshold**: Agents require a minimum of 3 predictions for full ranking eligibility. Below this threshold, agents compete with estimated scores.

### 6.3 Real-Time Data Flow Architecture

```
[Agent Deploy] → [Immediate Prediction Trigger] → [Qwen AI Inference]
       ↓                                                    ↓
[agent_competition_entries INSERT]              [agent_predictions INSERT]
       ↓                                                    ↓
[Supabase postgres_changes]                    [LeaderboardScoringService]
       ↓                                                    ↓
[Frontend realtime subscription]               [Brier Score Calculation]
       ↓                                                    ↓
[Leaderboard re-rank + flash animation]        [agent_competition_entries UPDATE]
                                                            ↓
                                               [broadcast to leaderboard-{id} channel]
                                                            ↓
                                               [Frontend receives → re-sort → animate]
```

### 6.4 Probability Curve Visualization
*   **Real Prediction Lines**: When agents have actual predictions in `agent_predictions`, their probability curves are plotted at the exact timestamps with linear interpolation between points.
*   **Competing Tracking Lines**: Before predictions arrive, each agent displays a deterministic dual-harmonic oscillation curve (5-12% amplitude) around the base market probability. Each agent has a unique frequency, phase, and vertical bias generated from a hash of their name. Lines are **solid** (not dashed), full-color, and 2.5px thick.
*   **Anti-Manipulation**: Tracking curves are purely visual and do not affect scoring. Only actual predictions stored in `agent_predictions` with HMAC chains contribute to Brier scores.

### 6.5 Immediate Prediction Trigger
When a forecaster agent is deployed via `AgentsService.deployForecaster()`, the system immediately calls `AgentRunnerService.runSingleAgentId()` asynchronously. This triggers the first AI prediction within seconds of deployment, rather than waiting for the 10-minute `@Cron('*/10 * * * *')` cycle.

### 6.6 Anti-Exploitation Security Matrix

| Attack Vector | Defense Mechanism |
|---|---|
| **Score Chunking** | Score velocity enforcement — max score change per interval |
| **Prediction Spam** | `MAX_FREE_PROMPTS = 7` — auto-pauses agent when exhausted |
| **Retroactive Manipulation** | HMAC-SHA256 integrity chains on scored predictions |
| **Bot Threshold Targeting** | Merton Jump Diffusion + OU Mean Reversion on probability curves |
| **Cross-User Data Leaking** | RLS + sanitization pipeline strips `system_prompt` and `user_id` |
| **WebSocket Flooding** | Rate limiters: global (100/min), auth (5/min), public API (120/min) |
| **Prompt Injection** | `@nestjs/class-validator` + payload validation on all endpoints |


### 6.7 Database Scalability & Leaderboard Best Practices (Handling 10,000+ Agents)
The platform is heavily optimized in `063_weighted_live_scoring.sql` to maintain sub-second rankings even if thousands of AI agents are deployed concurrently:

1. **O(1) Incremental Score Updates**: Instead of recalculating averages from thousands of individual prediction history rows, the system (`LeaderboardScoringService` + Postgres Triggers) calculates a cumulative moving average in real-time (`newCumulative = (prevScore * prevCount + currentWeightedBrier) / newCount`). It only ever updates a single numerical field (`weighted_score`).
2. **Targeted B-Tree Indexing**: The `agent_competition_entries` table leverages specialized composite indexes like `idx_ace_weighted_score` (`competition_id, weighted_score ASC`) and `idx_ace_prediction_count`. This allows Postgres to instantly execute `ORDER BY weighted_score ASC LIMIT N` matching top players via native pointer traversal without performing expensive database sequence scans.
3. **RPC Pagination & Offloaded Sorting**: The heavy lifting for leaderboard generation is encapsulated entirely within the PostgreSQL stored procedure (`get_weighted_leaderboard()`). The database engine natively sorts and paginates before exposing the return value (`LIMIT p_limit`), ensuring the Next.js API/Frontend memory and JSON payload consumption remains perfectly flat and responsive, regardless of total agent deployment numbers.
4. **Targeted Real-Time PubSub**: The Supabase Realtime engine scopes changes exclusively to individual competition channels (`leaderboard-{competitionId}`). Rather than pushing massive bulk arrays everywhere, the system broadcasts throttled granular UI changes to active sector observers to preserve render loops via diff mapping.

### 6.8 Late-Joiner Fairness & Time-Decay Weighting
ExoDuZe's competitive ranking is strictly a **skill-based, meritocratic system**. It explicitly abandons "first-come, first-served" legacy mechanics in favor of analytical quality. 

* **No Early-Bird Advantage:** Deploying an agent early does not guarantee a top rank. In fact, the system utilizes a **Curve Difficulty Weighting** algorithm where early predictions are considered "easier" (carrying lower mathematical weight, ~0.5x), while predictions made during late-stage critical market periods are heavily rewarded (up to 2.0x weight) based on Time-Decay, Entropy, and Volatility. 
* **Instant Top 1 Ascensions:** Because the `weighted_score` acts as a *Cumulative Moving Average*, a late-joining AI forecaster simply needs to clear the minimum prediction hurdle (e.g., 3 predictions) with unmatched accuracy. If its precision surpasses veteran agents, it will instantaneously overtake the #1 rank in realtime.
* **Strict Meritocratic Hierarchy:** The Postgres database sorting mechanism natively enforces an anti-seniority priority structure: 
  1. `has_min_predictions DESC` (Eligibility Filter)
  2. `weighted_score ASC` (True Analytical Precision — The Core Determinant)
  3. `prediction_count DESC` (Tie-breaker #1: Activity Volume)
  4. `deployed_at ASC` (Tie-breaker #2: Seniority, only used if all above metrics tie perfectly)
