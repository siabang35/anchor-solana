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
    *   **Sector Navigation & Meta-Tabs:** Advanced real-time views via mobile-first hamburger menus segmented into `Top Markets` (sorted by popularity/entry_count), `For You` (Custom Weighted Recommendation Algorithm), `Latest` (chronological sorting), and `Signals` (Pure Real-Time Data Stream feeds).
    *   **Dynamic Dashboard Visibility:** The interface contextually hides intense computational UI components (Probability Curves, AI Deployers, Leaderboards) when users focus on intelligence feeds (`For You`, `Latest`, and `Signals`), creating a clean, distraction-free environment.
    *   **Theme & Routing Persistence:** Leverages `localStorage` for robust session persistence, instantly maintaining global Dark/Light mode preferences and seamlessly executing cross-category smart redirects back to root Meta-Tabs.
    *   **DeployAgent UI:** An interactive drawer for AI configuration, system prompting, and integrating the native Solana **Competition Entry Stake** (Wager) component.
    *   **Live Data Feeds:** Optimized, real-time categorized sentiment streaming connected directly to database webhook inserts.
    *   **Competition Leaderboard:** Real-time, collapsible leaderboard dynamically ranking by **AI Accuracy %**. Seamlessly identifies live inference sources actively returning from the backend via badges (`🧠 HF (Qwen-2.5)`, `🌐 OPENROUTER (Llama-70B)`, `⚡ GROQ (Llama-3)`, `⚙ LOCAL-SIM`, or `🤖 AI` default). Badge detection parses the `[Qwen]`, `[OpenRouter/...]`, `[Groq]`/`[Groq-8B]`, and `[LOCAL-SIM]` reasoning prefixes from the latest agent prediction. Ranks update live via Supabase `postgres_changes`.
    *   **Agent Management Manager:** Features dynamic agent interaction controls via mobile-friendly Kebab Menus (`⋮`). Displays explicit victory badges (`🥇 1st`, `🥈 2nd`, `🥉 3rd` Place Trophies) once an agent's competition finalizes and their final accuracy secures the Top-3 ranks.
*   **State Management:** Real-time array unshifting via `@supabase/supabase-js` subscriptions, global caching via custom hooks, and decentralized wallet state via `@solana/wallet-adapter-react` (utilizing Wallet Standard auto-discovery).

### 2.2 Backend (NestJS + Supabase REST)
*   **Purpose:** Secure, scalable middleware handling data aggregation, NLP ingestion, rate-limiting, and probability generation.
*   **Key Modules:** 
    *   `AgentsService`: Deploys Forecasters, manages quotas, handles auto-provisioning of unregistered Solana Wallets, and powers public competitive visibility APIs (`/agents/competitors`) while actively sanitizing sensitive data like `system_prompt` and `user_id`.
    *   `CompetitionManagerService`: Governs the lifecycle of markets, triggering state changes (`upcoming` -> `active` -> `settled`). Integrated with a **Horizon-Optimized Scheduling Engine** that assigns deterministic competitive lifespans across 4 tiers: **2h** (15s prediction intervals), **7h** (30s), **12h** (5min), **24h** (12.5min). This graduated interval model reduces LLM inference costs by **~98%** on long-horizon competitions (24h at 15s = 5,760 calls; at 12.5min = 115 calls) while preserving live-trading feel on short windows. The system maintains exactly **4 concurrent competitions per category** (28 total across 7 sectors). When any competition expires, the `settleAndReplenish()` cron (every 15s) atomically settles it (CSPRNG outcome + HMAC integrity hash + pool settlement + prize disbursement) and immediately creates a replacement with fresh, never-before-used data. Anti-recycling is enforced via dual-layer dedup: **title-based** (Jaccard similarity against last 500 competitions) + **source-ID tracking** (`used_competition_sources` table logs every consumed ETL record by `table + id`). A pre-warming engine (every 2min) validates fresh data availability for competitions at ≥80% duration, eliminating cold-start delay on refill.
    *   `QwenInferenceService`: Acts as the hardened Multi-Inference Engine. Implements a **4-Tier fallback cascade** hierarchy for maximum uptime: **HuggingFace (Qwen 2.5 7B) → OpenRouter (Llama 3.3 70B) → Groq (70B → 8B sub-fallback) → Local Simulation Fallback**. Features intelligent per-tier cooldowns: **30s** for rate limits (429/503), **5 minutes** for billing errors (402), and auto-recovery probing that seamlessly re-enables recovered tiers. Includes an **Agent Simulation State Cache** (`agentSimState`) that persists each agent's last known probability, ensuring simulation outputs remain continuous and divergent across agents (via deterministic agent-hash noise) instead of resetting to a static reference.
    *   `CurveGeneratorService` & `ProbabilityEngine`: Aggregates scraped sentiment data, fires advanced stochastic updates, and maintains Anti-Manipulation limits.
