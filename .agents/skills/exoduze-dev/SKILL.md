---
name: exoduze-dev
description: ExoDuZe AI forecaster competition platform on Solana. Use when working on agent deployment, Brier scoring, weighted leaderboards, probability curves, NLP sentiment analysis, 4-tier inference cascade, Solana staking, competition lifecycle, HMAC integrity chains, or any ExoDuZe codebase changes.
---

You are the ExoDuZe platform development advisor. Use this context to make accurate, architecture-aware code changes.

## Platform Overview

ExoDuZe is a decentralized, skill-based AI probability competition platform on Solana Devnet. Users deploy autonomous AI Forecaster Agents that use NLP sentiment analysis over live data to predict market outcome probabilities. Rewards are distributed based on prediction accuracy via a Value Creation Pool model.

## Architecture

| Layer | Stack | Directory |
|---|---|---|
| Frontend | Next.js 16 + React | `/app` |
| Backend | NestJS + Supabase REST | `/api` |
| Database | PostgreSQL (Supabase) | `/api/supabase/migrations/` |
| Smart Contract | Anchor + Solana Devnet | `/programs/` |

## Critical Services (Backend)

1. **QwenInferenceService** (`qwen-inference.service.ts`): 4-Tier inference cascade — HuggingFace (Qwen 2.5 7B) → OpenRouter (Llama 3.3 70B) → Groq (70B → 8B sub-fallback) → Local Simulation. Per-tier cooldowns: 30s rate-limit, 5min billing. Agent Simulation State Cache persists last probability per agent.

2. **AgentRunnerService** (`agent-runner.service.ts`): Serialized agent processing (concurrency=1), 3s inter-agent delay, 2s inter-prediction delay, ±15% jitter. Bootstrap limited to 2 predictions per new agent.

3. **LeaderboardScoringService** (`leaderboard-scoring.service.ts`): Weighted Brier scoring with HMAC-SHA256 chain integrity. Curve difficulty weight (0.5–2.0) based on time remaining (40%), volatility (35%), entropy (25%).

4. **CompetitionManagerService**: 4 concurrent competitions per category (28 total across 7 sectors). 4-tier horizons: 2h/7h/12h/24h. Settlement via `settleAndReplenish()` cron every 15s.

## Scoring Formula

```
Brier Score = (predicted_probability - actual_outcome)²
AI Accuracy % = (1 - Brier Score) × 100%
Weighted Brier = Raw Brier × Curve Difficulty Weight
Cumulative = (prevScore × prevCount + weightedBrier) / (prevCount + 1)
```

## Ranking Hierarchy (ORDER BY)

```sql
1. has_min_predictions DESC  -- Min 3 predictions required
2. weighted_score ASC        -- Lower = more accurate = #1
3. prediction_count DESC     -- Tie-breaker: activity
4. deployed_at ASC           -- Tie-breaker: seniority (last resort)
```

## Security Patterns

- HMAC-SHA256 chain on scored predictions (immutable audit trail)
- Anti-chunking: 10s minimum between predictions per agent
- Score velocity limit: max Δ = 0.2 per tick
- RLS on all user-facing tables, admin client for system operations
- Sanitization: strip `system_prompt` and `user_id` from public responses
- Rate limiting: Global 100/min, Auth 5/min, Public API 120/min

## Database Key Tables

- `agents`: AI agent definitions (name, system_prompt, model, status)
- `agent_competition_entries`: Agent-competition mapping with scores
- `agent_predictions`: Individual predictions with probability, reasoning, projected_curve
- `competition_pools`: Prize pool tracking per competition
- `pool_stakes`: Individual stake records with on-chain tx hashes
- `leaderboard_snapshots`: Append-only HMAC-chained score history

## Frontend Patterns

- Supabase Realtime subscriptions for leaderboard + predictions
- Dynamic provider badges from reasoning prefix: `[Qwen]`, `[OpenRouter]`, `[Groq]`, `[LOCAL-SIM]`
- Theme persistence via `localStorage('exoduze_theme')` + CSS variables
- Cross-category meta-tab redirects via `localStorage('redirect_tab')`

## Staking & Prize Pool

- 100% risk policy (no refunds on loss)
- Top 3 winners: 50% / 30% / 20% of pool after 2% platform fee
- Stake amounts stored in `pool_stakes` with on-chain transaction hash verification

## Development Rules

1. Always use `SupabaseService.getAdminClient()` for system-wide operations (bypass RLS)
2. Never hardcode stake amounts — always use user-provided `wager_amount`
3. Preserve HMAC chain integrity — never modify scored predictions directly
4. Agent processing must remain serialized (concurrency=1)
5. All new migrations must be sequential (check last migration number)
6. Frontend sorting is purely by `_accuracy` descending — no time-based bias

## Reference Files

For detailed specifications, read:
- `system.md` (root): Full system audit log with tables, formulas, security matrix
- `doc.md` (root): Comprehensive architecture documentation
- `README.md` (root): Project overview and setup instructions
