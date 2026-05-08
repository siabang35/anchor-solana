# Deployment Guide

> **ExoDuZe Platform — Multi-Service Deployment Architecture**
> Version: 2.1.0 | Updated: 2026-05-09
> Environments: Vercel (Frontend) | Render (Backend) | Solana Devnet (Contract)

---

## 1. Architecture Overview

```mermaid
graph LR
    subgraph Frontend["Frontend (Vercel)"]
        Next["Next.js 16<br/>Static Export"]
    end

    subgraph Backend["Backend (Render)"]
        Nest["NestJS API<br/>Node.js 20"]
    end

    subgraph Database["Database (Supabase)"]
        PG["PostgreSQL 15<br/>+ Row Level Security"]
        RT["Realtime Engine<br/>(WebSocket)"]
    end

    subgraph Blockchain["Blockchain (Solana)"]
        Program["ExoDuZe Program<br/>Devnet"]
    end

    Next --> Nest
    Next --> PG
    Next --> RT
    Nest --> PG
    Next --> Program
```

---

## 2. Frontend — Vercel

### 2.1 Configuration

**File:** `app/vercel.json`
```json
{
    "framework": "nextjs"
}
```

**Settings:**
| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Root Directory | `app` |
| Build Command | `npm run build` |
| Output Directory | `out` |
| Node Version | 20.x |

### 2.2 Deploy

```bash
# Option A: CLI Deploy
cd app
npx vercel --prod

# Option B: Git Integration
# Connect the repository via Vercel Dashboard
# Set root directory to "app"
```

### 2.3 Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | Backend API URL (Render) |
| `NEXT_PUBLIC_SOLANA_RPC` | Solana RPC endpoint |
| `NEXT_PUBLIC_PROGRAM_ID` | Smart contract program ID |

---

## 3. Backend — Render

### 3.1 Configuration

**File:** `api/render.yaml`

```yaml
services:
  - type: web
    name: exoduze-api
    env: node
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: node dist/main.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
```

### 3.2 Deploy

```bash
# Option A: CLI
cd api
npm run build
npm run start:prod

# Option B: Render Dashboard
# Connect repo → Set root to "api"
# Build: npm install && npm run build
# Start: node dist/main.js
```

### 3.3 Environment Variables (Backend)

**File:** `api/.env.example`

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `NODE_ENV` | `development` / `production` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin operations) |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRATION` | Token expiry (e.g., `7d`) |
| `CORS_ORIGINS` | Allowed origins (comma-separated) |
| `HUGGINGFACE_API_KEY` | HuggingFace Inference API key |
| `RABBITMQ_URL` | RabbitMQ connection URL |
| `THESPORTSDB_API_KEY` | TheSportsDB API key |
| `APIFOOTBALL_API_KEY` | API-Sports shared key |
| `SOLANA_TREASURY_PRIVATE_KEY` | Treasury keypair for auto-stake + prize disbursement |
| `COMPETITION_HMAC_SECRET` | 32+ char secret for competition creation integrity |
| `LEADERBOARD_HMAC_SECRET` | 32+ char secret for leaderboard score chain verification |

---

## 4. Smart Contract — Solana Devnet

### 4.1 Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1
avm use 0.32.1
```

### 4.2 Deploy

```bash
# Configure for devnet
solana config set --url devnet

# Build
anchor build

# Sync keys (ensures Anchor.toml matches program ID)
anchor keys sync

# Deploy
anchor deploy --provider.cluster devnet
```

### 4.3 Deployed Addresses

| Network | Program ID |
|---------|-----------|
| **Devnet** | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |
| **Localnet** | `Dm5GkFcUkuCfrGNGt5jm5Ujqcg6NU4xmP52oJfb8uUSt` |

### 4.4 Deployment History

| Date | TX Signature | Type | Changes |
|------|-------------|------|---------|
| 2026-05-09 | `4a5gM86T5SwAEYD3145ZKJYqsrhew6HnEu2WrcB98bvJSM6JAbEDrMbyCeWSTqnwvh239uFWWg6mHRytkCx8b2Vo` | Upgrade | `admin_disburse_prize` registered, `claim_pool_prize` fixed (1.5x removed, PDA invoke_signed) |

