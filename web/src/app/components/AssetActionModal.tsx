import { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, ArrowRight, Upload, Download, AlertCircle, Loader2, ShieldCheck, Wallet, Scan } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from './auth/AuthContext';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { parseUnits, encodeFunctionData, createWalletClient, custom, isAddress } from 'viem';
import { Html5Qrcode } from 'html5-qrcode';
import { base, mainnet } from 'viem/chains';
import { depositApi } from '../../services/deposit';

// --- Types ---
interface Asset {
    symbol: string;
    chain: string;
    balance: string;
    valueUsd: string;
    address?: string;
}

interface AssetActionModalProps {
    asset: Asset | null;
    onClose: () => void;
    onSuccess?: () => void;
}

// --- Constants ---
const MIN_WITHDRAWAL_AMOUNT = 1;
const RATE_LIMIT_MS = 2000; // 2 seconds between clicks
const WITHDRAW_COOLDOWN_MS = 30000; // 30 seconds successful withdrawal cooldown

// Minimal ERC20 ABI
const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

// USDC Contracts
const USDC_ADDRESS_MAP: Record<number, string> = {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',    // Ethereum Mainnet
};

// Helper function to validate Solana address (base58)
const isValidSolanaAddress = (addr: string): boolean => {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(addr);
};

// Helper function to validate Sui address
const isValidSuiAddress = (addr: string): boolean => {
    const suiRegex = /^0x[a-fA-F0-9]{64}$/;
    return suiRegex.test(addr);
};

// Validate address based on selected chain
const isValidAddress = (addr: string, chainId: string): boolean => {
    if (!addr) return false;
    const chainLower = chainId.toLowerCase();

    if (chainLower === 'solana') return isValidSolanaAddress(addr);
    if (chainLower === 'sui') return isValidSuiAddress(addr);

    return isAddress(addr); // Ethereum validation
};

