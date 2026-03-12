import { motion } from "motion/react";
import { useRef, useEffect } from "react";

interface FilterOption {
    id: string;
    label: string;
}

interface PoliticsFilterProps {
    activeFilter: string;
    onSelectFilter: (id: string) => void;
}

const POLITICS_FILTERS: FilterOption[] = [
    { id: "all", label: "All" },
    { id: "us_elections", label: "US Elections" },
    { id: "primaries", label: "Primaries" },
    { id: "trump", label: "Trump" },
    { id: "foreign", label: "Foreign Elections" },
    { id: "international", label: "International" },
    { id: "house", label: "House" },
    { id: "congress", label: "Congress" },
    { id: "scotus", label: "SCOTUS & Courts" },
    { id: "local", label: "Local" },
    { id: "recurring", label: "Recurring" },
];

export function PoliticsFilter({ activeFilter, onSelectFilter }: PoliticsFilterProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to active element
    useEffect(() => {
        //  // Only scroll if not fully visible? simpler to just always scroll into view nicely
        if (scrollRef.current) {
            const activeEl = scrollRef.current.querySelector<HTMLElement>(`[data-active="true"]`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
        }
    }, [activeFilter]);

    return (
        <div className="w-full border-b border-border/40 bg-background/50 backdrop-blur-md sticky top-[64px] z-30">
            <div className="container mx-auto px-4 max-w-[1600px]">
                <div
                    ref={scrollRef}
                    className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-3 mask-linear-fade pr-12"
                >
                    {/* Generic "Sort / Filter" Button (Visual only for now matching ref) */}
                    {/* <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/30 text-xs font-medium border border-border/50 text-muted-foreground whitespace-nowrap mr-2">
                        Sort / Filter
                     </button> */}

                    {POLITICS_FILTERS.map((filter) => {
                        const isActive = activeFilter === filter.id;
                        return (
                            <button
                                key={filter.id}
                                onClick={() => onSelectFilter(filter.id)}
                                data-active={isActive}
                                className={`
                                    relative flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200
                                    ${isActive
                                        ? "text-primary-foreground font-semibold"
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent hover:border-border/50"
                                    }
                                `}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="politics-filter-pill"
                                        className="absolute inset-0 bg-primary/90 rounded-full shadow-sm -z-10"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                {filter.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
