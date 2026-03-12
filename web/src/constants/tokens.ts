import { DepositChain } from '../services/deposit';

export interface Chain {
    id: DepositChain;
    name: string;
    icon: string;
    color: string;
    chainId?: number; // EVM Chain ID
}

export const CHAINS: Chain[] = [
    { id: 'ethereum', name: 'Ethereum', icon: '/images/coin/ethereum.png', color: '#627EEA', chainId: 1 },
    { id: 'base', name: 'Base', icon: '/images/coin/base.jpeg', color: '#0052FF', chainId: 8453 },
    { id: 'solana', name: 'Solana', icon: '/images/coin/solana.png', color: '#14F195', chainId: 900 },
    { id: 'sui', name: 'Sui', icon: '/images/coin/sui.png', color: '#6FBCF0', chainId: 901 },
];

export interface Token {
    symbol: string;
    name: string;
    icon: string;
    chains: DepositChain[];
    minDeposit: number;
    decimals: number;
    isNative?: boolean;
    addresses?: Record<number, string>; // Map of chainId to token address
}

export const TOKENS: Token[] = [
    {
        symbol: 'USDC',
        name: 'USD Coin',
        icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        chains: ['ethereum', 'base', 'solana', 'sui'],
        minDeposit: 10,
        decimals: 6,
        addresses: {
            8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
            1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',    // Ethereum
        }
    },
    {
        symbol: 'USDT',
        name: 'Tether',
        icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
        chains: ['ethereum', 'base', 'solana'],
        minDeposit: 10,
        decimals: 6,
        addresses: {
            8453: '0x2d1aDB45Bb1d7D2556c6558aDb76CFD4F9F4ed16', // Base
            1: '0xdac17f958d2ee523a2206206994597c13d831ec7',    // Ethereum
        }
    },
    {
        symbol: 'ETH',
        name: 'Ethereum',
        icon: '/images/coin/ethereum.png',
        chains: ['ethereum', 'base'],
        minDeposit: 0.001,
        decimals: 18,
        isNative: true
    },
    {
        symbol: 'SOL',
        name: 'Solana',
        icon: '/images/coin/solana.png',
        chains: ['solana'],
        minDeposit: 0.01,
        decimals: 9,
        isNative: true
    },
    {
        symbol: 'SUI',
        name: 'Sui',
        icon: '/images/coin/sui.png',
        chains: ['sui'],
        minDeposit: 0.1,
        decimals: 9,
        isNative: true
    },
    {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        icon: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png',
        chains: ['ethereum', 'base'],
        minDeposit: 0.0001,
        decimals: 8,
        addresses: {
            8453: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // Base
            1: '0x2260fac5994a539433d34d2b27d3b51f08c69d4c',    // Ethereum
        }
    },
    {
        symbol: 'DAI',
        name: 'Dai',
        icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png',
        chains: ['ethereum', 'base'],
        minDeposit: 10,
        decimals: 18,
        addresses: {
            8453: '0x50c57259f9CC1Ac6ad4868910bF6c95B0A917DB0Cb', // Base
            1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',    // Ethereum
        }
    },
];
