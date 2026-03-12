import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDeposit } from '../contexts/DepositContext';
import { depositApi } from '../../services/deposit';
import { useAuth } from './auth/AuthContext';

/**
 * SVG Icons - inline to avoid lucide-react issues
 */
const Icons = {
    X: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    ),
    Copy: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
    ),
    Check: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    ChevronDown: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    ),
    Info: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
        </svg>
    ),
    Loader: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    ),
    Back: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
    ),
};

import { TOKENS, CHAINS, type Token, type Chain } from '../../constants/tokens';

interface DepositModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
    const { balance } = useDeposit();
    const { user } = useAuth();

    const [selectedToken, setSelectedToken] = useState<Token>(TOKENS[0]);
    const [selectedChain, setSelectedChain] = useState<Chain>(CHAINS[0]);
    const [showTokenDropdown, setShowTokenDropdown] = useState(false);
    const [showChainDropdown, setShowChainDropdown] = useState(false);
    const [copied, setCopied] = useState(false);
    const [depositAddress, setDepositAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get available chains for selected token
    const availableChains = CHAINS.filter(chain => selectedToken.chains.includes(chain.id));

    // Auto-select first available chain when token changes
    useEffect(() => {
        if (!selectedToken.chains.includes(selectedChain.id)) {
            const newChain = CHAINS.find(c => selectedToken.chains.includes(c.id));
            if (newChain) setSelectedChain(newChain);
        }
    }, [selectedToken, selectedChain.id]);

    // Sync with context selected chain
    const { selectedChain: contextChain } = useDeposit();

    useEffect(() => {
        if (isOpen && contextChain) {
            const chain = CHAINS.find(c => c.id === contextChain);
            if (chain) {
                setSelectedChain(chain);
                // Also update token if needed
                const token = TOKENS.find(t => t.chains.includes(chain.id));
                if (token) setSelectedToken(token);
            }
        }
    }, [isOpen, contextChain]);

    // Fetch real wallet address from backend when chain changes
    useEffect(() => {
        if (!isOpen || !user?.id) return;

        const fetchWalletAddress = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Try to get existing wallet first
                let wallet = await depositApi.getWallet(selectedChain.id);

                // If no wallet exists, generate one
                if (!wallet) {
                    wallet = await depositApi.generateWallet(selectedChain.id, user.id);
                }

                setDepositAddress(wallet.address);
            } catch (err) {
                console.error('Failed to get deposit address:', err);
                setError('Unable to generate deposit address. Please try again later.');
                setDepositAddress('');
            } finally {
                setIsLoading(false);
            }
        };

        fetchWalletAddress();
    }, [isOpen, selectedChain.id, user?.id]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setShowTokenDropdown(false);
            setShowChainDropdown(false);
            setCopied(false);
            setError(null);
        }
    }, [isOpen]);

    const copyAddress = useCallback(() => {
        navigator.clipboard.writeText(depositAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [depositAddress]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-[420px] bg-card rounded-2xl shadow-2xl overflow-hidden border border-border animate-in slide-in-from-bottom-5 duration-300">
                {/* Header */}
                <div className="relative px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
                    <button onClick={onClose} className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                        <Icons.Back />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-semibold text-foreground">Transfer Crypto</h2>
                        <p className="text-sm text-muted-foreground">Balance: ${balance?.availableBalance || '0.00'}</p>
                    </div>
                    <button onClick={onClose} className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                        <Icons.X />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Error Alert */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    {/* Token & Chain Selectors */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Token Selector */}
                        <div className="flex-1 relative">
                            <div className="flex items-center justify-between h-6 mb-1.5">
                                <label className="block text-xs text-muted-foreground font-medium uppercase tracking-wider">Supported token</label>
                            </div>
                            <button
                                onClick={() => { setShowTokenDropdown(!showTokenDropdown); setShowChainDropdown(false); }}
                                className="w-full flex items-center justify-between p-2.5 bg-secondary/50 rounded-xl border border-border hover:border-primary/50 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = '/images/coin/ethereum.png'; }} />
                                    <span className="font-medium text-foreground">{selectedToken.symbol}</span>
                                </div>
                                <div className="text-muted-foreground group-hover:text-foreground transition-colors"><Icons.ChevronDown /></div>
                            </button>

                            {showTokenDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-popover rounded-xl border border-border shadow-xl z-20 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                    {TOKENS.map((token) => (
                                        <button
                                            key={token.symbol}
                                            onClick={() => { setSelectedToken(token); setShowTokenDropdown(false); }}
                                            className={`w-full flex items-center gap-3 p-3 hover:bg-accent transition-colors ${selectedToken.symbol === token.symbol ? 'bg-primary/10' : ''}`}
                                        >
                                            <img src={token.icon} alt={token.symbol} className="w-6 h-6 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = '/images/coin/ethereum.png'; }} />
                                            <div className="text-left">
                                                <p className={`font-medium ${selectedToken.symbol === token.symbol ? 'text-primary' : 'text-foreground'}`}>{token.symbol}</p>
                                                <p className="text-xs text-muted-foreground">{token.name}</p>
                                            </div>
                                            {selectedToken.symbol === token.symbol && <div className="ml-auto text-primary"><Icons.Check /></div>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Chain Selector */}
                        <div className="flex-1 relative">
                            <div className="flex items-center justify-between h-6 mb-1.5">
                                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Supported chain</label>
                                <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full border border-border">
                                    <span className="text-[10px] text-muted-foreground font-medium">Min ${selectedToken.minDeposit}</span>
                                    <div className="text-muted-foreground"><Icons.Info /></div>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowChainDropdown(!showChainDropdown); setShowTokenDropdown(false); }}
                                className="w-full flex items-center justify-between p-2.5 bg-secondary/50 rounded-xl border border-border hover:border-primary/50 transition-colors group"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <img src={selectedChain.icon} alt={selectedChain.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                                    <span className="font-medium text-foreground truncate">{selectedChain.name}</span>
                                </div>
                                <div className="text-muted-foreground group-hover:text-foreground transition-colors"><Icons.ChevronDown /></div>
                            </button>

                            {showChainDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-popover rounded-xl border border-border shadow-xl z-20 animate-in fade-in zoom-in-95 duration-200">
                                    {availableChains.map((chain) => (
                                        <button
                                            key={chain.id}
                                            onClick={() => { setSelectedChain(chain); setShowChainDropdown(false); }}
                                            className={`w-full flex items-center gap-3 p-3 hover:bg-accent transition-colors ${selectedChain.id === chain.id ? 'bg-primary/10' : ''}`}
                                        >
                                            <img src={chain.icon} alt={chain.name} className="w-6 h-6 rounded-full" />
                                            <span className={`font-medium ${selectedChain.id === chain.id ? 'text-primary' : 'text-foreground'}`}>{chain.name}</span>
                                            {selectedChain.id === chain.id && <div className="ml-auto text-primary"><Icons.Check /></div>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* QR Code */}
                    <div className="flex justify-center py-4">
                        {isLoading ? (
                            <div className="w-[212px] h-[212px] bg-secondary/50 rounded-2xl flex items-center justify-center border border-border">
                                <div className="text-primary"><Icons.Loader /></div>
                            </div>
                        ) : (
                            <div className="relative bg-white p-4 rounded-2xl border border-border shadow-sm">
                                <QRCodeSVG
                                    value={depositAddress || 'loading...'}
                                    size={180}
                                    level="H"
                                    includeMargin={false}
                                    bgColor="#FFFFFF"
                                    fgColor="#000000"
                                />
                                <div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white p-1 shadow-lg"
                                    style={{ boxShadow: `0 0 0 3px ${selectedChain.color}` }}
                                >
                                    <img src={selectedChain.icon} alt={selectedChain.name} className="w-full h-full rounded-full object-cover" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Deposit Address */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-muted-foreground">Your deposit address</span>
                            <div className="text-muted-foreground"><Icons.Info /></div>
                        </div>
                        <div className="bg-secondary/50 rounded-xl border border-border overflow-hidden">
                            <div className="p-3">
                                <code className="text-sm text-foreground break-all font-mono">
                                    {isLoading ? 'Loading...' : depositAddress}
                                </code>
                            </div>
                            <button
                                onClick={copyAddress}
                                disabled={isLoading || !depositAddress}
                                className="w-full px-4 py-2.5 bg-card hover:bg-accent transition-colors flex items-center justify-center gap-2 border-t border-border disabled:opacity-50"
                            >
                                {copied ? (
                                    <><div className="text-green-500"><Icons.Check /></div><span className="text-green-500 font-medium">Copied!</span></>
                                ) : (
                                    <><div className="text-muted-foreground"><Icons.Copy /></div><span className="text-foreground font-medium">Copy address</span></>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Info Banner */}
                    <div className="bg-primary/5 rounded-xl p-3 flex items-center gap-2 border border-primary/10">
                        <div className="text-primary"><Icons.Info /></div>
                        <p className="text-xs text-muted-foreground">
                            Send only <span className="text-foreground font-bold">{selectedToken.symbol}</span> on <span className="text-foreground font-bold">{selectedChain.name}</span> network. Other assets will be lost.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
