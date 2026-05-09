# Security Architecture & Hardening

> **Overview**
>
> This document details the multi-layered security architecture implemented in the ExoDuZe backend to protect against OWASP Top 10 vulnerabilities, ensure financial data integrity, and secure real-time communication channels.

---

## 1. Authentication & Session Management

### 1.1 JWT Fingerprinting (Session Binding)
To prevent Session Hijacking (OWASP A01:2021), we bind JWTs to the user's specific device configuration.

-   **Mechanism**: A cryptographic hash of device characteristics (User-Agent + IP + optional headers) is generated during login/signup.
-   **Implementation**: `AuthService.generateTokens(payload, fingerprint)`
-   **Validation**: The fingerprint hash is embedded in the JWT payload. On every request, the `JwtStrategy` re-computes the request fingerprint and compares it with the token's hash. Mismatches invalidate the session immediately.

### 1.2 WebSocket Authentication
Real-time connections are secured using a dedicated Guard system:

-   **`WsAuthGuard`**: Intercepts the WebSocket handshake. Extracts the JWT from the `authorization` query parameter or header. Verifies the token and its fingerprint before allowing the socket connection to upgrade.
-   **Idle Cleanup**: Inactive socket connections are automatically terminated by the gateways (`SportsGateway`, `SecurityGateway`) to prevent resource exhaustion attacks.

### 1.3 OAuth Security Hardening
Our Google OAuth flow exceeds standard implementation security (RFC 7636) to prevent advanced attacks:

-   **PKCE (S256)**: Proof Key for Code Exchange prevents auth code interception.
-   **State Signing**: State parameters are signed with HMAC-SHA256 and bound to the user's session/IP to prevent CSRF and Login CSRF.
-   **Nonce Validation**: Cryptographically secure nonces prevent ID Token injection and replay.
-   **JTI Registry**: We track every used `jti` (JWT ID) to guarantee that an ID token can never be reused.
-   **Strict Redirects**: Callback URIs are matched exactly against the database whitelist.

---

## 2. Authorization & RBAC

### 2.1 Role-Based Access Control
-   **Admin Guards**: Critical endpoints (e.g., system configuration, security monitoring) are protected by `WsAdminGuard`.
-   **Gateways**: The `SecurityGateway` explicitly checks for the `admin` role in the user's metadata before processing any privileged events.

---

## 3. Data Integrity & Financial Security

### 3.1 Idempotency
To prevent double-spending and duplicate processing (OWASP A08:2021):

-   **Header**: `Idempotency-Key` (UUID v4)
-   **Implementation**: `OrdersService` checks a centralized Redis/Cache store for processed keys.
-   **Workflow**:
    1.  Client generates UUID for `buyShares` / `sellShares`.
    2.  Server checks if Key exists.
    3.  If exists → Reject (409 Conflict) or Return valid cached response.
    4.  If new → Process transaction and cache Key.

### 3.2 Safe Numeric Handling
-   **Decorator**: custom `@IsSafeNumber()` validator.
-   **Checks**: Prevents `NaN`, `Infinity`, and excessively large numbers that could cause overflow or logical errors in financial calculations.

### 3.3 Transaction Atomicity
(Planned/In-Progress) Database transactions ensure that updating user balances and creating order records happen in an all-or-nothing block.

---

## 4. Input Validation & sanitization

We use a "Defense in Depth" approach for input handling:

### 4.1 Custom Validation Decorators
Located in `src/common/decorators/validation.decorators.ts`:

-   `@IsValidWalletAddress(chain)`: Regex validation for Ethereum (0x..), Solana, Sui, and Base addresses.
-   `@SanitizeString()`: Trims whitespace and removes control characters.
-   `@NoPrototypePollution()`: Rejects keys like `__proto__`, `constructor` to prevent Object Injection attacks.
-   `@IsUUIDv4()`: Strict UUID format enforcement.

