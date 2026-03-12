import { useState, useRef, useCallback, useEffect } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { X, AlertCircle, Loader2, ArrowRight, Check, ChevronDown, Scan } from 'lucide-react';
import { Button } from '../components/ui/button';
import { depositApi } from '../../services/api';
import { parseUnits, encodeFunctionData, isAddress, createWalletClient, custom } from 'viem';
import { Html5Qrcode } from 'html5-qrcode';
import { TOKENS, CHAINS, type Token, type Chain } from '../../constants/tokens';
import { base, mainnet } from 'viem/chains';
import { useTokenBalances } from '../../hooks/useTokenBalances';
import { useDeposit } from '../contexts/DepositContext';

// Security: Rate limiting configuration
const RATE_LIMIT = {
    maxAttempts: 3,
    windowMs: 60000, // 1 minute
};

// Security: Minimum withdrawal amount
const MIN_WITHDRAWAL_AMOUNT = 1;
const MAX_WITHDRAWAL_AMOUNT = 100000;

// Minimal ERC20 ABI for transfer
const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

interface WithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Helper function to validate Solana address (base58)
const isValidSolanaAddress = (addr: string): boolean => {
    // Solana addresses are 32-44 characters, base58 encoded
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(addr);
};

// Helper function to validate Sui address
const isValidSuiAddress = (addr: string): boolean => {
    // Sui addresses are 66 characters (0x + 64 hex chars)
    const suiRegex = /^0x[a-fA-F0-9]{64}$/;
    return suiRegex.test(addr);
};

// Get address placeholder based on chain
const getAddressPlaceholder = (chainId: string): string => {
    switch (chainId) {
        case 'solana':
            return 'Enter Solana address...';
        case 'sui':
            return '0x... (64 characters)';
        default:
            return '0x...';
    }
};