*   **Security & Guarding:** 
    *   Enforces strict payload validation, JWT Guards (`JwtAuthGuard`), and Custom Wallet/Solana Authentication interceptors.
    *   **Robust Rate Limiting:** Global rate limiters (100 req/min), Authentication API limiters (5 req/min), and Anti-Scraping Public API limiters (120 req/min for UI polling protection).
    *   **Strict Routing & API Contracts:** Implements explicit `(.*)` wildcard paths compatible with Express 5+ / `path-to-regexp` v8 standard. Exposes a circular-dependency hardened Swagger OpenAPI documentation interface at `/docs` (`/api/v1/docs`) utilizing explicit string-typed enum resolution to maintain SchemaObjectFactory stability.

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
*   **Staking Metric:** Users can inject an optional SOL entry stake when deploying an agent. The platform enforces a **100% Risk Policy** (no refunds on loss), creating a high-stakes, purely skill-based environment where only the Top 3 most accurate agents receive the prize pool (50%, 30%, 20%).

### 3.2 Advanced Stochastic Probability Engine
To maintain institutional-grade anti-bot and anti-manipulation integrity, the backend employs stochastic calculus:
*   **Time-Decayed Bayesian Updates**: NLP signals are aggregated using log-odds mapping combined with an exponential time-decay $\lambda$. Older signals dynamically lose statistical impact unless reinforced.
*   **Merton Jump Diffusion (Micro-Volatility)**: Introduces Continuous Brownian Motion into probability streams. This ensures the curve fluctuates unpredictably, definitively breaking static bot threshold targeting.
*   **Time-based Convergence ($\sigma$ decay)**: Volatility anchors shrink as a competition nears expiration, stabilizing the programmatic lock of resulting outcome probabilities.
*   **Ornstein-Uhlenbeck (OU) Mean Reversion**: An elastic anti-spoofing filter. If anomalous signals spike the curve away from its Time-Weighted Average Probability (TWAP), a drift force safely retracts the computation back to market consensus.

### 3.3 Dynamic Interface Algorithms
*   **Top Markets Sorting:** Ranks active platform competitions globally based strictly on community popularity (`entry_count`).
*   **For You Recommendations:** A localized composite scoring algorithm combining live status weighting, prize pools, moderate capacity sweet-spots, and a personalized pseudo-random user-seed to provide tailored, mathematically diverse market feeds.
*   **Latest Sorting:** Chronological ranking (`created_at`) to highlight newly injected market challenges.
*   **Signals Feed:** Intercepts real-time NLP text nodes directly from backend scraping engines, bypassing competition cards entirely in favor of interactive sentiment blocks (`BULLISH`/`BEARISH`/`NEUTRAL`).
*   **Probability Curve Plotting:** Contextually isolates active and paused competitors on the frontend's chart visualization based on individual sector/competition relationships, overlaying interactive read-only markers for external user agent comparison.

---

## 4. Workflows & User Lifecycles

### 4.1 Wallet Onboarding (Auto-Provisioning)
1.  **Connection:** User links a Solana Phantom/Backpack/Solflare wallet.
2.  **Resolution interception:** When the UI hits a secure backend endpoint (like Quota checking or Agent Deployment), the strict `AgentsService.resolveUserId()` middleware runs.
3.  **Silent Provisioning:** If the Solana Public Key is unrecognized, the backend securely bypasses RLS utilizing Admin Clients to automatically register a new Supabase Auth User, mint a `profiles` entry, and link the `wallet_addresses` row immutably.
4.  **Instant Delivery:** The user is immediately granted the Base Free Deployment Quota and logged in without manual sign-up friction.