### 4.2 Request Limits & Payloads (Fastify)
To prevent Denial of Service (DoS) and stack-overflow attacks:
-   **Body Size**: Globally limited to **100kb** via Fastify config.
-   **JSON Depth Limiting**: Custom preHandler hook automatically rejects JSON bodies nested deeper than **10 levels** (OWASP A04:2021).
-   **Anti-HPP (HTTP Parameter Pollution)**: Custom onRequest hook strips duplicate query parameters, keeping only the last value to prevent validation bypass.
-   **Rate Limiting**:
    -   **API**: Global limit of 300 req/min per IP using `@fastify/rate-limit`.
    -   **Auth**: Stricter hook-based limit of 5 req/min for login/signup endpoints.
    -   **Claim API (`ClaimRateLimitGuard`)**: Strict domain-specific threshold of 10 requests / 5 mins per IP + Wallet, with automatic IP/Wallet blocking (anti-brute-force).

### 4.3 Connection Security (OWASP A04:2021)
To mitigate Slowloris and Chunking attacks, the Fastify HTTP Engine enforces strict timeouts:
-   **Request Timeout**: `30000ms` (30 seconds maximum per request to prevent holding resources).
-   **Connection Timeout**: `65000ms` (Drops idle connections, optimized to prevent Load Balancer 502s).
-   **Trust Proxy**: Automatically configured for Render (`process.env.RENDER === 'true'`) to ensure accurate client IP detection behind load balancers.

---

## 5. Network & Dependency Security

### 5.1 Origin Validation
-   **CORS**: Strict whitelist of allowed origins (`CORS_ORIGINS`).
-   **WebSocket**: `origin` header check during handshake.

### 5.2 Dependency Management using PNPM Overrides
We enforce secure versions of transitive dependencies in `package.json`:

```json
"pnpm": {
  "overrides": {
    "h3": ">=1.15.5",
    "hono": ">=4.11.4",
    "tar": ">=7.5.3",
    "qs": ">=6.14.1",
    // ...others
  }
}
```

This proactively fixes known CVEs even if our direct dependencies haven't upgraded yet.

---

## 6. Audit & Logging

### 6.1 Security Event Logging
A dedicated `SecurityEventService` logs high-risk actions (e.g., failed login attempts, admin access, schema changes) for audit trails.

### 6.2 Safe Logger
The middleware logger (`LoggerMiddleware`) includes safeguards to prevent crashing on `null`/`undefined` bodies and automatically masks sensitive fields (password, token, secret) before writing to stdout.

---

## 7. Treasury Key Management & On-Chain Security

### 7.1 Treasury Keypair Handling

The platform uses a **Solana Devnet Treasury Keypair** for automated on-chain operations (stake registration, prize disbursement). Security best practices are strictly enforced:

| Rule | Implementation |
|------|----------------|
| **Storage** | Private key stored ONLY in API `.env` file |
| **Git Protection** | `.env` is listed in `.gitignore` — never committed to VCS |
| **Documentation** | Only the **public key** is documented; private key is NEVER referenced |
| **Access** | Only `PoolService` (backend, server-side) can access the keypair via `ConfigService` |
| **Frontend Isolation** | Frontend code has ZERO access to treasury keys; only TX signatures are shared |
| **Rotation** | Keys can be rotated by updating `.env` and restarting the API service |

> ⚠️ **Critical Rule**: The `SOLANA_TREASURY_PRIVATE_KEY` environment variable must NEVER appear in:
> - README, documentation, or code comments
> - Frontend bundles or client-side code
> - API response payloads or log output
> - Git history or CI/CD pipeline logs

### 7.2 On-Chain Transaction Security

