# ExoDuZe Smart Contract Architecture

> **ExoDuZe — Decentralized AI Probability Markets**
> Network: Solana Devnet
> Framework: Anchor v0.32.1

---

## 1. Overview

The ExoDuZe smart contract is the trustless execution and settlement engine powering the ExoDuZe AI prediction platform. Unlike traditional zero-sum betting platforms, ExoDuZe leverages a **Value Creation Pool** and an **Automated Market Maker (AMM)** powered by a dynamic bonding curve.

Users deploy AI agents (Forecasters) and stake native SOL. The smart contract acts as a secure escrow, manages user quotas via Program Derived Addresses (PDAs), calculates pool distributions, and facilitates trustless prize disbursements upon market settlement.

---

## 2. Program Architecture

The program (`exoduze`) is designed with strict access controls, isolated state accounts (PDAs), and verifiable randomness/settlement ledgers.

### 2.1 Core State Accounts (PDAs)

All state in ExoDuZe is managed through deterministic PDAs to prevent unauthorized access and ensure data integrity.

| Account Struct | Purpose | Seeds |
|---|---|---|
| `Platform` | Global state, admin authority, total metrics, and Value Creation Pool balance. | `"platform"` |
| `Market` | Represents a single prediction market across 7 sectors. Stores probabilities, lifecycle timestamps, and bonding curve configurations (`k`, `n`). | `"market", market_index` |
| `Position` | Tracks a trader's Long/Short position on a specific outcome, including realized/unrealized PnL. | `"position", market_key, trader_key` |
| `Agent` | Records an AI Agent's deployment, strategy prompt, target outcome, and risk parameters. | `"agent", market_key, owner_key, agent_index` |
| `AgentRegistry` | Manages per-user AI agent deployment quotas (default 10 free deploys) to prevent spam. | `"agent_registry", user_key` |
| `CompetitionPool` | Escrow account for a market's prize pool. Aggregates stakes, tracks platform fees (2%), and calculates the distributable pool. | `"competition_pool", market_key` |
| `PoolVault` | System Account PDA acting as the secure SOL custody vault for staked funds. | `"pool_vault", market_key` |

---

## 3. Instruction Set

### 3.1 Platform & Market Lifecycle

*   **`initialize_platform(pool_deposit: u64)`**
    Initializes the global `Platform` account. Must be called by the designated admin. Injects initial liquidity into the Value Creation Pool.
*   **`create_market(title, team_home, team_away, probabilities, sector, start, end, bonding_k, bonding_n)`**
    Mints a new `Market` PDA. Initializes the underlying Automated Market Maker (AMM) using the specified bonding curve parameters (`k` and `n`).

### 3.2 AI Agent & User Management

*   **`register_agent_user()`**
    Initializes an `AgentRegistry` PDA for a new user. Grants an initial quota of `max_deploys` (10) for free AI agent deployments.
*   **`deploy_agent(strategy_prompt, target_outcome, direction, risk_level)`**
    Registers an AI agent's configuration on-chain. Validates and decrements the user's available quota from `AgentRegistry`.

### 3.3 Trading & Staking

*   **`take_position(outcome, direction, amount)`**
    Allows a user to take a Long or Short position on a specific market outcome. Calculates entry probability and updates the market's total volume.
*   **`stake_pool(amount: u64)`**
    Locks native SOL into the `PoolVault` PDA. Updates the `CompetitionPool` state. Enforces an **Anti-Whale limit** (`max_stake_per_user` = 10 SOL) to prevent liquidity monopolization.

### 3.4 Settlement & Disbursement

*   **`update_probabilities(new_probabilities: [u16; 3])`**
    Admin-only instruction. Syncs the on-chain market probabilities with the backend's AI-driven Bayesian curve engine.
*   **`settle_market(winning_outcome: u8)`**
    Locks the market state, marks the `winning_outcome`, and transitions the market/pool to a `Settled` status.
*   **`admin_disburse_prize(amount: u64)`**
    Executed by the backend's automated cron job. Uses PDA `invoke_signed` to trustlessly transfer SOL from the `PoolVault` to the winning user's wallet. Ensures absolute atomicity without exposing raw Lamport transfers.
*   **`claim_pool_prize()`**
    Alternative permissionless claim mechanism for users to withdraw their proportional share of the `distributable_pool` after settlement.
*   **`claim_reward()`**
    Distributes rewards from the global Value Creation Pool to top-performing agents.

---

## 4. Security & Protections

### 4.1 Anti-Whale Mechanics
The `stake_pool` instruction enforces a strict `10_000_000_000` lamports (10 SOL) hard cap per user per competition. This prevents deep-pocketed actors from skewing the `distributable_pool` yield curves.

### 4.2 PDA Vault Signing (`invoke_signed`)
All prize disbursements and reward claims utilize Cross-Program Invocations (CPI) with `invoke_signed`. 
*   **Why?** The smart contract never relies on manual admin wallets to disburse funds. The `PoolVault` PDA is the sole owner of the staked SOL, and only the program itself can cryptographically sign off on transfers out of the vault when settlement conditions are met.

### 4.3 Stake-Deploy Decoupling
Agent deployments (`deploy_agent`) and financial stakes (`stake_pool`) are isolated instructions. This allows users to deploy analytical agents purely for leaderboard prestige (using their free quota) without risking capital, fostering a skill-first ecosystem.

### 4.4 Multiplier Hardening (v2)
In version 2, the `claim_pool_prize` logic was stripped of arbitrary 1.5x multipliers. Prizes are now calculated strictly mathematically from the `distributable_pool` based on real fractional shares (BPS - Basis Points), preventing vault over-drain attacks.

---

## 5. Deployment Guide

### Prerequisites
*   Rust 1.79+
*   Solana CLI (`>= 1.18.x`)
*   Anchor CLI (`0.32.1`)

### Build & Deploy

1.  **Configure environment:**
    ```bash
    solana config set --url devnet
    ```

2.  **Build the program:**
    ```bash
    anchor build
    ```

3.  **Sync Program ID:**
    Ensure the Program ID in `Anchor.toml` matches the newly generated keypair.
    ```bash
    anchor keys sync
    ```

4.  **Deploy to Devnet:**
    ```bash
    anchor deploy --provider.cluster devnet
    ```

### Deployed Addresses
*   **Program ID**: `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7`
*   **Network**: Solana Devnet

---

*Engineered by ExoDuZe.*
