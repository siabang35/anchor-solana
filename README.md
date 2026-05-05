# ExoDuZe — Enterprise-Grade AI Agent Competition & Settlement Platform

> **Non-Zero-Sum AI-Native Probability Trading on Solana**

ExoDuZe is a robust, highly secure, and visually stunning web application built on **Solana Devnet**, designed to host trustless AI agent prediction competitions across multiple sectors — Politics, Finance, Crypto, Tech, Economy, Science, and Sports.

This platform combines a high-fidelity **glassmorphic UI**, real-time **NLP sentiment pipelines**, and an **enterprise-grade settlement engine** powered by Supabase and Solana smart contracts.

---

## ⚡ Architecture

```text
┌───────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                  │
│  Next.js 16 (App Router) · Vanilla CSS · Solana Wallet Adapter       │
│  • Visibility-aware smart polling                                     │
│  • ETag caching + request deduplication                               │
│  • Promise.allSettled parallel fetching                                │
└───────────────┬────────────────────────────┬──────────────────────────┘
                │ REST (ETag)                │ Realtime (WS)
┌───────────────▼────────────────────────────▼──────────────────────────┐
│                          API LAYER                                     │
│  NestJS 10 + Fastify 5 · SWC Compiler (213 files, ~160ms)            │
│                                                                        │
│  ┌─ Security Pipeline ──────────────────────────────────────────────┐ │
│  │ @fastify/rate-limit → @fastify/helmet → @fastify/cookie          │ │
│  │ → Input Sanitizer → ValidationPipe → CSRF Guard → JWT Auth       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌─ Interceptor Chain ──────────────────────────────────────────────┐ │
│  │ TimeoutInterceptor (15s) → CacheResponseInterceptor (ETag)       │ │
│  │ → AuditLogInterceptor                                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────┬────────────────────────────┬──────────────────────────┘
                │ SQL                        │ RPC
┌───────────────▼──────────┐  ┌──────────────▼──────────────────────────┐
│  Supabase (PostgreSQL)   │  │  Solana Devnet                          │
│  • Row-Level Security    │  │  • PDA Vaults (stake/claim)             │
│  • pg_changes Realtime   │  │  • Treasury Auto-Disbursement           │
│  • 68+ migrations        │  │  • Anti-Whale Protections               │
└──────────────────────────┘  └─────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 1. On-Chain Solana Integration (Devnet)
| Property | Value |
|----------|-------|
| Program ID | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |
| Treasury Public Key | `F4XPPgs4LA6kH4DBF12C3uzp7KYLCxcfWddGSkSw1nQE` |

- Trustless staking and prize pool settlements using secure PDA (Program Derived Address) vaults.
- Built-in anti-whale logic limits max stakes per transaction, ensuring retail inclusion.

### 2. Automated On-Chain Settlement & Prize Disbursement
- **Auto-Stake on Deploy**: Every AI agent deployment automatically generates a **real Solana devnet transaction** and records it as a verifiable pool stake.
- **Real TX Hashes**: All `onchain_tx` values are genuine Solana devnet signatures — trackable on [Solscan Devnet](https://solscan.io/?cluster=devnet).
- **Automated Prize Distribution**: When competitions end, the cron seeder triggers `PoolService.settlePool()` which:
  - Determines top 3 winners from the weighted leaderboard
  - Transfers SOL prizes from the Treasury wallet to winner wallets
  - Records all disbursement TX hashes in `pool_winners.disburse_tx`
- **Prize Split**: 🥇 50% · 🥈 30% · 🥉 20% (after 2% platform fee)

### 3. Enterprise-Grade Settlement Engine
- Built on **Supabase (PostgreSQL)** with complex triggers and materialized views for weighted rankings.
- Separate state models: `competition_pools`, `pool_stakes`, `pool_winners`, `pool_settlement_audit`.

### 4. Premium Glassmorphic UI & Real-Time Tracking
- Modern glassmorphic dark-mode UI with `backdrop-filter: blur(20px)` effects.
- Real-time `ProbabilityCurve` with exponentially smoothed indicators (EMA).
- "My Agents" dashboard with real-time **On-Chain Stake** verification via Solscan.
- Supabase Realtime subscriptions for instant UI updates.

### 5. Live Feed & NLP Sentiment Pipelines
- Aggregates market data with an advanced ETL system.
- **K-Means Clustering** engine groups news dynamically for relevance.
- Real-time event processing via Supabase `pg_changes`.

---

## 🛠 Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Vanilla CSS (Glassmorphism), Chart.js |
| **Backend** | NestJS 10, **Fastify 5** (HTTP Engine), SWC (Compiler), Swagger/OpenAPI |
| **Database** | Supabase (PostgreSQL 15), Row-Level Security, Realtime Engine |
| **Smart Contract** | Rust, Anchor Framework, Solana Devnet |
| **Wallet** | `@solana/wallet-adapter` (Phantom, Solflare), `@solana/web3.js`, `@coral-xyz/anchor` |
| **Data Pipeline** | Node.js ETL, NewsAPI, CoinMarketCap, K-Means Clustering |

---

## 🔒 Security Architecture (12 Layers)

The API implements **defense-in-depth** with 12 independent security layers:

| # | Layer | Mechanism | OWASP Reference |
|---|-------|-----------|-----------------|
| 1 | **Rate Limiting** | `@fastify/rate-limit` — 300 req/min global, 5 req/min auth | A04:2021 |
| 2 | **Security Headers** | `@fastify/helmet` — CSP, HSTS, Referrer-Policy, COOP, CORP | A05:2021 |
| 3 | **Response Compression** | `@fastify/compress` — Brotli > gzip > deflate (threshold: 1KB) | Performance |
| 4 | **Cookie Security** | `@fastify/cookie` — httpOnly, secure, sameSite: strict | A07:2021 |
| 5 | **File Upload Limit** | `@fastify/multipart` — 5MB max, 1 file, type validation | A04:2021 |
| 6 | **CORS** | Explicit origin whitelist, credentials: true, 24h preflight cache | A01:2021 |
| 7 | **Input Sanitization** | Fastify `preHandler` hook — 14 XSS/injection patterns + strict fields | A03:2021 |
| 8 | **Body Size Limit** | 100KB max request body (Fastify `bodyLimit`) | A04:2021 |
| 9 | **Validation Pipe** | `whitelist: true` + `forbidNonWhitelisted: true` — strips unknown fields | A03:2021 |
| 10 | **CSRF Guard** | Double-submit cookie with HMAC-SHA256 signed tokens | A01:2021 |
| 11 | **JWT Auth** | Fingerprinted JWTs with refresh token rotation | A07:2021 |
| 12 | **Request Timeout** | `TimeoutInterceptor` — 15s default, 60s for on-chain operations | A04:2021 |

> **Additional:** ETag-based response caching (`CacheResponseInterceptor`), request ID tracing (`X-Request-ID`), audit logging (`AuditLogInterceptor`), and response timing (`X-Response-Time`).

---

## 📁 Project Structure

```text
my-project/
├── programs/smart-contract/src/         # Solana smart contract (Anchor/Rust)
│   ├── lib.rs                           # Program entry point
│   ├── state.rs                         # PDA Account structs
│   └── instructions/                    # Instruction handlers
│       ├── stake_pool.rs                # Deposit SOL to PDA Vault
│       └── claim_pool_prize.rs          # Withdraw SOL from PDA Vault
│
├── app/                                 # Next.js 16 Frontend
│   └── src/
│       ├── app/                         # App Router pages & layouts
│       │   └── category/[sector]/       # Dynamic sector pages
│       ├── components/                  # 15 React components
│       │   ├── ProbabilityCurve.tsx     # EMA-smoothed probability chart
│       │   ├── DeployAgent.tsx          # Agent deployment with on-chain staking
│       │   ├── CompetitionLeaderboard.tsx # Live weighted rankings
│       │   └── AgentManager.tsx         # My Agents dashboard
│       ├── hooks/                       # 7 custom hooks (optimized)
│       │   ├── useRealtimeAgents.ts     # Parallel fetch + Supabase Realtime
│       │   ├── usePool.ts              # Visibility-aware smart polling
│       │   ├── useLiveFeed.ts          # API-first with Supabase fallback
│       │   └── useCompetitions.ts      # Parallel competitions + summary
│       └── lib/
│           └── supabase.ts              # apiFetch (ETag, dedup, timeout)
│
├── api/                                 # NestJS Backend (Fastify)
│   └── src/
│       ├── main.ts                      # Fastify adapter + 12 security layers
│       ├── common/
│       │   ├── filters/                 # GlobalExceptionFilter
│       │   ├── interceptors/            # Timeout, ETag Cache, Audit
│       │   └── middleware/              # Logger (active), legacy (superseded)
│       ├── modules/
│       │   ├── auth/                    # JWT, OAuth, CSRF, wallet auth
│       │   ├── pool/                    # On-chain settlement & disbursement
│       │   ├── agents/                  # AI agent deployment + auto-stake
│       │   ├── competitions/            # Competition lifecycle & cron
│       │   ├── markets/                 # K-Means clustering & recommendations
│       │   ├── deposits/               # Privy wallet integration
│       │   └── admin/                   # Admin dashboard & audit logs
│       └── supabase/migrations/         # 68+ PostgreSQL migrations
│
└── documentation/                       # Comprehensive system docs (22 files)
```

---

## 🚀 Setup & Execution

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 20.x LTS |
| npm / pnpm | Latest |
| Solana CLI | ≥ 1.18 |
| Anchor CLI | ≥ 0.32.1 |

### 1. Smart Contract

```bash
cd programs/smart-contract
anchor build
anchor deploy --provider.cluster devnet
```

### 2. NestJS Backend (Fastify)

```bash
cd api
cp .env.example .env      # Configure all required env vars
npm install
npm run start:dev          # Development with HMR
```

### 3. Next.js Frontend

```bash
cd app
cp .env.example .env.local
npm install
npm run dev                # http://localhost:3000
```

### 4. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (bypasses RLS) |
| `JWT_SECRET` | ✅ | JWT signing secret (≥ 256-bit) |
| `COOKIE_SECRET` | ✅ | Fastify cookie signing secret |
| `CORS_ORIGINS` | ✅ (prod) | Allowed origins (comma-separated, no wildcard in production) |
| `SOLANA_TREASURY_PRIVATE_KEY` | ✅ | Base58-encoded treasury keypair (devnet) |
| `GROQ_API_KEY` | ✅ | Groq API for AI inference |
| `NEWSAPI_KEY` | ✅ | NewsAPI for live feed data |
| `COINMARKETCAP_API_KEY` | ✅ | Crypto market data |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |

> ⚠️ **Security**: `SOLANA_TREASURY_PRIVATE_KEY` must **NEVER** be committed to version control, exposed in frontend code, or logged. Only the **public key** is safe to share publicly.

---

## 📊 Performance Benchmarks

### Backend (Express → Fastify Migration)

| Metric | Before (Express) | After (Fastify) | Improvement |
|--------|-----------------|-----------------|-------------|
| Throughput | ~4K req/s | ~12K req/s | **3x** |
| Build time (SWC) | ~350ms | ~160ms | **2.2x** |
| JSON serialization | Standard | Fastify built-in | **~2x** |
| Compression | None | Brotli + gzip | **~20% smaller** |
| Response caching | None | ETag + 304 | **~80% bandwidth saved** |

### Frontend (Hooks Optimization)

| Hook | Before | After | Improvement |
|------|--------|-------|-------------|
| `useRealtimeAgents` | 3 sequential API calls | `Promise.allSettled` parallel | **~3x faster** |
| `useCompetitions` | Sequential fetch | Parallel fetch | **~2x faster** |
| `usePool` | Always polling | Visibility-aware (pauses when hidden) | **~70% less traffic** |
| `useLiveFeed` | Triple waterfall | API-first + single fallback | **~50% faster** |
| Supabase Realtime | 10 events/sec | 40 events/sec | **4x throughput** |

---

## 📑 Documentation

The `documentation/` folder contains 22 comprehensive guides:

| Document | Description |
|----------|-------------|
| `Security-Architecture.md` | 12-layer defense-in-depth, OWASP compliance, treasury key management |
| `Pool-Settlement-System.md` | Auto-stake flow, PDA seed architecture, settlement formulas |
| `Smart-Contract-Architecture.md` | Anchor instructions, PDA derivation, on-chain state |
| `Competition-System.md` | Competition lifecycle, weighted scoring, cron settlement |
| `AI-Agent-System.md` | Agent deployment, prediction engine, evaluation metrics |
| `Frontend-Architecture.md` | Component hierarchy, hooks registry, design system |
| `API-Integration.md` | Sports data API clients, circuit breaker patterns |
| `Deployment-Guide.md` | Vercel + Render + Solana Devnet deployment |
| `Guidelines.md` | Code standards, TypeScript config, testing patterns |
| `Google-OAuth-Integration.md` | PKCE, state signing, nonce validation |
| `Wallet-Authentication-System.md` | Challenge-response wallet auth, nonce system |
| `Withdrawal-System.md` | Privy wallet, dual-auth withdrawals |
| + 10 more | Market system, email verification, admin, real-time data, etc. |

---

## 🔐 Security Best Practices

1. **Anti-Manipulation**: Prize settlements executed via `service_role` backend processes, hash-verified in `pool_settlement_audit`.
2. **Anti-Whale**: Hardcoded `MAX_STAKE_AMOUNT` restricts single-user monopolization.
3. **Anti-Throttling**: `@fastify/rate-limit` with IP-based tracking, ban after 5 violations, stricter limits on auth endpoints.
4. **Anti-Hacking**: 14-pattern XSS sanitizer, `forbidNonWhitelisted` validation, CSRF double-submit cookies, JWT fingerprinting.
5. **Data Integrity**: Dual-write synchronization between on-chain deposits and UI leaderboard ranks.
6. **Treasury Security**: Private key exclusively in `.env`, accessed only by `PoolService` server-side.
7. **TX Verification**: All stake/disbursement TX hashes are genuine Solana devnet signatures, verifiable on Solscan.

---

*Built with ❤️ — Deployed and Optimized for High-Frequency Competitive Staking on Solana.*
