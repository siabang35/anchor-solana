import { apiRequest } from './api';

/**
 * Deposit chain types
 */
export type DepositChain = 'ethereum' | 'solana' | 'sui' | 'base';

/**
 * Deposit status types
 */
export type DepositStatus = 'pending' | 'confirmed' | 'failed' | 'expired';

/**
 * Balance response from API
 */
export interface BalanceResponse {
    balance: string;
    lockedBalance: string;
    availableBalance: string;
    currency: string;
    assets?: Array<{
        symbol: string;
        balance: string;
        chain: string;
        valueUsd?: string;
        address?: string;
    }>;
}

/**
 * Wallet response from API
 */
export interface WalletResponse {
    address: string;
    chain: string;
    walletType: string;
    createdAt: string;
}

/**
 * Initiate deposit response
 */
export interface InitiateDepositResponse {
    nonce: string;
    depositAddress: string;
    expiresInSeconds: number;
    amount: string;
    chain: string;
}

/**
 * Deposit transaction
 */
export interface DepositTransaction {
    id: string;
    amount: string;
    currency: string;
    chain: string;
    txHash: string | null;
    status: DepositStatus;
    createdAt: string;
    confirmedAt: string | null;
}

/**
 * Deposit history response
 */
export interface DepositHistoryResponse {
    data: DepositTransaction[];
    total: number;
}

/**
 * Helper to make authenticated requests
 */
// authFetch removed in favor of apiRequest

/**
 * Deposit API Service
 */
export const depositApi = {
    /**
     * Get user's current balance
     */
    async getBalance(): Promise<BalanceResponse> {
        return apiRequest<BalanceResponse>('/deposits/balance');
    },

    /**
     * Generate or get wallet address for a chain
     */
    async generateWallet(chain: DepositChain, privyUserId: string): Promise<WalletResponse> {
        return apiRequest<WalletResponse>('/deposits/wallet/generate', {
            method: 'POST',
            body: { chain, privyUserId },
        });
    },

    /**
     * Get wallet for a specific chain
     */
    async getWallet(chain: DepositChain): Promise<WalletResponse | null> {
        try {
            return await apiRequest<WalletResponse>(`/deposits/wallet/${chain}`);
        } catch {
            return null;
        }
    },

    /**
     * Initiate a new deposit
     */
    async initiateDeposit(amount: number, chain: DepositChain): Promise<InitiateDepositResponse> {
        return apiRequest<InitiateDepositResponse>('/deposits/initiate', {
            method: 'POST',
            body: { amount, chain },
        });
    },

    /**
     * Verify/confirm a deposit with transaction hash
     */
    async verifyDeposit(nonce: string, txHash: string, privyToken?: string): Promise<DepositTransaction> {
        return apiRequest<DepositTransaction>('/deposits/verify', {
            method: 'POST',
            body: { nonce, txHash, privyToken },
        });
    },

    /**
     * Get deposit history
     */
    /**
     * Get deposit history
     */
    async getHistory(params?: {
        page?: number;
        limit?: number;
        status?: DepositStatus;
        chain?: DepositChain;
    }): Promise<DepositHistoryResponse> {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.set('page', params.page.toString());
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.status) queryParams.set('status', params.status);
        if (params?.chain) queryParams.set('chain', params.chain);

        const query = queryParams.toString();
        return apiRequest<DepositHistoryResponse>(`/deposits/history${query ? `?${query}` : ''}`);
    },

    /**
     * Initiate withdrawal with optional Privy token for dual authentication
     */
    async initiateWithdrawal(amount: number, chain: string, toAddress: string, privyToken?: string): Promise<{ id: string }> {
        const headers: Record<string, string> = {};
        if (privyToken) {
            headers['x-privy-token'] = privyToken;
        }
        return apiRequest<{ id: string }>('/deposits/withdraw', {
            method: 'POST',
            body: { amount, chain, toAddress },
            headers,
        });
    },

    /**
     * Confirm withdrawal with optional Privy token for dual authentication
     */
    async confirmWithdrawal(withdrawalId: string, txHash: string, privyToken?: string): Promise<any> {
        const headers: Record<string, string> = {};
        if (privyToken) {
            headers['x-privy-token'] = privyToken;
        }
        return apiRequest('/deposits/withdraw/confirm', {
            method: 'POST',
            body: { withdrawalId, txHash },
            headers,
        });
    },
};

export default depositApi;

