'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { 
    createDefaultAuthorizationResultCache, 
    SolanaMobileWalletAdapter, 
    createDefaultAddressSelector, 
    createDefaultWalletNotFoundHandler 
} from '@solana-mobile/wallet-adapter-mobile';

import '@solana/wallet-adapter-react-ui/styles.css';

export default function WalletProvider({ children }: { children: React.ReactNode }) {
    const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
    const wallets = useMemo(() => [
        new SolanaMobileWalletAdapter({
            addressSelector: createDefaultAddressSelector(),
            appIdentity: {
                name: 'ExoDuZe',
                uri: 'https://exoduze.app',
                icon: '/images/logo/exoduze-logo.png',
            },
            authorizationResultCache: createDefaultAuthorizationResultCache(),
            cluster: 'devnet',
            onWalletNotFound: createDefaultWalletNotFoundHandler(),
        }),
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
    ], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
}
