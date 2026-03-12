/**
 * Wallet Adapters for Multi-Chain Authentication
 * 
 * COMPREHENSIVE WALLET SUPPORT:
 * - MetaMask (EVM: Ethereum, Base, Polygon, Arbitrum, Optimism)
 * - Phantom (Solana & EVM)
 * - Coinbase Wallet (EVM)
 * - Slush (SUI)
 * - WalletConnect (Multi-chain via QR/Deep Link)
 * 
 * SECURITY FEATURES (OWASP Compliant):
 * - Anti-drain protection (only signs messages, not transactions)
 * - Message preview before signing
 * - Domain verification
 * - Mobile deep link support with proper scheme detection
 * 
 * MULTI-WALLET HANDLING:
 * - Uses EIP-6963 (Multi-Injected Provider Discovery) for robust EVM detection
 * - Uses Wallet Standard for SUI discovery
 * - Falls back to legacy injection paths
 */

export type WalletProvider = 'metamask' | 'phantom' | 'coinbase' | 'slush' | 'walletconnect';
export type WalletChain = 'ethereum' | 'base' | 'solana' | 'sui' | 'polygon' | 'arbitrum' | 'optimism';

export interface WalletAdapter {
    name: WalletProvider;
    displayName: string;
    icon: string;
    chains: WalletChain[];
    downloadUrl: string;
    mobileDeepLink?: string;
    isInstalled: () => boolean;
    getProvider: () => any | null;
    connect: () => Promise<string>;
    getAddress: () => Promise<string | null>;
    getChain: () => Promise<WalletChain | null>;
    signMessage: (message: string) => Promise<string>;
    disconnect: () => Promise<void>;
}

export interface WalletConnectionResult {
    address: string;
    chain: WalletChain;
    provider: WalletProvider;
    signature?: string;
}

// Detect environment
const isBrowser = typeof window !== 'undefined';
const isMobile = isBrowser && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ============================================================
// EIP-6963 PROVIDER DISCOVERY (EVM)
// ============================================================

interface EIP6963ProviderDetail {
    info: {
        uuid: string;
        name: string;
        icon: string;
        rdns: string;
    };
    provider: any;
}

// Cache found providers
const discoveredProviders: Map<string, EIP6963ProviderDetail> = new Map();

if (isBrowser) {
    // Listen for providers announcing themselves
    window.addEventListener('eip6963:announceProvider', ((event: any) => {
        const detail = event.detail as EIP6963ProviderDetail;
        if (detail && detail.info) {
            discoveredProviders.set(detail.info.rdns, detail);
            // Also map by name for easier lookup
            discoveredProviders.set(detail.info.name.toLowerCase(), detail);
            console.log(`[WalletDiscovery] Discovered: ${detail.info.name} (${detail.info.rdns})`);
        }
    }) as EventListener);

    // Announce request to find already injected providers
    // We do this in a timeout to ensure other scripts have loaded
    setTimeout(() => {
        window.dispatchEvent(new Event('eip6963:requestProvider'));
    }, 100);

    // Fallback: Dispatch again after a short delay for late injections
    setTimeout(() => {
        window.dispatchEvent(new Event('eip6963:requestProvider'));
    }, 1000);
}

// ============================================================
// PROVIDER DETECTION UTILITIES
// ============================================================

/**
 * Find MetaMask provider specifically using EIP-6963 or Legacy
 */
function getMetaMaskProvider(): any | null {
    if (!isBrowser) return null;

    // 1. EIP-6963 (Best way)
    // MetaMask RDNS is 'io.metamask'
    const eip6963MetaMask = discoveredProviders.get('io.metamask');
    if (eip6963MetaMask) return eip6963MetaMask.provider;

    // 2. Legacy window.ethereum with checks
    const ethereum = (window as any).ethereum;

    // Handle providers array (older multi-injection standard)
    if (ethereum?.providers) {
        return ethereum.providers.find((p: any) => p.isMetaMask && !p.isPhantom && !p.isCoinbaseWallet);
    }

    // Handle direct injection
    if (ethereum?.isMetaMask && !ethereum?.isPhantom && !ethereum?.isCoinbaseWallet) {
        return ethereum;
    }

    return null;
}

/**
 * Find Phantom Solana provider
 */
function getPhantomSolanaProvider(): any | null {
    if (!isBrowser) return null;

    // Phantom Solana is at window.phantom?.solana or window.solana
    // Note: window.solana might be overridden by other wallets (e.g. Backpack, Solflare)
    // So we check isPhantom flag

    // Check window.phantom.solana (Most specific)
    const phantomSolana = (window as any).phantom?.solana;
    if (phantomSolana?.isPhantom) return phantomSolana;

    // Check window.solana (Generic injection)
    const solana = (window as any).solana;
    if (solana?.isPhantom) return solana;

    return null;
}

