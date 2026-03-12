import React from 'react';
import { cn } from '../ui/utils';
import { ChevronRight, Download } from 'lucide-react';

interface WalletOptionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    name: string;
    recommended?: boolean;
    /** Whether the wallet is installed/available */
    installed?: boolean;
    /** Whether the user is on a mobile device */
    isMobile?: boolean;
}

export function WalletOption({ icon, name, recommended, installed = true, isMobile = false, className, ...props }: WalletOptionProps) {
    const showInstall = !installed && !isMobile;
    const isClickable = installed || isMobile;

    return (
        <button
            className={cn(
                "group relative flex w-full items-center justify-center sm:justify-start gap-3 rounded-xl border border-border/40 bg-card/50 p-2 sm:p-3 transition-all duration-200 hover:bg-accent/40 hover:border-border active:scale-[0.98] outline-none focus:ring-2 focus:ring-primary/20 overflow-hidden",
                !isClickable && "opacity-75",
                className
            )}
            {...props}
        >
            <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/50 transition-transform group-hover:scale-110">
                <span className="w-6 h-6">{icon}</span>
            </div>

            <div className="hidden sm:flex flex-1 flex-col items-start gap-0.5 min-w-0">
                <span className="font-medium text-sm text-foreground truncate w-full text-left">{name}</span>
                <div className="flex items-center gap-1.5 w-full">
                    {recommended && (
                        <span className="text-[10px] uppercase font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">Recommended</span>
                    )}
                    {showInstall && (
                        <span className="text-[10px] uppercase font-bold text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap">
                            <Download className="w-2.5 h-2.5" />
                            Install
                        </span>
                    )}
                </div>
            </div>

            <ChevronRight className="hidden sm:block flex-shrink-0 w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
    );
}

