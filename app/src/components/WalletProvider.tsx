'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { 
    createDefaultAuthorizationResultCache, 
    SolanaMobileWalletAdapter, 
    createDefaultAddressSelector, 
    createDefaultWalletNotFoundHandler 
} from '@solana-mobile/wallet-adapter-mobile';

import '@solana/wallet-adapter-react-ui/styles.css';

import bs58 from 'bs58';
import { apiFetch } from '@/lib/supabase';
import { useWallet } from '@solana/wallet-adapter-react';

function WalletAuthHandler({ children }: { children: React.ReactNode }) {
    const { publicKey, signMessage, disconnect, connected } = useWallet();
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const authenticate = async () => {
            // Only trigger if connected, have public key, and signMessage is available
            if (!connected || !publicKey || !signMessage || isAuthenticated) return;
            
            // If we already have a token for this session, skip signing
            const token = localStorage.getItem('access_token');
            if (token) {
                setIsAuthenticated(true);
                return;
            }

            try {
                // Request challenge from backend
                const challengeRes = await apiFetch<any>('/auth/wallet-connect/challenge', {
                    method: 'POST',
                    body: JSON.stringify({
                        address: publicKey.toBase58(),
                        chain: 'solana'
                    })
                });

                // Request user to sign the message
                const encodedMessage = new TextEncoder().encode(challengeRes.message);
                const signature = await signMessage(encodedMessage);

                // Verify the signature to get JWT token
                const verifyRes = await apiFetch<any>('/auth/wallet-connect/verify', {
                    method: 'POST',
                    body: JSON.stringify({
                        address: publicKey.toBase58(),
                        chain: 'solana',
                        signature: bs58.encode(signature),
                        message: challengeRes.message,
                        nonce: challengeRes.nonce
                    })
                });

                if (verifyRes?.tokens?.accessToken) {
                    localStorage.setItem('access_token', verifyRes.tokens.accessToken);
                    setIsAuthenticated(true);
                }
            } catch (err) {
                console.error('Wallet SIWE authentication failed:', err);
                // Disconnect if user rejects signature to mimic EVM strict-auth behavior
                disconnect();
            }
        };

        authenticate();
    }, [publicKey, signMessage, connected, isAuthenticated, disconnect]);

    return <>{children}</>;
}

export default function WalletProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
    
    const wallets = useMemo(() => {
        if (!mounted || typeof window === 'undefined') return [];

        const origin = window.location.origin;

        return [
            new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: 'ExoDuZe',
                    uri: origin,
                    icon: '/images/logo/exoduze-logo.png',
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: 'devnet',
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            }),
        ];
    }, [mounted]);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <WalletAuthHandler>
                        {children}
                    </WalletAuthHandler>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
}
