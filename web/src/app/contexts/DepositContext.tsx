import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { depositApi, BalanceResponse, DepositTransaction, DepositChain } from '../../services/deposit';
import { useAuth } from '../components/auth/AuthContext';

/**
 * Deposit context state
 */
interface DepositContextType {
    /** Current user balance */
    balance: BalanceResponse | null;
    /** Balance loading state */
    isLoadingBalance: boolean;
    /** Recent deposit transactions */
    recentTransactions: DepositTransaction[];
    /** Deposit modal open state */
    isDepositModalOpen: boolean;
    /** Open deposit modal with optional chain pre-selection */
    openDepositModal: (chain?: DepositChain) => void;
    /** Currently selected chain for deposit */
    selectedChain?: DepositChain;
    /** Close deposit modal */
    closeDepositModal: () => void;
    /** Refresh balance */
    refreshBalance: () => Promise<void>;
    /** Initiate a deposit */
    initiateDeposit: (amount: number, chain: DepositChain) => Promise<{
        nonce: string;
        depositAddress: string;
        expiresInSeconds: number;
    }>;
    /** Verify a deposit */
    verifyDeposit: (nonce: string, txHash: string) => Promise<DepositTransaction>;
    /** Error message */
    error: string | null;
    /** Clear error */
    clearError: () => void;
}

const DepositContext = createContext<DepositContextType | undefined>(undefined);

interface DepositProviderProps {
    children: ReactNode;
}

/**
 * DepositProvider - Manages deposit state globally
 */
export function DepositProvider({ children }: DepositProviderProps) {
    const { isAuthenticated } = useAuth();
    const [balance, setBalance] = useState<BalanceResponse | null>(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<DepositTransaction[]>([]);
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const [selectedChain, setSelectedChain] = useState<DepositChain | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    /**
     * Refresh user balance
     */
    const refreshBalance = useCallback(async () => {
        if (!isAuthenticated) {
            setBalance(null);
            return;
        }

        setIsLoadingBalance(true);
        try {
            const balanceData = await depositApi.getBalance();
            setBalance(balanceData);
        } catch (err) {
            console.error('Failed to fetch balance:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch balance');
        } finally {
            setIsLoadingBalance(false);
        }
    }, [isAuthenticated]);

    /**
     * Fetch balance on auth change
     */
    useEffect(() => {
        if (isAuthenticated) {
            refreshBalance();
        } else {
            setBalance(null);
            setRecentTransactions([]);
        }
    }, [isAuthenticated, refreshBalance]);

    /**
     * Open deposit modal
     */
    const openDepositModal = useCallback((chain?: DepositChain) => {
        if (chain) setSelectedChain(chain);
        setIsDepositModalOpen(true);
        setError(null);
    }, []);

    /**
     * Close deposit modal
     */
    const closeDepositModal = useCallback(() => {
        setIsDepositModalOpen(false);
        setError(null);
    }, []);

    /**
     * Initiate a deposit
     */
    const initiateDeposit = useCallback(async (amount: number, chain: DepositChain) => {
        setError(null);
        try {
            const result = await depositApi.initiateDeposit(amount, chain);
            return {
                nonce: result.nonce,
                depositAddress: result.depositAddress,
                expiresInSeconds: result.expiresInSeconds,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initiate deposit';
            setError(message);
            throw err;
        }
    }, []);

    /**
     * Verify a deposit
     */
    const verifyDeposit = useCallback(async (nonce: string, txHash: string) => {
        setError(null);
        try {
            const transaction = await depositApi.verifyDeposit(nonce, txHash);
            // Refresh balance after successful deposit
            await refreshBalance();
            // Add to recent transactions
            setRecentTransactions(prev => [transaction, ...prev.slice(0, 4)]);
            return transaction;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to verify deposit';
            setError(message);
            throw err;
        }
    }, [refreshBalance]);

    /**
     * Clear error
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const value: DepositContextType = {
        balance,
        isLoadingBalance,
        recentTransactions,
        isDepositModalOpen,
        openDepositModal,
        selectedChain,
        closeDepositModal,
        refreshBalance,
        initiateDeposit,
        verifyDeposit,
        error,
        clearError,
    };

    return (
        <DepositContext.Provider value={value}>
            {children}
        </DepositContext.Provider>
    );
}

/**
 * Hook to access deposit context
 */
export function useDeposit(): DepositContextType {
    const context = useContext(DepositContext);
    if (context === undefined) {
        throw new Error('useDeposit must be used within a DepositProvider');
    }
    return context;
}

