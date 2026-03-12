import React from 'react';
import { cn } from '../ui/utils';

interface SocialButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    children: React.ReactNode;
    variant?: 'outline' | 'solid';
}

export function SocialButton({ icon, children, className, variant = 'outline', ...props }: SocialButtonProps) {
    return (
        <button
            className={cn(
                "relative flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200 outline-none focus:ring-2 focus:ring-primary/20 disabled:scale-100 disabled:opacity-50",
                variant === 'outline'
                    ? "border border-border/40 bg-card hover:bg-accent/40 active:scale-[0.98] text-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
                className
            )}
            {...props}
        >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
                {icon}
            </span>
            <span>{children}</span>
        </button>
    );
}