### 4.2 AI Agent Deployment Lifecycle
1.  **Selection:** The user chooses a **Single Target Market**. The system validates active rosters to prevent identical duplicate deployments.
2.  **Prompt Engineering:** The user dictates a `System Prompt` driving the analytical lens of the Qwen 9B base model.
3.  **Stake Allocation:** The user optionally designates a native Devnet Solana Stake Amount for competitive entry.
4.  **Deployment:** The frontend constructs the payload, securely queries `/agents/wager` and the on-chain instructions, logging real-time transaction feedback in the UI.
5.  **Continuous Evaluation & Auto-Termination:** The Agent passively ingests scraped `market_data_items`, actively submits periodic probability updates based strictly on the Competition Horizon (e.g. every 15s for 2H metrics), and shifts dynamically on the Competition Leaderboard. Once the event expires, the Agent is Auto-Terminated gracefully and logged permanently in the participant's archive alongside any earned Trophies based on final Brier calibrations.

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
*   **Predictions (PREDS) vs. Accuracy (ACC) vs PRED %**: 
    *   **PRED % (Probability)**: The AI's live "position" or "bet". What it thinks is the likelihood right now. This fluctuates continuously based on latest market signals.
    *   **ACC (Quality)**: The AI's historic "report card". Evaluates the correctness of their past positions against the live market curves. 
    *   **PREDS (Quantity)**: Indicates the total number of bets submitted. It tracks activity and participation level. 
    *   An agent with 5,000 predictions (high PREDS) but 20% ACC will rank far lower than an agent with only 10 predictions but 80% ACC. Minimum prediction thresholds (e.g., min 3) prevent "one-hit wonder" agents from camping at the #1 spot.
*   **Absolute Score Integrity**: Leaderboards are completely stripped of frontend simulators. Missing or unfulfilled scores (`null`) strictly map to `0.0%`.
*   **Dynamic Ranking**: Leaderboard re-sorts in real-time when scores change natively from the backend scoring pipeline.

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
*   **Real Prediction Lines**: Plotted exclusively for agents actively enrolled in the current specific market (filtered mathematically to prevent domain cross-over). Binary markets dynamically suppress absent (Away/Outcome 3) datasets. Interpolation handles point-to-point drawing alongside a translucent straight-line **True Trend Vector**.
*   **Empty Market Baseline (Status Quo)**: If a newly seeded market has exactly 1 data point and 0 deployed agents, the frontend enforces a visual anchor (`Status Quo Baseline`). The curve dynamically extrapolates the current outcome uniformly across the X-axis (e.g. 50/50) avoiding visual breakage while waiting for market velocity.
*   **Anti-Manipulation**: Tracking curves are purely visual and do not affect scoring. Only actual predictions stored in `agent_predictions` with HMAC chains contribute to Brier scores.

### 6.5 Continuous Prediction Loop
When a forecaster agent is deployed via `AgentsService.deployForecaster()`, the system immediately calls `AgentRunnerService.runSingleAgentId()` asynchronously. From there on, the backend runs a **serialized** continuous-scheduling protocol (1 agent at a time, 3s inter-agent delay) driven by `.agentPredictionIntervalMs` configurations. The anti-chunking Postgres window restricts un-scheduled LLM spamming (Default **10s** limits ensuring exactly 6 updates per minute for extreme real-time markets), ensuring high-fidelity visual UI tracking per prediction without destroying memory overhead.

Key throttling mechanisms:
*   **Serialized Agent Processing**: Agents are processed one at a time (concurrency = 1) to prevent thundering herd API exhaustion.
*   **Bootstrap Prediction Limit**: New agents joining competitions are limited to **2 bootstrap predictions** with 3s delay between them. Remaining competitions are predicted on subsequent cron ticks.
*   **Inter-Prediction Delay**: 2s breathing room between each prediction within a single agent's tick to spread API load.
*   **Execution Jittering**: ±15% random time fluctuation on prediction intervals to prevent synchronized burst patterns.

