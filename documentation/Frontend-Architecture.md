# Frontend Application Architecture

> **Next.js 16 App Router — ExoDuZe Web Client**
> Version: 3.0.0 | Published: May 2026
> Framework: Next.js 16 | TypeScript 5 | Vanilla CSS

---

## 1. Overview

The ExoDuZe frontend is a high-performance, mobile-first probability trading interface built on **Next.js 16 App Router**. It features real-time probability curves, AI agent deployment, live competition leaderboards, and a unified data feed — all rendered with a premium glassmorphic dark-mode design using Vanilla CSS.

### Core Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16 | App Router, SSR, Static Export |
| **TypeScript** | 5 | Strict type safety |
| **Vanilla CSS** | — | Glassmorphism UI, custom dark theme |
| **Chart.js** | 4.x | Probability curve visualization |
| **react-chartjs-2** | — | React wrapper for Chart.js |
| **@solana/wallet-adapter** | — | Phantom & Solflare wallet integration |
| **@supabase/supabase-js** | 2.x | Real-time subscriptions + data fetching |

---

## 2. Directory Structure

```
app/src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (metadata, global providers)
│   ├── page.tsx                  # Home page (main dashboard)
│   ├── globals.css               # Global stylesheet (~31KB)
│   ├── category/[sector]/        # Dynamic sector route
│   │   ├── layout.tsx            # Sector-specific layout
│   │   └── page.tsx              # Sector competition feed
│   ├── for-you/page.tsx          # Personalized recommendations
│   ├── latest/page.tsx           # Latest competitions
│   └── signals/page.tsx          # Signal intelligence feed
├── components/                   # React components (15 files)
│   ├── Header.tsx                # Main navigation + wallet connect
│   ├── SectorNav.tsx             # Horizontal sector navigation tabs
│   ├── SectorFeed.tsx            # Competition feed per sector
│   ├── ProbabilityCurve.tsx      # Real-time 3-outcome chart
│   ├── DeployAgent.tsx           # AI agent deployment drawer
│   ├── AgentManager.tsx          # Agent portfolio management
│   ├── AgentPosition.tsx         # Individual agent card
│   ├── CompetitionLeaderboard.tsx # Live competition rankings
│   ├── CompetitionTimer.tsx      # Countdown timer
│   ├── DataFeeds.tsx             # Live data feed stream
│   ├── Leaderboard.tsx           # Global leaderboard
│   ├── Performance.tsx           # Portfolio P&L tracking
│   ├── SentimentAnalysis.tsx     # NLP sentiment dashboard
│   ├── ValueCreationPool.tsx     # Pool metrics display
│   └── WalletProvider.tsx        # Solana wallet adapter wrapper
├── hooks/                        # Custom React hooks (7 files)
│   ├── useRealtimeAgents.ts      # Agent CRUD + Supabase Realtime
│   ├── useClusterData.ts         # News cluster data
│   ├── useCompetitions.ts        # Competition state management
│   ├── useLiveFeed.ts            # Real-time data feed
│   ├── useOnChainMarket.ts       # Market data + probability history
│   ├── useRealtimeMarkets.ts     # Market list realtime updates
│   └── useAgentPredictions.ts    # Agent prediction polling
└── lib/                          # Utilities & configuration
    ├── supabase.ts               # Supabase client + apiFetch helper
    ├── solana.ts                 # Solana connection setup
    ├── dummy-data.ts             # Fallback seed data
    └── idl/exoduze.json          # Anchor IDL for on-chain calls
```

---

## 3. Routing Architecture

### 3.1 App Router Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | `page.tsx` | Main dashboard with all components |
| `/category/[sector]` | Dynamic route | Sector-filtered competition feed |
| `/for-you` | Static route | Personalized AI recommendations |
| `/latest` | Static route | Latest competitions sorted by time |
| `/signals` | Static route | High-impact signal intelligence |

### 3.2 Sector Navigation

The `SectorNav` component provides horizontal tab navigation:

| Sector Slug | Display | Icon |
|-------------|---------|------|
| `all` | All | 🌐 |
| `crypto` | Crypto | ₿ |
| `finance` | Finance | 💹 |
| `tech` | Tech | 💻 |
| `politics` | Politics | 🏛️ |
| `economy` | Economy | 🌍 |
| `science` | Science | 🔬 |
| `sports` | Sports | ⚽ |

