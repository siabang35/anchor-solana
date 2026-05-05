# Security Architecture & Hardening

> **ExoDuZe API — Enterprise-Grade Defense-in-Depth**
> Version: 3.0.0 | Updated: May 2026
> HTTP Engine: NestJS 10 + Fastify 5 | OWASP Top 10 Compliant

---

## 1. Security Pipeline Overview

The ExoDuZe API implements **12 independent security layers** using Fastify-native plugins and NestJS guards/interceptors. All security is configured in `main.ts` and executed via Fastify lifecycle hooks.

```text
Request Flow (Fastify Pipeline):

  Client Request
       │
       ▼
  ┌─────────────────────┐
  │ @fastify/rate-limit  │  L1: 300 req/min global, 5 req/min auth
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ @fastify/helmet      │  L2: CSP, HSTS, Referrer-Policy
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ Fastify onRequest    │  L3: Security headers (COOP, CORP, X-Frame-Options)
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ @fastify/cookie      │  L4: Cookie parsing (httpOnly, secure, sameSite)
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ Fastify preHandler   │  L5: Input sanitization (14 XSS patterns)
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ NestJS Middleware    │  L6: LoggerMiddleware (safe body logging)
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ NestJS ValidationPipe│  L7: DTO validation (whitelist + forbidNonWhitelisted)
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ NestJS Guards        │  L8: JwtAuthGuard, CsrfGuard, AdminGuard
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ NestJS Interceptors  │  L9: Timeout (15s) → ETag Cache → Audit Log
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ Controller Handler   │  Business logic
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ Fastify onSend       │  Response timing (X-Response-Time)
  └─────────────────────┘
```

---

## 2. Authentication & Session Management

### 2.1 JWT Fingerprinting (Session Binding)

To prevent Session Hijacking (OWASP A01:2021), JWTs are bound to the user's specific device configuration.

- **Mechanism**: A cryptographic hash of device characteristics (User-Agent + IP + optional headers) is generated during login/signup.
- **Implementation**: `AuthService.generateTokens(payload, fingerprint)`
- **Validation**: The fingerprint hash is embedded in the JWT payload. On every request, the `JwtStrategy` re-computes the request fingerprint and compares it with the token's hash. Mismatches invalidate the session immediately.

### 2.2 Cookie-Based Refresh Tokens (Fastify)

Refresh tokens are stored in secure HTTP-only cookies via `@fastify/cookie`:

```typescript
// auth.controller.ts — Fastify cookie API
res.setCookie('refresh_token', token, {
    httpOnly: true,
    secure: true,           // HTTPS only in production
    sameSite: 'strict',     // CSRF protection
    path: '/api/v1/auth',   // Scoped to auth endpoints only
    maxAge: 7 * 24 * 60 * 60, // 7 days
});
```

### 2.3 OAuth Security Hardening

Google OAuth flow exceeds standard implementation security (RFC 7636):

- **PKCE (S256)**: Proof Key for Code Exchange prevents auth code interception.
- **State Signing**: State parameters are signed with HMAC-SHA256 and bound to the user's session/IP.
- **Nonce Validation**: Cryptographically secure nonces prevent ID Token injection and replay.
- **JTI Registry**: Every `jti` (JWT ID) is tracked to prevent token reuse.
- **Strict Redirects**: Callback URIs are matched exactly against the whitelist.

---

## 3. Rate Limiting & Anti-Throttling

### 3.1 Global Rate Limiting (Fastify-Native)

Handled by `@fastify/rate-limit` — not NestJS middleware — for minimal overhead:

| Config | Value | Purpose |
|--------|-------|---------|
| `max` | 300 | Requests per time window |
| `timeWindow` | 60,000ms | 1-minute window |
| `ban` | 5 | Auto-ban after 5 violations |
| `cache` | 10,000 | Track up to 10K unique IPs |
| `enableDraftSpec` | true | RFC 7231 compliant headers |

### 3.2 Auth Endpoint Rate Limiting

Stricter limits for authentication-sensitive endpoints:

| Config | Value | Purpose |
|--------|-------|---------|
| `max` | 5 | Requests per minute |
| `keyGenerator` | `auth:${ip}` | Separate namespace from global limits |
| `onExceeding` | Logger warning | Early warning on approaching limit |
| `onExceeded` | Logger alert | Violation alert |

### 3.3 Rate Limit Response