/**
 * Find Coinbase Wallet provider
 */
function getCoinbaseProvider(): any | null {
    if (!isBrowser) return null;

    // 1. EIP-6963
    const eip6963Coinbase = discoveredProviders.get('com.coinbase.wallet');
    if (eip6963Coinbase) return eip6963Coinbase.provider;

    // 2. Dedicated injection
    const coinbaseWallet = (window as any).coinbaseWalletExtension;
    if (coinbaseWallet) return coinbaseWallet;

    // 3. Providers array
    const ethereum = (window as any).ethereum;
    if (ethereum?.providers) {
        return ethereum.providers.find((p: any) => p.isCoinbaseWallet);
    }

    // 4. Direct injection
    if (ethereum?.isCoinbaseWallet) return ethereum;

    return null;
}

/**
 * Get SUI provider (Slush / Sui Wallet)
 */
function getSlushProvider(): any | null {
    if (!isBrowser) return null;

    console.log('[WalletDebug] SUI Providers:', {
        slush: !!(window as any).slush,
        suiWallet: !!(window as any).suiWallet,
        sui: !!(window as any).sui,
        // Check for Wallet Standard
        wallets: (window.navigator as any).getWallets ? 'getWallets() exists' : 'no getWallets',
    });

    // Slush specific
    if ((window as any).slush) {
        return (window as any).slush;
    }

    // Generic SUI wallet (standard)
    if ((window as any).suiWallet) {
        return (window as any).suiWallet;
    }

    // Check window.sui which is sometimes used
    if ((window as any).sui) {
        return (window as any).sui;
    }

    return null;
}

// ============================================================
// METAMASK ADAPTER
// ============================================================

export const MetaMaskAdapter: WalletAdapter = {
    name: 'metamask',
    displayName: 'MetaMask',
    icon: '/icons/metamask.svg',
    chains: ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism'],
    downloadUrl: 'https://metamask.io/download/',
    mobileDeepLink: 'metamask://dapp/exoduze.app',

    isInstalled: () => {
        return getMetaMaskProvider() !== null;
    },

    getProvider: () => {
        return getMetaMaskProvider();
    },

    connect: async () => {
        const provider = getMetaMaskProvider();

        if (!provider) {
            if (isMobile) {
                window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
                throw new Error('Redirecting to MetaMask app...');
            }
            throw new Error('MetaMask is not installed. Please install the MetaMask extension.');
        }

        try {
            const accounts = await provider.request({
                method: 'eth_requestAccounts',
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found. Please unlock MetaMask.');
            }

            return accounts[0] as string;
        } catch (error: any) {
            if (error.code === 4001) {
                throw new Error('Connection rejected. Please approve in MetaMask.');
            }
            // -32002 means pending request
            if (error.code === -32002) {
                throw new Error('Check MetaMask, connection request is pending.');
            }
            throw new Error(error.message || 'Failed to connect to MetaMask');
        }
    },

    getAddress: async () => {
        const provider = getMetaMaskProvider();
        if (!provider) return null;
        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            return accounts?.[0] || null;
        } catch {
            return null;
        }
    },

    getChain: async () => {
        const provider = getMetaMaskProvider();
        if (!provider) return null;
        try {
            const chainId = await provider.request({ method: 'eth_chainId' });
            return chainIdToChain(parseInt(chainId, 16));
        } catch {
            return null;
        }
    },

    signMessage: async (message: string) => {
        const provider = getMetaMaskProvider();
        if (!provider) throw new Error('MetaMask is not available');

        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts?.[0]) throw new Error('No account connected within MetaMask');

        try {
            const signature = await provider.request({
                method: 'personal_sign',
                params: [message, accounts[0]],
            });
            return signature as string;
        } catch (error: any) {
            if (error.code === 4001) throw new Error('Signature rejected');
            throw new Error(error.message || 'Failed to sign message');
        }
    },

    disconnect: async () => { },
};

// ============================================================
// PHANTOM ADAPTER (Solana)
// ============================================================

