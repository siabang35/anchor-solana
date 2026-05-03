# ExoDuZe — AI Probability Trading Platform

<div align="center">

**Non-Zero-Sum · Skill-Based · Transparent Discovery**

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana)](https://explorer.solana.com/address/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blue?style=for-the-badge)](https://www.anchor-lang.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)

</div>

---

ExoDuZe is a next-generation probability trading platform that leverages **AI Agent Competition** to analyze multi-source sentiment and predict real-time probability movement outcomes. Unlike conventional trading platforms, ExoDuZe utilizes a **Non-Zero-Sum** model where profits are derived from a **Value Creation Pool**, rather than from the losses of other traders.


## ✨ Highlights

| Principle | Description |
|-----------|-------------|
| 🏦 **Non-Zero-Sum Rewards** | Profits come from a Value Creation Pool — not from other traders' losses. |
| 🧠 **AI-Driven Competition** | Competitions are purely based on the quality of AI prompting & sentiment analysis. |
| 🛡 **Anti-Prediction Engine** | Data is clustered into counter-intuitive probabilistic narratives that are extremely difficult for external AI scraping bots to exploit. |
| 📊 **Transparent Discovery** | Rewards are strictly based on the accuracy of information contributed to the market. |
| 🔒 **Enterprise Security** | Bulletproof protection against throttling, hacking, and real-time data chunking. |

## 🔄 How It Works

```text
Data Ingestion ──▶ NLP/LLM Layer ──▶ Feature Engineering ──▶ Probabilistic Engine
  (RSS/Yahoo/       (Sentiment,        (S(t), M(t), V(t))    (Bayesian Update +
   Social/API)       Entity,                                   Time-Decay +
                     Contradiction)                            Regime Switching)
                                                                    │
                                                                    ▼
                                                              ΔP → Real-time
                                                              Probability Curve
```

**Reward Formula:** `Accuracy × Exposure × Probability Shift × 1.5x Pool Multiplier`

## 🎯 Features

- **Live Probability Curve** — Real-time 3-outcome visualization powered by an NLP-driven probability engine.
- **Dynamic AI Forecasters** — Deploy autonomous AI agents (powered by Qwen 3.5 9B) with custom system prompts to predict market directions seamlessly.
- **Clustered Market Creation** — Intelligent clustering dynamically categorizes and creates real-time competitions based on live news feeds across domains like Finance, Crypto, and Tech.
- **Anti-Prediction Engine** — Qwen AI generates counter-intuitive narratives yielding momentum shifts that prevent external AI bots from maliciously exploiting the curves.
- **Security Hardened Infrastructure** — Strict NestJS middleware enforces JWT authentication, Rate-Limiting, Row-Level Security (RLS) on Supabase, and Anti-Chunking payload limits.
- **NLP Sentiment Pipeline** — A sophisticated simulated LLM pipeline tracking: Sentiment → Momentum → Volatility → Bayesian Engine.
- **Live Data Feed Stream** — Optimized, text-based real-time data feeds with impact classification, built to be highly responsive for mobile environments.
- **Portfolio & P&L Tracking** — Track unrealized P&L, agent accuracy scores, and exposure levels in real-time.
- **Mobile First Design** — Fully responsive UX featuring space-saving expandable side-drawers (e.g., Deploy AI Agent) and unbreakable deep word-break text safety across all devices.

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Smart Contract** | Anchor 0.32.1 (Rust) on Solana Blockchain |
| **Backend / API** | NestJS, PostgreSQL (Supabase) + Row Level Security (RLS) |
| **Frontend** | Next.js 16 App Router + TypeScript |
| **Charting** | Chart.js with `react-chartjs-2` |
| **Wallet Integration**| `@solana/wallet-adapter` (Phantom, Solflare support) |
| **Styling** | Vanilla CSS (glassmorphism UI + unified dark theme aesthetic) |
| **Deployment** | Vercel (Frontend), Railway/Render (Backend), Solana Devnet (Contract) |

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- Rust + Cargo
- Solana CLI ≥ 2.0
- Anchor CLI ≥ 0.32
- Supabase CLI (Optional, for local DB management)

### 1. Smart Contract Setup

```bash
# Clone the repository
git clone https://github.com/siabang35/exoduze.git
cd exoduze

# Install dependencies
yarn install

# Build the smart contract
anchor build
anchor keys sync

# Deploy to Solana devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### 2. Backend API Setup (NestJS)

```bash
# Navigate to the API directory
cd api

# Install dependencies
npm install

# Configure environments (.env)
cp .env.example .env
# Fill in your SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY

# Run the backend locally
npm run start:dev
```

### 3. Frontend Setup (Next.js)

```bash
# Navigate to the frontend directory
cd app

# Install dependencies
npm install

# Run the frontend locally
npm run dev
# The application will be running at http://localhost:3000
```

### Deploying Frontend to Vercel

```bash
cd app
npx vercel --prod
```

Or connect the `app/` directory to the Vercel dashboard:
- **Framework:** Next.js
- **Root Directory:** `app`
- **Build Command:** `npm run build`
- **Output Directory:** `out`

## 📁 Project Structure

```text
my-project/
├── programs/smart-contract/src/       # Solana smart contract (Anchor/Rust)
│   ├── lib.rs                         # Program entry point (8 instructions)
│   ├── state.rs                       # Account structs (PlatformState, Market, Position, Agent)
│   ├── constants.rs                   # PDA seeds & constants
│   ├── error.rs                       # Custom error codes
│   ├── instructions.rs                # Instruction module declarations
│   └── instructions/                  # Instruction handlers
│       ├── initialize.rs
│       ├── create_market.rs
│       ├── take_position.rs
│       ├── register_agent_user.rs
│       ├── deploy_agent.rs
│       ├── update_probabilities.rs
│       ├── settle_market.rs
│       └── claim_reward.rs
├── app/                               # Next.js 16 frontend
│   ├── public/images/                 # Static image assets
│   ├── src/
│   │   ├── app/                       # App Router pages & layouts
│   │   │   ├── layout.tsx             # Root layout (wallet providers, fonts)
│   │   │   ├── page.tsx               # Home page (main dashboard)
│   │   │   ├── globals.css            # Global stylesheet
│   │   │   ├── category/[sector]/     # Dynamic sector pages (Finance, Crypto, etc.)
│   │   │   ├── for-you/              # Personalized feed page
│   │   │   ├── latest/               # Latest competitions page
│   │   │   └── signals/              # Signals feed page
│   │   ├── components/                # React components
│   │   │   ├── Header.tsx             # Navigation & wallet connect
│   │   │   ├── SectorNav.tsx          # Sector category navigation
│   │   │   ├── SectorFeed.tsx         # Competition feed per sector
│   │   │   ├── ProbabilityCurve.tsx   # Real-time 3-outcome probability chart
│   │   │   ├── DeployAgent.tsx        # AI agent deployment side-drawer
│   │   │   ├── AgentManager.tsx       # Agent portfolio management
│   │   │   ├── AgentPosition.tsx      # Individual agent position view
│   │   │   ├── CompetitionLeaderboard.tsx  # Live competition rankings
│   │   │   ├── CompetitionTimer.tsx   # Countdown timer for competitions
│   │   │   ├── DataFeeds.tsx          # Live data feed stream
│   │   │   ├── Leaderboard.tsx        # Global leaderboard
│   │   │   ├── Performance.tsx        # Portfolio P&L tracking
│   │   │   ├── SentimentAnalysis.tsx  # NLP sentiment dashboard
│   │   │   ├── ValueCreationPool.tsx  # Pool metrics display
│   │   │   └── WalletProvider.tsx     # Solana wallet adapter wrapper
│   │   ├── hooks/                     # Custom React hooks
│   │   │   ├── useAgentPredictions.ts # Agent prediction polling
│   │   │   ├── useClusterData.ts      # News cluster data fetching
│   │   │   ├── useCompetitions.ts     # Competition state management
│   │   │   ├── useLiveFeed.ts         # Real-time data feed stream
│   │   │   ├── useOnChainMarket.ts    # On-chain market data via Anchor
│   │   │   ├── useRealtimeAgents.ts   # Real-time agent updates
│   │   │   └── useRealtimeMarkets.ts  # Real-time market updates
│   │   └── lib/                       # Utilities & clients
│   │       ├── supabase.ts            # Supabase client configuration
│   │       ├── solana.ts              # Solana connection setup
│   │       ├── dummy-data.ts          # Fallback/seed data
│   │       └── idl/exoduze.json       # Anchor IDL for on-chain interactions
│   ├── next.config.ts                 # Next.js configuration
│   ├── vercel.json                    # Vercel deployment config
│   └── package.json
├── api/                               # NestJS Backend Service
│   ├── src/
│   │   ├── main.ts                    # Application bootstrap & CORS config
│   │   ├── app.module.ts              # Root module (all feature modules)
│   │   ├── root.controller.ts         # Health check endpoint
│   │   ├── health.controller.ts       # Detailed health controller
│   │   ├── common/                    # Shared infrastructure
│   │   │   ├── guards/               # JWT & role-based auth guards
│   │   │   ├── middleware/            # Rate-limiting & anti-chunking
│   │   │   ├── interceptors/         # Response transformation
│   │   │   ├── filters/              # Exception filters
│   │   │   ├── decorators/           # Custom param decorators
│   │   │   ├── services/             # Shared services (Supabase, etc.)
│   │   │   ├── idl/                  # Anchor IDL (backend copy)
│   │   │   └── utils/                # Helper utilities
│   │   ├── config/                    # Environment validation
│   │   ├── database/                  # Database module & Supabase service
│   │   ├── modules/                   # Feature modules
│   │   │   ├── admin/                # Admin dashboard & management
│   │   │   ├── agents/               # AI agent CRUD & predictions
│   │   │   ├── auth/                 # Authentication (JWT, OAuth, Wallet)
│   │   │   ├── competitions/         # Competition lifecycle management
│   │   │   ├── dashboard/            # Dashboard analytics
│   │   │   ├── deposits/             # Deposit processing
│   │   │   ├── email/                # Email & OTP verification
│   │   │   ├── markets/              # Market data & clustering engine
│   │   │   ├── notifications/        # Push notification service
│   │   │   ├── orders/               # Order management
│   │   │   ├── referrals/            # Referral system
│   │   │   ├── security/             # Security monitoring & audit
│   │   │   ├── settings/             # User settings
│   │   │   ├── sports/               # Sports data integration
│   │   │   ├── transactions/         # Transaction history
│   │   │   └── users/                # User profile management
│   │   └── scripts/                   # Debug & maintenance scripts
│   ├── scripts/                       # Admin scripts (seed, cleanup, etc.)
│   ├── supabase/migrations/           # PostgreSQL migrations & RLS policies (68 files)
│   ├── render.yaml                    # Render deployment config
│   └── package.json
├── documentation/                     # Project documentation library
│   ├── Doc.md                         # Master documentation
│   ├── API-Integration.md            # REST API reference
│   ├── Market-System-Architecture.md # Probability engine design
│   ├── Security-Architecture.md      # Security hardening docs
│   ├── Real-Time-Data-Architecture.md # Real-time data pipeline
│   ├── AI-Recommendations-System.md  # AI agent system design
│   ├── RabbitMQ-Integration.md       # Message queue architecture
│   ├── Sports-System.md             # Sports data integration
│   ├── Wallet-Authentication-System.md # Wallet auth flow
│   ├── Google-OAuth-Integration.md   # OAuth2 integration
│   ├── Email-Verification-System.md  # Email OTP system
│   ├── Withdrawal-System.md         # Withdrawal processing
│   ├── Frontend-Architecture.md      # Frontend design patterns
│   ├── Admin-Features.md            # Admin dashboard features
│   ├── Asset-Management.md          # Asset & image management
│   ├── Image-Scraping-ETL.md        # ETL pipeline for images
│   └── Guidelines.md                # Development guidelines
├── Anchor.toml                        # Anchor deployment configuration
├── Cargo.toml                         # Rust workspace configuration
├── rust-toolchain.toml                # Rust toolchain version pinning
├── doc.md                             # Quick reference documentation
├── system.md                          # System architecture overview
└── README.md                          # Project documentation
```

## ⛓️ On-Chain Information

> **Network:** Solana Devnet

| Property | Value |
|----------|-------|
| **Program ID (Devnet)** | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |
| **Program ID (Localnet)** | `Dm5GkFcUkuCfrGNGt5jm5Ujqcg6NU4xmP52oJfb8uUSt` |
| **Deploy Authority (Wallet)** | `8g4DwqHDWasZdtA6yEVrfSX4eySFr1kbsKE81wGgzKXN` |
| **Cluster** | `devnet` (`https://api.devnet.solana.com`) |
| **Anchor Version** | `0.32.1` |

### 🔗 Explorer Links

| Resource | Link |
|----------|------|
| **Program (Devnet)** | [Solana Explorer](https://explorer.solana.com/address/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet) |
| **Wallet (Devnet)** | [Solana Explorer](https://explorer.solana.com/address/8g4DwqHDWasZdtA6yEVrfSX4eySFr1kbsKE81wGgzKXN?cluster=devnet) |
| **SolScan Program** | [SolScan](https://solscan.io/account/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet) |
| **SolScan Wallet** | [SolScan](https://solscan.io/account/8g4DwqHDWasZdtA6yEVrfSX4eySFr1kbsKE81wGgzKXN?cluster=devnet) |
| **Solana.fm Program** | [Solana.fm](https://solana.fm/address/56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7?cluster=devnet-solana) |

### 🔑 Key Files

| File | Description |
|------|-------------|
| `~/.config/solana/id.json` | Deploy authority keypair (wallet) |
| `target/deploy/exoduze-keypair.json` | Program keypair |
| `Anchor.toml` | Cluster & program configuration |
| `app/src/lib/idl/exoduze.json` | Anchor IDL (frontend) |
| `app/src/lib/solana.ts` | Frontend program ID constant |
| `programs/smart-contract/src/lib.rs` | On-chain `declare_id!` |

### 🏗️ PDA Seeds (Program Derived Addresses)

| PDA | Seed | Purpose |
|-----|------|---------|
| **Platform** | `b"platform"` | Core platform state & pool balance |
| **Market** | `b"market"` | Individual competition/market state |
| **Position** | `b"position"` + `trader` + `index` | User's trading position |
| **Vault** | `b"vault"` | SOL custody (Value Creation Pool) |
| **Agent** | `b"agent"` | AI agent on-chain registration |
| **Agent Registry** | `b"agent_registry"` | Per-user agent quota tracking |
| **Leaderboard** | `b"leaderboard"` | Competition leaderboard state |

### 💻 Quick CLI Commands

```bash
# Check your wallet address
solana address

# Check your wallet balance
solana balance

# View program account
solana account 56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7 --url devnet

# Airdrop SOL for testing (devnet only)
solana airdrop 2 --url devnet

# View program logs
solana logs 56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7 --url devnet

# Sync Anchor keys after build
anchor keys sync
anchor keys list
```

## 📄 Smart Contract Instructions

**Program ID:** `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` *(Devnet)*

| Instruction | Description |
|---|---|
| `initialize_platform` | Initializes the core platform states and the Value Creation Pool vault. |
| `create_market` | Creates a 3-way probability market with sector, competition timing, and bonding curve. |
| `take_position` | Takes a Long/Short position on a market outcome with bonding curve pricing. |
| `register_agent_user` | Registers user for AI agent deployment by creating a quota PDA. |
| `deploy_agent` | Deploys an AI agent on-chain with a custom strategy prompt (checks quota). |
| `update_probabilities` | Updates market probabilities based on Oracle/Engine data (admin only). |
| `settle_market` | Settles the market declaring the winning outcome. |
| `claim_reward` | Processes reward claims from the Value Creation Pool. |

## 📜 License

[ISC License](LICENSE)

