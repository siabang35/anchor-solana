# Frontend Architecture Documentation

> **ExoDuZe Web Frontend**  
> Version: 2.1.0 "Perfection" | Published: January 21, 2026  
> Author: ExoDuZe Engineering Team

---

## 1. System Overview

The ExoDuZe frontend is a high-performance, enterprise-grade generic AI Agent Competition interface built for scalability ("Data Besar"), security, and responsiveness. It utilizes a **modular, lazy-loaded architecture** to support dozens of sports and thousands of active markets without performance degradation.

### Core Technology Stack

| Technology | Purpose | Key Features |
|------------|---------|--------------|
| **React 19** | UI Library | Concurrent Mode, Suspense, Hooks |
| **TypeScript 5** | Language | Strict Type Safety, Interfaces |
| **Vite 6** | Build Tool | Instant HMR, Optimized Bundling |
| **TanStack Query (v5)** | Data Fetching | Caching, Deduping, Anti-Throttling |
| **Zod** | Validation | Runtime Schema Validation (Anti-Hack) |
| **TailwindCSS 4** | Styling | Utility-first, Dark Mode, Animations |
| **Framer Motion** | Animation | Layout Transitions, Micro-interactions |
| **Socket.io Client** | Real-time | Live Odds & Score Streaming |
| **K-Means Client** | AI Engine | "For You" Personalization Logic |
| **Search Engine** | Search | Specialized Multi-Endpoint Aggregation |

### 1.1 New Capabilities (AI & Recommendations)
*   **Top Markets**: A unified interface blending high-volume betting markets with critical global news.
*   **For You**: Personalized content feed driven by client-side interest vectors and backend clustering.

---

## 2. Directory Structure

The project follows a **Feature-First / Domain-Driven** directory structure to ensure maintainability and scalability.

```bash
apps/web/src/
├── app/
│   ├── components/       # Shared UI Components (Atomic Design)
│   ├── hooks/            # Custom React Hooks
│   ├── layouts/          # Layout Wrappers (Root, Markets, Admin)
│   ├── pages/            # Lazy-Loaded Page Views
│   │   ├── markets/      # Markets Domain
│   │   │   ├── categories/       # Modular Category Views
│   │   │   │   ├── crypto/
│   │   │   │   ├── sports/       # Sports Sub-System
│   │   │   │   │   ├── nba/      # Chunk: NBA
│   │   │   │   │   ├── afl/      # Chunk: AFL
│   │   │   │   │   └── ...
│   │   │   │   └── GenericCategoryView.tsx
│   │   │   ├── marketsConfig.ts  # Routing Configuration
│   │   │   │   └── GenericCategoryView.tsx
│   │   │   ├── marketsConfig.ts  # Routing Configuration
│   │   │   └── MarketsIndex.tsx  # Router Entry
│   ├── search/             # Enhanced Search Page [UPDATED]
│   ├── settings/           # Dedicated Settings Page [NEW]
│   ├── schemas/          # Zod Validation Schemas
│   └── utils/            # Shared Utilities
├── config/               # Environment Configuration
├── services/             # API Clients (Singleton Pattern)
└── styles/               # Global Styles & Tailwind Config
```

---

## 3. Performance Architecture

### 3.1 Code Splitting (Lazy Loading)

To support massive scale, **every major route is a separate chunk**. We use `React.lazy` and `Suspense` to load code only when needed.

- **Route-based Chunking**: Browsing `/markets` does not load Admin or Portfolio code.
- **Sub-category Chunking**: Accessing `/markets/sports/nba` does *not* load the code for Football or Rugby. This keeps the initial bundle size minimal (<100KB critical path).

**Implementation (`MarketsIndex.tsx`):**
```tsx
// Explicit named imports for optimal chunking
const FinancePage = lazy(() => import('./categories/finance/Finance'));
const TechPage = lazy(() => import('./categories/tech/Tech'));

<Suspense fallback={<MarketLoader />}>
  <Routes>
    <Route path="finance" element={<FinancePage />} />
    <Route path="tech" element={<TechPage />} />
  </Routes>
</Suspense>
```

### 3.2 Anti-Throttling (React Query)

We utilize **TanStack Query** as a server-state manager to implement aggressive caching and request deduplication.

- **Stale Time**: Global default of **30 seconds**. Data is considered "fresh" for 30s; navigating back and forth does not trigger new API calls.
- **Deduping**: Multiple components requesting `useSportsMarkets({sport: 'nba'})` simultaneously will trigger only **one** network request.
- **Garbage Collection**: Unused data remains in memory for 5 minutes before GC.

**Configuration (`main.tsx`):**
```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30s Anti-Throttling
      refetchOnWindowFocus: false,
    },
  },
});
```

---

## 4. Security & Data Integrity

### 4.1 Anti-Hack (Zod Validation)

We do not trust backend data blindly. All API responses are validated at runtime using **Zod Schemas**.

- **Strict Schemas**: Define exact expected shapes.
- **Soft Enforcement**: If data is malformed (e.g., missing field), we log an `[Anti-Hack]` warning but attempt to render the partial UI, preventing white-screen crashes ("Resilience").