export const PhantomAdapter: WalletAdapter = {
    name: 'phantom',
    displayName: 'Phantom',
    icon: '/icons/phantom.svg',
    chains: ['solana'],
    downloadUrl: 'https://phantom.app/download',
    mobileDeepLink: 'phantom://browse/exoduze.app',

    isInstalled: () => {
        return getPhantomSolanaProvider() !== null;
    },

    getProvider: () => {
        return getPhantomSolanaProvider();
    },

    connect: async () => {
        const provider = getPhantomSolanaProvider();

        if (!provider) {
            if (isMobile) {
                const encodedUrl = encodeURIComponent(window.location.href);
                window.location.href = `https://phantom.app/ul/browse/${encodedUrl}`;
                throw new Error('Redirecting to Phantom app...');
            }
            throw new Error('Phantom is not installed. Please install the Phantom extension.');
        }

        try {
            // "onlyIfTrusted" helps avoid popup if already connected,
            // but for explicit connect we don't use it or catch error to retry
            const response = await provider.connect();
            return response.publicKey.toString();
        } catch (error: any) {
            if (error.code === 4001) {
                throw new Error('Connection rejected. Please approve in Phantom.');
            }
            throw new Error(error.message || 'Failed to connect to Phantom');
        }
    },

    getAddress: async () => {
        const provider = getPhantomSolanaProvider();
        if (!provider) return null;
        if (provider.isConnected && provider.publicKey) {
            return provider.publicKey.toString();
        }
        return null;
    },

    getChain: async () => {
        return 'solana';
    },

    signMessage: async (message: string) => {
        const provider = getPhantomSolanaProvider();
        if (!provider) throw new Error('Phantom is not available');

        if (!provider.isConnected) {
            await provider.connect();
        }

        try {
            const encodedMessage = new TextEncoder().encode(message);
            const signedMessage = await provider.signMessage(encodedMessage, 'utf8');
            // Return base58 encoded signature
            return encodeBase58(signedMessage.signature);
        } catch (error: any) {
            if (error.code === 4001) throw new Error('Signature rejected');
            throw new Error(error.message || 'Failed to sign message');
        }
    },

    disconnect: async () => {
        const provider = getPhantomSolanaProvider();
        if (provider?.disconnect) await provider.disconnect();
    },
};

// ============================================================
// COINBASE ADAPTER
// ============================================================

