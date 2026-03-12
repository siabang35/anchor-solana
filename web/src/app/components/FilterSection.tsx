import { Search, SlidersHorizontal, LayoutGrid, List, Sparkles } from "lucide-react";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";

interface FilterSectionProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function FilterSection({ searchQuery, onSearchChange }: FilterSectionProps) {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const handleToggleAnimations = useCallback(() => {
    setAnimationsEnabled(prev => !prev);
  }, []);

  const handleViewModeChange = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
  }, []);

  return (
    <div className="sticky top-0 z-30 pt-4 pb-2 bg-background/80 backdrop-blur-xl border-b border-white/5 supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Left: Search & Filter */}
          <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-2xl">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 bg-secondary/50 border border-transparent focus:border-primary/20 focus:bg-background rounded-xl text-sm placeholder:text-muted-foreground/70 transition-all duration-200 outline-none shadow-sm group-hover:bg-secondary/70"
                placeholder="Search markets, events, or categories..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>

            <button className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 hover:bg-secondary rounded-xl transition-all duration-200 border border-transparent hover:border-border/50 text-sm font-medium">
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Animations Toggle */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleAnimations}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${animationsEnabled
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-transparent border-transparent text-muted-foreground hover:bg-accent"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">FX {animationsEnabled ? 'On' : 'Off'}</span>
            </motion.button>

            <div className="h-6 w-px bg-border/50 hidden sm:block" />

            {/* View Mode */}
            <div className="flex p-1 bg-secondary/50 rounded-lg">
              <button
                onClick={() => handleViewModeChange("grid")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleViewModeChange("list")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Sort */}
            <select className="bg-transparent text-sm font-medium outline-none cursor-pointer hover:text-primary transition-colors">
              <option>Trending</option>
              <option>Newest</option>
              <option>Ending Soon</option>
              <option>High Volume</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}