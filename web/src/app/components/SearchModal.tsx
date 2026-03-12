"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
    Search,
    X,
    Sparkles,
    TrendingUp,
    Timer,
    Bitcoin,
    Landmark,
    Dumbbell,
    Banknote,
    Laptop,
} from "lucide-react";

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Quick access topics
const QUICK_TOPICS = [
    { id: "crypto", label: "Crypto", icon: Bitcoin },
    { id: "politics", label: "Politics", icon: Landmark },
    { id: "sports", label: "Sports", icon: Dumbbell },
    { id: "finance", label: "Finance", icon: Banknote },
    { id: "tech", label: "Tech", icon: Laptop },
];

// Browse filters
const QUICK_FILTERS = [
    { id: "new", label: "New", icon: Sparkles },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "ending_soon", label: "Ending Soon", icon: Timer },
];

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery("");
        }
    }, [isOpen]);

    // Handle search - navigate to search page
    const handleSearch = useCallback(() => {
        navigate(`/search${searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : ''}`);
        onClose();
    }, [searchQuery, navigate, onClose]);

    // Handle topic click
    const handleTopicClick = (topicId: string) => {
        navigate(`/search?category=${topicId}`);
        onClose();
    };

    // Handle filter click - navigate to search with filter
    const handleFilterClick = (filterId: string) => {
        navigate(`/search?filter=${filterId}`);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal - Smaller size */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[101] w-full max-w-lg mx-4"
                    >
                        <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                            {/* Search Input */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    placeholder="Search markets, events, topics..."
                                    className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/60"
                                />
                                <button
                                    onClick={onClose}
                                    className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Quick Content */}
                            <div className="p-4">
                                {/* Quick Filters */}
                                <div className="mb-4">
                                    <div className="flex flex-wrap gap-2">
                                        {QUICK_FILTERS.map((filter) => {
                                            const Icon = filter.icon;
                                            return (
                                                <button
                                                    key={filter.id}
                                                    onClick={() => handleFilterClick(filter.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                                                >
                                                    <Icon className="w-3 h-3" />
                                                    {filter.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Quick Topics */}
                                <div>
                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Topics</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {QUICK_TOPICS.map((topic) => {
                                            const Icon = topic.icon;
                                            return (
                                                <button
                                                    key={topic.id}
                                                    onClick={() => handleTopicClick(topic.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/50 text-foreground hover:bg-accent transition-colors"
                                                >
                                                    <Icon className="w-3 h-3" />
                                                    {topic.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>Press <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Enter</kbd> to search</span>
                                <span><kbd className="px-1 py-0.5 bg-secondary rounded font-mono">ESC</kbd> to close</span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
