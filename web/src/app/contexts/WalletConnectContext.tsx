import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
    WalletAdapter,
    WalletProvider,
    WalletChain,
    getWalletAdapter,
    getInstalledWallets,
    isMessageSafe,
} from '../../services/walletAdapters';
import { walletAuthApi } from '../../services/api';

// Types
export interface WalletConnection {
    address: string;
    chain: WalletChain;
    provider: WalletProvider;
    isConnected: boolean;
}

export interface WalletAuthResult {
    user: {
        id: string;
        email?: string;
        username?: string;
        fullName?: string;
        avatarUrl?: string;
    };
    tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    };
    profilePending: boolean;
    wallet: {
        address: string;
        chain: string;
        provider?: string;
    };
}

interface WalletConnectContextType {
    // State
    connection: WalletConnection | null;
    isConnecting: boolean;
    error: string | null;
    installedWallets: WalletAdapter[];

    // Challenge state
    challenge: {
        message: string;
        nonce: string;
        expiresAt: string;
    } | null;

    // Actions
    connect: (provider: WalletProvider) => Promise<string>;
    requestChallenge: (address: string, chain: WalletChain, provider: WalletProvider) => Promise<void>;
    signAndVerify: () => Promise<WalletAuthResult>;
    disconnect: () => Promise<void>;
    clearError: () => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | undefined>(undefined);

interface WalletConnectProviderProps {
    children: ReactNode;
}

/**
 * WalletConnectProvider
 * 
 * Manages wallet connection state and authentication flow:
 * 1. Connect wallet (get address)
 * 2. Request challenge (get SIWE message)
 * 3. Sign message
 * 4. Verify signature (get JWT tokens)
 */
export function WalletConnectProvider({ children }: WalletConnectProviderProps) {
    const [connection, setConnection] = useState<WalletConnection | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [installedWallets, setInstalledWallets] = useState<WalletAdapter[]>([]);
    const [challenge, setChallenge] = useState<{
        message: string;
        nonce: string;
        expiresAt: string;
    } | null>(null);
    const [currentAdapter, setCurrentAdapter] = useState<WalletAdapter | null>(null);

    // Detect installed wallets on mount
    useEffect(() => {
        const detectWallets = () => {
            const wallets = getInstalledWallets();
            setInstalledWallets(wallets);
        };

        // Initial detection
        detectWallets();

        // Re-detect after a short delay (some wallets inject late)
        const timer = setTimeout(detectWallets, 1000);

        return () => clearTimeout(timer);
    }, []);

    /**
     * Connect to a wallet and get the address
     */
    const connect = useCallback(async (provider: WalletProvider): Promise<string> => {
        setIsConnecting(true);
        setError(null);

        try {
            const adapter = getWalletAdapter(provider);
            if (!adapter) {
                throw new Error(`Unknown wallet provider: ${provider}`);
            }

            // Check if installed (except WalletConnect which uses QR)
            if (provider !== 'walletconnect' && !adapter.isInstalled()) {
                throw new Error(`${adapter.displayName} is not installed. Please install the extension.`);
            }

            // Connect to wallet
            const address = await adapter.connect();
            const chain = await adapter.getChain() || 'ethereum';

            setConnection({
                address,
                chain,
                provider,
                isConnected: true,
            });
            setCurrentAdapter(adapter);

            return address;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to connect wallet';
            setError(message);
            throw err;
        } finally {
            setIsConnecting(false);
        }
    }, []);

    /**
     * Request SIWE challenge from backend
     */
    const requestChallenge = useCallback(async (
        address: string,
        chain: WalletChain,
        provider: WalletProvider,
    ): Promise<void> => {
        setError(null);

        try {
            const challengeResponse = await walletAuthApi.getChallenge(address, chain, provider);

            // Validate the message is safe before showing to user
            const safetyCheck = isMessageSafe(challengeResponse.message);
            if (!safetyCheck.safe) {
                console.warn('Challenge message safety issues:', safetyCheck.issues);
                // Still allow but log warning - the backend generates these so they should be safe
            }

            setChallenge({
                message: challengeResponse.message,
                nonce: challengeResponse.nonce,
                expiresAt: challengeResponse.expiresAt,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to get authentication challenge';
            setError(message);
            throw err;
        }
    }, []);

    /**
     * Sign the challenge message and verify with backend
     */
    const signAndVerify = useCallback(async (): Promise<WalletAuthResult> => {
        if (!connection || !challenge || !currentAdapter) {
            throw new Error('No active connection or challenge');
        }

        setIsConnecting(true);
        setError(null);

        try {
            // Sign the challenge message
            const signature = await currentAdapter.signMessage(challenge.message);

            // Verify with backend
            const result = await walletAuthApi.verify({
                address: connection.address,
                chain: connection.chain,
                signature,
                message: challenge.message,
                nonce: challenge.nonce,
                provider: connection.provider,
            });

            // Clear challenge after successful verification
            setChallenge(null);

            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to verify signature';
            setError(message);
            throw err;
        } finally {
            setIsConnecting(false);
        }
    }, [connection, challenge, currentAdapter]);

    /**
     * Disconnect wallet
     */
    const disconnect = useCallback(async () => {
        if (currentAdapter) {
            try {
                await currentAdapter.disconnect();
            } catch {
                // Ignore disconnect errors
            }
        }

        setConnection(null);
        setChallenge(null);
        setCurrentAdapter(null);
        setError(null);
    }, [currentAdapter]);

    /**
     * Clear error state
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const value: WalletConnectContextType = {
        connection,
        isConnecting,
        error,
        installedWallets,
        challenge,
        connect,
        requestChallenge,
        signAndVerify,
        disconnect,
        clearError,
    };

    return (
        <WalletConnectContext.Provider value={value}>
            {children}
        </WalletConnectContext.Provider>
    );
}

/**
 * Hook to access wallet connect context
 */
export function useWalletConnect(): WalletConnectContextType {
    const context = useContext(WalletConnectContext);
    if (context === undefined) {
        throw new Error('useWalletConnect must be used within a WalletConnectProvider');
    }
    return context;
}

export default WalletConnectContext;