export function AssetActionModal({ asset, onClose, onSuccess }: AssetActionModalProps) {
    const { isAuthenticated } = useAuth();
    const { wallets } = useWallets();
    const { getAccessToken } = usePrivy();

    // State
    const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawAddress, setWithdrawAddress] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scannerError, setScannerError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [lastWithdrawTime, setLastWithdrawTime] = useState(0);
    const [canRetryScanner, setCanRetryScanner] = useState(false);

    // Refs for anti-throttling
    const lastClickTimeRef = useRef(0);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    // Helper function to request camera permission explicitly
    const requestCameraPermission = async (): Promise<boolean> => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('getUserMedia not available');
                return true;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (err: any) {
            console.error('Camera permission error:', err);
            if (err.name === 'NotAllowedError') {
                setScannerError('Camera permission denied. Please allow camera access in your browser settings.');
            } else if (err.name === 'NotFoundError') {
                setScannerError('No camera found. Please ensure your device has a camera.');
            } else if (err.name === 'NotReadableError') {
                setScannerError('Camera is in use by another application.');
            } else if (err.name === 'OverconstrainedError') {
                try {
                    const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    fallbackStream.getTracks().forEach(track => track.stop());
                    return true;
                } catch {
                    setScannerError('Camera access failed. Please try again.');
                    return false;
                }
            } else {
                setScannerError('Camera access failed. Please check permissions.');
            }
            return false;
        }
    };

    // Start scanner function (can be retried)
    const startScanner = async () => {
        if (!asset) return;

        setScannerError(null);
        setCanRetryScanner(false);

        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
            setCanRetryScanner(true);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 150));

        const readerElement = document.getElementById('reader-asset');
        if (!readerElement) {
            setScannerError('Scanner initialization failed. Please try again.');
            setCanRetryScanner(true);
            return;
        }

        try {
            const scanner = new Html5Qrcode('reader-asset');
            scannerRef.current = scanner;

            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
            };

            await scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    const cleanText = decodedText.trim();
                    const cleanAddress = cleanText.split(':').pop() || cleanText;

                    if (isValidAddress(cleanAddress, asset.chain)) {
                        setWithdrawAddress(cleanAddress);
                        setShowScanner(false);
                    }
                },
                () => { /* ignore frame errors */ }
            );
        } catch (err: any) {
            console.error('Scanner start failed:', err);

            if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
                setScannerError('Camera permission denied. Please allow camera access and try again.');
            } else if (err.toString().includes('NotFoundError') || err.toString().includes('not found')) {
                setScannerError('No camera found on this device.');
            } else if (err.toString().includes('NotReadableError') || err.toString().includes('in use')) {
                setScannerError('Camera is busy. Close other apps using the camera and try again.');
            } else {
                setScannerError('Could not start camera. Please check permissions.');
            }
            setCanRetryScanner(true);
        }
    };

    // Scanner Effect
    useEffect(() => {
        if (showScanner && asset) {
            startScanner();
        }

        return () => {
            if (scannerRef.current) {
                if (scannerRef.current.isScanning) {
                    scannerRef.current.stop()
                        .then(() => scannerRef.current?.clear())
                        .catch(err => console.warn('Scanner cleanup error:', err));
                } else {
                    try {
                        scannerRef.current.clear();
                    } catch (e) {
                        // Ignore clear errors
                    }
                }
                scannerRef.current = null;
            }
        };
    }, [showScanner, asset?.chain]);

    // Reset state when asset changes
    useEffect(() => {
        if (asset) {
            setWithdrawAmount('');
            setWithdrawAddress('');
            setError(null);
            setSuccessMsg(null);
            setIsLoading(false);
            setActiveTab('deposit'); // Default to deposit
            setShowScanner(false);
        }
    }, [asset?.symbol, asset?.chain]);

    // Anti-Throttling Check
    const isThrottled = () => {
        const now = Date.now();
        if (now - lastClickTimeRef.current < RATE_LIMIT_MS) {
            return true;
        }
        lastClickTimeRef.current = now;
        return false;
    };

    // Quick Amount Selectors
    const setPercentageAmount = (percent: number) => {
        if (!asset) return;
        const balance = parseFloat(asset.balance);
        if (isNaN(balance)) return;

        const amount = (balance * percent).toFixed(6); // 6 decimals safe for most
        setWithdrawAmount(amount);
    };

    const handleWithdraw = async () => {
        if (!asset) return;

        // Anti-Throttle & Cooldown
        if (isThrottled()) return;
        if (Date.now() - lastWithdrawTime < WITHDRAW_COOLDOWN_MS) {
            setError(`Please wait ${Math.ceil((WITHDRAW_COOLDOWN_MS - (Date.now() - lastWithdrawTime)) / 1000)}s before next withdrawal.`);
            return;
        }

        setError(null);
        if (!isAuthenticated) { setError('Please login to withdraw.'); return; }

        // Validation
        const amountVal = parseFloat(withdrawAmount);
        const maxVal = parseFloat(asset.balance);

        if (isNaN(amountVal) || amountVal <= 0) { setError('Please enter a valid amount'); return; }
        if (amountVal < MIN_WITHDRAWAL_AMOUNT) { setError(`Minimum withdrawal is $${MIN_WITHDRAWAL_AMOUNT}`); return; }
        if (amountVal > maxVal) { setError('Insufficient balance'); return; }
        if (!withdrawAddress || withdrawAddress.length < 10) { setError('Invalid recipient address'); return; }

        setIsLoading(true);

        try {
            const token = await getAccessToken();
            if (!token) throw new Error('Authentication failed. Please refresh.');

            // 1. Initiate Backend Withdrawal
            const initRes = await depositApi.initiateWithdrawal(
                amountVal,
                asset.chain.toLowerCase(),
                withdrawAddress,
                token
            );

            // 2. Handle On-Chain Transaction (if needed/supported by wallet)
            const isUsdc = asset.symbol === 'USDC';
            const chainId = asset.chain.toLowerCase() === 'base' ? 8453 : 1;

            if (isUsdc && (asset.chain.toLowerCase() === 'base' || asset.chain.toLowerCase() === 'ethereum')) {
                const wallet = wallets.find((w) => w.walletClientType === 'privy');
                if (!wallet) throw new Error('No connected wallet found for signing.');

                if (wallet.chainId !== `caip154:${chainId}`) {
                    await wallet.switchChain(chainId);
                }

                const provider = await wallet.getEthereumProvider();
                const chainObj = asset.chain.toLowerCase() === 'base' ? base : mainnet;
                const walletClient = createWalletClient({
                    account: wallet.address as `0x${string}`,
                    chain: chainObj,
                    transport: custom(provider)
                });

                const amountWei = parseUnits(withdrawAmount, 6); // USDC 6 decimals
                const data = encodeFunctionData({
                    abi: ERC20_ABI,
                    functionName: 'transfer',
                    args: [withdrawAddress as `0x${string}`, amountWei]
                });

                const txHash = await walletClient.sendTransaction({
                    to: USDC_ADDRESS_MAP[chainId] as `0x${string}`,
                    data: data,
                    chain: chainObj
                });

                await depositApi.confirmWithdrawal(initRes.id, txHash, token);
            } else {
                // For other assets, we simulate or handle differently
                await new Promise(r => setTimeout(r, 1500));
            }

            setSuccessMsg('Withdrawal Submitted!');
            setLastWithdrawTime(Date.now());

            setTimeout(() => {
                if (onSuccess) onSuccess();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Withdrawal failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Helpers ---
    const getNetworkColor = (chain: string) => {
        switch (chain.toLowerCase()) {
            case 'ethereum': return 'text-[#627EEA] bg-[#627EEA]/10 border-[#627EEA]/20';
            case 'base': return 'text-[#0052FF] bg-[#0052FF]/10 border-[#0052FF]/20';
            case 'solana': return 'text-[#14F195] bg-[#14F195]/10 border-[#14F195]/20';
            default: return 'text-primary bg-primary/10 border-primary/20';
        }
    };

    const getAssetConfig = (symbol: string) => {
        const s = symbol.toUpperCase();
        if (s === 'ETH' || s === 'ETHEREUM') return { icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=035', color: 'bg-[#627EEA]/10 text-[#627EEA]' };
        if (s === 'SOL' || s === 'SOLANA') return { icon: 'https://cryptologos.cc/logos/solana-sol-logo.png?v=035', color: 'bg-[#14F195]/10 text-[#14F195]' };
        if (s === 'SUI') return { icon: 'https://cryptologos.cc/logos/sui-sui-logo.png?v=035', color: 'bg-[#6FBCF0]/10 text-[#6FBCF0]' };
        if (s === 'BASE') return { icon: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4', color: 'bg-[#0052FF]/10 text-[#0052FF]' };
        if (s === 'USDC') return { icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=035', color: 'bg-[#2775CA]/10 text-[#2775CA]' };
        if (s === 'USDT') return { icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png?v=035', color: 'bg-[#50AF95]/10 text-[#50AF95]' };
        if (s === 'WBTC') return { icon: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png?v=035', color: 'bg-[#F7931A]/10 text-[#F7931A]' };
        if (s === 'DAI') return { icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png?v=035', color: 'bg-[#F5AC37]/10 text-[#F5AC37]' };
        return { icon: null, color: 'bg-primary/10 text-primary' };
    };

    if (!asset) return null;

    const assetConfig = getAssetConfig(asset.symbol);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
            {/* Modal Card */}
            <div className="w-full max-w-md bg-card sm:rounded-3xl rounded-t-3xl border border-border shadow-2xl flex flex-col overflow-hidden h-[85vh] sm:h-auto max-h-[90vh] animate-in slide-in-from-bottom-10 duration-300">

                {/* Header Section */}
                <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-card/5 to-transparent shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border p-2 ${getNetworkColor(asset.chain)}`}>
                            {assetConfig.icon ? (
                                <img src={assetConfig.icon} alt={asset.symbol} className="w-full h-full object-contain" />
                            ) : (
                                <span className="text-2xl font-bold">{asset.symbol[0]}</span>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                                {asset.symbol}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${getNetworkColor(asset.chain)}`}>
                                    {asset.chain}
                                </span>
                            </h2>
                            <div className="text-muted-foreground text-sm font-medium mt-0.5">
                                Balance: <span className="text-foreground tabular-nums">{asset.balance}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Switcher - Simple & Professional */}
                <div className="px-6 pb-2">
                    <div className="flex p-1 bg-secondary/50 rounded-xl border border-border">
                        <button
                            onClick={() => setActiveTab('deposit')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-lg transition-all ${activeTab === 'deposit' ? 'bg-card text-foreground shadow-lg ring-1 ring-border' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            <Download className="w-4 h-4" /> Deposit
                        </button>
                        <button
                            onClick={() => setActiveTab('withdraw')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-lg transition-all ${activeTab === 'withdraw' ? 'bg-card text-foreground shadow-lg ring-1 ring-border' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            <Upload className="w-4 h-4" /> Withdraw
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="p-6 overflow-y-auto flex-1 h-full min-h-[300px] pb-24">
                    {activeTab === 'deposit' && (
                        <div className="flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-white p-3 rounded-2xl mb-6 shadow-xl ring-4 ring-white/10">
                                {asset.address ? (
                                    <QRCodeSVG value={asset.address} size={180} />
                                ) : (
                                    <div className="w-[180px] h-[180px] bg-gray-100 animate-pulse rounded-lg" />
                                )}
                            </div>

                            <div className="w-full space-y-4">
                                <div
                                    onClick={() => {
                                        if (asset.address) navigator.clipboard.writeText(asset.address);
                                    }}
                                    className="flex items-center justify-between bg-secondary/50 border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 hover:bg-accent transition-all group active:scale-[0.99]"
                                >
                                    <div className="flex flex-col overflow-hidden mr-4">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Deposit Address</label>
                                        <div className="font-mono text-sm text-foreground truncate w-full select-all">
                                            {asset.address || 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-2 bg-background rounded-lg group-hover:bg-primary/20 group-hover:text-primary transition-colors text-muted-foreground">
                                        <Copy className="w-4 h-4" />
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex gap-3 items-start">
                                    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                        Send only <strong className="text-foreground">{asset.symbol}</strong> ({asset.chain} Network) to this address. Using the wrong network will result in lost funds.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'withdraw' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
                            {successMsg ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 ring-4 ring-emerald-500/10">
                                        <ArrowRight className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Withdrawal Sent!</h3>
                                    <p className="text-muted-foreground">Your funds are on the way.</p>
                                </div>
                            ) : (
                                <>
                                    {error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-500 flex items-center gap-2 animate-in slide-in-from-top-2">
                                            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                                        </div>
                                    )}

                                    {/* Amount Input */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Amount to Withdraw</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={withdrawAmount}
                                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full bg-secondary/50 border border-border rounded-xl py-4 pl-4 pr-32 text-xl font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                                <button onClick={() => setPercentageAmount(0.25)} className="px-2 py-1.5 text-[10px] font-bold bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md transition-colors">25%</button>
                                                <button onClick={() => setPercentageAmount(0.5)} className="px-2 py-1.5 text-[10px] font-bold bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md transition-colors">50%</button>
                                                <button onClick={() => setPercentageAmount(1)} className="px-2 py-1.5 text-[10px] font-bold bg-background/50 hover:bg-accent text-primary rounded-md transition-colors">MAX</button>
                                            </div>
                                        </div>
                                        <div className="text-right text-[10px] text-muted-foreground">
                                            Available: {asset.balance} {asset.symbol}
                                        </div>
                                    </div>

                                    {/* Address Input */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Destination Address</label>
                                        <div className="relative">
                                            <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <input
                                                type="text"
                                                value={withdrawAddress}
                                                onChange={(e) => setWithdrawAddress(e.target.value)}
                                                placeholder={`Paste ${asset.chain} address`}
                                                className="w-full bg-secondary/50 border border-border rounded-xl py-4 pl-10 pr-12 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                            />
                                            <button
                                                onClick={() => setShowScanner(true)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                                title="Scan QR Code"
                                            >
                                                <Scan className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Warnings */}
                                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                        <div className="flex gap-2 items-start">
                                            <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                            <div className="text-[10px] text-blue-200/70 leading-relaxed font-medium">
                                                Ensure the receiving wallet is on the <span className="text-blue-300 font-bold uppercase">{asset.chain}</span> network.
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <Button
                                        onClick={handleWithdraw}
                                        disabled={isLoading || !withdrawAmount || !withdrawAddress}
                                        className="w-full h-14 text-base font-bold bg-foreground text-background hover:bg-foreground/90 rounded-xl shadow-lg shadow-black/5 mt-2 transition-all active:scale-[0.98]"
                                    >
                                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Withdrawal'}
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* QR Code Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl overflow-hidden relative">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h3 className="text-foreground font-bold">Scan {asset.chain} Address</h3>
                            <button
                                onClick={() => setShowScanner(false)}
                                className="p-2 hover:bg-accent rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-4 relative min-h-[300px] flex flex-col items-center justify-center bg-black">
                            {scannerError ? (
                                <div className="text-center p-4">
                                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                                    <p className="text-red-400 font-medium mb-4">{scannerError}</p>
                                    <div className="flex gap-3 justify-center">
                                        {canRetryScanner && (
                                            <Button
                                                variant="default"
                                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                                onClick={() => {
                                                    setScannerError(null);
                                                    setCanRetryScanner(false);
                                                    setShowScanner(false);
                                                    setTimeout(() => setShowScanner(true), 100);
                                                }}
                                            >
                                                Try Again
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="border-border text-muted-foreground hover:bg-accent"
                                            onClick={() => setShowScanner(false)}
                                        >
                                            Close
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div id="reader-asset" className="w-full h-full overflow-hidden rounded-xl"></div>
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                        {/* Scanning Frame Branding */}
                                        <div className="w-[250px] h-[250px] border-2 border-primary/50 rounded-2xl relative">
                                            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary -mt-1 -ml-1 rounded-tl-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary -mt-1 -mr-1 rounded-tr-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary -mb-1 -ml-1 rounded-bl-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary -mb-1 -mr-1 rounded-br-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>

                                            {/* Scanning Line Animation */}
                                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_20px_rgba(59,130,246,1)] animate-[scan_2s_ease-in-out_infinite] opacity-80"></div>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-gray-500 mt-4 absolute bottom-4">
                                        Scanning for <b>{asset.chain}</b> Address
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