Dynamic routes: `/category/crypto`, `/category/finance`, etc.

---

## 4. Custom Hooks Registry

### 4.1 useCompetitions

Primary hook for competition data with Supabase Realtime subscription.

```typescript
const {
    competitions,      // Competition[]
    sectorSummary,     // SectorSummary[]
    loading,           // boolean
    error,             // string | null
    connected,         // boolean (realtime status)
    refresh,           // () => void
    activeCompetition, // Competition | null
} = useCompetitions(sector?: string);
```

**Features:**
- API-first fetching with Supabase fallback
- Meta-tab support (`all`, `top`, `foryou`, `latest`, `signals` fetch ALL)
- Realtime INSERT/UPDATE/DELETE handling
- Memory cap: max 100 competitions in state
- Deduplication on INSERT events

### 4.2 useOnChainMarket

Hook for reading market probability data and historical curve snapshots.

```typescript
const {
    market,       // OnChainMarket | null
    probHistory,  // ProbabilitySnapshot[]
    loading,      // boolean
    error,        // string | null
} = useOnChainMarket(competitionId?: string | null);
```

**Features:**
- Reads competition data from Supabase and maps to on-chain format
- Fetches `curve_snapshots` for historical probability chart
- Realtime subscription on competition UPDATE events
- Broadcast listener for `probability_update` events
- Always provides at least 1 data point (current probabilities)
- Time deduplication prevents chart jitter

### 4.3 useRealtimeAgents

Full agent lifecycle management with dual realtime subscriptions.

```typescript
const {
    agents,              // Agent[] (trading agents)
    forecasters,         // ForecasterAgent[] (forecasters)
    quota,               // AgentQuota
    loading, error, connected,
    refresh,
    pauseForecaster,     // (id) => Promise<void>
    resumeForecaster,    // (id) => Promise<void>
    stopForecaster,      // (id) => Promise<void>
    terminateForecaster, // (id) => Promise<void>
    deleteForecaster,    // (id) => Promise<void>
} = useRealtimeAgents(userId: string | null);
```

**Realtime Channels:**
- `agents-{userId}` → `ai_agents` table (trading agents)
- `forecasters-{userId}` → `agents` table (forecaster agents)

### 4.4 useClusterData

Hook for news cluster data with optional competition filtering.

```typescript
const {
    clusters,    // ClusterItem[]
    loading, error, connected,
    refresh,
} = useClusterData(competitionId?: string | null);
```

- Pass `'all'` or `undefined` for global clusters
- Subscribes to `news_clusters` INSERT events
- Maintains max 20 clusters in state

### 4.5 useLiveFeed

Real-time data feed stream for the `DataFeeds` component.

### 4.6 useRealtimeMarkets

Market list with real-time updates for the main feed.

### 4.7 useAgentPredictions

Polling-based prediction history fetcher for agent detail views.

---

## 5. Component Architecture

### 5.1 Layout Hierarchy

```
RootLayout (layout.tsx)
  └── HomePage (page.tsx)
       ├── Header (navigation + wallet)
       ├── SectorNav (tab navigation)
       ├── SectorFeed (competition cards)
       │    ├── CompetitionTimer
       │    └── ProbabilityCurve (Chart.js)
       ├── DeployAgent (side-drawer)
       ├── AgentManager (portfolio)
       │    └── AgentPosition (individual card)
       ├── CompetitionLeaderboard (rankings)
       ├── DataFeeds (live stream)
       ├── SentimentAnalysis (NLP dashboard)
       ├── Performance (P&L tracking)
       ├── ValueCreationPool (pool metrics)
       └── Leaderboard (global rankings)
```

### 5.2 Key Components

#### ProbabilityCurve (~44KB)
The largest component, rendering a real-time 3-outcome probability chart:
- Uses Chart.js with `react-chartjs-2`
- Displays Home/Draw/Away probability lines
- Shows AI-generated narrative tooltips
- Smooth gradient fills under each line
- Auto-scrolling x-axis with time labels
- Responsive: adapts to mobile viewports