// Validate address based on selected chain
const isValidAddress = (addr: string, chainId: string): boolean => {
    if (!addr) return false;
    switch (chainId) {
        case 'solana':
            return isValidSolanaAddress(addr);
        case 'sui':
            return isValidSuiAddress(addr);
        default:
            return isAddress(addr); // Ethereum validation
    }
};

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
    const { wallets } = useWallets();
    const { user, getAccessToken, authenticated } = usePrivy();
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');

    // State for Token and Chain selection
    const [selectedToken, setSelectedToken] = useState<Token>(TOKENS[0]); // Default USDC
    const [selectedChain, setSelectedChain] = useState<Chain>(CHAINS.find(c => c.id === 'base') || CHAINS[0]);
    const [showTokenDropdown, setShowTokenDropdown] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // QR Scanner state
    const [scannerError, setScannerError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    // Track scanner retry state
    const [canRetryScanner, setCanRetryScanner] = useState(false);

    // Helper function to request camera permission explicitly
    const requestCameraPermission = async (): Promise<boolean> => {
        try {
            // First, check if getUserMedia is available (needed for HTTPS or localhost)
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('getUserMedia not available - camera may not work');
                return true; // Let Html5Qrcode handle the error
            }

            // Request camera permission explicitly
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            // Stop the stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (err: any) {
            console.error('Camera permission error:', err);
            if (err.name === 'NotAllowedError') {
                setScannerError('Camera permission denied. Please allow camera access in your browser settings and try again.');
            } else if (err.name === 'NotFoundError') {
                setScannerError('No camera found. Please ensure your device has a camera.');
            } else if (err.name === 'NotReadableError') {
                setScannerError('Camera is in use by another application. Please close other apps using the camera.');
            } else if (err.name === 'OverconstrainedError') {
                setScannerError('Camera not compatible. Trying alternative...');
                // Try without environment constraint
                try {
                    const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    fallbackStream.getTracks().forEach(track => track.stop());
                    return true;
                } catch {
                    setScannerError('Camera access failed. Please try again.');
                    return false;
                }
            } else {
                setScannerError('Camera access failed. Please check permissions and try again.');
            }
            return false;
        }
    };

    // Start scanner function (can be retried)
    const startScanner = async () => {
        setScannerError(null);
        setCanRetryScanner(false);

        // Request camera permission first
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
            setCanRetryScanner(true);
            return;
        }

        // Wait for DOM element to be ready
        await new Promise(resolve => setTimeout(resolve, 150));

        const readerElement = document.getElementById('reader');
        if (!readerElement) {
            setScannerError('Scanner initialization failed. Please try again.');
            setCanRetryScanner(true);
            return;
        }

        try {
            const scanner = new Html5Qrcode('reader');
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
                    // Anti-Hack: Strict validation of scanned data
                    const cleanText = decodedText.trim();
                    // Parse payment URIs (e.g., ethereum:0x...)
                    const cleanAddress = cleanText.split(':').pop() || cleanText;

                    // Validate against selected chain rules before setting
                    if (isValidAddress(cleanAddress, selectedChain.id)) {
                        setAddress(cleanAddress);
                        setShowScanner(false);
                    }
                },
                () => { /* ignore frame errors */ }
            );
        } catch (err: any) {
            console.error('Scanner start failed:', err);

            // Provide specific error messages
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

    useEffect(() => {
        if (showScanner) {
            startScanner();
        }

        // Cleanup function - properly at useEffect level
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
    }, [showScanner, selectedChain.id]);

    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
    const [error, setError] = useState<string | null>(null);

    // Fetch real-time balances
    const privyWallet = wallets.find(w => w.walletClientType === 'privy');
    const evmAddress = privyWallet?.address;

    // Access backend balance data to find specific asset addresses
    // This ensures we match the "Crypto Assets" view
    const { balance: backendBalance } = useDeposit();

    // Find Solana and Sui addresses:
    // 1. Try to find in backend assets (most reliable for "deposited" funds)
    // 2. Fallback to linked accounts in Privy user object
    const solanaAsset = backendBalance?.assets?.find(a => a.chain === 'solana');
    const suiAsset = backendBalance?.assets?.find(a => a.chain === 'sui');

    const solanaAddress = solanaAsset?.address || (user?.linkedAccounts.find((a: any) => a.type === 'wallet' && a.chainType === 'solana') as any)?.address;
    const suiAddress = suiAsset?.address || (user?.linkedAccounts.find((a: any) => a.type === 'wallet' && a.chainType === 'sui') as any)?.address;

    const { balances, isLoading: isBalancesLoading } = useTokenBalances({ evmAddress, solanaAddress, suiAddress });

    // Get current available balance based on selection
    const currentBalance = balances[`${selectedToken.symbol}-${selectedChain.id}`] || 0;

    // Update compatible chain when token changes
    // If current chain is not supported by new token, switch to first supported chain
    const handleTokenChange = (token: Token) => {
        setSelectedToken(token);
        setShowTokenDropdown(false);
        if (!token.chains.includes(selectedChain.id)) {
            const firstSupportedChain = CHAINS.find(c => token.chains.includes(c.id));
            if (firstSupportedChain) {
                setSelectedChain(firstSupportedChain);
            }
        }
        setAddress(''); // Clear address on token change
        setError(null);
    };

    // Security: Rate limiting state
    const attemptCountRef = useRef(0);
    const lastAttemptTimeRef = useRef(0);

    // Security: Check rate limit before withdrawal
    const checkRateLimit = useCallback((): boolean => {
        const now = Date.now();

        // Reset counter if window has passed
        if (now - lastAttemptTimeRef.current > RATE_LIMIT.windowMs) {
            attemptCountRef.current = 0;
        }

        if (attemptCountRef.current >= RATE_LIMIT.maxAttempts) {
            const remainingTime = Math.ceil((RATE_LIMIT.windowMs - (now - lastAttemptTimeRef.current)) / 1000);
            setError(`Too many attempts. Please wait ${remainingTime} seconds.`);
            return false;
        }

        attemptCountRef.current++;
        lastAttemptTimeRef.current = now;
        return true;
    }, []);

    if (!isOpen) return null;

    const handleWithdraw = async () => {
        setError(null);

        // Security: Check authentication
        if (!authenticated) {
            setError('Please login to continue');
            return;
        }

        // Security: Rate limiting
        if (!checkRateLimit()) {
            return;
        }

        const amountValue = parseFloat(amount);

        // Security: Enhanced amount validation
        if (!amount || isNaN(amountValue) || amountValue <= 0) {
            setError('Invalid amount');
            return;
        }
        if (amountValue < MIN_WITHDRAWAL_AMOUNT) {
            setError(`Minimum withdrawal is $${MIN_WITHDRAWAL_AMOUNT}`);
            return;
        }
        if (amountValue > MAX_WITHDRAWAL_AMOUNT) {
            setError(`Maximum withdrawal is $${MAX_WITHDRAWAL_AMOUNT}`);
            return;
        }
        if (amountValue > currentBalance) {
            setError('Insufficient balance');
            return;
        }

        // Security: Address validation
        if (!isValidAddress(address, selectedChain.id)) {
            const errorMsg = selectedChain.id === 'solana'
                ? 'Invalid Solana Address (must be base58 format)'
                : selectedChain.id === 'sui'
                    ? 'Invalid Sui Address (must be 0x followed by 64 hex characters)'
                    : 'Invalid Wallet Address (must be valid EVM address)';
            setError(errorMsg);
            return;
        }

        const isNative = selectedToken.isNative;
        const tokenAddress = selectedToken.addresses?.[selectedChain.chainId!];

        // Check text support
        if (!isNative && !tokenAddress && !['solana', 'sui'].includes(selectedChain.id)) {
            setError('Token not supported on this network');
            return;
        }

        setIsLoading(true);
        setStep('processing');

        try {
            // Security: Get Privy access token for dual authentication
            const privyToken = await getAccessToken();
            if (!privyToken) {
                throw new Error('Failed to get authentication token');
            }

            console.log('[Security] Initiating secure withdrawal with dual auth...');

            // 1. Backend: Initiate (Lock funds) - with Privy token for dual auth
            const initiateRes = await depositApi.initiateWithdrawal(
                amountValue,
                selectedChain.id,
                address,
                privyToken // Pass Privy token for backend verification
            );
            const { id: withdrawalId } = initiateRes;

            // 2. Privy: Send Transaction
            const wallet = wallets.find((w) => w.walletClientType === 'privy');
            if (!wallet) throw new Error('No embedded wallet found');

            // Switch chain if needed
            if (wallet.chainId !== `caip154:${selectedChain.chainId}`) {
                await wallet.switchChain(selectedChain.chainId as any); // cast for safety
            }

            // Get provider and create viem client
            const provider = await wallet.getEthereumProvider();
            // Ensure we map correctly to viem chain objects
            const chainObj = selectedChain.id === 'base' ? base : mainnet;
            // Note: For Solana/Sui this part will need specific adapters. Currently focusing on EVM.

            if (selectedChain.id === 'solana' || selectedChain.id === 'sui') {
                // Temporary handling for non-EVM until full integration
                throw new Error(`${selectedChain.name} withdrawals are coming soon.`);
            }

            const walletClient = createWalletClient({
                account: wallet.address as `0x${string}`,
                chain: chainObj,
                transport: custom(provider)
            });

            console.log(`Constructing secure ${selectedToken.symbol} transaction for ${selectedChain.name}...`);

            const amountWei = parseUnits(amount, selectedToken.decimals);

            let txHash;

            if (selectedToken.isNative) {
                // Native ETH Transfer
                console.log('Sending Native Transaction...');
                txHash = await walletClient.sendTransaction({
                    to: address as `0x${string}`,
                    value: amountWei,
                    chain: chainObj,
                    data: '0x'
                });
            } else {
                // ERC-20 Transfer
                console.log('Sending ERC-20 Transaction...');
                const tokenAddress = selectedToken.addresses?.[selectedChain.chainId!];
                if (!tokenAddress) throw new Error('Token address not found for this network');

                const data = encodeFunctionData({
                    abi: ERC20_ABI,
                    functionName: 'transfer',
                    args: [address as `0x${string}`, amountWei]
                });

                txHash = await walletClient.sendTransaction({
                    to: tokenAddress as `0x${string}`,
                    data: data,
                    value: 0n,
                    chain: chainObj
                });
            }

            // 3. Backend: Confirm - with Privy token for dual auth
            await depositApi.confirmWithdrawal(withdrawalId, txHash, privyToken);

            setStep('success');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('Withdrawal failed', err);
            setError(err.message || 'Withdrawal failed');
            setStep('input');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-card rounded-3xl border border-border shadow-2xl relative flex flex-col max-h-[90dvh] overflow-hidden ring-1 ring-border/50">
                {/* Header */}
                <div className="p-6 border-b border-border flex justify-between items-center bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Withdraw Assets</h2>
                        <p className="text-xs text-muted-foreground mt-1">Transfer funds securely to your wallet</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-accent rounded-xl transition-colors text-muted-foreground hover:text-foreground group"
                    >
                        <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                    {step === 'input' && (
                        <div className="space-y-8">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span className="leading-relaxed">{error}</span>
                                </div>
                            )}

                            {/* Asset Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-muted-foreground ml-1">Select Asset</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                                        className="w-full h-[72px] flex items-center justify-between px-4 bg-secondary/50 border border-border hover:border-border/80 rounded-2xl transition-all group hover:bg-accent"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-background p-0.5 ring-2 ring-border">
                                                <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-full h-full rounded-full object-cover" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                                                    {selectedToken.symbol}
                                                </div>
                                                <div className="text-xs text-muted-foreground font-medium">
                                                    {selectedToken.name}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-sm font-medium text-muted-foreground/80">Balance</div>
                                                <div className="text-sm text-muted-foreground font-mono">
                                                    {isBalancesLoading ? (
                                                        <Loader2 className="w-3 h-3 animate-spin inline ml-1" />
                                                    ) : (
                                                        `$${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${showTokenDropdown ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {showTokenDropdown && (
                                        <div className="mt-2 bg-popover rounded-2xl border border-border shadow-inner max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent p-2 animate-in slide-in-from-top-2 fade-in-20">
                                            {TOKENS.map((token) => {
                                                const tokenTotalBalance = token.chains.reduce((sum, chainId) => sum + (balances[`${token.symbol}-${chainId}`] || 0), 0);
                                                return (
                                                    <button
                                                        key={token.symbol}
                                                        onClick={() => handleTokenChange(token)}
                                                        className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${selectedToken.symbol === token.symbol
                                                            ? 'bg-primary/10 border border-primary/20'
                                                            : 'hover:bg-accent border border-transparent'
                                                            }`}
                                                    >
                                                        <img src={token.icon} alt={token.symbol} className="w-8 h-8 rounded-full" />
                                                        <div className="text-left flex-1">
                                                            <div className="flex justify-between items-center">
                                                                <div className={`font-bold ${selectedToken.symbol === token.symbol ? 'text-primary' : 'text-foreground'}`}>
                                                                    {token.symbol}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground font-mono">
                                                                    {tokenTotalBalance > 0 ? tokenTotalBalance.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0.00'}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">{token.name}</div>
                                                        </div>
                                                        {selectedToken.symbol === token.symbol && (
                                                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                                                <Check className="w-3.5 h-3.5 text-primary" />
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Network Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-muted-foreground ml-1">Select Network</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {CHAINS.filter(c => selectedToken.chains.includes(c.id)).map(chain => {
                                        const chainBalance = balances[`${selectedToken.symbol}-${chain.id}`] || 0;
                                        return (
                                            <button
                                                key={chain.id}
                                                onClick={() => {
                                                    setSelectedChain(chain);
                                                    setAddress('');
                                                    setError(null);
                                                }}
                                                className={`relative h-[60px] flex items-center gap-3 px-4 rounded-xl border transition-all duration-200 overflow-hidden ${selectedChain.id === chain.id
                                                    ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)] ring-1 ring-primary/20'
                                                    : 'bg-secondary/50 border-border hover:border-muted-foreground/50 hover:bg-accent'
                                                    }`}
                                            >
                                                <img src={chain.icon} alt={chain.name} className="w-6 h-6 rounded-full" />
                                                <div className="text-left">
                                                    <div className={`font-semibold text-sm ${selectedChain.id === chain.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                        {chain.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {chainBalance > 0 ? chainBalance.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0.00'}
                                                    </div>
                                                </div>
                                                {selectedChain.id === chain.id && (
                                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-muted-foreground ml-1">
                                    Amount to Withdraw
                                </label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-2xl px-4 py-5 text-foreground text-2xl font-bold text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50 tracking-tight"
                                        placeholder="0.00"
                                    />
                                    <div className="absolute inset-y-0 right-4 flex items-center">
                                        <button
                                            onClick={() => setAmount(currentBalance.toString())}
                                            className="px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary rounded-lg transition-colors uppercase tracking-wider"
                                        >
                                            Max
                                        </button>
                                    </div>
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                        <span className="text-muted-foreground font-bold text-lg">$</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs text-muted-foreground font-medium">Available Balance</span>
                                    <span className={`text-xs font-mono bg-accent px-2 py-0.5 rounded-md ${currentBalance > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                        {currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {selectedToken.symbol}
                                    </span>
                                </div>
                            </div>

                            {/* Address Input */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-muted-foreground ml-1">Recipient Address</label>
                                    {address && isValidAddress(address, selectedChain.id) && (
                                        <span className="text-xs text-green-500 flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded-md font-medium">
                                            <Check className="w-3 h-3" /> Valid
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        className={`w-full bg-secondary/50 border rounded-2xl px-4 py-4 pr-10 text-foreground font-mono text-sm focus:outline-none focus:ring-1 transition-all placeholder:text-muted-foreground/50 ${address && !isValidAddress(address, selectedChain.id)
                                            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                            : address && isValidAddress(address, selectedChain.id)
                                                ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20'
                                                : 'border-border focus:border-primary focus:ring-primary/50'
                                            }`}
                                        placeholder={getAddressPlaceholder(selectedChain.id)}
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        {address && (
                                            <>
                                                {isValidAddress(address, selectedChain.id) ? (
                                                    <div className="w-2 h-2 rounded-full bg-green-500 blur-[2px]" />
                                                ) : (
                                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                                )}
                                            </>
                                        )}
                                        <button
                                            onClick={() => setShowScanner(true)}
                                            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                            title="Scan QR Code"
                                        >
                                            <Scan className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-1 bg-primary/5 border border-primary/10 p-2 rounded-lg">
                                    <AlertCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Ensure address matches the <span className="text-primary font-semibold">{selectedChain.name}</span> network. Transactions are irreversible.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in zoom-in-95 duration-300">
                            <div className="relative mb-8">
                                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                                <div className="w-24 h-24 bg-card border border-primary/30 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-foreground">Processing Withdrawal</h3>
                            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 max-w-[280px]">
                                <p className="text-primary text-sm leading-relaxed">
                                    Please verify and sign the transaction in your wallet to proceed.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in zoom-in-95 duration-300">
                            <div className="relative mb-8">
                                <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                                <div className="w-24 h-24 bg-card border border-green-500/30 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                    <Check className="w-12 h-12 text-green-500" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-foreground">Withdrawal Initiated</h3>
                            <p className="text-muted-foreground text-sm max-w-[260px]">
                                Your assets are on the way. Funds typically arrive within a few minutes.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                {step === 'input' && (
                    <div className="p-6 pb-8 border-t border-border bg-card/50 backdrop-blur-sm mt-auto sticky bottom-0">
                        <Button
                            className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl transition-all shadow-[0_8px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_12px_24px_rgba(37,99,235,0.3)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none text-lg flex items-center justify-center gap-3"
                            onClick={handleWithdraw}
                            disabled={isLoading || !amount || parseFloat(amount) <= 0 || !address || !isValidAddress(address, selectedChain.id)}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <span>Confirm Withdrawal</span>
                                    <ArrowRight className="w-5 h-5 opacity-80" />
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>
            {/* QR Code Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-[#13141b] rounded-3xl border border-gray-800 shadow-2xl overflow-hidden relative">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-white font-bold">Scan QR Code</h3>
                            <button
                                onClick={() => setShowScanner(false)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
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
                                                    // Trigger scanner restart
                                                    setShowScanner(false);
                                                    setTimeout(() => setShowScanner(true), 100);
                                                }}
                                            >
                                                Try Again
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="border-gray-700 text-gray-300 hover:bg-gray-800"
                                            onClick={() => setShowScanner(false)}
                                        >
                                            Close
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div id="reader" className="w-full h-full overflow-hidden rounded-xl"></div>
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                        {/* Scanning Frame Branding */}
                                        <div className="w-[250px] h-[250px] border-2 border-blue-500/50 rounded-2xl relative">
                                            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1 rounded-tl-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1 rounded-tr-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1 rounded-bl-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1 rounded-br-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>

                                            {/* Scanning Line Animation */}
                                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_20px_rgba(59,130,246,1)] animate-[scan_2s_ease-in-out_infinite] opacity-80"></div>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-gray-500 mt-4 absolute bottom-4">
                                        Scanning for <b>{selectedChain.name}</b> Address
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
