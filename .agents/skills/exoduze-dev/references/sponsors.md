# ExoDuZe — Colosseum Frontier Hackathon Sponsor Integration Guide

> Curated list of sponsor tools evaluated for ExoDuZe platform compatibility.
> Only includes tools that have concrete integration paths — no filler.

---

## Integrated / Priority Sponsors

### Phantom Connect (wallet, payments)
- **What:** Embedded wallet with email signin for web2 users + native Phantom support
- **Why ExoDuZe:** Replaces manual `@solana/wallet-adapter-react` setup. Zero-friction onboarding for non-crypto users.
- **Integration:** Phantom Connect SDK → `/app/src/` wallet provider
- **CASH stablecoin:** Backed by Phantom, accepted across Stripe merchants. Can replace SOL staking with stablecoin staking.
- **Docs:** https://docs.phantom.app/phantom-connect
- **Templates:** React Starter, JS Template, React Native Template
- **MCP Server:** Available for agentic use cases

### Helius (RPC)
- **What:** Solana's leading RPC + data infrastructure. LaserStream for gRPC streaming.
- **Why ExoDuZe:** Sub-millisecond response times for real-time leaderboard. `getTransactionsForAddress` for stake verification.
- **Offer:** 50% off Developer plan ($49 → $24.50/mo) for Frontier builders
- **Integration:** Replace current RPC endpoint in `/app/.env.local` and `/api/.env`

### Squads / Altitude (treasury, security)
- **What:** Multisig platform securing $15B+ in tokenized value on Solana.
- **Why ExoDuZe:** Secure program upgrade authority, prize pool treasury, and validator keys with multi-party approval.
- **Integration:** Route upgrade authority through Squads Multisig before mainnet deployment.

---

## Evaluated — Good Fit for Future

### World IDKit (identity, agents)
- **What:** Zero-knowledge Proof of Human verification
- **Why ExoDuZe:** Anti-bot protection for agent deployment. Verify humans without exposing identity.
- **Integration complexity:** Medium — requires backend signature generation + server-side verification
- **Docs:** https://docs.world.org

### Swig (payments, agents)
- **What:** Smart wallets with on-chain policy engine, gasless payments, delegated execution
- **Why ExoDuZe:** Automated agent staking without user signing each transaction
- **Docs:** TypeScript SDK, Rust SDK available

### Metaplex (agents, nfts)
- **What:** Agent registry as Core NFTs with built-in wallets on Solana
- **Why ExoDuZe:** Register forecaster agents on-chain as discoverable NFTs
- **Integration:** Agent Kit for registration + 014 registry

### Coinbase CDP (wallet, payments)
- **What:** x402 for paid APIs, agentic wallets, on/off-ramps
- **Why ExoDuZe:** Monetize ExoDuZe prediction API via x402 HTTP payments

---

## Evaluated — Not Priority

| Sponsor | Reason |
|---|---|
| Arcium | Privacy compute useful for blind auctions, but ExoDuZe predictions are intentionally public |
| Vanish | Private swaps not aligned with transparent competition model |
| Reflect | Interest-bearing stablecoins could add yield on idle pools, but adds complexity |
| LI.FI | Cross-chain not needed while on Solana Devnet only |
| Pentagon | Team management tool, not a code integration |
| MoonPay | Agent payment infra, overlaps with existing Solana wallet flow |
| Condor | Trading agent harness, different use case than forecasting |
| Privy | Overlaps with Phantom Connect — pick one, not both |

---

## RPC Provider Comparison

| Provider | Best For | Pricing | Special |
|---|---|---|---|
| **Helius** ⭐ | Production + streaming | $24.50/mo (Frontier) | LaserStream gRPC, archival methods |
| **Triton One** | Dedicated bare-metal | Custom | Free devnet/testnet |
| **FluxRPC** | High-volume reads | $0.06/GB bandwidth | Lantern local cache, sub-ms reads |

**Recommendation:** Helius for primary RPC (LaserStream for real-time), FluxRPC as fallback for high-volume reads.
