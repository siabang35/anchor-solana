# ExoDuZe: Comprehensive System Documentation

## 1. Overview
ExoDuZe is a decentralized, AI-driven probability trading platform built on the Solana blockchain. It redefines traditional trading platforms by eliminating Zero-Sum mechanics and shifting to a Value Creation model. 

Participants in ExoDuZe build or deploy autonomous **AI Forecaster Agents** that use Natural Language Processing (NLP) over live data streams to predict the probabilities of clustered market outcomes. Rewards are generated transparently based on the accuracy of these market shifts.

---

## 2. Platform Architecture

### 2.1 Technical Layers
ExoDuZe uses a modern tiered architecture emphasizing real-time processing and blockchain transparency.

1.  **Frontend (Next.js 16 + React)**
    *   **Purpose:** Delivers a highly responsive, mobile-first Trading interface.
    *   **Key Modules:** 
        *   `DeployAgent`: An expandable mobile-drawer for AI setup.
        *   `DataFeeds`: Text-based, optimized real-time sentiment streaming.
        *   `Category Layouts`: Market lists split into Crypto, Finance, Tech, etc.
    *   **State Management:** Real-time subscriptions via Supabase client, Wallet connection via `@solana/wallet-adapter`.

2.  **Backend (NestJS + Supabase)**
    *   **Purpose:** Serves as the high-security middleware handling rate-timing, REST endpoints, and WebSockets.
    *   **Key Modules:** 
        *   `AgentsService`: Deploys Forecasters, handles RLS bypassing via Admin Client internally, tracks usage quotas.
        *   `ProbabilityEngine`: Aggregates sentiment data, fires Bayesian updates, clusters markets dynamically.
    *   **Security:** Enforces Anti-Throttling, Payload Analysis, Chunking protections, and JWT Guards.

3.  **Database Layer (PostgreSQL / Supabase)**
    *   **Purpose:** The central data source of truth.
    *   **Security:** Strict Row-Level Security (RLS) ensuring users can only manipulate their personal deployed agents and entries. Service Roles manage background aggregation tasks.

4.  **Smart Contract Layer (Anchor + Solana Devnet)**
    *   **Purpose:** Immutable state of truth, escrow for the Value Creation Pool.
    *   **Key Programs:** Initializes markets, takes positions, registers agent PDAs, and settles rewards based on Oracle inputs.

---

## 3. Core Mechanisms

### 3.1 Non-Zero-Sum Value Creation Pool
Instead of users betting directly against one another, users and AI agents "discover" accurate information. 

*   A platform-funded **Value Creation Pool** issues rewards directly proportional to how much genuine *Information Asymmetry* the deployed AI agent resolved.
*   **Formula Elements:** Agent Accuracy × User Exposure Amount × Delta Probability Shift × Pool Multiplier.

### 3.2 Anti-Prediction Engine & Clustering
To prevent scraping bots or malicious actors from gaming the system:
*   **Clustering:** ExoDuZe restricts active competitions to a maximum of 15 per category simultaneously.
*   **Narrative Twisting:** The Qwen 3.5-9B AI Model is instructed to find *counter-intuitive* patterns in the noise. It focuses on the second-order effects of news rather than raw headline scraping, making the resulting probability curves incredibly difficult to front-run or reverse-engineer without doing the actual computational work.

### 3.3 The Data Pipeline
*   **Ingestion:** Scrapes live market data (RSS, APIs, Twitter, Financial streams).
*   **NLP Layer:** Triggers the LLM to rate Sentiment, extract Entities, and identify Contradictory reports.
*   **Feature Engineering:** Creates variables for Sentiment ($S_t$), Momentum ($M_t$), and Volatility ($V_t$).
*   **Probabilistic Engine:** Employs Bayesian updates coupled with Time-Decay parameters to yield the final Shift in Market Probabilities ($\Delta P$).

---

## 4. AI Agent Deployment Lifecycle

### 4.1 Deployment Flow
1.  **Selection:** A user selects an underlying category (e.g., Finance) and a specific competition market.
2.  **Prompting:** The user injects a custom `System Prompt` (Knowledge Base) alongside the Qwen 9B base model instruction.
3.  **Validation:** The Backend checks the user's quota (Max 7 free deploys) and passes the model parameters.
4.  **Database Storage:** The `deployForecaster` service inserts the agent into Supabase. (Backend handles this securely via `Service Role` bypassing complex user-session RLS hurdles).
5.  **Active Simulation:** The Agent runs passively, polling data streams against its system prompt to issue `brier_scores` and predictive insights.

---

## 5. Security Protocols

*   **Row-Level Security (RLS):** Policies are rigorously set on Supabase tables (`agents`, `agent_wagers`, `agent_predictions`). A user can strictly SELECT, UPDATE, or INSERT their own data. Service Roles execute system-wide operations safely.
*   **Input Validation:** NestJS class-validators sanitize all AI deployment prompts to prevent prompt-injection hacks designed to output malicious SQL or scripts.
*   **Rate Limits:** Strict endpoints preventing mass-deployment spamming inside the AI Competition modules.

---

## 6. Smart Contract Reference (Solana Anchor)
*   **`initialize_platform`**: Prepares the vault for Value Pool issuance.
*   **`create_market`** & **`settle_market`**: Opens and closes the bounds for probability shifts.
*   **`deploy_agent`**: Creates a PDA (Program Derived Address) binding the User Wallet to their deployed Agent profile for on-chain verifiable track records. 
*   **`take_position`** & **`claim_reward`**: Standard interactions against the pool based on resolved probabilities.

---

*(End of ExoDuZe System Documentation)*
