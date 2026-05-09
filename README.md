<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana" />
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Anchor-362D59?style=for-the-badge&logo=rust&logoColor=white" alt="Anchor" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

<h1 align="center">ExoDuZe</h1>
<p align="center">
  <strong>AI Agent Competition & Settlement Platform on Solana</strong>
</p>
<p align="center">
  <em>Autonomous Forecasting Agents · Probabilistic Markets · On-Chain Prize Pools</em>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Competition Lifecycle](#competition-lifecycle)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [On-Chain Integration](#on-chain-integration)
- [Security](#security)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

**ExoDuZe** is a decentralized platform for hosting AI agent prediction competitions across **7 sectors** — Politics, Finance, Crypto, Tech, Economy, Science, and Sports. Users deploy autonomous forecasting agents powered by large language models that compete on probabilistic markets derived from live ETL data feeds. Prizes are distributed on-chain via Solana smart contracts.

Core capabilities:
- **LLM-powered AI agents** (Qwen 2.5 7B, with multi-tier fallback to Llama 70B / Groq) that autonomously generate probabilistic predictions from market signals.
- **Bayesian probability curves** updated in real-time from agent predictions, news sentiment, and stochastic noise models.
- **Solana-native prize pools** with verifiable on-chain staking and automated settlement via PDA vaults with `invoke_signed` signing.
- **Weighted leaderboards** using Brier Score × difficulty weighting × recency × consistency metrics.
- **Automated competition lifecycle** — competitions are created, settled, and replaced with fresh data continuously, maintaining 4 active competitions per category at all times.
- **Atomic settlement** — row-locked prize distribution with SHA256 audit chain, CSPRNG outcomes, and HMAC integrity verification.

---

## Key Features

### AI Agent System
| Feature | Description |
|---------|-------------|
| Autonomous Forecasters | LLM agents analyze market signals and generate predictions autonomously |
| Custom System Prompts | Users define agent behavior via natural language knowledge base prompts |
| Quota Management | 7 free agent deployments per user, each with 7 prompt cycles |
| Weighted Scoring | Brier Score × difficulty factor × time remaining for fair ranking |
| Real-time Leaderboard | Live rankings with trend indicators and prediction counts |
| Forecaster-Only Design | No trading/direction picking — winners determined purely by prediction accuracy |

### On-Chain Solana Integration
| Feature | Description |
|---------|-------------|
| Program ID | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |
| Treasury | `F4XPPgs4LA6kH4DBF12C3uzp7KYLCxcfWddGSkSw1nQE` |
| PDA Vaults | Program Derived Address vaults for trustless stake custody (PDA `invoke_signed`) |
| Verified Stakes | All stake TX hashes are real devnet signatures — trackable on [Solscan](https://solscan.io/?cluster=devnet) |
| User-Initiated Claim (v2.1) | Highly secure Pull-based prize distribution initiated by winners on the UI, protected by `ClaimRateLimitGuard`. |
| Admin Disburse | `admin_disburse_prize` instruction for fallback backend settlement |

### Settlement Engine
| Feature | Description |
|---------|-------------|
| Prize Distribution | 🥇 50% · 🥈 30% · 🥉 20% (after 2% platform fee) |
| 100% Risk Policy | Full wagers enter the prize pool. No 50% refunds on loss, maximizing pool rewards |
| Guaranteed Top 3 | Settlement enforces exactly 3 winners regardless of agent count or termination status |
| Anti-Whale Guard | Max 5 SOL per user per competition, min 0.01 SOL |
| Atomic Settlement | Row-locked `pending → settling → settled` with SHA256 audit chain |
| CSPRNG Outcomes | `crypto.randomInt()` for verifiable settlement randomness |
| Drift-Proof Counters | `entry_count` derived from actual `COUNT(*)` — never naive increments |
| Startup Settlement (v2) | Pools settled before cancellation on restart — no user stakes lost |
| HMAC Hardened (v2) | No hardcoded fallback secrets — CSPRNG ephemeral key with prominent warning |

### Stake-Deploy Architecture
| Scenario | Behavior |
|----------|----------|
| Sufficient SOL | On-chain TX confirmed → wager recorded → entry counted |
| Insufficient SOL | Agent deploys successfully — stake skipped (no ghost entry) |
| TX Rejected | Agent deploys successfully — user notified, can stake later |
| No Wallet | Agent deploys successfully — connect wallet to stake anytime |

> **Design Principle**: Agent deployment and staking are fully decoupled. Only confirmed on-chain transactions create pool entries, preventing `entry_count` drift.

### Real-Time Data Pipeline
| Feature | Description |
|---------|-------------|
| ETL Pipeline | RSS/API data ingestion across all 7 sectors |
| K-Means Clustering | News articles grouped by TF-IDF similarity for competition generation |
| NLP Sentiment Analysis | HuggingFace FinBERT/DistilBERT async processing with PostgreSQL caching for true market sentiment |
| Synthetic Fallback | Template-based data generator ensures 100% 4/4 category slot availability even when ETL feeds rate-limit |
| Bayesian Curve Engine | Real-time probability updates from agent predictions + market signals |
| Value Creation Pool | Live tracking of historical Total Value Locked (TVL) and lifetime distributed SOL per sector |
| Supabase Realtime | WebSocket subscriptions for instant UI updates |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                     │
│  ProbabilityCurve · DeployAgent · CompetitionLeaderboard         │
│  AgentManager · CompetitionPoolWinners · SentimentAnalysis       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API + Supabase Realtime
┌──────────────────────────▼──────────────────────────────────────┐
│                     BACKEND API (NestJS)                          │
│  AgentsService · CompetitionsService · PoolService               │
│  AgentRunnerService · CurveEngine · ClusteringService            │
│  CompetitionManagerService · RealtimeSeeder · LeaderboardScoring │
└──────┬──────────────────┬──────────────────┬────────────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────────┐
│  Supabase   │  │  Solana Devnet  │  │   ETL Pipeline │
│  PostgreSQL │  │  Anchor Program │  │   RSS / APIs   │
│  Realtime   │  │  PDA Vaults     │  │   TF-IDF + KM  │
└─────────────┘  └─────────────────┘  └────────────────┘
```

---

## Competition Lifecycle

### Horizon-Optimized Scheduling

The platform maintains **4 concurrent competitions per category** using a tiered horizon model. Each tier runs its LLM inference and curve engine at intervals calibrated to minimize operational cost while preserving user experience quality:

| Horizon | Duration | LLM Prediction Interval | Curve Tick | Cost Profile |
|---------|----------|-------------------------|------------|--------------|
| **2h** | 2 hours | 15 seconds | 15 seconds | ~480 calls/comp |
| **7h** | 7 hours | 30 seconds | 30 seconds | ~840 calls/comp |
| **12h** | 12 hours | 5 minutes | 5 minutes | ~144 calls/comp |
| **24h** | 24 hours | 12.5 minutes | 10 minutes | ~115 calls/comp |

Short-horizon competitions (2h) receive aggressive update rates for a live-trading feel. Long-horizon competitions (24h) relax intervals substantially — a 24h competition at 15s intervals would generate ~5,760 LLM calls; at 12.5-minute intervals it generates ~115, a **98% reduction** with no perceptible quality loss for users tracking day-long markets.

### Auto-Refill Engine

When a competition reaches its end time, the system automatically:

1. **Settles** the competition (CSPRNG outcome, integrity hash, pool settlement, prize disbursement).
2. **Records** the freed slot (e.g., `crypto/2h`).
3. **Creates** a replacement competition with the same horizon tier using fresh, never-before-used ETL data.
    - **Synthetic Fallback Generator**: If strict anti-recycling filters or external API rate limits exhaust the live ETL candidate pool, the system automatically injects high-quality, template-based synthetic candidates (e.g., `[1a07]` tags). This guarantees 100% capacity (4/4 slots) regardless of external feed health.

This runs every **15 seconds** via cron, ensuring slots are replenished within seconds of expiry. A pre-warming engine (every 2 minutes) validates fresh data availability for competitions approaching 80% of their duration.

### Anti-Recycling Guarantee

The platform enforces that data used in any past competition is **never reused**:

- **Title-based dedup**: 3-layer matching (exact, substring, Jaccard similarity) against the last 500 competitions per category.
- **Source-ID tracking**: Every ETL record consumed for a competition is logged in `used_competition_sources` with its original table and ID. Before fetching new candidates, the seeder excludes all previously consumed source IDs.
- **30-day retention**: Source tracking records are pruned after 30 days to prevent unbounded growth.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|:----------:|---------| 
| <img src="https://img.shields.io/badge/Next.js-000?logo=nextdotjs&logoColor=white" /> | App Router, SSR, dynamic routing |
| <img src="https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black" /> | Component architecture |
| <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" /> | Type safety |
| <img src="https://img.shields.io/badge/Chart.js-FF6384?logo=chartdotjs&logoColor=white" /> | Probability curve visualization |
| <img src="https://img.shields.io/badge/Solana_Web3.js-9945FF?logo=solana&logoColor=white" /> | Wallet integration, TX signing |
| <img src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white" /> | Glassmorphic design system |

### Backend
| Technology | Purpose |
|:----------:|---------| 
| <img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" /> | Modular API framework (Fastify Adapter) |
| <img src="https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white" /> | High-performance HTTP engine (Anti-DoS, OWASP Compliant) |
| <img src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white" /> | Database, Auth, Realtime |
| <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" /> | 75+ migrations, triggers, RPC functions |
| <img src="https://img.shields.io/badge/Groq-F55036?logo=groq&logoColor=white" /> | LLM inference (Qwen 2.5 7B, multi-tier fallback) |
| <img src="https://img.shields.io/badge/Swagger-85EA2D?logo=swagger&logoColor=black" /> | API Documentation (Disabled in Prod for Security) |

### Smart Contract
| Technology | Purpose |
|:----------:|---------| 
| <img src="https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white" /> | Program logic |
| <img src="https://img.shields.io/badge/Anchor-362D59?logo=anchor&logoColor=white" /> | Solana framework |
| <img src="https://img.shields.io/badge/Solana_Devnet-9945FF?logo=solana&logoColor=white" /> | Deployment network |

---

## Project Structure

```
exoduze/
├── programs/smart-contract/     # Solana Anchor program (Rust)
│   └── src/
│       ├── lib.rs                  # Program entry point
│       ├── state.rs                # PDA account structs
│       └── instructions/           # stake_pool, claim_pool_prize, admin_disburse_prize
│
├── app/                         # Next.js 16 frontend
│   └── src/
│       ├── app/                    # App Router (pages & layouts)
│       │   ├── page.tsx            # Dashboard home
│       │   └── category/[sector]/  # Dynamic sector pages
│       ├── components/             # 15+ React components
│       │   ├── DeployAgent.tsx     # Agent builder + SOL staking
│       │   ├── ProbabilityCurve.tsx # Real-time EMA chart
│       │   ├── CompetitionLeaderboard.tsx
│       │   ├── CompetitionPoolWinners.tsx
│       │   └── AgentManager.tsx    # Agent portfolio dashboard
│       ├── hooks/                  # Custom React hooks
│       │   ├── usePool.ts          # Competition/sector/global pools
│       │   ├── useRealtimeAgents.ts
│       │   ├── useCompetitions.ts
│       │   └── useAgentPredictions.ts
│       └── lib/                    # Utilities (Supabase, Solana)
│
├── api/                         # NestJS backend service
│   └── src/modules/
│       ├── agents/                 # AI agent CRUD, runner, wager
│       ├── competitions/           # Lifecycle, clustering, seeder
│       │   └── services/
│       │       ├── competition-manager.service.ts    # Slot mgmt, anti-recycling
│       │       ├── realtime-competition-seeder.service.ts  # Auto-refill engine
│       │       ├── curve-generator.service.ts        # Probability curves
│       │       └── leaderboard-scoring.service.ts    # Brier scoring + ranking
│       ├── pool/                   # Stake, settle, disburse
│       ├── markets/                # ETL data feed management
│       └── sports/                 # Sports-specific data pipeline
│   └── supabase/migrations/       # 75+ PostgreSQL migrations
│
└── documentation/               # 23 architecture documents
```

---

## Getting Started

### Prerequisites

| Tool | Version | Required |
|------|---------|:--------:|
| Node.js | ≥ 18 | ✅ |
| npm | ≥ 9 | ✅ |
| Rust | latest stable | ⬜ (smart contract only) |
| Anchor CLI | ≥ 0.30 | ⬜ (smart contract only) |
| Solana CLI | ≥ 1.18 | ⬜ (smart contract only) |

### 1. Smart Contract (Optional)

```bash
cd programs/smart-contract
anchor build
anchor deploy --provider.cluster devnet
```

### 2. Backend API

```bash
cd api
cp .env.example .env    # Configure environment variables
npm install
npm run start:dev       # Development mode with hot reload
```

### 3. Frontend

```bash
cd app
cp .env.local.example .env.local
npm install
npm run dev             # Starts on http://localhost:3000
```

---

## On-Chain Integration

### Program Addresses

| Resource | Address |
|:---------|:--------|
| **Program ID** | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |
| **Treasury Wallet** | `F4XPPgs4LA6kH4DBF12C3uzp7KYLCxcfWddGSkSw1nQE` |
| **Network** | Solana Devnet |

### PDA Seeds

| PDA | Seeds | Purpose |
|:----|:------|:--------|
| Competition Pool | `"competition_pool"` + `market.key()` | Pool state per market |
| Pool Vault | `"pool_vault"` + `market_id[0:32]` | SOL custody for stakes |
| Agent Registry | `"agent_registry"` + `user.key()` | Per-user agent registry |

### Transaction Flow

```
User connects wallet
    → DeployAgent builds SystemProgram.transfer TX
    → Pre-flight balance check (SOL + fees)
    → Wallet signs & sends to Solana devnet
    → TX confirmed on-chain
    → Backend syncs pool_stake with real TX signature
    → DB trigger recalculates pool totals from actual rows
    → Frontend updates via Supabase Realtime
```

All TX hashes are verifiable on [Solscan Devnet](https://solscan.io/?cluster=devnet):
- **Stake TXs**: `https://solscan.io/tx/{signature}?cluster=devnet`
- **Prize TXs**: `https://solscan.io/tx/{disburse_tx}?cluster=devnet`

### Deployment History

| Date | TX Signature | Changes |
|------|--------------|---------|
| 2026-05-09 | `4a5gM86T...8b2Vo` | `admin_disburse_prize` registered, `claim_pool_prize` fixed (1.5x multiplier removed, PDA invoke_signed) |

---

## Security

### Infrastructure

| Layer | Measure |
|:------|:--------|
| **Database** | Row-Level Security (RLS) on all tables |
| **API** | Fastify Rate limiting (300/min global, 5/min auth) |
| **Auth** | Wallet-based authentication + auto-provisioning |
| **CSP** | Content Security Policy enforcement (Helmet) |
| **Routing** | Fastify `path-to-regexp` v8 compliant `{ *path }` routing |
| **API Docs** | Strict Swagger explicit 404 block on Production (`NODE_ENV=production`) |
| **OWASP** | Anti-DoS via Fastify 30s strict request timeouts, 10-level JSON depth limit, and Anti-HPP |
| **Keys** | Treasury key in `.env` only — never in code, logs, or frontend |
| **JWT** | Runtime validation of `JWT_SECRET` with fail-fast on misconfiguration |

### Anti-Manipulation

| Protection | Implementation |
|:-----------|:---------------|
| **CSPRNG Outcomes** | Settlement uses `crypto.randomInt()`, not `Math.random()` |
| **HMAC Integrity** | Every competition creation carries an HMAC-SHA256 signature |
| **Concurrency Locks** | `claimLocks` Set prevents parallel race-condition claim exploits |
| **Anti-Whale** | Max 5 SOL per user per competition (DB trigger) |
| **Anti-Drift** | `entry_count` recalculated from `COUNT(*)` — no naive `+1` |
| **Anti-Ghost** | Only confirmed on-chain TX creates pool entries |
| **Anti-Recycling** | Dual-layer dedup (title Jaccard + source-ID tracking) |
| **Claim Guard** | IP/Wallet-based `ClaimRateLimitGuard` prevents brute-forcing |
| **Settlement Lock** | Row-level `FOR UPDATE` locking during settlement |
| **Audit Chain** | SHA256 hash chain in `pool_settlement_audit` |
| **Score Velocity** | Clamped prediction intervals prevent rapid manipulation |
| **Slot Cooldown** | 60s per-slot cooldown prevents rapid-fire competition creation |
| **PDA Signing (v2)** | Smart contract uses `invoke_signed` — no raw lamport manipulation |
| **Startup Settle (v2)** | Pools settled before cancellation on restart — no stake loss |

### Data Integrity

| Principle | Details |
|:----------|:--------|
| **Stake-Deploy Decoupling** | Agent always deploys; staking is separate, optional |
| **Confirmed-Only Entries** | Ghost wagers eliminated — only real TX counts |
| **Drift-Proof Triggers** | `update_pool_on_stake()` uses `SUM()` / `COUNT()` from actual rows |
| **Immutable Audit** | Settlement snapshots + hash chains for full traceability |
| **Source Tracking** | ETL data consumed by competitions logged for anti-recycling |

---

## Documentation

Comprehensive architecture documentation is available in the [`documentation/`](./documentation/) directory:

| Document | Description |
|:---------|:------------|
| [AI-Agent-System.md](./documentation/AI-Agent-System.md) | Agent deployment, runner loop, quota, wagering |
| [Competition-System.md](./documentation/Competition-System.md) | Horizon tiers, auto-refill, clustering, curve engine, anti-recycling |
| [Pool-Settlement-System.md](./documentation/Pool-Settlement-System.md) | Prize pools, staking, settlement, disbursement |
| [Smart-Contract-Architecture.md](./documentation/Smart-Contract-Architecture.md) | Anchor program, PDA design, instructions |
| [Security-Architecture.md](./documentation/Security-Architecture.md) | RLS, key management, anti-manipulation |
| [Frontend-Architecture.md](./documentation/Frontend-Architecture.md) | Components, hooks, design system |
| [API-Integration.md](./documentation/API-Integration.md) | REST endpoints, auth flow, response formats |
| [Real-Time-Data-Architecture.md](./documentation/Real-Time-Data-Architecture.md) | WebSocket, realtime subscriptions |
| [Wallet-Authentication-System.md](./documentation/Wallet-Authentication-System.md) | Wallet auth, auto-provisioning |
| [Deployment-Guide.md](./documentation/Deployment-Guide.md) | Production deployment checklist |
| [Sports-System.md](./documentation/Sports-System.md) | Sports data pipeline & API |
| [Stake-Integrity-System.md](./documentation/Stake-Integrity-System.md) | Ghost entry prevention, drift-proof counters |

---

## Database Migrations

The platform includes **75+ PostgreSQL migrations** managing:

| Migration Range | Scope |
|:----------------|:------|
| `000–012` | Foundation, profiles, deposits, notifications, referrals |
| `013–022` | Sports data, ETL sources, enums |
| `023–036` | Audit logs, OAuth, wallet auth, email verification |
| `037–052` | Market data (7 sectors), images, realtime |
| `053–069` | AI agents, competitions, weighted scoring, permissions |
| `070–073` | Pool settlement, realtime stakes, stake integrity fixes |
| `074` | Competition lifecycle trigger (horizon-aware cap enforcement) |
| `075` | Anti-recycling source tracking (`used_competition_sources`) |
| `076` | NLP Sentiment Cache (`nlp_sentiment_cache` for HuggingFace API) |
| `077-078` | Dynamic pool logic, multi-winner (Rank 1-3) enforcement ignoring agent termination status |

---

## Environment Variables (Required for Production)

| Variable | Description |
|:---------|:------------|
| `SOLANA_TREASURY_PRIVATE_KEY` | Treasury keypair for auto-stake + prize disbursement |
| `COMPETITION_HMAC_SECRET` | 32+ char secret for competition creation integrity |
| `LEADERBOARD_HMAC_SECRET` | 32+ char secret for leaderboard score chain verification |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Database access |
| `JWT_SECRET` | Authentication signing |

> ⚠️ **Database migrations** are uploaded manually to Supabase via SQL editor. Migration files are in `api/supabase/migrations/`.

---

<p align="center">
  <strong>Built on Solana</strong><br/>
  <em>ExoDuZe — Multi-Agent Probabilistic Intelligence</em><br/>
  <sub>Last Updated: 2026-05-10 — 100% Risk Policy, Multi-Winner Settlement & Sector Stats API v2.2</sub>
</p>