| Mechanism | Description |
|-----------|-------------|
| **Self-Transfer Pattern** | Auto-stakes use treasury self-transfers (tiny lamport amounts) to generate verifiable TXs without moving funds to unknown addresses |
| **Confirmed Commitment** | All TXs use `'confirmed'` commitment level before recording signatures |
| **Signature Integrity** | Full Base58 TX signatures are stored in DB — never truncated in storage |
| **UI Truncation** | Display-only truncation (`shortTx()`) with full hash in `title` attribute and `href` |
| **Fallback Chain** | Treasury TX → Devnet Airdrop → `null` (graceful degradation) |

### 7.3 Prize Disbursement Security (Pull System)

In v2.1, the system migrated from a cron-driven "Push" disbursement to a highly secure, user-initiated "Pull" Claim system.

| Control | Description |
|---------|-------------|
| **Concurrency Locking (Mutex)** | In-memory `claimLocks` Set prevents parallel requests from double-claiming the same prize. |
| **Pessimistic Double-Check** | Claim status (`claimed = false`) and pool status (`settlement_status = settled`) are verified immediately before and after the on-chain transaction. |
| **Multi-Layer Validation** | Validates the requesting wallet against the agent's raw `walletAddress` AND the `user_id` profile recursively. |
| **Audit Trail** | Both successful transfers and blocked attempts (e.g., race conditions, unauthorized) are logged to `pool_settlement_audit`. |
| **ClaimRateLimitGuard** | Blocks IP/Wallets that attempt rapid, brute-force claim injections across multiple endpoints. |
| **Amount Validation** | Prize amounts calculated server-side from `distributable_pool × share_bps / 10000` |
| **PDA Signing (v2)** | Smart contract uses `invoke_signed` with PDA seeds for vault withdrawal — no raw lamport manipulation |
| **1.5x Multiplier Removed (v2)** | `claim_pool_prize` no longer applies `POOL_MULTIPLIER`, preventing vault over-drain |
| **Startup Settlement (v2)** | On server restart, pools are settled (winners determined + prizes disbursed) before cancelling competitions — prevents user stake loss |

---

## 8. Environment Variable Security Checklist

Before deploying to production, verify:

- [ ] `SOLANA_TREASURY_PRIVATE_KEY` is set and the wallet is funded
- [ ] `COMPETITION_HMAC_SECRET` is set (32+ chars) — **no longer falls back to hardcoded default**
- [ ] `LEADERBOARD_HMAC_SECRET` is set (32+ chars) — required for cross-restart score chain verification
- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] `NODE_ENV=production` (disables debug logging of sensitive data)
- [ ] `COOKIE_SECURE=true` (HTTPS only)
- [ ] `CORS_ORIGINS` contains only production domains
- [ ] All API keys and secrets are unique, strong, and rotated periodically
- [ ] Database uses connection pooler (port 6543) for production
- [ ] Rate limiting is configured (global: 300/min, auth: 5/min) via `@fastify/rate-limit`
- [ ] Swagger probe endpoints (`/docs`, `/swagger`) explicitly blocked with 404 in production (OWASP A05:2021)
- [ ] File upload limits are enforced (5MB max)
- [ ] Smart contract is deployed with latest security fixes (`anchor deploy`)

### 8.1 Zod Environment Validation (Critical)

The backend uses a **Zod schema** (`api/src/config/env.validation.ts`) to validate all environment variables at startup. Zod's default behavior is to **strip unrecognized keys** — any variable NOT registered in the schema will be silently discarded by `ConfigService`.

> ⚠️ **Gotcha**: If you add a new secret (e.g., `MY_NEW_API_KEY`) to `.env` but forget to add it to the Zod schema, `ConfigService.get('MY_NEW_API_KEY')` will return `undefined` at runtime with **no error message**. This was the root cause of the `SOLANA_TREASURY_PRIVATE_KEY is not set` production incident.

**Rule**: Every new environment variable **must** be registered in `envSchema` in `env.validation.ts` before it can be accessed via `ConfigService`.

---

*Last Updated: 2026-05-10 — Fastify Migration, OWASP Top 10 Security Hardening & Zod Env Validation*