### 4.5 Solana Explorer

View on-chain: [Solana Explorer (Devnet)](https://explorer.solana.com/address/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet)

---

## 5. Database — Supabase

### 5.1 Migration Management

The project contains **75+ migration files** in `api/supabase/migrations/`:

```bash
# Apply migrations (via Supabase CLI)
cd api
npx supabase db push

# Or apply individually
npx supabase db push --db-url postgresql://...
```

### 5.2 Migration Categories

| Range | Category | Example |
|-------|----------|---------|
| 000-012 | Foundation & Core | Schema, profiles, admin, deposits |
| 013-022 | Sports Data | Sports schema, enums, security |
| 023-036 | Authentication | Audit logs, OAuth, email OTP, wallet auth |
| 037-051 | Market Data | 8-category schemas (politics, crypto, etc.) |
| 052-068 | Competitions | Realtime, AI agents, competitions, scoring |
| 069-075 | Pool & Settlement | Pool ledger, stakes, settlement, anti-drift, lifecycle fixes, data tracking |

### 5.3 Key Database Functions

| Function | Migration | Purpose |
|----------|-----------|---------|
| `get_weighted_leaderboard` | 063 | Weighted scoring for agent rankings |
| `settle_competition_pool` | 070 | Atomic pool settlement with row locking |
| `update_pool_on_stake` | 073 | Drift-proof pool counter updates |
| `generate_wallet_nonce` | 025 | Challenge-response auth nonces |
| `consume_wallet_nonce` | 025 | Single-use nonce consumption |
| `check_wallet_auth_rate_limit` | 025 | Brute force prevention |

---

## 6. Local Development

### 6.1 Full Stack Setup

```bash
# 1. Clone
git clone https://github.com/siabang35/exoduze.git
cd exoduze

# 2. Install root dependencies
yarn install

# 3. Build smart contract
anchor build

# 4. Start backend
cd api
npm install
cp .env.example .env
# Fill in Supabase keys
npm run start:dev

# 5. Start frontend (new terminal)
cd app
npm install
cp .env.example .env.local
# Fill in environment variables
npm run dev
```

### 6.2 Development URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001 |
| Supabase Studio | https://app.supabase.com |
| Solana Explorer | https://explorer.solana.com/?cluster=devnet |

---

## 7. CI/CD Recommendations

### 7.1 Vercel (Frontend)

- Auto-deploys on push to `main` branch
- Preview deployments on pull requests
- Environment variables set via Vercel Dashboard

### 7.2 Render (Backend)

- Auto-deploys on push to `main` branch
- Health check endpoint: `/health`
- Zero-downtime deploys with rolling restart

### 7.3 Smart Contract

Smart contract deployments are manual (require wallet signing):
```bash
# Always verify before mainnet deploy
anchor test
anchor deploy --provider.cluster devnet
```

---

## 8. Production Checklist

- [ ] All environment variables configured
- [ ] `COMPETITION_HMAC_SECRET` set (32+ chars) — no hardcoded fallback
- [ ] `LEADERBOARD_HMAC_SECRET` set (32+ chars) — required for score chain integrity
- [ ] `SOLANA_TREASURY_PRIVATE_KEY` set and wallet funded
- [ ] CORS origins set to production domains only
- [ ] Supabase RLS policies verified
- [ ] JWT secret is cryptographically strong (≥ 256-bit)
- [ ] Rate limiting configured for all endpoints
- [ ] Smart contract deployed with latest fixes (`anchor deploy`)
- [ ] IDL synced between contract and frontend
- [ ] Database migrations applied (up to 075)
- [ ] Health check endpoint responding
- [ ] SSL/TLS configured on all services
- [ ] `pool_settlement_audit` table monitored for anomalies

---

*Last Updated: 2026-05-09 — Pool Settlement Hardening*
