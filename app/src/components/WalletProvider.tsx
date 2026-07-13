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

function isTokenExpired(token: string | null): boolean {
    if (!token) return true;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = (4 - (base64.length % 4)) % 4;
        const paddedBase64 = base64 + '='.repeat(padLength);
        const payload = JSON.parse(atob(paddedBase64));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            return true;
        }
        return false;
    } catch {
        return true;
    }
}

function WalletAuthHandler({ children }: { children: React.ReactNode }) {
    const { publicKey, signMessage, connected } = useWallet();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const isSigningRef = React.useRef(false);

    useEffect(() => {
        if (connected && publicKey) {
            const token = localStorage.getItem('access_token');
            const storedAddress = localStorage.getItem('wallet_address');
            const isMatch = storedAddress && storedAddress.toLowerCase() === publicKey.toBase58().toLowerCase();
            
            console.debug('[WalletAuth] Check:', { 
                hasToken: !!token, 
                storedAddress, 
                currentAddress: publicKey.toBase58(), 
                isMatch, 
                isExpired: isTokenExpired(token) 
            });

            if (token && isMatch && !isTokenExpired(token)) {
                setIsAuthenticated(true);
            } else {
                if (token || storedAddress) {
                    console.debug('[WalletAuth] Clearing token/address due to mismatch or expiration');
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

            // Wait 500ms to let wallet adapter state settle and avoid race conditions (e.g. Invalid account)
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!publicKey) return;

            // Synchronous check of localStorage to prevent race conditions on page load/refresh
            const token = localStorage.getItem('access_token');
            const storedAddress = localStorage.getItem('wallet_address');
            const isMatch = storedAddress && storedAddress.toLowerCase() === publicKey.toBase58().toLowerCase();

            if (token && isMatch && !isTokenExpired(token)) {
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
            } catch (err: any) {
                console.error('Wallet SIWE authentication failed:', err);
                
                const errMessage = err?.message || '';
                const isUserCancellation = /cancel|reject|decline|user/i.test(errMessage) || 
                    (err?.name === 'WalletSignMessageError' && errMessage.includes('Cancelled'));

                // Only set the declined flag in sessionStorage if the user explicitly cancelled/rejected
                if (isUserCancellation && typeof window !== 'undefined') {
                    console.debug('[WalletAuth] User explicitly cancelled signature, setting siwe_declined flag');
                    sessionStorage.setItem('siwe_declined', 'true');
                } else {
                    console.debug('[WalletAuth] Authentication failed due to connection/system error, NOT setting siwe_declined flag');
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
    
    const mobileAdapterRef = React.useRef<SolanaMobileWalletAdapter | null>(null);

    const wallets = useMemo(() => {
        if (!mounted || typeof window === 'undefined') return [];

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // If inside a mobile wallet in-app browser (Phantom / Solflare),
        // or if we are on a desktop browser, we omit SolanaMobileWalletAdapter.
        if (isInApp || !isMobile) {
            return [];
        }

        if (!mobileAdapterRef.current) {
            mobileAdapterRef.current = new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: 'ExoDuZe',
                    uri: window.location.origin,
                    icon: '/images/logo/exoduze-logo.png',
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: 'devnet',
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            });
        }

        return [mobileAdapterRef.current];
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
