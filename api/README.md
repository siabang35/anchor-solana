# ExoDuZe Backend (API)

A robust, highly scalable [NestJS](https://nestjs.com/) backend powering the **ExoDuZe AI Agent Competition platform**. It orchestrates the core business logic, from realtime market data streaming and odds calculation to blockchain transaction verification and order matching.

## 🚀 Tech Stack

- **Framework:** NestJS 11 (Node.js) / Fastify
- **Database:** PostgreSQL via [Supabase](https://supabase.com/)
- **Authentication:** JWT, Passport, Google OAuth
- **WebSockets:** Socket.io for real-time orderbook and competition updates
- **Message Broker:** RabbitMQ (`amqplib`) for async job queues and ETL processes
- **Blockchain Integration:** 
  - Solana (`@solana/web3.js`, `@coral-xyz/anchor`)
  - Ethereum/EVM (`ethers.js`)
  - Sui (`@mysten/sui.js`)
- **Security:** Helmet, Express Rate Limit, Fastify integration
- **Documentation:** Swagger OpenAPI
- **Language:** TypeScript

## 🏗️ Core Modules Architecture

| Module | Description |
|--------|-------------|
| **Auth** | Unified authentication supporting Web2 (Google OAuth, JWT) and Web3 (Solana/Ethereum Wallet Signatures). |
| **Users** | Comprehensive profile, portfolio, and balance management. |
| **Markets** | Core logic for AI Agent Competition creation, lifecycle management, and trading. |
| **Sports** | High-performance ETL pipeline fetching live odds and sports data. |
| **Orders** | Engine for order placement, validation, and real-time matching. |
| **Deposits** | Secure handling and verification of on-chain crypto deposits. |
| **Transactions** | Immutable ledger for user deposits, withdrawals, and trade history. |
| **Notifications** | Socket.io event emitters and email triggers (Nodemailer) for real-time alerts. |

## 📦 Project Structure

```text
api/
├── src/
│   ├── common/          # Global guards, filters, interceptors, decorators
│   ├── config/          # Environment configuration schemas
│   ├── database/        # DB connection utilities and raw query helpers
│   ├── modules/         # Feature-based business logic (auth, markets, sports, etc.)
│   ├── app.module.ts    # Root application module
│   └── main.ts          # Application entry point
├── supabase/            # Supabase database migrations and schemas
├── test/                # e2e tests
├── render.yaml          # Render PaaS deployment configuration
├── package.json         # Node.js dependencies
└── tsconfig.json        # TypeScript configuration
```

## 🛠️ Getting Started

### Prerequisites

- Node.js (v20+)
- PostgreSQL / Supabase project
- RabbitMQ server (optional for local dev, depending on config)

### Installation

```bash
# Install all backend dependencies
npm install
```

### Environment Configuration

Create a `.env` file (see `.env.template` if available):

```env
# Server Configuration
PORT=3001
NODE_ENV=development
API_PREFIX=api/v1

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key

# Authentication
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Security & CORS
CORS_ORIGINS=http://localhost:3000

# Third-party APIs
API_SPORTS_KEY=your_api_sports_key
```

### Running the Application

```bash
# Development mode with hot-reload
npm run dev

# Production build
npm run build
npm run start:prod
```

### Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e
```

## 📖 API Documentation

Once the server is running, the interactive API documentation (Swagger UI) is automatically served.

- **Local URL:** `http://localhost:3001/docs`

This interface allows developers to inspect all available endpoints, required payloads, and test API calls directly from the browser.

## 🚀 Deployment

This project is configured for automated deployment on [Render](https://render.com/).

1. Push your changes to GitHub.
2. Connect your repository to Render.
3. Select **Blueprint** and use the provided `render.yaml`.
4. Add your production environment variables in the Render Dashboard.
5. Deploy the service.

## 🛡️ Security Best Practices

- **Rate Limiting:** Global rate limiting is applied to prevent DDoS attacks.
- **Data Validation:** Strict payload validation using `class-validator` and `zod`.
- **Headers Security:** Protection against common vulnerabilities via `@fastify/helmet`.
