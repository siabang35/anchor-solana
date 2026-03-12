import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { mainnet, base } from 'viem/chains';
import { TOKENS } from '../constants/tokens';

// Initialize publicly available RPC endpoints
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SUI_RPC = 'https://fullnode.mainnet.sui.io:443';

// Initialize public clients outside to avoid recreation
const publicClients: Record<number, any> = {
    1: createPublicClient({ chain: mainnet, transport: http() }),
    8453: createPublicClient({ chain: base, transport: http() }),
};

interface UseTokenBalancesParams {
    evmAddress?: string;
    solanaAddress?: string;
    suiAddress?: string;
}

export const useTokenBalances = ({ evmAddress, solanaAddress, suiAddress }: UseTokenBalancesParams) => {
    const [balances, setBalances] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!evmAddress && !solanaAddress && !suiAddress) {
            setBalances({});
            return;
        }

        const fetchBalances = async () => {
            setIsLoading(true);
            const newBalances: Record<string, number> = {};

            // Helper for EVM
            const getEvmBalance = async (token: typeof TOKENS[0], chainIdStr: string) => {
                if (!evmAddress) return;
                const chainId = chainIdStr === 'ethereum' ? 1 : chainIdStr === 'base' ? 8453 : null;
                if (!chainId || !publicClients[chainId]) return;

                const client = publicClients[chainId];
                const key = `${token.symbol}-${chainIdStr}`;

                try {
                    let rawBalance = 0n;
                    if (token.isNative) {
                        if (['ethereum', 'base'].includes(chainIdStr)) {
                            rawBalance = await client.getBalance({ address: evmAddress as `0x${string}` });
                        }
                    } else if (token.addresses && token.addresses[chainId]) {
                        rawBalance = await client.readContract({
                            address: token.addresses[chainId] as `0x${string}`,
                            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
                            functionName: 'balanceOf',
                            args: [evmAddress as `0x${string}`],
                        }) as bigint;
                    }
                    newBalances[key] = parseFloat(formatUnits(rawBalance, token.decimals));
                } catch (e) {
                    // console.warn(`Failed to fetch ${token.symbol} on ${chainIdStr}`, e);
                }
            };

            // Helper for Solana (Native ONLY for now)
            const getSolanaBalance = async (token: typeof TOKENS[0]) => {
                if (!solanaAddress) return;
                const key = `${token.symbol}-solana`;

                try {
                    if (token.isNative) {
                        const response = await fetch(SOLANA_RPC, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'getBalance',
                                params: [solanaAddress]
                            })
                        });
                        const data = await response.json();
                        if (data.result?.value !== undefined) {
                            newBalances[key] = data.result.value / 1000000000; // Lamports to SOL/USDC (decimals vary, but SOL is 9)
                        }
                    }
                } catch (e) {
                    console.warn('Solana fetch failed', e);
                }
            };

            // Helper for Sui (Native ONLY for now)
            const getSuiBalance = async (token: typeof TOKENS[0]) => {
                if (!suiAddress) return;
                const key = `${token.symbol}-sui`;

                try {
                    if (token.isNative) { // SUI Coin
                        const response = await fetch(SUI_RPC, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'suix_getBalance',
                                params: [suiAddress, '0x2::sui::SUI']
                            })
                        });
                        const data = await response.json();
                        if (data.result) {
                            // totalBalance is string MIST
                            newBalances[key] = parseFloat(data.result.totalBalance) / 1000000000; // MIST to SUI (9 decimals)
                        }
                    }
                } catch (e) {
                    console.warn('Sui fetch failed', e);
                }
            };

            const promises: Promise<void>[] = [];

            // EVM Promises
            promises.push(...TOKENS.flatMap(token =>
                token.chains
                    .filter(c => ['ethereum', 'base'].includes(c))
                    .map(chain => getEvmBalance(token, chain))
            ));

            // Solana Promises
            const solToken = TOKENS.find(t => t.symbol === 'SOL');
            if (solToken && solToken.chains.includes('solana')) {
                promises.push(getSolanaBalance(solToken));
            }

            // Sui Promises
            const suiToken = TOKENS.find(t => t.symbol === 'SUI');
            if (suiToken && suiToken.chains.includes('sui')) {
                promises.push(getSuiBalance(suiToken));
            }

            await Promise.allSettled(promises);

            setBalances(newBalances);
            setIsLoading(false);
        };

        fetchBalances();

        const interval = setInterval(fetchBalances, 15000);
        return () => clearInterval(interval);
    }, [evmAddress, solanaAddress, suiAddress]);

    return { balances, isLoading };
};
