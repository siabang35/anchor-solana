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
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

import '@solana/wallet-adapter-react-ui/styles.css';

import bs58 from 'bs58';
import { apiFetch } from '@/lib/supabase';
import { useWallet } from '@solana/wallet-adapter-react';

function WalletAuthHandler({ children }: { children: React.ReactNode }) {
    const { publicKey, signMessage, connected } = useWallet();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const isSigningRef = React.useRef(false);

    useEffect(() => {
        if (connected && publicKey) {
            const token = localStorage.getItem('access_token');
            const storedAddress = localStorage.getItem('wallet_address');
            if (token && storedAddress === publicKey.toBase58()) {
                setIsAuthenticated(true);
            } else {
                if (token || storedAddress) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('wallet_address');
                }
                setIsAuthenticated(false);
            }
        } else {
            setIsAuthenticated(false);
        }
    }, [connected, publicKey]);

    useEffect(() => {
        const authenticate = async () => {
            // Only trigger if connected, have public key, and signMessage is available
            if (!connected || !publicKey || !signMessage || isAuthenticated) return;
            if (isSigningRef.current) return;
            
            isSigningRef.current = true;

            try {
                // Request challenge from backend
                const challengeRes = await apiFetch<any>('/auth/wallet-connect/challenge', {
                    method: 'POST',
                    body: JSON.stringify({
                        address: publicKey.toBase58(),
                        chain: 'solana'
                    })
                });

                if (!challengeRes?.message) {
                    throw new Error('Invalid challenge response');
                }

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
                    localStorage.setItem('wallet_address', publicKey.toBase58());
                    setIsAuthenticated(true);
                }
            } catch (err) {
                console.error('Wallet SIWE authentication failed:', err);
                // DO NOT disconnect() automatically on mobile.
                // Calling disconnect() on any aborted signature/timeout forces the wallet adapter 
                // to completely log out, triggering disconnect loops on mobile page transitions or backgrounding.
            } finally {
                isSigningRef.current = false;
            }
        };

        authenticate();
    }, [publicKey, signMessage, connected, isAuthenticated]);

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
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
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
