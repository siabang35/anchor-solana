# Unified Asset Management System

> **Feature Documentation**  
> Version 1.0.0 | Published: January 17, 2026

---

## Overview

The Unified Asset Management system facilitates secure and intuitive crypto deposits and withdrawals through a single, responsive interface: the `AssetActionModal`. This component replaces separate deposit and withdrawal flows, providing a seamless user experience across desktop and mobile devices.

---

## 2. Asset Action Modal & Withdraw System

The project now utilizes two distinct, specialized components for asset management:
1.  **AssetActionModal**: Primarily for **Deposits**, offering a unified entry point.
2.  **WithdrawModal**: A dedicated, feature-rich system for **Withdrawals**.

> **Note**: For detailed documentation on the Withdrawal System, including Multi-Chain logic and QR Scanning, please refer to [Withdrawal-System.md](./Withdrawal-System.md).

### 2.1 Key Features (Asset Action Modal)

### 2.1 Key Features

| Feature | Description |
|---------|-------------|
| **Unified Interface** | Toggle between "Deposit" and "Withdraw" modes instantly within the same modal. |
| **Mobile-First Design** | Adapts to a bottom-sheet layout on mobile devices with safe-area padding (`pb-24`) to prevent UI obstruction. |
| **Network Intelligence** | Automatically detects and displays the correct network (Ethereum, Base, Solana, Sui) and associated branding/logos. |
| **Quick Actions** | One-tap percentage selectors (25%, 50%, MAX) for fast withdrawal amounts. |
| **Premium Scanner** | Built-in QR scanner with anti-hack validation and custom UI. |
| **Real-Time Feedback** | Instant validation of addresses, amounts, and balances. |

### 2.2 Security Measures

The system implements multiple layers of security to protect user funds:

1.  **Network Verification**: Users are explicitly warned to ensure they are on the correct network (e.g., "Send only USDT (Ethereum Network) to this address").
2.  **Rate Limiting**:
    *   **Click Throttling**: Prevents accidental double-clicks (2-second cooldown on buttons).
    *   **Withdrawal Cooldown**: Enforces a 30-second wait period between successful withdrawals to prevent spam/abuse.
3.  **Input Validation**:
    *   Prevents negative amounts.
    *   Enforces minimum withdrawal limits ($1.00 equivalent).
    *   Validates address format length.
4.  **Auto-Refresh**: Portfolio balances automatically refresh upon successful transaction completion to show up-to-date funds.

---

## 3. User Flows

### 3.1 Deposit Flow

1.  User clicks on an asset in the Portfolio.
2.  Modal opens in **Deposit** mode by default (or remembers last state).
3.  **QR Code** is generated for the specific asset address.
4.  **Copy Address**: User can tap the address box to copy to clipboard.
5.  **Network Warning**: A prominent alert confirms the required network to avoid improper transfers.

### 3.2 Withdrawal Flow

1.  User switches to **Withdraw** tab.
2.  **Amount Selection**:
    *   Type manually.
    *   Use Quick Selectors: `25%`, `50%`, `MAX`.
3.  **Address Entry**: 
    *   Paste the destination wallet address.
    *   **Or Scan QR Code**: Use the integrated Premium Scanner to capture the address via camera.
4.  **Confirmation**: Click "Confirm Withdrawal".
5.  **Processing**:
    *   Frontend validates inputs.
    *   Backend initiates withdrawal request (`/deposits/withdraw`).
    *   (If applicable) User signs transaction via Privy/Wallet.
6.  **Success**:
    *   Success message displayed.
    *   Modal closes automatically after 2 seconds.
    *   Portfolio balance refreshes.

---

## 4. Technical Implementation

### 4.1 Component Structure (`AssetActionModal.tsx`)

```tsx
export function AssetActionModal({ asset, onClose, onSuccess }: AssetActionModalProps) {
    // Hooks for Auth and Wallets
    const { isAuthenticated } = useAuth();
    const { wallets } = useWallets();

    // State Management
    const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
    
    // ... Logic for rate limiting and API calls ...
}
```

### 4.2 Asset Configuration

The system dynamically loads asset configuration (Logos, Colors) based on the asset symbol:

```typescript
const getAssetConfig = (symbol: string) => {
    // Returns { icon: string, color: string }
    // Supports: ETH, SOL, SUI, BASE, USDC, USDT, WBTC, DAI
}
```

### 4.3 Mobile Optimization

*   **Height**: Adjustable `max-h` based on viewport (`85vh` on mobile).
*   **Scroll Area**: Content container has `pb-24` to ensure the bottom action buttons are always accessible above the mobile browser navigation bar.

---

## 5. Supported Assets

The system currently supports the following assets with full branding:

*   **Native**: Ethereum (ETH), Solana (SOL), Sui (SUI), Base (ETH)
*   **Stablecoins**: USDC, USDT, DAI
*   **Tokens**: WBTC

---
