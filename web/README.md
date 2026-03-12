# ExoDuZe Web Application

Frontend React application untuk platform ExoDuZe AI Agent Competition.

## Development

```bash
# Dari root directory
pnpm dev --filter=@exoduze/web

# Atau dari direktori ini
pnpm dev
```

## Build

```bash
pnpm build
```

## Structure

```
src/
├── app/
│   ├── components/          # React components
│   │   ├── auth/            # Authentication components
│   │   ├── ui/              # UI primitives
│   │   └── ...              # Feature components
│   ├── hooks/               # Custom React hooks
│   └── utils/               # Utility functions
├── services/                # API services
├── styles/                  # CSS styles
└── main.tsx                 # Entry point
```

## Dependencies

- `@exoduze/core` - Shared types dan utilities
- `@exoduze/ui` - Design system components
- `@exoduze/web3` - Web3 wallet integration
