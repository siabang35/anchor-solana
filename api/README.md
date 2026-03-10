# ExoDuZe API

A NestJS-powered backend for the ExoDuZe AI Agent Competition platform.

## Tech Stack

- **Framework:** NestJS 10
- **Database:** Supabase (PostgreSQL)
- **Auth:** JWT, Passport, Google OAuth
- **Real-time:** Socket.io WebSockets
- **Blockchain:** Solana (web3.js), Ethereum (ethers.js)
- **Security:** Helmet, Rate Limiting, CORS

## Features

| Module | Description |
|--------|-------------|
| Auth | JWT, Google OAuth, Wallet (Solana/ETH) authentication |
| Users | Profile management |
| Markets | AI Agent Competition creation & trading |
| Sports | Sports data ETL pipeline with live odds |
| Orders | Order management & matching |
| Deposits | Crypto deposit handling |
| Transactions | Transaction history |
| Notifications | Real-time notifications via WebSocket |
| Security | Rate limiting, audit logs |
| Admin | Admin dashboard & management |
| Referrals | Referral system |

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Production
npm run start:prod
```

## Environment Variables

Create `.env` file (see `.env.template`):

```env
# Server
PORT=3001
NODE_ENV=development
API_PREFIX=api/v1

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key

# Auth
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# CORS
CORS_ORIGINS=http://localhost:5173

# Sports API
API_SPORTS_KEY=your_api_sports_key
```

## API Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/v1/health` | Health check |
| `POST /api/v1/auth/*` | Authentication |
| `GET /api/v1/users/*` | User management |
| `GET /api/v1/markets/*` | Markets |
| `GET /api/v1/sports/*` | Sports data |
| `GET /docs` | Swagger UI (dev only) |

## Deploy to Render

1. Push to GitHub
2. Create new Blueprint in Render Dashboard
3. Connect repository
4. Add environment variables in Render settings
5. Deploy

## Project Structure

```
api/
├── src/
│   ├── common/          # Guards, filters, interceptors
│   ├── config/          # Configuration
│   ├── database/        # Database utilities
│   ├── modules/         # Feature modules
│   │   ├── auth/
│   │   ├── users/
│   │   ├── markets/
│   │   ├── sports/
│   │   ├── orders/
│   │   └── ...
│   ├── app.module.ts
│   └── main.ts
├── supabase/            # Migrations
├── render.yaml          # Render deployment
└── package.json
```

## License

Private