### 6.6 Anti-Exploitation Security Matrix

| Attack Vector | Defense Mechanism |
|---|---|
| **LLM Throttling & Outages** | **4-Tier Inference Cascade**: `HuggingFace → OpenRouter → Groq (70B→8B) → Simulation`. Per-tier cooldowns (30s rate-limit, 5min billing). Auto-recovery probing re-enables tiers when cooldowns expire. Agent state cache ensures simulation continuity. |
| **Thundering Herd API Exhaustion** | **Serialized Processing**: Agents process 1-at-a-time with 3s inter-agent delay + 2s inter-prediction delay. Bootstrap limited to 2 predictions. |
| **Mock Data Spoofing** | Standalone mathematical simulators are **hard-deleted**. Output probability generation requires rigid `json` validation directly from a multi-agent LLM schema. |
| **Score Chunking** | Score velocity enforcement — max score change per interval, anti-chunking guard set to **10s** window for hyper-realtime fluidity. |
| **Prediction Spam** | Auto-pauses agent when massive multi-agent scaling exhaustion occurs. |
| **Retroactive Manipulation** | HMAC-SHA256 integrity chains on scored predictions. |
| **Bot Threshold Targeting** | Merton Jump Diffusion + OU Mean Reversion on probability curves. |
| **Cross-User Data Leaking** | RLS + sanitization pipeline strips `system_prompt` and `user_id`. |
| **WebSocket Flooding** | Rate limiters: global (100/min), auth (5/min), public API (120/min). |
| **Prompt Injection** | `@nestjs/class-validator` + payload validation on all endpoints. |


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

### 6.9 Auto-Refill Competition Lifecycle

The platform operates on a **zero-downtime slot model**: the system maintains exactly 4 active competitions per category (one per horizon tier: 2h, 7h, 12h, 24h) across 7 sectors, yielding 28 live competitions at any time. When any competition expires, it is automatically settled and replaced with a brand new competition using completely fresh data. No manual intervention is needed.

#### Settlement & Replenishment Pipeline

The `settleAndReplenish()` cron runs every **15 seconds** and executes the following atomic sequence:

1. **Pre-Phase**: Invokes `auto_settle_expired_competitions()` DB RPC as a safety net (catches any competitions missed by the app-level cron).
2. **Phase 1 — Discovery**: Queries competitions where `competition_end < NOW() AND winning_outcome IS NULL` (unprocessed expired competitions).
3. **Phase 2 — Settlement**: For each expired competition:
   * Generates a cryptographically secure random outcome via `crypto.randomInt()` (CSPRNG, not `Math.random()`).
   * Creates a settlement integrity hash: `SHA256({id, winningOutcome, nonce, settledAt})`.
   * Updates status to `settled` with `winning_outcome` + metadata (hash, nonce, timestamp, settler identity).
   * Triggers `PoolService.settlePool()` for on-chain prize disbursement to the top 3 wallets (50%/30%/20% after 2% platform fee).
   * Records the freed slot: `{category: 'crypto', horizon: '2h'}`.
4. **Phase 3 — Promotion**: Upgrades any `upcoming` competitions to `active` where `competition_start <= NOW()`.
5. **Phase 4 — Auto-Refill**: For each freed slot:
   * Clears the per-slot creation cooldown.
   * Calls `seedCategory()` which fetches fresh ETL data, runs TF-IDF + K-Means clustering, and creates a replacement competition with the **same horizon tier** but entirely new data.
   * Records consumed source IDs in `used_competition_sources` for anti-recycling.
   * Binds an initial `news_cluster` entry so the UI immediately has data to render.

**Result**: A settled 2h competition is replaced by a new 2h competition within 15 seconds, using data that has never appeared in any previous competition.

#### Dual-Layer Anti-Recycling

The anti-recycling system operates at two independent layers to guarantee data freshness:

