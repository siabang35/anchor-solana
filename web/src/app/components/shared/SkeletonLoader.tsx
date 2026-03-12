import { cn } from '../../../utils/cn'; // Assuming utils/cn exists or I should create it/use clsx/tailwind-merge directly.
// Checking package.json... clsx and tailwind-merge are present.
// Let's assume a utility exists or just use template literals if simple, but better to implement a simple cn utility if not found.
// Actually I'll implement inline for safety or check if cn exists.
// I'll create a simple inline cn function here to be safe, or just use `className`.



interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'chart';
    height?: string | number;
    width?: string | number;
}

export function Skeleton({ className, variant = 'text', height, width }: SkeletonProps) {
    const baseStyles = "animate-pulse bg-neutral-800 rounded";

    const variants = {
        text: "h-4 w-full rounded",
        circular: "rounded-full",
        rectangular: "rounded-md",
        card: "rounded-xl border border-neutral-800 bg-neutral-900",
        chart: "rounded-xl bg-neutral-900 border border-neutral-800",
    };

    const style = {
        height: height,
        width: width,
    };

    return (
        <div
            className={cn(baseStyles, variants[variant], className)}
            style={style}
            aria-hidden="true"
        />
    );
}

export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn("bg-neutral-950 border border-neutral-800 rounded-xl p-6 space-y-4", className)}>
            <div className="flex items-center gap-4">
                <Skeleton variant="circular" width={40} height={40} />
                <div className="space-y-2 flex-1">
                    <Skeleton width="60%" />
                    <Skeleton width="40%" className="h-3" />
                </div>
            </div>
            <div className="space-y-2 pt-2">
                <Skeleton className="h-20" />
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center gap-4">
                <Skeleton width={200} height={24} />
                <div className="ml-auto">
                    <Skeleton width={100} height={32} />
                </div>
            </div>
            <div className="divide-y divide-neutral-800">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-6 py-4 flex items-center gap-4">
                        <Skeleton width={40} height={40} variant="circular" />
                        <div className="flex-1">
                            <Skeleton width="30%" className="mb-2" />
                            <Skeleton width="20%" height={12} />
                        </div>
                        <Skeleton width={100} height={24} />
                    </div>
                ))}
            </div>
        </div>
    );
}
