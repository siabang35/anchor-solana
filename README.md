# DeJaVu — AI Probability Trading Platform

<div align="center">

**Non-Zero-Sum · Skill-Based · Transparent Discovery**

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana)](https://explorer.solana.com/address/95fmbWqB23YMi5xTEZzwQmgnGUbHDWCA6MR7Es4G6NxN?cluster=devnet)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blue?style=for-the-badge)](https://www.anchor-lang.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)

</div>

---

DeJaVu adalah platform probability trading generasi baru yang menggunakan **AI agents** untuk menganalisis sentimen multi-sumber dan memprediksi pergerakan probabilitas outcome secara real-time. Berbeda dengan platform trading konvensional, DeJaVu menggunakan model **Non-Zero-Sum** dimana profit berasal dari **Value Creation Pool**, bukan dari kerugian trader lain.

## ✨ Highlights

| Principle | Description |
|---|---|
| 🏦 Non-Zero-Sum Rewards | Profit berasal dari Value Creation Pool — bukan dari loss trader lain |
| 🧠 AI-Driven Competition | Kompetisi berbasis kualitas AI prompting & analisis sentimen |
| 📊 Transparent Discovery | Reward berdasarkan kontribusi akurasi informasi ke pasar |
| 🔓 OpenClaw Framework | Deploy AI agent dengan custom strategy prompt |

## 🔄 How It Works

```
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

- **Live Probability Curve** — Real-time 3-outcome visualization (Home/Draw/Away) with NLP-driven probability engine
- **AI Agent Deployment (OpenClaw)** — Deploy agent dengan custom strategy prompt, watch it analyze data live
- **NLP Sentiment Pipeline** — Simulated LLM pipeline: Sentiment → Momentum → Volatility → Bayesian Engine
- **Live Data Feed Simulation** — Streaming feeds with impact classification (high/medium/low)
- **Portfolio & P&L Tracking** — Real-time unrealized P&L, accuracy score, exposure level
- **Value Creation Pool** — Non-zero-sum reward visualization
- **Leaderboard** — Ranking berdasarkan return dan accuracy
- **Light/Dark Theme** — Toggle between premium dark and clean light mode
- **Responsive Design** — Full mobile and desktop support

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Anchor 0.32.1 (Rust) on Solana |
| Frontend | Next.js 16 + TypeScript |
| Charting | Chart.js + react-chartjs-2 |
| Wallet | @solana/wallet-adapter (Phantom, Solflare) |
| Styling | Vanilla CSS (glassmorphism + light theme) |
| Deploy | Vercel (frontend) + Solana Devnet (contract) |

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- Rust + Cargo
- Solana CLI ≥ 2.0
- Anchor CLI ≥ 0.32

### Setup

```bash
# Clone & install
git clone https://github.com/siabang35/anchor-solana.git
cd anchor-solana
yarn install

# Build smart contract
anchor build
anchor keys sync

# Deploy to devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet

# Start frontend
cd app
npm install
npm run dev
# → http://localhost:3000
```

### Deploy to Vercel

```bash
cd app
npx vercel --prod
```

Or connect the `app/` directory to Vercel dashboard with:
- **Framework:** Next.js
- **Root Directory:** `app`
- **Build Command:** `npm run build`
- **Output Directory:** `out`

## 📁 Project Structure

```
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
├── app/                         # Next.js frontend
│   └── src/
│       ├── app/                 # Pages & layout
│       ├── components/          # React components
│       └── lib/                 # Utilities & dummy data
├── tests/                       # Anchor tests
├── Anchor.toml                  # Anchor configuration
└── README.md
```

## 📄 Smart Contract

**Program ID:** Your Program ID

| Instruction | Description |
|---|---|
| `initialize_platform` | Initialize platform + Value Creation Pool vault |
| `create_market` | Create 3-way probability market |
| `take_position` | Take UP/DOWN position on outcome probability |
| `deploy_agent` | Deploy AI agent with strategy prompt |
| `update_probabilities` | Update market probabilities (admin) |
| `settle_market` | Settle market with winning outcome |
| `claim_reward` | Claim reward from Value Creation Pool |

## 📜 License

ISC
