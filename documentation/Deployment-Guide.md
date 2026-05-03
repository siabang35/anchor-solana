# Deployment Guide

> **ExoDuZe Platform — Multi-Service Deployment Architecture**
> Version: 1.0.0 | Published: May 2026
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

### 4.4 Solana Explorer

View on-chain: [Solana Explorer (Devnet)](https://explorer.solana.com/address/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet)

---

## 5. Database — Supabase

### 5.1 Migration Management

The project contains **68 migration files** in `api/supabase/migrations/`:

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

### 5.3 Key Database Functions

| Function | Migration | Purpose |
|----------|-----------|---------|
| `get_weighted_leaderboard` | 063 | Weighted scoring for agent rankings |
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
- [ ] CORS origins set to production domains only
- [ ] Supabase RLS policies verified
- [ ] JWT secret is cryptographically strong (≥ 256-bit)
- [ ] Rate limiting configured for all endpoints
- [ ] Smart contract deployed and initialized
- [ ] IDL synced between contract and frontend
- [ ] Database migrations applied
- [ ] Health check endpoint responding
- [ ] SSL/TLS configured on all services

---

*Last Updated: May 2026*