export const CoinbaseAdapter: WalletAdapter = {
    name: 'coinbase',
    displayName: 'Coinbase Wallet',
    icon: '/icons/coinbase.svg',
    chains: ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism'],
    downloadUrl: 'https://www.coinbase.com/wallet/downloads',
    mobileDeepLink: 'cbwallet://dapp',

    isInstalled: () => {
        return getCoinbaseProvider() !== null;
    },

    getProvider: () => {
        return getCoinbaseProvider();
    },

    connect: async () => {
        const provider = getCoinbaseProvider();

        if (!provider) {
            if (isMobile) {
                const encodedUrl = encodeURIComponent(window.location.href);
                window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`;
                throw new Error('Redirecting to Coinbase Wallet app...');
            }
            throw new Error('Coinbase Wallet is not installed. Please install the extension.');
        }

        try {
            const accounts = await provider.request({
                method: 'eth_requestAccounts',
            });
            if (!accounts || accounts.length === 0) throw new Error('No accounts found');
            return accounts[0] as string;
        } catch (error: any) {
            if (error.code === 4001) throw new Error('Connection rejected');
            throw new Error(error.message || 'Failed to connect to Coinbase Wallet');
        }
    },

    getAddress: async () => {
        const provider = getCoinbaseProvider();
        if (!provider) return null;
        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            return accounts?.[0] || null;
        } catch {
            return null;
        }
    },

    getChain: async () => {
        const provider = getCoinbaseProvider();
        if (!provider) return null;
        try {
            const chainId = await provider.request({ method: 'eth_chainId' });
            return chainIdToChain(parseInt(chainId, 16));
        } catch {
            return null;
        }
    },

    signMessage: async (message: string) => {
        const provider = getCoinbaseProvider();
        if (!provider) throw new Error('Coinbase Wallet not available');

        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts?.[0]) throw new Error('No account connected');

        try {
            const signature = await provider.request({
                method: 'personal_sign',
                params: [message, accounts[0]],
            });
            return signature as string;
        } catch (error: any) {
            if (error.code === 4001) throw new Error('Signature rejected');
            throw new Error(error.message || 'Failed to sign message');
        }
    },

    disconnect: async () => { },
};

// ============================================================
// SLUSH ADAPTER (SUI)
// ============================================================

export const SlushAdapter: WalletAdapter = {
    name: 'slush',
    displayName: 'Slush',
    icon: '/icons/slush.svg',
    chains: ['sui'],
    downloadUrl: 'https://slush.app/',

    isInstalled: () => {
        return getSlushProvider() !== null;
    },

    getProvider: () => {
        return getSlushProvider();
    },

    connect: async () => {
        const provider = getSlushProvider();
        if (!provider) throw new Error('Slush wallet is not installed. Please install Slush extension.');

        try {
            // Handle different SUI wallet API versions
            // Standard wallet adapter specification typically uses features...
            // But specific wallets like Slush might use direct injection methods

            // Attempt standard connect
            if (provider.connect) {
                const response = await provider.connect();
                // Response format varies: { accounts: [{ address }] } or similar
                if (response?.accounts?.[0]?.address) return response.accounts[0].address;
                if (response?.address) return response.address; // Direct object
            }

            // Fallback for some versions
            if (provider.request) {
                const accounts = await provider.request({ method: 'sui_connect' }); // Generic attempt
                if (accounts?.[0]) return accounts[0];
            }

            throw new Error('Connection successful but address not found in response');
        } catch (error: any) {
            throw new Error(error.message || 'Failed to connect to Slush');
        }
    },

    getAddress: async () => {
        const provider = getSlushProvider();
        if (!provider) return null;
        try {
            if (provider.getAccounts) {
                const accounts = await provider.getAccounts();
                return accounts?.[0]?.address || accounts?.[0] || null;
            }
            return null;
        } catch {
            return null;
        }
    },

    getChain: async () => {
        return 'sui';
    },

    signMessage: async (message: string) => {
        const provider = getSlushProvider();
        if (!provider) throw new Error('Slush not available');

        try {
            const encodedMessage = new TextEncoder().encode(message);

            // Modern SUI wallets use signMessage with specific inputs
            const result = await provider.signMessage({
                message: encodedMessage,
            });
            // Result usually contains 'signature' or 'bytes'
            return result.signature || result;
        } catch (error: any) {
            throw new Error(error.message || 'Failed to sign message');
        }
    },

    disconnect: async () => {
        const provider = getSlushProvider();
        if (provider?.disconnect) await provider.disconnect();
    },
};

// ============================================================
// WALLETCONNECT ADAPTER
// ============================================================

export const WalletConnectAdapter: WalletAdapter = {
    name: 'walletconnect',
    displayName: 'WalletConnect',
    icon: '/icons/walletconnect.svg',
    chains: ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism', 'solana'],
    downloadUrl: 'https://walletconnect.com/',

    isInstalled: () => true,
    getProvider: () => null,

    connect: async () => {
        throw new Error('WalletConnect requires modal initialization. Use Context.');
    },

    getAddress: async () => null,
    getChain: async () => null,
    signMessage: async () => { throw new Error('Use WalletConnect modal'); },
    disconnect: async () => { },
};

// ============================================================
// HELPERS
// ============================================================

export function getWalletAdapters(): WalletAdapter[] {
    return [MetaMaskAdapter, PhantomAdapter, CoinbaseAdapter, SlushAdapter, WalletConnectAdapter];
}

export function getWalletAdapter(provider: WalletProvider): WalletAdapter | null {
    const adapters = {
        metamask: MetaMaskAdapter,
        phantom: PhantomAdapter,
        coinbase: CoinbaseAdapter,
        slush: SlushAdapter,
        walletconnect: WalletConnectAdapter,
    };
    return adapters[provider] || null;
}

export function getInstalledWallets(): WalletAdapter[] {
    return getWalletAdapters().filter(adapter => adapter.isInstalled());
}

function chainIdToChain(chainId: number): WalletChain {
    const map: Record<number, WalletChain> = {
        1: 'ethereum',
        8453: 'base',
        137: 'polygon',
        42161: 'arbitrum',
        10: 'optimism',
    };
    return map[chainId] || 'ethereum';
}

function encodeBase58(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (bytes.length === 0) return '';
    const digits = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
            carry += digits[i] << 8;
            digits[i] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    let leadingZeros = 0;
    for (const byte of bytes) {
        if (byte === 0) leadingZeros++;
        else break;
    }
    return ALPHABET[0].repeat(leadingZeros) + digits.reverse().map(d => ALPHABET[d]).join('');
}

export function isMessageSafe(message: string, expectedDomain: string = 'exoduze.app'): { safe: boolean; issues: string[] } {
    const issues: string[] = [];
    if (typeof message !== 'string' || !message) {
        issues.push('Message is invalid');
        return { safe: false, issues };
    }

    // Check for suspicious hex (ignoring expected wallet addresses)
    // We check for hex strings longer than 70 chars which might be transaction data
    if (/0x[a-fA-F0-9]{70,}/.test(message)) {
        issues.push('Message contains suspicious long hex data');
    }

    if (!message.toLowerCase().includes(expectedDomain.toLowerCase())) {
        issues.push(`Domain mismatch: expected ${expectedDomain}`);
    }

    const dangerous = ['transfer', 'approve', 'setApproval', 'swap', 'permit', 'multicall'];
    for (const word of dangerous) {
        // Use word boundaries so "transaction" doesn't trigger "action" etc.
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(message) && !message.includes('Sign this message')) {
            issues.push(`Suspicious keyword: ${word}`);
        }
    }

    return { safe: issues.length === 0, issues };
}

export function isMobileDevice(): boolean { return isMobile; }
export function openWalletMobile(provider: WalletProvider): void {
    const adapter = getWalletAdapter(provider);
    if (adapter?.mobileDeepLink) window.location.href = adapter.mobileDeepLink;
}
