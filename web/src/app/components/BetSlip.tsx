/**
 * Bet Slip Component - Polymarket Style
 * 
 * Sticky sidebar/bottom sheet for managing AI agent positions:
 * - Add/remove selections
 * - Set bet amounts
 * - Calculate potential payouts
 * - Responsive (sidebar on desktop, bottom sheet on mobile)
 */

import { useState } from 'react';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import {
    X,
    Trash2,
    ChevronUp,
    ChevronDown,
    TrendingUp,
    Wallet,
    AlertCircle
} from 'lucide-react';
import { useBetSlip } from '../contexts/BetSlipContext';
import { useDeposit } from '../contexts/DepositContext';
import { motion, AnimatePresence } from 'motion/react';

interface BetSlipProps {
    className?: string; // Only styling props remain
}

export function BetSlip({ className }: BetSlipProps) {
    const {
        selections,
        amounts,
        removeFromBetSlip,
        clearBetSlip,
        updateAmount,
        toggleBetSlip,
        isOpen,
        calculations
    } = useBetSlip();

    const { balance: balanceData } = useDeposit();
    // Parse the available balance string to a float, default to 0 if null
    const balance = balanceData ? parseFloat(balanceData.availableBalance) : 0;

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAmountChange = (id: string, value: string) => {
        const numValue = parseFloat(value) || 0;
        updateAmount(id, numValue);
    };

    const handleQuickAmount = (id: string, amount: number) => {
        updateAmount(id, (amounts[id] || 0) + amount);
    };

    const handleSubmit = async () => {
        if (selections.length === 0 || calculations.totalStake === 0) return;

        setIsSubmitting(true);
        try {
            // Mock submission for now, replace with actual contract call
            await new Promise(resolve => setTimeout(resolve, 1500));
            clearBetSlip();
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit = selections.length > 0 &&
        calculations.totalStake > 0 &&
        calculations.totalStake <= (balance || 0);

    return (
        <div className={cn(
            "flex flex-col bg-card border border-border/40 rounded-2xl overflow-hidden transition-all duration-300",
            "shadow-xl backdrop-blur-xl h-full",
            className
        )}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-secondary/5 cursor-pointer"
                onClick={toggleBetSlip}
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Wallet className="w-5 h-5 text-primary" />
                        {selections.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center animate-in zoom-in">
                                {selections.length}
                            </span>
                        )}
                    </div>
                    <span className="font-bold">Bet Slip</span>
                </div>
                <div className="flex items-center gap-2">
                    {selections.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); clearBetSlip(); }}
                            className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Clear
                        </Button>
                    )}
                    {isOpen ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    )}
                </div>
            </div>

            {/* Content */}
            {isOpen && (
                <>
                    {/* Selections List */}
                    <div className="flex-1 overflow-y-auto max-h-[calc(100vh-300px)]">
                        {selections.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center h-full">
                                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                                    <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
                                </div>
                                <p className="text-muted-foreground font-medium">No selections yet</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">
                                    Click Yes or No on a market to add
                                </p>
                            </div>
                        ) : (
                            <div className="p-3 space-y-3">
                                <AnimatePresence initial={false}>
                                    {selections.map(sel => (
                                        <motion.div
                                            key={sel.id}
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="relative bg-background/50 rounded-xl p-3 border border-border/30 overflow-hidden"
                                        >
                                            {/* Remove button */}
                                            <button
                                                onClick={() => removeFromBetSlip(sel.id)}
                                                className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>

                                            {/* Market Info */}
                                            <div className="pr-6 mb-3">
                                                <p className="text-sm font-medium line-clamp-2 leading-snug">
                                                    {sel.question}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={cn(
                                                        "text-xs font-bold px-2 py-0.5 rounded-full uppercase",
                                                        sel.outcome === 'yes'
                                                            ? "bg-green-500/10 text-green-500"
                                                            : "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {sel.outcome}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        @ {Math.round(sel.price * 100)}¢
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Amount Input */}
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                                    <input
                                                        type="number"
                                                        value={amounts[sel.id] || ''}
                                                        onChange={(e) => handleAmountChange(sel.id, e.target.value)}
                                                        placeholder="0.00"
                                                        className="w-full h-10 pl-7 pr-16 rounded-lg bg-background border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm font-medium transition-all"
                                                    />
                                                    <button
                                                        onClick={() => updateAmount(sel.id, balance || 0)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded uppercase"
                                                    >
                                                        Max
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Quick Amounts */}
                                            <div className="flex gap-1 mt-2">
                                                {[10, 25, 50, 100].map(amt => (
                                                    <button
                                                        key={amt}
                                                        onClick={() => handleQuickAmount(sel.id, amt)}
                                                        className="flex-1 h-7 px-1 text-[10px] font-medium rounded-md bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        +${amt}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Potential Payout */}
                                            {(amounts[sel.id] || 0) > 0 && (
                                                <div className="flex justify-between mt-3 pt-2 border-t border-border/30 text-xs animate-in fade-in slide-in-from-top-1">
                                                    <span className="text-muted-foreground">Potential payout</span>
                                                    <span className="font-bold text-green-500">
                                                        ${((amounts[sel.id] || 0) / sel.price).toFixed(2)}
                                                    </span>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Footer Summary */}
                    {selections.length > 0 && (
                        <div className="p-4 border-t border-border/30 bg-gradient-to-t from-background via-background/95 to-transparent space-y-3 z-10 glass-effect">
                            {/* Summary */}
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total stake</span>
                                    <span className="font-medium">${calculations.totalStake.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Potential payout</span>
                                    <span className="font-bold text-green-500">${calculations.potentialPayout.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t border-border/30 pt-1.5">
                                    <span className="text-muted-foreground">Potential profit</span>
                                    <span className="font-bold text-primary">${calculations.potentialProfit.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Balance warning */}
                            {calculations.totalStake > (balance || 0) && (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs animate-pulse">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>Insufficient balance. You have ${(balance || 0).toFixed(2)}</span>
                                </div>
                            )}

                            {/* Submit Button */}
                            <Button
                                className="w-full h-12 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                                disabled={!canSubmit || isSubmitting}
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Placing Bet...
                                    </span>
                                ) : (
                                    `Place Bet • $${calculations.totalStake.toFixed(2)}`
                                )}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default BetSlip;
