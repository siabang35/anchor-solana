import { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { AuthIcons } from './AuthIcons';
import { SocialButton } from './SocialButton';
import { WalletOption } from './WalletOption';
import { EmailForm } from './EmailForm';
import { WalletProfileModal } from './WalletProfileModal';
import { useAuth } from './AuthContext';
import {
    WalletProvider,
    WalletChain,
    getWalletAdapter,
    MetaMaskAdapter,
    PhantomAdapter,
    CoinbaseAdapter,
    isMessageSafe,
    isMobileDevice,
} from '../../../services/walletAdapters';
import { walletAuthApi } from '../../../services/api';
import { useConnectWallet, useWallets, useSignPersonalMessage, useCurrentAccount } from '@mysten/dapp-kit';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';


interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: 'login' | 'signup';
}

type AuthView = 'MAIN' | 'EMAIL' | 'WALLET_CONNECTING' | 'WALLET_SIGNING' | 'WALLET_ERROR' | 'WALLET_SUCCESS';

interface WalletState {
    provider: WalletProvider;
    address: string;
    chain: WalletChain;
    challenge?: {
        message: string;
        nonce: string;
        expiresAt: string;
    };
    error?: string;
}

export function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
    const { refreshUser } = useAuth();
    const [view, setView] = useState<AuthView>('MAIN');
    const [walletState, setWalletState] = useState<WalletState | null>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);

    // Check mobile device once
    const isMobile = isMobileDevice();

    // SUI SDK Hooks
    const { mutateAsync: connectSui } = useConnectWallet();
    const { mutateAsync: signSuiMessage } = useSignPersonalMessage();
    const suiWallets = useWallets();
    const currentSuiAccount = useCurrentAccount();

    // AppKit / Wagmi Hooks (WalletConnect)
    const { open } = useAppKit();
    const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { disconnect: disconnectWagmi } = useDisconnect();

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setView('MAIN');
                setWalletState(null);
            }, 300);
        }
    }, [isOpen]);

    // Handle WalletConnect detection
    useEffect(() => {
        if (view === 'WALLET_CONNECTING' && walletState?.provider === 'walletconnect' && isWagmiConnected && wagmiAddress) {
            const initWalletConnectSession = async () => {
                try {
                    setWalletState(prev => ({ ...prev!, address: wagmiAddress, chain: 'ethereum' }));

                    // Get SIWE challenge
                    const challenge = await walletAuthApi.getChallenge(wagmiAddress, 'ethereum', 'walletconnect');

                    // Safety check
                    const safetyCheck = isMessageSafe(challenge.message);
                    if (!safetyCheck.safe) console.warn(safetyCheck.issues);

                    setWalletState(prev => ({
                        ...prev!,
                        address: wagmiAddress,
                        challenge: {
                            message: challenge.message,
                            nonce: challenge.nonce,
                            expiresAt: challenge.expiresAt
                        }
                    }));
                    setView('WALLET_SIGNING');
                } catch (error) {
                    console.error('WalletConnect init error:', error);
                    setWalletState(prev => prev ? { ...prev, error: 'Failed to initialize session' } : null);
                    setView('WALLET_ERROR');
                }
            };
            initWalletConnectSession();
        }
    }, [isWagmiConnected, wagmiAddress, view, walletState?.provider]);

    /**
     * Handle wallet connection - uses real adapters
     */
    const handleWalletConnect = useCallback(async (providerName: string) => {
        // Map display names to adapter names
        const providerMap: Record<string, WalletProvider> = {
            'Metamask': 'metamask',
            'Phantom': 'phantom',
            'Coinbase': 'coinbase',
            'Slush': 'slush',
            'WalletConnect': 'walletconnect',
        };
        const provider = providerMap[providerName] || providerName.toLowerCase() as WalletProvider;

        setWalletState({ provider, address: '', chain: 'ethereum' });
        setView('WALLET_CONNECTING');

        try {
            let address = '';
            let chain: WalletChain = 'ethereum';

            // Special handling for WalletConnect (Reown)
            if (provider === 'walletconnect') {
                // Determine if already connected via Wagmi
                if (isWagmiConnected && wagmiAddress) {
                    // Already connected, proceed to signing
                    address = wagmiAddress;
                    chain = 'ethereum'; // Default for Wagmi for now, could check chainId
                } else {
                    // Open Reown Modal
                    await open();
                    // We return here because the useEffect hook at the top will detect
                    // when the connection is established and trigger the next step.
                    return;
                }
            }
            // Special handling for Slush (SUI) via SDK
            else if (provider === 'slush') {
                // Find Slush or any SUI wallet
                const targetWallet = suiWallets.find(w => w.name.toLowerCase().includes('slush'))
                    || suiWallets.find(w => w.name.toLowerCase().includes('sui'))
                    || suiWallets[0];

                if (!targetWallet) {
                    throw new Error('Likely due to Slush Wallet (or compatible SUI wallet) not being detected. Please install it.');
                }

                await connectSui({ wallet: targetWallet });

                // Get address from account
                address = targetWallet.accounts[0]?.address;
                if (!address && currentSuiAccount) address = currentSuiAccount.address;

                if (!address) throw new Error('Failed to get SUI address');
                chain = 'sui';
            } else {
                // Standard Adapters for Phase 1
                const adapter = getWalletAdapter(provider);
                if (!adapter) {
                    throw new Error(`Unknown wallet: ${provider}`);
                }

                // Check if installed (Desktop only)
                // On mobile, we might proceed to redirect via deep link even if "not installed" (not injected)
                const isMobile = isMobileDevice();

                if (!isMobile && !adapter.isInstalled()) {
                    throw new Error(`${adapter.displayName} is not installed. Please install the extension.`);
                }

                // Connect to wallet
                try {
                    address = await adapter.connect();
                } catch (err: any) {
                    // If the adapter threw a "Redirecting..." error (from walletAdapters.ts), we should just stop here
                    // safely without showing an error state, as the user is being navigated away.
                    if (err.message && err.message.includes('Redirecting')) {
                        return;
                    }
                    throw err;
                }

                chain = await adapter.getChain() || (provider === 'phantom' ? 'solana' : 'ethereum');
            }

            // Get SIWE challenge from backend (DB-Backed)
            const challenge = await walletAuthApi.getChallenge(address, chain, provider);

            // Validate message is safe (anti-drain)
            const safetyCheck = isMessageSafe(challenge.message);
            if (!safetyCheck.safe) {
                console.warn('Challenge message safety issues:', safetyCheck.issues);
            }

            setWalletState({
                provider,
                address,
                chain,
                challenge: {
                    message: challenge.message,
                    nonce: challenge.nonce,
                    expiresAt: challenge.expiresAt,
                },
            });
            setView('WALLET_SIGNING');

        } catch (error) {
            console.error('Wallet connection error:', error);
            const message = error instanceof Error ? error.message : 'Failed to connect wallet';
            setWalletState(prev => prev ? { ...prev, error: message } : null);
            setView('WALLET_ERROR');
        }
    }, [suiWallets, connectSui, currentSuiAccount, open, isWagmiConnected, wagmiAddress]);

    /**
     * Handle signature and verification
     */
    const handleSign = useCallback(async () => {
        if (!walletState?.challenge) return;

        // Don't switch view immediately to keep the button state or show loading spinner there
        // But for Global UI consistency we can set 'WALLET_CONNECTING' or similar, 
        // let's stick to 'WALLET_SIGNING' but maybe add a loading state in the button?
        // For now, let's keep view simplified.

        try {
            let signature = '';

            if (walletState.provider === 'slush') {
                const messageBytes = new TextEncoder().encode(walletState.challenge.message);
                const result = await signSuiMessage({ message: messageBytes });
                signature = result.signature;
            } else if (walletState.provider === 'walletconnect') {
                // Wagmi signing
                signature = await signMessageAsync({ message: walletState.challenge.message });
            } else {
                const adapter = getWalletAdapter(walletState.provider);
                if (!adapter) throw new Error('Wallet not available');
                signature = await adapter.signMessage(walletState.challenge.message);
            }

            // Verify with backend
            // This now includes "Consuming the Nonce"
            const result = await walletAuthApi.verify({
                address: walletState.address,
                chain: walletState.chain,
                signature,
                message: walletState.challenge.message,
                nonce: walletState.challenge.nonce,
                provider: walletState.provider,
            });

            // Check if profile completion is needed (New Feature)
            if (result.profilePending) {
                setView('WALLET_SUCCESS'); // Short success animation
                setTimeout(() => {
                    onClose();
                    setShowProfileModal(true);
                }, 1000);
            } else {
                // Standard Success
                await refreshUser();
                setView('WALLET_SUCCESS');
                setTimeout(() => {
                    onClose();
                }, 1500);
            }

        } catch (error) {
            console.error('Signing error:', error);
            const message = error instanceof Error ? error.message : 'Failed to verify signature';
            setWalletState(prev => prev ? { ...prev, error: message } : null);
            setView('WALLET_ERROR');
        }
    }, [walletState, refreshUser, onClose, signSuiMessage, signMessageAsync]);

    /**
     * Handle retry after error
     */
    const handleRetry = useCallback(() => {
        if (walletState?.provider === 'walletconnect') disconnectWagmi();
        setWalletState(null);
        setView('MAIN');
    }, [walletState?.provider, disconnectWagmi]);

    /**
     * Handle profile completion modal close
     */
    const handleProfileComplete = useCallback(async () => {
        setShowProfileModal(false);
        await refreshUser();
    }, [refreshUser]);

    const renderContent = () => {
        if (view === 'EMAIL') {
            return <EmailForm initialMode={initialMode} onBack={() => setView('MAIN')} onSuccess={onClose} />;
        }

        if (view === 'WALLET_CONNECTING') {
            const displayName = walletState?.provider
                ? getWalletAdapter(walletState.provider)?.displayName || walletState.provider
                : 'wallet';

            return (
                <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-300">
                    <div className="relative w-20 h-20 mb-6">
                        <div className="absolute inset-0 rounded-full border-4 border-accent/30 animate-pulse" />
                        <div className="absolute inset-0 rounded-full border-t-4 border-primary animate-spin" />
                        <div className="absolute inset-2 bg-card rounded-full flex items-center justify-center p-3">
                            {walletState?.provider === 'metamask' && <AuthIcons.Metamask className="w-full h-full" />}
                            {walletState?.provider === 'phantom' && <AuthIcons.Phantom className="w-full h-full" />}
                            {walletState?.provider === 'slush' && <AuthIcons.Slush className="w-full h-full" />}
                            {walletState?.provider === 'coinbase' && <AuthIcons.Coinbase className="w-full h-full" />}
                            {walletState?.provider === 'walletconnect' && <AuthIcons.WalletConnect className="w-full h-full" />}
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Connecting to {displayName}...</h3>
                    <p className="text-muted-foreground text-sm mt-2">Please approve the request in your wallet.</p>
                </div>
            );
        }

        if (view === 'WALLET_SIGNING') {
            const shortAddress = walletState?.address
                ? `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`
                : '';

            return (
                <div className="flex flex-col items-center py-8 animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 mb-4 rounded-full bg-accent/50 flex items-center justify-center">
                        {walletState?.provider === 'metamask' && <AuthIcons.Metamask className="w-10 h-10" />}
                        {walletState?.provider === 'phantom' && <AuthIcons.Phantom className="w-10 h-10" />}
                        {walletState?.provider === 'slush' && <AuthIcons.Slush className="w-10 h-10" />}
                        {walletState?.provider === 'coinbase' && <AuthIcons.Coinbase className="w-10 h-10" />}
                        {walletState?.provider === 'walletconnect' && <AuthIcons.WalletConnect className="w-10 h-10" />}
                    </div>

                    <h3 className="text-lg font-bold mb-1 text-zinc-950 dark:text-zinc-50">Sign Message</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                        Connected: <span className="font-mono">{shortAddress}</span>
                    </p>

                    {/* Message Preview */}
                    <div className="w-full bg-accent/30 rounded-lg p-4 mb-4 max-h-40 overflow-y-auto">
                        <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
                            {walletState?.challenge?.message || 'Loading...'}
                        </p>
                    </div>

                    <p className="text-xs text-muted-foreground text-center mb-4">
                        This will NOT trigger a blockchain transaction or cost any gas fees.
                    </p>

                    <button
                        onClick={handleSign}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                    >
                        Sign Message to Login
                    </button>

                    <button
                        onClick={handleRetry}
                        className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Use different wallet
                    </button>
                </div>
            );
        }

        if (view === 'WALLET_ERROR') {
            return (
                <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-zinc-950 dark:text-zinc-50">Connection Failed</h3>
                    <p className="text-muted-foreground text-sm text-center mb-6 max-w-xs">
                        {walletState?.error || 'Something went wrong. Please try again.'}
                    </p>
                    <button
                        onClick={handleRetry}
                        className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        if (view === 'WALLET_SUCCESS') {
            return (
                <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-zinc-950 dark:text-zinc-50">Connected!</h3>
                    <p className="text-muted-foreground text-sm">
                        Redirecting...
                    </p>
                </div>
            );
        }

        // MAIN VIEW
        return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-1.5">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground dark:text-white">
                        {initialMode === 'signup' ? 'Create an Account' : 'Welcome to ExoDuZe'}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        {initialMode === 'signup'
                            ? 'Sign up to trade, predict, and win.'
                            : 'Sign in to trade, predict, and win.'}
                    </p>
                </div>

                <div className="space-y-3">
                    <SocialButton
                        icon={<AuthIcons.Google />}
                        variant="solid"
                        className="bg-white text-black hover:bg-gray-100 border-none shadow-md shadow-gray-200/10 dark:shadow-none"
                        onClick={() => {
                            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
                            window.location.href = `${apiUrl}/auth/google`;
                        }}
                    >
                        Continue with Google
                    </SocialButton>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border/40" />
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 sm:grid sm:grid-cols-2">
                        <WalletOption
                            icon={<AuthIcons.Metamask />}
                            name="Metamask"
                            recommended={isMobile || MetaMaskAdapter.isInstalled()}
                            installed={MetaMaskAdapter.isInstalled()}
                            isMobile={isMobile}
                            onClick={() => handleWalletConnect('Metamask')}
                            className="w-auto sm:w-full shrink-0"
                        />
                        <WalletOption
                            icon={<AuthIcons.Phantom />}
                            name="Phantom"
                            installed={PhantomAdapter.isInstalled()}
                            isMobile={isMobile}
                            onClick={() => handleWalletConnect('Phantom')}
                            className="w-auto sm:w-full shrink-0"
                        />
                        <WalletOption
                            icon={<AuthIcons.Coinbase />}
                            name="Coinbase"
                            installed={CoinbaseAdapter.isInstalled()}
                            isMobile={isMobile}
                            onClick={() => handleWalletConnect('Coinbase')}
                            className="w-auto sm:w-full shrink-0"
                        />
                        <WalletOption
                            icon={<AuthIcons.Slush />}
                            name="Slush"
                            installed={true}
                            isMobile={isMobile}
                            onClick={() => handleWalletConnect('Slush')}
                            className="w-auto sm:w-full shrink-0"
                        />
                        <WalletOption
                            icon={<AuthIcons.WalletConnect />}
                            name="WalletConnect"
                            className="w-auto sm:w-full sm:col-span-2 shrink-0"
                            installed={true}
                            isMobile={isMobile}
                            onClick={() => handleWalletConnect('WalletConnect')}
                        />
                    </div>

                    <SocialButton
                        icon={<AuthIcons.Email className="w-5 h-5" />}
                        className="mt-2"
                        onClick={() => setView('EMAIL')}
                    >
                        Continue with Email
                    </SocialButton>
                </div>

                <div className="flex items-center justify-center px-4 mt-2">
                    <p className="text-[11px] text-muted-foreground/60 text-center leading-tight">
                        By continuing, you agree to our <a href="/terms" className="underline hover:text-foreground relative z-10">Terms of Service</a> and <a href="/privacy" className="underline hover:text-foreground relative z-10">Privacy Policy</a>.
                    </p>
                </div>
            </div>
        );
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="w-full max-w-[94vw] sm:max-w-[450px] max-h-[80vh] overflow-y-auto overflow-x-hidden p-0 gap-0 bg-background/80 backdrop-blur-xl border border-border shadow-2xl duration-300 [&>button]:hidden ring-1 ring-border/5 rounded-2xl custom-scrollbar">
                    <DialogTitle className="sr-only">Authentication</DialogTitle>
                    <DialogDescription className="sr-only">Sign in or create an account to access ExoDuZe.</DialogDescription>

                    {/* Close button */}
                    <div className="absolute right-4 top-4 z-50">
                        <button
                            onClick={onClose}
                            className="rounded-full p-2 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground cursor-pointer ring-1 ring-inset ring-black/5 dark:ring-white/5"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" />
                            <span className="sr-only">Close</span>
                        </button>
                    </div>

                    {/* Animated Gradient Background Effect */}
                    <div className="absolute top-0 left-0 w-full h-[180px] bg-gradient-to-b from-blue-500/10 via-purple-500/10 to-transparent pointer-events-none" />
                    <div className="absolute -top-[100px] -left-[100px] w-[200px] h-[200px] bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />
                    <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-purple-500/20 blur-[80px] rounded-full pointer-events-none" />

                    <div className="px-5 pt-14 pb-8 sm:p-8 sm:pb-10 relative">
                        {renderContent()}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Profile Completion Modal */}
            <WalletProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                onComplete={handleProfileComplete}
                walletAddress={walletState?.address}
                walletChain={walletState?.chain}
            />
        </>
    );
}