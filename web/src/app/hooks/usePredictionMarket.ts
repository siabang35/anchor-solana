import { useCallback, useState } from 'react';
import { parseEther } from 'viem';
import { useWallet } from './useWallet';
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '../../contracts/predictionMarket.abi';

export function usePredictionMarket() {
    const { walletClient, address, isConnected, connect } = useWallet();
    const [isTransacting, setIsTransacting] = useState(false);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const buyShares = useCallback(async (
        marketId: number,
        outcomeId: number,
        shares: number,
        costEth: string
    ) => {
        setIsTransacting(true);
        setError(null);
        setLastTxHash(null);

        try {
            if (!isConnected || !walletClient || !address) {
                await connect();
                // Check again after connect attempt
                if (!walletClient) throw new Error("Wallet not connected");
            }

            // In a real app, 'address' is definitely set here if walletClient is
            const account = address!;

            const hash = await walletClient!.writeContract({
                address: PREDICTION_MARKET_ADDRESS,
                abi: PREDICTION_MARKET_ABI,
                functionName: 'buyShares',
                args: [BigInt(marketId), BigInt(outcomeId), BigInt(shares)],
                value: parseEther(costEth),
                account,
                chain: undefined
            });

            console.log('Transaction sent:', hash);
            setLastTxHash(hash);
            return hash;

        } catch (err) {
            console.error('Buy shares failed:', err);
            setError(err instanceof Error ? err.message : 'Transaction failed');
            throw err;
        } finally {
            setIsTransacting(false);
        }
    }, [walletClient, address, isConnected, connect]);

    return {
        buyShares,
        isTransacting,
        lastTxHash,
        error
    };
}
