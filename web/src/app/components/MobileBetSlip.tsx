/**
 * Mobile Bet Slip - Bottom Sheet Style
 * 
 * Floating bottom bar that expands into full bet slip:
 * - Sticky footer on mobile with selection count
 * - Swipe up to expand
 * - Full bet management in expanded view
 */

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { BetSlip } from './BetSlip';
import { useBetSlip } from '../contexts/BetSlipContext';

export function MobileBetSlip() {
    const { selections, isOpen, openBetSlip, closeBetSlip } = useBetSlip();
    const [isVisible, setIsVisible] = useState(false);

    // Show/hide based on selections
    useEffect(() => {
        if (selections.length > 0) {
            setIsVisible(true);
        } else {
            // Delay hiding for animation
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [selections.length]);

    if (!isVisible && selections.length === 0) return null;

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[45] lg:hidden animate-in fade-in-0 duration-200 backdrop-blur-sm"
                    onClick={closeBetSlip}
                />
            )}

            {/* Bottom Sheet */}
            <div
                className={cn(
                    "fixed left-0 right-0 z-[50] lg:hidden transition-all duration-300 ease-out",
                    isOpen
                        ? "bottom-0 top-[15vh]"
                        : selections.length > 0
                            ? "bottom-20" // Sit above MobileBottomNav (which is usually h-[5rem] approx 80px)
                            : "-bottom-24"
                )}
            >
                {/* Collapsed Bar */}
                {!isOpen && selections.length > 0 && (
                    <div
                        className="mx-4 mb-2 bg-gradient-to-r from-primary to-primary/90 rounded-2xl shadow-xl shadow-primary/20 cursor-pointer border border-primary/20 backdrop-blur-md"
                        onClick={openBetSlip}
                    >
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                        <Zap className="w-5 h-5 text-white fill-current" />
                                    </div>
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-primary rounded-full text-xs font-bold flex items-center justify-center shadow">
                                        {selections.length}
                                    </span>
                                </div>
                                <div className="text-white">
                                    <p className="text-sm font-bold">{selections.length} Selection{selections.length > 1 ? 's' : ''}</p>
                                    <p className="text-xs opacity-80">Tap to view & place bet</p>
                                </div>
                            </div>
                            <ChevronUp className="w-6 h-6 text-white/80" />
                        </div>
                    </div>
                )}

                {/* Expanded Sheet */}
                {isOpen && (
                    <div className="h-full bg-card rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 duration-300 border-t border-border/40">
                        {/* Handle Bar */}
                        <div
                            className="flex justify-center pt-3 pb-2 cursor-pointer"
                            onClick={closeBetSlip}
                        >
                            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pb-3 border-b border-border/30">
                            <h3 className="text-lg font-bold">Your Bet Slip</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={closeBetSlip}
                                className="h-8 w-8 rounded-full hover:bg-secondary"
                            >
                                <ChevronDown className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Bet Slip Content */}
                        <div className="flex-1 overflow-hidden h-full">
                            <BetSlip className="border-0 rounded-none shadow-none h-full bg-transparent" />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default MobileBetSlip;
