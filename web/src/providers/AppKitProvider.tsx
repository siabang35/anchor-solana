
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { type AppKitNetwork, mainnet, arbitrum, base, polygon, optimism, bsc, avalanche } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { ReactNode } from 'react'

const queryClient = new QueryClient()

// Get projectId from .env
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694' // Fallback for dev

// Metadata
const metadata = {
    name: 'ExoDuZe',
    description: 'ExoDuZe AI-Native Probability Trading Platform',
    url: 'https://exoduzebuild.netlify.app',
    icons: ['https://assets.reown.com/reown-profile-pic.png']
}

// Networks
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, arbitrum, base, polygon, optimism, bsc, avalanche]

// Create Adapter
export const wagmiAdapter = new WagmiAdapter({
    networks,
    projectId,
    ssr: true
});

// Initialize AppKit
createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    features: {
        analytics: true,
        email: false, // Disable default email to use our custom flow
        socials: [], // Disable default socials to use our custom flow
    },
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#8b5cf6', // Violet-500
        '--w3m-border-radius-master': '1px',
    }
})

export function AppKitProvider({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={wagmiAdapter.wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    )
}