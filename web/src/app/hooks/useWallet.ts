import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, custom, WalletClient, Address } from 'viem';
import { sepolia } from 'viem/chains';

export interface UseWalletReturn {
    address: Address | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    walletClient: WalletClient | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    chainId: number | null;
}

export function useWallet(): UseWalletReturn {
    const [address, setAddress] = useState<Address | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);

    // Initialize checking for existing connection
    useEffect(() => {
        const checkConnection = async () => {
            if (typeof window !== 'undefined' && window.ethereum) {
                try {
                    const client = createWalletClient({
                        chain: sepolia, // Defaulting to Sepolia for dev
                        transport: custom(window.ethereum)
                    });

                    const [connectedAddress] = await client.requestAddresses();
                    if (connectedAddress) {
                        setAddress(connectedAddress);
                        setWalletClient(client);
                        const id = await client.getChainId();
                        setChainId(id);
                    }
                } catch (err) {
                    // Start fresh if no permission
                    console.debug('No existing wallet permission');
                }
            }
        };

        checkConnection();
    }, []);

    // Listen for account changes
    useEffect(() => {
        if (typeof window !== 'undefined' && window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAddress(accounts[0] as Address);
                } else {
                    setAddress(null);
                    setWalletClient(null);
                }
            });

            window.ethereum.on('chainChanged', (id: string) => {
                setChainId(parseInt(id, 16));
            });
        }
    }, []);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);
        try {
            if (typeof window === 'undefined' || !window.ethereum) {
                throw new Error('No crypto wallet found. Please install MetaMask.');
            }

            const client = createWalletClient({
                chain: sepolia,
                transport: custom(window.ethereum)
            });

            const [connectedAddress] = await client.requestAddresses();

            setAddress(connectedAddress);
            setWalletClient(client);
            const id = await client.getChainId();
            setChainId(id);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to connect wallet';
            setError(message);
            console.error(err);
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        setAddress(null);
        setWalletClient(null);
        // Note: You can't programmatically disconnect from MetaMask, but we clear local state
    }, []);

    return {
        address,
        isConnected: !!address,
        isConnecting,
        error,
        walletClient,
        connect,
        disconnect,
        chainId
    };
}

// Add global type for window.ethereum
declare global {
    interface Window {
        ethereum?: any;
    }
}
