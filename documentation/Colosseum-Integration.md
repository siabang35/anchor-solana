# ExoDuZe — Colosseum Integration & Developer Skills System

This document outlines how ExoDuZe leverages the Colosseum hackathon resources and the AI Agent Skills system for development and platform integration.

## 1. Development Context (Coding Agents)

To accelerate development and ensure alignment with Solana ecosystem best practices, the ExoDuZe repository is equipped with the **Colosseum Resources Skill** and custom project context.

### The Skills System
These skills are designed for **AI Coding Agents** (like Cursor, Claude Code, Windsurf) used by the developers building ExoDuZe. They are **not** used by the end-users deploying forecaster agents on the platform.

The system uses a "Progressive Disclosure" model:
1. **Trigger:** The coding agent reads the YAML frontmatter (`name` and `description`) of the skills in `.agents/skills/`.
2. **Activation:** When the developer asks about ExoDuZe architecture or Solana integrations, the agent loads the relevant `SKILL.md`.
3. **Execution:** The agent uses the highly specific context to write accurate, architecture-aware code.

### Installed Skills

| Skill | Location | Purpose |
|-------|----------|---------|
| **Colosseum Resources** | `.agents/skills/colosseum-resources/` | Official Colosseum advisor. Recommends sponsor tools, SDKs, and RPC providers for hackathon projects. |
| **ExoDuZe Dev Context** | `.agents/skills/exoduze-dev/` | Custom project knowledge base. Contains rules for the 4-tier LLM cascade, Brier scoring, HMAC chains, and smart contract architecture. |

## 2. Platform Integrations (Sponsor Tools)

ExoDuZe integrates several Colosseum hackathon sponsor tools to enhance security, UX, and performance. 

### Priority Integrations
- **Phantom Connect:** Utilized for seamless embedded wallet experiences and web2 email onboarding. Replaces manual wallet-adapter configurations. Supports **CASH stablecoin** for prize pools.
- **World (IDKit):** Explored for Proof of Human verification to ensure agents are deployed by unique humans, preventing bot-farm exploits.
- **Helius RPC:** Primary RPC provider leveraging **LaserStream** gRPC for ultra-low latency WebSocket updates on the real-time leaderboard.
- **Squads (Multisig):** Secures the Solana Anchor program upgrade authority and manages the platform's 2% fee treasury.

## 3. End-User AI Prompting vs. Developer Skills

It is important to distinguish between developer skills and platform AI prompts:

- **Developer Skills ( `.agents/skills/` ):** Used by the platform creators to build ExoDuZe.
- **User System Prompts ( `agents.system_prompt` ):** Used by end-users in the "Build Agent" UI to dictate how their autonomous forecaster analyzes news. 

### Does Prompting Evolve the Model?
In ExoDuZe, end-users provide a `System Prompt` (e.g., *"Focus deeply on regulatory announcements and ignore short-term market noise"*). 
- **Steering, not Fine-Tuning:** This does not alter the underlying weights of the LLM (Qwen 2.5 / Llama 3.3). 
- **In-Context Evolution:** It acts as a strict analytical lens. By tweaking prompts, users "evolve" their agent's strategy. Better prompts yield more accurate probability parsing from the NLP sentiment engine, resulting in a lower Brier Score and higher Leaderboard Rank.
