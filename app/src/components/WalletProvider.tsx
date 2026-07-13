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
            // Clear any declined status when wallet is explicitly disconnected
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('siwe_declined');
            }
        }
    }, [connected, publicKey]);

    useEffect(() => {
        const authenticate = async () => {
            // Only trigger if connected, have public key, and signMessage is available
            if (!connected || !publicKey || !signMessage) return;

            // Synchronous check of localStorage to prevent race conditions on page load/refresh
            const token = localStorage.getItem('access_token');
            const storedAddress = localStorage.getItem('wallet_address');
            if (token && storedAddress === publicKey.toBase58()) {
                setIsAuthenticated(true);
                return;
            }

            if (isAuthenticated) return;
            if (isSigningRef.current) return;

            // Prevent prompt loops if the user previously declined in this session
            if (typeof window !== 'undefined' && sessionStorage.getItem('siwe_declined') === 'true') {
                return;
            }
            
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
                    if (typeof window !== 'undefined') {
                        sessionStorage.removeItem('siwe_declined');
                    }
                    setIsAuthenticated(true);
                }
            } catch (err) {
                console.error('Wallet SIWE authentication failed:', err);
                
                // Set the declined flag in sessionStorage to prevent loop prompts
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('siwe_declined', 'true');
                }
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
    const [isInApp, setIsInApp] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkInApp = () => {
            const hasInjected = !!(
                (window as any).solana?.isPhantom ||
                (window as any).phantom?.solana ||
                (window as any).solflare ||
                (window as any).ethereum
            );
            const matchesUA = /phantom|solflare/i.test(navigator.userAgent);
            
            if (hasInjected || matchesUA) {
                setIsInApp(true);
            }
        };

        // Check immediately
        checkInApp();

        // Check again after multiple delayed intervals to handle async injection
        const t1 = setTimeout(checkInApp, 100);
        const t2 = setTimeout(checkInApp, 250);
        const t3 = setTimeout(checkInApp, 500);
        const t4 = setTimeout(checkInApp, 1000);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
        };
    }, []);

    const endpoint = useMemo(() => {
        return process.env.NEXT_PUBLIC_SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet');
    }, []);
    
    const wallets = useMemo(() => {
        if (!mounted || typeof window === 'undefined') return [];

        const origin = window.location.origin;

        // If inside a mobile wallet in-app browser (Phantom / Solflare),
        // we omit SolanaMobileWalletAdapter to avoid socket connection failures.
        if (isInApp) {
            return [];
        }

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
    }, [mounted, isInApp]);

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