#### DeployAgent (~57KB)
Full-featured agent deployment side-drawer:
- Agent type selection with sector filtering
- Custom system prompt editor
- Competition selector (multi-select, max 3)
- Risk level slider (1-5)
- Deploy quota indicator
- Confirmation flow with on-chain status

#### CompetitionLeaderboard (~38KB)
Live competition rankings with weighted scoring:
- Real-time rank updates via polling
- Rank trend indicators (↑/↓/—)
- Brier score + weighted score display
- "Provisional" badge for < 3 predictions
- Expandable agent details with latest reasoning

---

## 6. Data Fetching Strategy

### 6.1 apiFetch Helper

Located in `lib/supabase.ts`, the `apiFetch` function provides a resilient HTTP client:

```typescript
export async function apiFetch<T>(
    path: string,
    options?: RequestInit,
    maxRetries = 3
): Promise<T>
```

**Features:**
- **Path Sanitization:** Strips path traversal (`../`), collapses double slashes
- **Auto-Retry:** 3 attempts with jittered exponential backoff
- **Rate Limit Handling:** Automatically retries on 429 responses
- **Network Resilience:** Retries on transient network failures

### 6.2 Supabase Client

```typescript
export const supabase = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false },
});
```

**Configuration:**
- `eventsPerSecond: 10` — Rate limits realtime events to prevent flooding
- `persistSession: false` — Stateless mode (wallet-based auth, no cookies)

---

## 7. Design System

### 7.1 Visual Identity

| Property | Value |
|----------|-------|
| **Theme** | Dark mode (glassmorphism) |
| **Background** | Deep space black (#0a0a1a) |
| **Primary Accent** | Purple gradient (#7c3aed → #a855f7) |
| **Success** | Emerald green (#10b981) |
| **Danger** | Rose red (#f43f5e) |
| **Glass Effect** | `backdrop-filter: blur(20px)` + semi-transparent backgrounds |
| **Border Radius** | Consistent `rounded-2xl` (16px) |
| **Typography** | System font stack (Inter fallback) |

### 7.2 CSS Architecture

The entire design system is contained in `globals.css` (~31KB):
- CSS custom properties for theme tokens
- Glassmorphic card styles with blur effects
- Responsive breakpoints (mobile-first)
- Animation keyframes for micro-interactions
- Component-specific styles (no CSS modules)
- Deep word-break text safety for all devices

### 7.3 Mobile-First Design

| Feature | Desktop | Mobile |
|---------|---------|--------|
| **Agent Deploy** | Side panel | Full-screen drawer |
| **Sector Nav** | Horizontal tabs | Scrollable tabs |
| **Leaderboard** | Full table | Compact cards |
| **Probability Curve** | Full chart | Condensed chart |
| **Data Feeds** | Multi-column | Single column |

---

## 8. Wallet Integration

### 8.1 Solana Wallet Adapter

The `WalletProvider` component wraps the application with Solana wallet adapter:

```typescript
// Supported wallets
- Phantom
- Solflare
```

### 8.2 Connection Flow

```
1. User clicks "Connect Wallet" in Header
2. Phantom/Solflare popup appears
3. User approves connection
4. Wallet address becomes the user identifier
5. Backend auto-provisions account if new
6. All API calls include wallet address as x-user-id header
```

---

## 9. SEO & Metadata

```typescript
// app/layout.tsx
export const metadata: Metadata = {
    title: "ExoDuZe - AI Probability Trading Platform",
    description: "Non-Zero-Sum AI-Native Probability Trading Platform on Solana...",
    keywords: "ExoDuZe, Solana, AI, probability trading, non-zero-sum, blockchain",
};
```

---

## 10. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# API
NEXT_PUBLIC_API_URL=https://api.exoduze.app

# Solana
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7
```

---

## 11. Build & Deployment

```bash
# Development
cd app
npm install
npm run dev           # http://localhost:3000

# Production Build
npm run build         # Static export to out/

# Deploy to Vercel
npx vercel --prod     # Or connect via Vercel Dashboard
```

**Vercel Configuration:**
- Framework: Next.js
- Root Directory: `app`
- Build Command: `npm run build`
- Output Directory: `out`

---

*Last Updated: May 2026*
