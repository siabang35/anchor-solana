import { CATEGORIES } from "../utils/mockData";
import { motion } from "motion/react";
import { useRef, useEffect } from "react";

interface CategoryNavProps {
    activeCategory: string;
    onSelectCategory: (id: string) => void;
}

export function CategoryNav({ activeCategory, onSelectCategory }: CategoryNavProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to active element
    useEffect(() => {
        if (scrollRef.current) {
            const activeEl = scrollRef.current.querySelector<HTMLElement>(`[data-active="true"]`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
        }
    }, [activeCategory]);

    return (
        <div className="sticky top-[64px] z-40 bg-background/80 backdrop-blur-md border-b border-border/40 supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4">
                <div
                    ref={scrollRef}
                    className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-3 mask-linear-fade lg:pl-24"
                >
                    {CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = activeCategory === cat.id;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => onSelectCategory(cat.id)}
                                data-active={isActive}
                                className={`
                                    relative flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all duration-300
                                    ${isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}
                                `}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="category-pill"
                                        className="absolute inset-0 bg-primary rounded-full -z-10 shadow-sm"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <Icon className={`w-4 h-4 z-10 relative ${isActive ? "text-primary-foreground" : ""}`} />
                                <span className="z-10 relative">{cat.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