```json
{
    "statusCode": 429,
    "message": "Too many requests. Rate limit: 300 per 1 minute. Please try again later.",
    "error": "Too Many Requests"
}
```

**Response Headers:**
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714920060
Retry-After: 45
```

---

## 4. Input Validation & Sanitization

### 4.1 Fastify preHandler Sanitization Hook

A server-side input sanitizer runs on every POST/PUT/PATCH request:

**14 Dangerous Patterns Blocked:**
```text
<script>, </script>, javascript:, on*= (event handlers),
<iframe>, <object>, <embed>, <link>, <meta>, <style>,
vbscript:, expression(), eval(), new Function()
```

**8 Strict Fields** (zero HTML tolerance):
```text
email, password, username, phone, address, walletAddress, signature, nonce
```

### 4.2 NestJS ValidationPipe (Global)

```typescript
new ValidationPipe({
    whitelist: true,              // Strip unknown properties
    forbidNonWhitelisted: true,   // Reject requests with unknown fields
    transform: true,              // Auto-transform to DTO instances
    disableErrorMessages: true,   // Hide validation details in production
})
```

### 4.3 Custom Validation Decorators

| Decorator | Purpose |
|-----------|---------|
| `@IsValidWalletAddress(chain)` | Regex validation for Ethereum, Solana, Sui, Base addresses |
| `@SanitizeString()` | Trim whitespace + strip control characters |
| `@NoPrototypePollution()` | Block `__proto__`, `constructor` keys |
| `@IsSafeNumber()` | Prevent NaN, Infinity, overflow in financial values |

---

## 5. Security Headers

### 5.1 Fastify Helmet Plugin

```typescript
await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

### 5.2 Additional Headers (Fastify onRequest Hook)

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing prevention |
| `X-Frame-Options` | `DENY` | Clickjacking prevention |
| `X-XSS-Protection` | `0` | Disable buggy browser XSS filters |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin isolation |
| `Cross-Origin-Resource-Policy` | `same-origin` | Resource sharing control |
| `Permissions-Policy` | Deny all | Camera, mic, geolocation disabled |
| `Cache-Control` | `no-store` (auth endpoints) | Prevent caching of sensitive data |

---

## 6. CORS Configuration

```typescript
app.enableCors({
    origin: corsOrigins.split(','),  // Explicit whitelist (no wildcard in prod)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 'Authorization', 'X-Requested-With',
        'X-Request-ID', 'If-None-Match', 'Cache-Control',
    ],
    exposedHeaders: [
        'ETag', 'X-Response-Time', 'X-RateLimit-Limit',
        'X-RateLimit-Remaining', 'X-RateLimit-Reset',
    ],
    maxAge: 86400,  // 24h preflight cache
});
```

> **Production enforcement**: If `CORS_ORIGINS` is unset or `*` in production, the API will **refuse to start** (`process.exit(1)`).

---

## 7. CSRF Protection (Double-Submit Cookie)

### 7.1 Implementation

The `CsrfGuard` implements the double-submit cookie pattern with HMAC-SHA256 signing:

1. **Token Generation**: Server generates a cryptographic CSRF token and sets it as a signed cookie.
2. **Client Transmission**: Frontend reads the cookie and sends it back via the `X-CSRF-Token` header.
3. **Server Validation**: Guard compares the cookie token with the header token using `crypto.timingSafeEqual()`.
4. **Rotation**: Tokens are rotated after each state-changing request.

### 7.2 Safe Methods

GET, HEAD, OPTIONS are excluded from CSRF validation (read-only).

---

## 8. Body & Upload Limits (Anti-Chunking / Anti-DoS)

| Limit | Value | Config |
|-------|-------|--------|
| **Request body** | 100 KB | Fastify `bodyLimit: 102_400` |
| **File upload** | 5 MB | `@fastify/multipart` `fileSize: 5 * 1024 * 1024` |
| **Files per request** | 1 | `@fastify/multipart` `files: 1` |
| **Form fields** | 10 | `@fastify/multipart` `fields: 10` |
| **Allowed MIME types** | `image/jpeg`, `image/png`, `image/webp` | Controller-level validation |
| **Connection timeout** | 30s | Fastify `connectionTimeout` |
| **Keep-alive timeout** | 72s | Fastify `keepAliveTimeout` (> ALB 60s) |
| **Request timeout** | 15s | `TimeoutInterceptor` (60s for on-chain ops) |