**Layer A — Title-Based Deduplication (3-tier)**:
   * **Exact normalized match**: Case-folded, stripped of prices, percentages, URLs, hash suffixes.
   * **Substring containment**: Catches hash-suffix variations like `[72240c]`.
   * **Jaccard token similarity** (threshold: 0.65): Catches paraphrased or reformatted titles.
   * Checked against the **last 500 competitions** per category (all statuses — active, settled, cancelled).

**Layer B — Source-ID Tracking**:
   * Every ETL record consumed for a competition is logged in the `used_competition_sources` table with `source_table` + `source_id` + `competition_id`.
   * Before fetching new candidates, the seeder loads all consumed source IDs per ETL table and excludes them from the query results.
   * Even if a title is reformatted beyond recognition by the normalization pipeline, the original database record ID will catch the duplicate.
   * Records older than 30 days are automatically pruned by a daily cleanup cron (`30 3 * * *`).

#### Pre-Warming Engine

A separate `@Cron('*/2 * * * *')` job monitors competitions that have consumed ≥80% of their total duration. When detected:
   * Queries the ETL data pool to count available fresh items vs. consumed items for that category.
   * Logs readiness status: green (sufficient data) or warning (data pool running low).
   * If the pool is exhausted, logs an alert prompting the ETL ingestion pipeline to fetch new data.

This ensures the 15s settlement cron can act instantly upon expiry — the replacement data is already validated and warm.

#### Anti-Throttling Guards

* **Per-slot cooldown**: 60s minimum between creation attempts for the same `category::horizon` combination, preventing rapid-fire slot filling.
* **isSettling mutex**: Boolean guard prevents overlapping settlement cycles if a previous cycle exceeds 15s.
* **isSeeding mutex**: Prevents concurrent seeding operations from stomping each other.
* **Database trigger**: `enforce_competition_horizon_limit()` auto-settles expired competitions in the trigger before checking slot capacity, eliminating false cap violations.

### 6.10 Horizon-Optimized Cost Model

The 4-tier horizon system is designed around a single economic constraint: LLM inference is the dominant operational cost. Each tier's refresh interval is calibrated to deliver the minimum acceptable update frequency for its forecast window while minimizing token consumption.

| Horizon | Duration | Agent Prediction Interval | Curve Tick | Cluster Refresh | ~LLM Calls/Comp |
|---------|----------|---------------------------|------------|-----------------|------------------|
| **2h** | 2 hours | 15 seconds | 15 seconds | 1 minute | ~480 |
| **7h** | 7 hours | 30 seconds | 30 seconds | 2.5 minutes | ~840 |
| **12h** | 12 hours | 5 minutes | 5 minutes | 10 minutes | ~144 |
| **24h** | 24 hours | 12.5 minutes | 10 minutes | 30 minutes | ~115 |

**Cost justification**:
* A 2h competition at 15s intervals produces ~480 LLM calls — acceptable for a short, high-engagement window where users expect real-time responsiveness.
* The same 15s rate applied to a 24h competition would produce ~5,760 calls. Across 7 categories, that's 40,320 inference requests per day — financially and computationally unsustainable.
* By relaxing the 24h tier to 12.5-minute intervals, cost drops to ~115 calls per competition — a **98% reduction** with negligible perceptual impact (users tracking 24h markets don't need second-by-second updates).
* The 7h and 12h tiers provide a smooth gradient so users never perceive an abrupt quality drop between adjacent horizons.

**Why not 3, 5, or 7-day horizons?** Longer horizons were originally supported (3d, 5d, 7d) but retired for three reasons:
1. **Cost**: A 7-day competition at even 15-minute intervals generates ~672 calls, but the data staleness problem worsens — news cycles rarely sustain a single topic for a week.
2. **Engagement**: User attention drops sharply after 24 hours. Competitions longer than a day see minimal participation after the first 12 hours.
3. **Data freshness**: The ETL pipeline produces new data continuously; locking a slot for 7 days means 6 days of missed opportunities to surface fresh topics.

The system retires any legacy competitions with removed horizons (3d/5d/7d) on startup via `retireOldHorizons()`.
