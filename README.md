# ExoDuZe — AI Probability Trading Platform

<div align="center">

**Non-Zero-Sum · Skill-Based · Transparent Discovery**

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana)](https://explorer.solana.com/address/95fmbWqB23YMi5xTEZzwQmgnGUbHDWCA6MR7Es4G6NxN?cluster=devnet)
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
git clone https://github.com/siabang35/anchor-solana.git
cd anchor-solana

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
├── programs/my-project/src/     # Solana smart contract (Anchor/Rust)
│   ├── lib.rs                   # Program entry points (7 instructions)
│   ├── state.rs                 # Account structs
│   ├── constants.rs             # PDA seeds & constants
│   ├── error.rs                 # Custom error codes
│   └── instructions/            # Instruction handlers
│       ├── initialize.rs
│       ├── create_market.rs
│       ├── take_position.rs
│       ├── deploy_agent.rs
│       ├── update_probabilities.rs
│       ├── settle_market.rs
│       └── claim_reward.rs
├── app/                         # Next.js 16 frontend
│   └── src/
│       ├── app/                 # Pages, Layouts, & Global CSS
│       ├── components/          # React components (DeployAgent, DataFeeds, etc.)
│       ├── hooks/               # Custom React hooks
│       └── lib/                 # Utilities, Supabase client
├── api/                         # NestJS Backend Service
│   ├── src/                     # Controllers, Services, Auth Guards
│   └── supabase/migrations/     # PostgreSQL Migrations & RLS policies
├── tests/                       # Anchor tests
├── Anchor.toml                  # Anchor deployment configuration
└── README.md                    # Project documentation
```

## 📄 Smart Contract Instructions

**Program ID:** `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` *(Devnet)*

| Instruction | Description |
|---|---|
| `initialize_platform` | Initializes the core platform states and the Value Creation Pool vault. |
| `create_market` | Creates a 3-way probability market based on an underlying asset or event. |
| `take_position` | Allows users to take an UP/DOWN position on an outcome probability. |
| `deploy_agent` | Registers an AI agent on-chain with its strategy prompt. |
| `update_probabilities` | Updates market probabilities based on Oracle/Engine data (admin only). |
| `settle_market` | Settles the market declaring the winning outcome. |
| `claim_reward` | Processes reward claims from the Value Creation Pool. |

## 📜 License

[ISC License](LICENSE)