---

## 9. Treasury Key Management & On-Chain Security

### 9.1 Treasury Keypair Handling

| Rule | Implementation |
|------|----------------|
| **Storage** | Private key stored ONLY in API `.env` file |
| **Git Protection** | `.env` is listed in `.gitignore` — never committed to VCS |
| **Documentation** | Only the **public key** is documented |
| **Access** | Only `PoolService` (backend, server-side) accesses the keypair via `ConfigService` |
| **Frontend Isolation** | Frontend has ZERO access to treasury keys; only TX signatures are shared |
| **Rotation** | Keys can be rotated by updating `.env` and restarting the API |

> ⚠️ **Critical Rule**: `SOLANA_TREASURY_PRIVATE_KEY` must NEVER appear in: README, frontend code, API responses, log output, or Git history.

### 9.2 On-Chain Transaction Security

| Mechanism | Description |
|-----------|-------------|
| **Self-Transfer Pattern** | Auto-stakes use treasury self-transfers to generate verifiable TXs |
| **Confirmed Commitment** | All TXs use `'confirmed'` commitment level |
| **Signature Integrity** | Full Base58 TX signatures stored in DB — never truncated |
| **UI Truncation** | Display-only truncation with full hash in tooltip and Solscan link |
| **Fallback Chain** | Treasury TX → Devnet Airdrop → `null` (graceful degradation) |

### 9.3 Prize Disbursement Security

| Control | Description |
|---------|-------------|
| **Server-Side Only** | Disbursement triggered by `RealtimeCompetitionSeederService` (cron) |
| **Double-Spend Prevention** | Pool status: `pending → settling → settled` with PostgreSQL row-lock |
| **Audit Trail** | Every TX recorded in `pool_winners.disburse_tx` and `pool_settlement_audit` |
| **Wallet Resolution** | Winner wallets resolved from authenticated user profiles only |
| **Amount Validation** | Prize amounts: `distributable_pool × share_bps / 10000` (server-side) |

---

## 10. Response Caching & Performance Security

### 10.1 ETag-Based Caching (CacheResponseInterceptor)

- Generates ETag from `SHA-256` hash of response body.
- Returns `304 Not Modified` when client sends matching `If-None-Match`.
- TTL-based cache: 5-10s for competition data, no cache for auth endpoints.
- Saves ~80% bandwidth for frequently-polled endpoints.

### 10.2 Compression (Anti-Bandwidth Abuse)

```typescript
await app.register(import('@fastify/compress'), {
    encodings: ['br', 'gzip', 'deflate'],  // Brotli priority
    threshold: 1024,                         // Only compress > 1KB
});
```

---

## 11. Audit & Logging

### 11.1 Audit Log Interceptor

The `AuditLogInterceptor` records all state-changing operations with:
- User ID, IP address, and User-Agent
- Request method, URL, and body (sensitive fields masked)
- Response status code and timing
- Stored in Supabase `audit_logs` table

### 11.2 Safe Logger

The `LoggerMiddleware` includes safeguards:
- Null/undefined body handling
- Automatic masking of `password`, `token`, `secret` fields
- Request ID correlation (`X-Request-ID`)

### 11.3 Response Timing

Every response includes an `X-Response-Time` header (e.g., `12.34ms`).
In development mode, `Server-Timing` header is also included for DevTools.

---

## 12. Environment Variable Security Checklist

Before deploying to production, verify:

- [ ] `SOLANA_TREASURY_PRIVATE_KEY` is set and the wallet is funded
- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] `NODE_ENV=production` (disables debug logging and Swagger)
- [ ] `CORS_ORIGINS` contains only production domains (no wildcard)
- [ ] `COOKIE_SECRET` is a strong, unique secret (not the default)
- [ ] `JWT_SECRET` is cryptographically strong (≥ 256-bit)
- [ ] `COOKIE_SECURE=true` (HTTPS only)
- [ ] All API keys and secrets are unique, strong, and rotated periodically
- [ ] Database uses connection pooler (port 6543) for production
- [ ] Rate limiting is configured (global: 300/min, auth: 5/min)
- [ ] Swagger UI is disabled (`!isProduction` check)
- [ ] File upload limits are enforced (5MB max)

---

*Last Updated: May 2026 — Fastify 5 Migration Complete*
