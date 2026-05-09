# Market Pool & Settlement System

## Overview

The **Market Pool & Settlement System** is the core prize distribution engine for ExoDuZe competitions. Each competition/target market in every category (Finance, Crypto, Politics, etc.) has its own independent prize pool, funded by participant stakes during agent deployment. Winners are determined by weighted scoring (Brier Score × Curve Difficulty) and prizes are distributed automatically via on-chain settlement.

> **Key Feature (v2):** Every agent deployment now automatically creates a `pool_stake` with a **real Solana devnet transaction**, ensuring all stakes are verifiable on [Solscan](https://solscan.io/?cluster=devnet). Prize disbursement is fully automated via the Treasury Keypair.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    USER DEPLOYS AGENT                      │
│         (selects category → target market → stake)         │
└──────────────────┬───────────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────────┐
     │   AUTO-STAKE (PoolService)                      │
     │   1. Treasury self-transfer on Solana devnet    │
     │   2. Real TX signature generated                │
     │   3. pool_stake inserted with onchain_tx        │
     │   4. DB trigger updates competition_pools       │
     └─────────────┬──────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────────┐
     │   OPTIONAL: WALLET STAKE (Web3 Users)           │
     │   SOL transfer from Phantom → Pool Vault PDA    │
     │   SystemProgram.transfer() on devnet            │
     │   TX synced to backend via /agents/wager        │
     └─────────────┬──────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────────┐
     │         COMPETITION RUNS                        │
     │   AI agents make predictions in real-time       │
     │   Weighted scores accumulate (Brier × Diff)     │
     │   Leaderboard updates via Supabase Realtime     │
     └─────────────┬──────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────────┐
     │         AUTOMATED SETTLEMENT (Cron)             │
     │   RealtimeCompetitionSeederService detects end  │
     │   → winning_outcome set from outcomes array     │
     │   → settle_competition_pool() RPC called        │
     │   → Top 3 winners determined from leaderboard   │
     │   → Settlement hash generated (audit trail)     │
     │   → Global leaderboard refreshed                │
     └─────────────┬──────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────────┐
     │   USER-INITIATED PRIZE CLAIM (Pull System)      │
     │   User clicks "Claim Reward" in AgentManager    │
     │   → ClaimRateLimitGuard verifies limits         │
     │   → Concurrency Lock acquired (anti race-cond)  │
     │   → Multi-layer wallet + Profile verification   │
     │   → Pessimistic double-check of claim status    │
     │   → Treasury → Winner wallet (SOL transfer)     │
     │   → Claim TX recorded & Lock released           │
     └────────────────────────────────────────────────┘
```

> **v2.1 Upgrade (2026-05-09):** Transitioned from backend-automated "Push" disbursement to a highly secure "Pull" User-Initiated Claim system. Smart contract uses `invoke_signed` PDA signing for vault withdrawals. The system now features Enterprise-grade concurrency locks, ClaimRateLimitGuards (IP/Wallet blocking), and deep wallet ownership validation.
> **100% Risk Policy (2026-05-09):** Removed the 50% refund on loss mechanism. Stakes are now fully committed to the prize pool, adhering to the pure 100% risk principle.

## Treasury Keypair & On-Chain Operations

> ⚠️ **SECURITY**: The Treasury **private key** (`SOLANA_TREASURY_PRIVATE_KEY`) is stored exclusively in the API `.env` file, which is `.gitignored`. **NEVER** commit, log, or expose the private key in documentation, frontend code, or version control.

| Property | Value |
|----------|-------|
| **Network** | Solana Devnet |
| **Treasury Public Key** | `F4XPPgs4LA6kH4DBF12C3uzp7KYLCxcfWddGSkSw1nQE` |
| **RPC Endpoint** | `https://api.devnet.solana.com` |
| **Program ID** | `56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7` |

### Treasury Operations

| Operation | Method | Description |
|-----------|--------|-------------|
| **Auto-Stake TX** | `generateDevnetStakeTx()` | Self-transfer from treasury (creates verifiable Solscan TX) |
| **Prize Claim** | `claimPrize()` | Validates user-initiated request, acquires lock, executes transfer |
| **Prize Transfer** | `sendPrizeTransfer()` | SOL transfer from treasury to verified winner wallet |
| **Simulated Disbursement** | `simulateDisbursement()` | Devnet airdrop fallback when treasury has insufficient funds |

## Database Schema

### `competition_pools`
Per-competition pool with financial tracking and settlement status.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `competition_id` | UUID | FK → competitions |
| `total_staked` | DECIMAL(18,8) | Total SOL staked |
| `platform_fee` | DECIMAL(18,8) | 2% platform fee |
| `distributable_pool` | DECIMAL(18,8) | Prize pool after fee |
| `winner_1_share` | INTEGER | 5000 (50%) |
| `winner_2_share` | INTEGER | 3000 (30%) |
| `winner_3_share` | INTEGER | 2000 (20%) |
| `settlement_status` | ENUM | pending/settling/settled/disputed/cancelled |
| `stake_count` | INTEGER | Number of participants |
| `max_stake_per_user` | DECIMAL(18,8) | Anti-whale: max 5 SOL |
| `min_stake` | DECIMAL(18,8) | Min 0.01 SOL |
| `onchain_pool_pubkey` | VARCHAR(64) | Solana pool PDA |
| `onchain_settle_tx` | VARCHAR(128) | Settlement TX hash |
| `settlement_hash` | TEXT | SHA256 integrity hash |

### `pool_stakes`
Individual participant stake records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `pool_id` | UUID | FK → competition_pools |
| `competition_id` | UUID | FK → competitions |
| `user_id` | UUID | FK → auth.users |
| `agent_id` | UUID | FK → agents |
| `stake_amount` | DECIMAL(18,8) | Amount staked (SOL) |
| `onchain_tx` | VARCHAR(128) | Solana TX signature |
| `status` | VARCHAR(20) | active/refunded/claimed |
| `stake_sequence` | INTEGER | Auto-set by trigger |

**Constraint:** One stake per user per competition (anti-whale).

### `pool_winners`
Settlement results — determined winners with prizes.

| Column | Type | Description |
|--------|------|-------------|
| `rank` | INTEGER | 1, 2, or 3 |
| `agent_id` | UUID | Winning agent |
| `agent_name` | VARCHAR(100) | Agent display name |
| `final_weighted_score` | DECIMAL(10,6) | Score at settlement |
| `final_accuracy` | DECIMAL(6,2) | Percentage (0-100) |
| `prediction_count` | INTEGER | Total predictions made |
| `prize_amount` | DECIMAL(18,8) | Prize in SOL |
| `prize_share_bps` | INTEGER | Basis points of pool |
| `claimed` | BOOLEAN | On-chain claim status |
| `claim_tx` | VARCHAR(128) | Claim TX signature |
| `settlement_snapshot` | JSONB | Full leaderboard at settlement |

### `pool_settlement_audit`
Immutable audit trail with HMAC chain integrity.

| Column | Type | Description |
|--------|------|-------------|
| `event_type` | VARCHAR(50) | stake_added, settlement_started, etc. |
| `event_hash` | TEXT | SHA256 hash |
| `previous_hash` | TEXT | Chain link to prior event |
| `details` | JSONB | Event metadata |

### `global_leaderboard` (Materialized View)
Cross-competition aggregated rankings.

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | UUID | Agent identifier |
| `competitions_entered` | BIGINT | Total competitions |
| `total_predictions` | BIGINT | All predictions |
| `avg_weighted_score` | NUMERIC | Average score |
| `total_wins` | BIGINT | Total pool wins |
| `total_prize_earned` | NUMERIC | Total SOL earned |
| `global_accuracy` | NUMERIC | Computed accuracy % |

## Security & Fairness Protocols

### Anti-Whale Protection
- **Max stake per user per competition:** 5.00 SOL
- **Min stake:** 0.01 SOL
- **One stake per user per competition** (enforced by UNIQUE constraint)
- DB trigger `validate_stake()` enforces all limits

### Anti-Manipulation & Enterprise Claim Security
- **Settlement hash chain:** Each settlement event is hashed and chained
- **Server-side settlement only:** `service_role` required to settle pools
- **Locked settlement:** Pool status transitions `pending → settling → settled` with row-level locking
- **Concurrency Locking (Mutex):** `claimLocks` Set prevents double-spend race conditions on claims.
- **Pessimistic Verification:** Claim status is checked before and immediately after processing.
- **Wallet Ownership Resolution:** Agent ownership is validated by checking the raw `walletAddress` AND the resolved profile UUID recursively.

### Anti-Throttling & Guarding
- **ClaimRateLimitGuard:** Blocks brute-force claim attacks using dynamic IP and Wallet tracking. Suspicous IPs/Wallets are auto-blocked.
- **Minimum prediction intervals** (anti-chunking from migration 063)
- **Score velocity clamping** prevents rapid score manipulation
- **Rate limiting** on stake API endpoints

### Fair Winner Determination
Winners are ranked by **weighted_score** (lower = better):

```
weighted_score = brier_score × difficulty_factor × (1 / time_remaining_factor)
```

Where:
- `brier_score` = (prediction - outcome)² averaged over all predictions
- `difficulty_factor` = curve volatility at prediction time
- `time_remaining_factor` = bonus for earlier predictions

### Guaranteed Multi-Winner Settlement (v2.1)
The settlement SQL function (`settle_competition_pool`) dynamically guarantees exactly **3 winners (Rank 1, 2, and 3)** as long as there are sufficient participants. It explicitly disregards the agent's current `status` (active vs terminated) and the rigid `has_min_predictions` filter to ensure players are never robbed of their rightful prize rank due to operational agent lifecycles.

### Row Level Security (RLS)
- `competition_pools`: Public read, service_role write
- `pool_stakes`: Users see own stakes, service_role manages
- `pool_winners`: Public read, service_role write
- `pool_settlement_audit`: service_role only

## On-Chain (Solana Devnet)

### Program Instructions

| Instruction | Description |
|-------------|-------------|
| `stake_pool` | Transfer SOL to competition pool vault PDA |
| `claim_pool_prize` | Claim winnings from settled pool vault (proportional share, no multiplier) |
| `admin_disburse_prize` | Admin-only: disburse prize from vault to winner wallet (used by settlement cron) |

> **v2 Fix:** `claim_pool_prize` no longer applies the 1.5x `POOL_MULTIPLIER`. Prizes are now `(user_stake / total_staked) × distributable_pool`, ensuring total claims never exceed vault balance. Both claim instructions now use `invoke_signed` with PDA seeds for secure vault withdrawal.

### PDA Seeds

| PDA | Seeds | Purpose |
|-----|-------|---------|
| **Competition Pool** | `b"competition_pool"` + `market.key()` | Pool state per market |
| **Pool Vault** | `b"pool_vault"` + `market.key()` | SOL custody for stakes |

### CompetitionPool State (On-Chain)

```rust
pub struct CompetitionPool {
    pub authority: Pubkey,          // Platform admin
    pub market: Pubkey,             // Associated market
    pub total_staked: u64,          // Total lamports staked
    pub platform_fee: u64,          // 2% fee accumulated
    pub distributable_pool: u64,    // Prize pool (98%)
    pub stake_count: u64,           // Number of stakers
    pub claims_count: u64,          // Prizes claimed
    pub max_stake_per_user: u64,    // 10 SOL (lamports)
    pub is_settled: bool,           // Settlement flag
    pub settled_at: Option<i64>,    // Settlement timestamp
    pub bump: u8,                   // PDA bump
}
```

### Auto-Stake Flow (v2 — Automatic)
Every agent deployment triggers an automatic pool stake with a **real Solana devnet transaction**:

1. User deploys AI agent via `DeployAgent.tsx` (selecting competition + strategy).
2. Backend `AgentsService.deployForecaster()` creates the agent and links it to the competition.
3. `PoolService.autoStakeWithDevnetTx()` is called automatically:
   - Verifies pool exists and is `pending` (not already settled).
   - Checks for duplicate stakes (one per agent per competition).
   - Generates a **real devnet TX** via `generateDevnetStakeTx()`:
     - **Primary**: Treasury self-transfer (`SystemProgram.transfer` from treasury to treasury).
     - **Fallback**: Devnet airdrop to a temporary keypair.
   - Inserts `pool_stake` with the real TX signature.
   - DB trigger `update_pool_on_stake()` auto-increments `total_staked`, `stake_count`, `platform_fee`, and `distributable_pool`.
4. Frontend receives the update via Supabase Realtime (`useCompetitionPool` hook).
5. `CompetitionPoolWinners.tsx` renders the stake with a clickable **Solscan link**.

### Manual Stake Flow (Web3 Wallet Users)
1. User connects Phantom/Solflare wallet.
2. Enters stake amount in DeployAgent UI.
3. Frontend derives `pool_vault` PDA using `PublicKey.findProgramAddressSync`.
4. Creates `SystemProgram.transfer` transaction to pool vault.
5. Wallet signs and sends to Solana devnet.
6. Backend receives TX signature via `POST /agents/wager`.
7. `AgentsService.createWager()` records wager + pool_stake with the real TX.
8. DB trigger auto-updates `competition_pools` totals.
9. Frontend renders the on-chain stake with direct Solscan link.

### Solscan Integration
All TX hashes are trackable on Solscan Devnet:
- **Stake TXs**: `https://solscan.io/tx/{onchain_tx}?cluster=devnet`
- **Disbursement TXs**: `https://solscan.io/tx/{disburse_tx}?cluster=devnet`
- UI displays truncated hashes (`shortTx()`: `abc123…xyz9`) with full-hash tooltips and clickable links.

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pool/competition?competition_id=UUID` | Pool + winners for one competition |
| `GET` | `/pool/sector?sector=finance&limit=3` | Sector pool summary + top winners |
| `GET` | `/pool/global?limit=4` | Global pool summary + champions |

### Authenticated Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pool/stake` | Stake SOL on agent in competition |
| `POST` | `/pool/settle` | Settle competition pool (admin) |
| `POST` | `/pool/claim` | Process a user-initiated reward claim (Hardened) |

### Response Examples

**GET /pool/sector?sector=crypto&limit=3**
```json
{
  "pool": {
    "sector": "crypto",
    "total_pool": 12.50,
    "total_staked": 12.76,
    "platform_fees": 0.26,
    "competition_count": 3,
    "active_competitions": 2,
    "total_participants": 18
  },
  "winners": [
    {
      "rank": 1,
      "agent_name": "CryptoOracle",
      "prize_amount": 3.75,
      "final_accuracy": 87.3,
      "prediction_count": 24
    }
  ]
}
```

**GET /pool/global?limit=4**
```json
{
  "pool": {
    "total_pool": 45.80,
    "total_staked": 46.74,
    "competition_count": 12,
    "total_participants": 67,
    "sectors": [
      { "sector": "crypto", "pool": 12.50, "competitions": 3 },
      { "sector": "finance", "pool": 10.20, "competitions": 4 }
    ]
  },
  "winners": [
    {
      "rank": 1,
      "agent_name": "AlphaPredictor",
      "global_accuracy": 92.1,
      "total_wins": 3,
      "total_prize_earned": 8.75
    }
  ]
}
```

## Frontend Components

### CategoryPoolWinners
Per-sector pool display with:
- Hero pool amount (gradient text)
- Settlement progress bar
- Participant/competition stats grid
- Top 3 winners with rank badges (🥇🥈🥉)
- Prize distribution breakdown

### GlobalPoolWinners
Cross-platform pool display with:
- Global pool amount (multi-color gradient)
- Total staked / competitions / participants stats
- Sector breakdown chips
- Top 4 global champions with win counts
- Reward formula explanation

### DeployAgent (Updated Stake UI)
- SOL amount input with SOLANA badge
- Real devnet network indicator
- Prize pool split display (50/30/20)
- Anti-whale max limit display (5 SOL)
- Platform fee transparency (2%)
- Dynamic deploy button showing stake amount

## Database Functions

| Function | Purpose |
|----------|---------|
| `settle_competition_pool(UUID, TEXT)` | Full settlement: lock → rank → distribute → audit |
| `get_competition_pool_with_winners(UUID)` | Pool + winners JSON for one competition |
| `get_sector_pool_summary(TEXT)` | Aggregated pool metrics for a sector |
| `get_global_pool_summary()` | Platform-wide pool metrics |
| `refresh_global_leaderboard()` | Refresh materialized view |
| `validate_stake()` | Trigger: anti-whale stake validation |
| `update_pool_on_stake()` | Trigger: auto-update pool totals |
| `auto_create_competition_pool()` | Trigger: auto-create pool for new competitions |

## Migration Files

| Migration | Description |
|-----------|-------------|
| `070_pool_settlement.sql` | Core pool system: ledger, stakes, winners, settlement, RLS, triggers |
| `073_fix_pool_stake_count_drift.sql` | Drift-proof triggers using `COUNT(*)` + `SUM()` aggregates |
| `074_fix_competition_lifecycle.sql` | Fixed false-cap violations on horizon limits |
| `075_competition_data_tracking.sql` | Anti-recycling source tracking for ETL data |
| `077-078` | Dynamic pool logic, multi-winner (Rank 1-3) enforcement disregarding agent termination status |

## Startup Graceful Settlement

> **v2 Fix (2026-05-09):** On server restart, the system now **settles pools before cancelling** any active competitions. Previously, `cancelAllAndSeedFresh()` would cancel non-expired competitions without pool settlement, causing user stakes to be stranded forever. The new flow:

1. For each remaining active/upcoming competition:
   - Generate CSPRNG outcome + HMAC integrity hash
   - Update competition status to `settled` with metadata
   - Call `poolService.settlePool()` to determine winners and disburse prizes
2. If settlement fails for any competition, fall back to cancellation with error reason
3. Seed fresh competitions after all pools are settled

## HMAC Security Hardening

> **v2 Fix (2026-05-09):** The `COMPETITION_HMAC_SECRET` no longer falls back to a hardcoded string (`'exoduze-integrity-key-v2'`). If the environment variable is not set or is too short (<32 chars), a CSPRNG ephemeral key is generated per process with a prominent console warning. For production, set `COMPETITION_HMAC_SECRET` (32+ chars) in `.env`.