**Schema (`schemas/marketSchema.ts`):**
```typescript
export const MarketSchema = z.object({
  id: z.string(),
  question: z.string(),
  outcomes: z.array(MarketOutcomeSchema),
  // Optional fields handle potential API inconsistencies securely
  volume: z.number().nonnegative().optional(),
});
```

**Hook Integration:**
```typescript
const validation = MarketListSchema.safeParse(response.data);
if (!validation.success) {
    console.warn("[Anti-Hack] Schema Mismatch:", validation.error);
}
```

---

## 5. UI/UX Design System ("Polymarket++")

### 5.1 Design Principles
- **Glassmorphism**: Heavy use of `backdrop-filter: blur()` for depth.
- **Responsive**: Mobile-first design.
- **Interactive**: Hover states, micro-animations (Framer Motion).

### 5.2 Key Components
- **SportsMarketCard**: The core unit. Displays match info, live score (pulsing dot), and outcome probabilities.
- **LiveMarketCard**: A versatile card for News, Econ Data, and mixed Betting/Signal content.
- **MarketFeed**: A scrolling ticker component for "Latest" updates.
- **BetSlip**:
  - **Desktop**: Sticky sidebar.
  - **Mobile**: Swipeable bottom sheet (FAB).
- **Navigation**:
  - **Sidebar**: Collapsible, icon-based navigation for 12 sports.
  - **Top Bar**: Context-aware categorization (Trending, New, etc.).
  - **Mobile UI**: Native-like iOS settings layout, grouped lists, and glassmorphic headers.

---

## 6. Best Practices Checklist

When contributing to the frontend, ensure:

- [ ] **Async**: Use `useQuery` for GET requests. Never use `useEffect` + `fetch` manually.
- [ ] **Validation**: Define Zod schema for new data types.
- [ ] **Style**: Use Tailwind utility classes. Avoid inline styles.
- [ ] **Chunking**: Lazy load any new distinct page or heavy component.
- [ ] **Strictness**: No `any` types. Use inferred Zod types or interfaces.

---

## 7. Context Organization

All global state contexts are consolidated in `src/app/contexts/` for maintainability.

| Context | File | Purpose |
|---------|------|---------|
| `AdminContext` | `contexts/AdminContext.tsx` | Admin role and profile state |
| `DepositContext` | `contexts/DepositContext.tsx` | Deposit modal, balance, transactions |
| `BetSlipContext` | `contexts/BetSlipContext.tsx` | Bet selections, open/close state |

> **Note**: Theme and Auth contexts remain in `components/` due to their integration with external providers (Privy, Radix).

---

## 8. Custom Hooks Registry

| Hook | Location | Purpose |
|------|----------|---------|
| `useSportsMarkets` | `app/hooks/useSportsMarkets.ts` | **TanStack Query + Zod** for fetching markets (supports Search & Filters) |
| `useMarketData` | `app/hooks/useMarketData.ts` | **Unified Data Hook** for Betting, News, and AI Feeds |
| `useSettings` | `app/pages/settings/index.tsx` | Local state for tab navigation and responsive layout |
| `useSportsSocket` | `app/hooks/useSportsSocket.ts` | WebSocket connection with strict payload types |
| `useDebounce` | `app/hooks/useDebounce.ts` | Anti-throttling for search inputs |
| `useThrottle` | `app/hooks/useThrottle.ts` | Rate-limit callback invocations |
| `useSportsData` | `app/hooks/useSportsData.ts` | General sports events fetching |
| `useNotifications` | `app/hooks/useNotifications.ts` | User notification management |
| `useWallet` | `app/hooks/useWallet.ts` | Multi-chain wallet interactions |
| `useAdvancedMarketRanking` | `app/hooks/useAdvancedMarketRanking.ts` | **Top Markets & For You** aggregation with real-time updates and **Pagination (Load More)** |
| `useMarketSocket` | `app/hooks/useMarketSocket.ts` | Universal socket listener for global market events |

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.1.1 | Jan 21, 2026 | Context consolidation, Type Safety improvements, 0 TS errors |
| 2.1.0 | Jan 21, 2026 | React Query + Zod integration, Lazy Loading |
| 2.0.0 | Jan 16, 2026 | Initial architecture documentation |

---

| Version | Date | Changes |
|---------|------|---------|
| 2.5.0 | Jan 31, 2026 | Scalable Category Architecture (Named Components), Enhanced Image Fallbacks |
| 2.4.0 | Jan 31, 2026 | "Load More" Pagination for Recommendations, Security Hardening |
| 2.3.0 | Jan 29, 2026 | Real-time "Top Markets" & "For You", Image Support in MarketCard |
| 2.2.0 | Jan 21, 2026 | Dedicated Settings Page, Premium Mobile UI, X Branding |
| 2.1.1 | Jan 21, 2026 | Context consolidation, Type Safety improvements, 0 TS errors |
| 2.1.0 | Jan 21, 2026 | React Query + Zod integration, Lazy Loading |
| 2.0.0 | Jan 16, 2026 | Initial architecture documentation |

---

*This document is maintained by the ExoDuZe Engineering Team.*

