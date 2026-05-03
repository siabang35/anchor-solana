# Withdrawal System Documentation

> **Feature Documentation**
> Version 2.0.0 | Published: January 18, 2026

---

## 1. Overview

The ExoDuZe Withdrawal System has been completely redesigned to offer a **Premium Web3** experience. It features a modern, glassmorphic UI, real-time multi-chain balance fetching, and advanced security measures. The system supports direct withdrawals for EVM (Ethereum, Base), Solana, and Sui networks, ensuring users can only withdraw funds they actually possess on-chain.

---

## 2. Key Features

### 2.1 Premium User Interface
- **Dark Mode & Glassmorphism**: A sleek, professional aesthetic using semi-transparent backgrounds and blurs (`backdrop-blur-md`).
- **Mobile-First Design**:
    - Uses `dvh` (Dynamic Viewport Height) to ensure the modal fits perfectly on mobile browsers, accounting for address bars.
    - High z-index (`z-[100]`) to prevent collisions with bottom navigation menus.
    - Optimized touch targets (>44px) for all interactive elements.
- **Intuitive Layout**: Step-by-step flow: Asset Selection -> Network Selection -> Amount -> Recipient Address.

### 2.2 Real-Time Multi-Chain Balances
The system fetches live, on-chain balances directly from the blockchain nodes, bypassing potentially stale backend caches for critical financial data.

- **Hook**: `useTokenBalances.ts`
- **Supported Networks**:
    - **EVM**: Ethereum Mainnet, Base (via `viem` `createPublicClient`).
    - **Solana**: Mainnet Beta (via JSON-RPC `getBalance`).
    - **Sui**: Mainnet (via JSON-RPC `suix_getBalance`).
- **Logic**:
    - **EVM**: Uses `balanceOf` for ERC-20 tokens and `getBalance` for Native ETH.
    - **Solana/Sui**: Fetches native balances using secure RPC endpoints.
    - **Address Resolution**: Automatically detects the correct wallet address by cross-referencing the backend's "Crypto Assets" registry and Privy's `linkedAccounts`, ensuring the balance displayed matches the fund source.

### 2.3 Premium QR Code Scanner
- **Core Library**: `html5-qrcode` (Direct `Html5Qrcode` class implementation).
- **Features**:
    - **Custom Glassmorphic Overlay**: Replaces default scanner UI with a custom black/transparent overlay featuring a laser-scan animation and chain-specific branding.
    - **Explicit Permission Handling**: Manages camera permissions gracefully, providing clear feedback ("Camera access denied") without crashing the app.
    - **Smart Validation (Anti-Hack)**:
        - **Strict Regex Logic**: Validates scanned content against the active chain's rules (e.g., Base58 for Solana, Hex for EVM) *before* populating the field.
        - **Sanitization**: Automatically parses and cleans payment URIs (e.g., `ethereum:0x123...` -> `0x123...`).
        - **Input Security**: Trims whitespace and prevents injection of invalid characters.
- **UX**: One-tap "Scan" button integrated directly into the address input field.

### 2.4 Security & Validation
- **Rate Limiting**:
    - **Client-Side**: Prevents withdrawal spam by tracking attempt counts and window timestamps.
    - **Cooldowns**: Enforces delays between actions.
- **Input Validation**:
    - **Type-Safe**: Strict validation ensuring the address format matches the selected network (e.g., regex for Solana Base58 vs EVM Hex).
    - **Balance Check**: Prevents entering amounts > `currentBalance` (fetched live).
    - **Visual Feedback**: Real-time Green/Red indicators for address validity.

---

## 3. Technical Architecture

### 3.1 Component Hierarchy
`WithdrawModal.tsx` is the core component, orchestrating:
- **State**: `selectedToken`, `selectedChain`, `amount`, `address`.
- **Hooks**:
    - `usePrivy` & `useWallets`: authentication and signing.
    - `useTokenBalances`: data fetching.
    - `useDeposit`: address resolution source.
- **Dependencies**: `lucide-react` (Icons), `viem` (EVM Logic), `html5-qrcode` (Scanner).

### 3.2 Data Flow
1.  **Open Modal**: User clicks "Withdraw".
2.  **Fetch Data**:
    - `useDeposit` fetches backend asset metadata.
    - `useTokenBalances` uses these addresses to query RPC nodes (EVM/Solana/Sui) in parallel.
3.  **User Input**:
    - Selects Token -> Updates available Chains.
    - Selects Chain -> Updates displayed Balance.
    - Scans/Types Address -> Validates regex for that Chain.
4.  **Execution**:
    - **EVM**: Prepares `wagmi`/`viem` transaction config.
    - **Solana/Sui**: (Planned/In-Progress) Prepares SDK-specific transaction payloads.
    - **Signing**: Prompts user via Privy wallet interface.
    - **Broadcast**: Submits tx to network and notifies backend.

---

## 4. Supported Assets & Networks

| Asset | Networks | Balance Source |
|-------|----------|----------------|
| **USDC** | Ethereum, Base, Solana, Sui | Contract Read / SPL / Coin |
| **USDT** | Ethereum, Base, Solana | Contract Read / SPL |
| **ETH** | Ethereum, Base | Native RPC |
| **SOL** | Solana | Native RPC |
| **SUI** | Sui | Native RPC |
| **WBTC** | Ethereum, Base | Contract Read |

---

## 5. Mobile Optimization Details

To prevent the common "modal cutoff" issue on mobile browsers:
- **Z-Index**: `z-[100]` ensures overlay above bottom navs.
- **Height**: `max-h-[90dvh]` uses dynamic viewport units.
- **Safe Area**: `pb-8` added to the footer to clear safe-area insets on modern iOS/Android devices.
- **Scroll**: Custom scrollbar styling for the Asset Accordion to ensure smooth scrolling within the modal internal containers.
