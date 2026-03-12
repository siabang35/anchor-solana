/**
 * Sports Loading Skeleton Components
 * 
 * Professional loading states for sports AI agent competition interface.
 * Provides visual feedback during data loading.
 */

import React from 'react';
import { cn } from './ui/utils';

interface SkeletonProps {
    className?: string;
}

/**
 * Base skeleton element
 */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-muted/50",
                className
            )}
        />
    );
}

/**
 * Sports Card Skeleton
 */
export function SportsCardSkeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "bg-card border border-border/40 rounded-xl p-4 animate-pulse",
                className
            )}
        >
            {/* Header - League & Status */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-5 h-5 rounded-full" />
                    <Skeleton className="w-24 h-3" />
                </div>
                <Skeleton className="w-16 h-5 rounded-full" />
            </div>

            {/* Teams */}
            <div className="flex justify-between items-center mb-4">
                {/* Home Team */}
                <div className="flex flex-col items-center gap-2 flex-1">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <Skeleton className="w-20 h-3" />
                    <Skeleton className="w-8 h-6" />
                </div>

                {/* VS */}
                <div className="text-muted-foreground/30">
                    <Skeleton className="w-8 h-4" />
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-2 flex-1">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <Skeleton className="w-20 h-3" />
                    <Skeleton className="w-8 h-6" />
                </div>
            </div>

            {/* Question */}
            <div className="text-center mb-4">
                <Skeleton className="w-3/4 h-4 mx-auto mb-2" />
                <Skeleton className="w-1/2 h-3 mx-auto" />
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/40">
                <Skeleton className="w-20 h-3" />
                <Skeleton className="w-24 h-3" />
            </div>
        </div>
    );
}

/**
 * Sports Ticker Skeleton
 */
export function SportsTickerSkeleton() {
    return (
        <div className="flex gap-4 overflow-hidden py-3 px-2 bg-card/50 rounded-lg border border-border/40 mb-6">
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 min-w-[200px] p-2 rounded-lg bg-muted/30"
                >
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1">
                        <Skeleton className="w-full h-3 mb-1" />
                        <Skeleton className="w-2/3 h-2" />
                    </div>
                    <Skeleton className="w-12 h-6 rounded" />
                </div>
            ))}
        </div>
    );
}

/**
 * Sports Sidebar Skeleton
 */
export function SportsSidebarSkeleton() {
    return (
        <aside className="w-64 hidden md:block flex-shrink-0">
            <div className="bg-card border border-border/40 rounded-xl p-4">
                <Skeleton className="w-24 h-4 mb-4" />
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                            <Skeleton className="w-6 h-6 rounded" />
                            <Skeleton className="w-20 h-3" />
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}

/**
 * Bet Slip Skeleton
 */
export function BetSlipSkeleton() {
    return (
        <div className="bg-card border border-border/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="w-20 h-5" />
                <Skeleton className="w-6 h-6 rounded-full" />
            </div>

            <div className="space-y-3 mb-4">
                {[1, 2].map((i) => (
                    <div key={i} className="p-3 bg-muted/30 rounded-lg">
                        <Skeleton className="w-full h-3 mb-2" />
                        <div className="flex justify-between">
                            <Skeleton className="w-12 h-4" />
                            <Skeleton className="w-16 h-4" />
                        </div>
                    </div>
                ))}
            </div>

            <Skeleton className="w-full h-10 rounded-lg" />
        </div>
    );
}

/**
 * Full page sports skeleton
 */
export function SportsPageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-6 max-w-[1800px]">
            {/* Ticker */}
            <SportsTickerSkeleton />

            <div className="flex gap-6">
                {/* Left Sidebar */}
                <SportsSidebarSkeleton />

                {/* Main Content */}
                <main className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <Skeleton className="w-48 h-8 mb-2" />
                            <Skeleton className="w-32 h-4" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="w-20 h-9 rounded-lg" />
                            <Skeleton className="w-9 h-9 rounded-lg" />
                        </div>
                    </div>

                    {/* Featured Section */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                            <Skeleton className="w-5 h-5 rounded" />
                            <Skeleton className="w-28 h-5" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <SportsCardSkeleton key={i} />
                            ))}
                        </div>
                    </div>

                    {/* League Section */}
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <Skeleton className="w-6 h-6 rounded-full" />
                            <Skeleton className="w-32 h-5" />
                            <Skeleton className="w-16 h-4 rounded-full" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <SportsCardSkeleton key={i} />
                            ))}
                        </div>
                    </div>
                </main>

                {/* Right Sidebar - Bet Slip */}
                <aside className="w-80 hidden xl:block flex-shrink-0">
                    <div className="sticky top-24">
                        <BetSlipSkeleton />
                    </div>
                </aside>
            </div>
        </div>
    );
}

/**
 * Inline loading indicator
 */
export function LoadingSpinner({ className }: SkeletonProps) {
    return (
        <div className={cn("flex items-center justify-center", className)}>
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
    );
}

/**
 * Error state with retry button
 */
interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({ message = "Failed to load data", onRetry }: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-muted-foreground mb-4">{message}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                    Try Again
                </button>
            )}
        </div>
    );
}

/**
 * Empty state
 */
interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

export function EmptyState({
    title = "No data found",
    description,
    icon,
    action
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-accent/20 rounded-2xl border border-border/40">
            {icon && (
                <div className="mb-4 opacity-30">
                    {icon}
                </div>
            )}
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            {description && (
                <p className="text-muted-foreground text-sm mb-4 max-w-md">{description}</p>
            )}
            {action}
        </div>
    );
}

export default SportsCardSkeleton;
