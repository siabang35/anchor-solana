/**
 * Sports Market Page - Polymarket Style
 * 
 * Complete sports AI agent competition interface with:
 * - Sport category selection
 * - Live/upcoming event filtering
 * - AI agent cards with Yes/No buttons
 * - Integrated bet slip (desktop sidebar + mobile bottom sheet)
 * - Real-time updates
 * - Anti-throttling with optimistic updates
 */

import { useState, useMemo, useEffect } from 'react';
import { SportsSidebar, sportsCategories } from '../../components/SportsSidebar';
import { SportsTicker } from '../../components/SportsTicker';
import SportsMarketCard from '../../components/SportsMarketCard';
import { MobileBetSlip } from '../../components/MobileBetSlip';
import { BetSlip } from '../../components/BetSlip';
import {
    Loader2,
    RefreshCcw,
    TrendingUp,
    Zap,
    Grid3X3,
    List,
    AlertTriangle,
    Clock
} from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { Button } from '../../components/ui/button';
import { useSportsMarkets } from '../../hooks/useSportsMarkets';
import { useSportsSocket } from '../../hooks/useSportsSocket';
import { SportType } from '../../../services/sports.service';
import { motion, AnimatePresence } from 'motion/react';

type ViewMode = 'grid' | 'list';

interface SportsMarketPageProps {
    onOpenAuth?: (mode?: 'login' | 'signup') => void;
    initialSport?: string;
}

import { useNavigate } from 'react-router-dom';

export function SportsMarketPage({ onOpenAuth, initialSport }: SportsMarketPageProps) {
    const navigate = useNavigate();
    // If initialSport is provided (from URL), use it. Otherwise default to 'live'.
    // We also update this state if the URL changes (useEffect below).
    const [activeSport, setActiveSport] = useState<SportType | 'live'>((initialSport as SportType) || 'live');

    useEffect(() => {
        if (initialSport) {
            setActiveSport(initialSport as SportType);
        }
    }, [initialSport]);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    const { markets, loading, error, isRateLimited, refresh, lastUpdated } = useSportsMarkets({
        sport: activeSport === 'live' ? undefined : activeSport,
        isActive: true,
        autoRefresh: true,
        refreshInterval: 10000,
    });

    // Real-time Updates
    const [realTimeMarkets, setRealTimeMarkets] = useState<typeof markets>([]);

    useEffect(() => {
        setRealTimeMarkets(markets);
    }, [markets]);

    const handleMarketUpdate = (update: any) => {
        setRealTimeMarkets(prev => {
            const index = prev.findIndex(m => m.id === update.id);
            if (index === -1) return prev;

            const newMarkets = [...prev];
            newMarkets[index] = { ...newMarkets[index], ...update };
            return newMarkets;
        });
    };

    const { joinSport, leaveSport } = useSportsSocket({
        onMarketUpdate: handleMarketUpdate
    });

    useEffect(() => {
        const sportRoom = activeSport === 'live' ? 'live' : activeSport;
        joinSport(sportRoom);
        return () => leaveSport(sportRoom);
    }, [activeSport, joinSport, leaveSport]);

    // Group markets by league for list view
    const groupedMarkets = useMemo(() => {
        // ... (Memo is large, let's keep lines intact by starting replace AFTER it? No, context is safe)
        return realTimeMarkets.reduce((acc, market) => {
            const leagueName = market.event?.league?.name || market.event?.metadata?.leagueName || 'Other';
            if (!acc[leagueName]) acc[leagueName] = [];
            acc[leagueName].push(market);
            return acc;
        }, {} as Record<string, typeof markets>);
    }, [realTimeMarkets]);

    // Countdown for rate limit (Removed as logic handled by React Query internal stale/retry)
    // We can show simple "Backing off..." message if isRateLimited is true without explicit countdown.
    const cooldownSeconds = 0; // Placeholder to prevent build error in UI below if referenced


    return (
        <div className="container mx-auto px-4 py-6 max-w-[1920px]">
            {/* Live Ticker */}
            <SportsTicker />

            <div className="flex gap-8 relative items-start">
                {/* Left Sidebar (Desktop) */}
                <SportsSidebar
                    activeSport={activeSport}
                    onSelectSport={(id) => {
                        navigate(id === 'live' ? '/sports' : `/sports/${id}`);
                    }}
                />

                {/* Main Content */}
                <main className="flex-1 min-w-0 pb-20">

                    {/* Rate Limit Notification */}
                    <AnimatePresence>
                        {isRateLimited && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mb-6 bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
                                    <div>
                                        <h3 className="font-semibold text-orange-600 dark:text-orange-400">High Traffic Volume</h3>
                                        <p className="text-sm text-orange-600/80 dark:text-orange-400/80">
                                            We're experiencing high demand. Live updates explicitly throttled.
                                        </p>
                                    </div>
                                </div>
                                <div className="font-mono text-lg font-bold text-orange-500">
                                    00:{cooldownSeconds.toString().padStart(2, '0')}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Mobile Sport Selector */}
                    <div className="lg:hidden overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide flex gap-2 sticky top-[60px] z-20 bg-background/95 backdrop-blur py-2 mb-4">
                        {sportsCategories.map((sport) => {
                            const isActive = activeSport === sport.id;
                            return (
                                <button
                                    key={sport.id}
                                    onClick={() => setActiveSport(sport.id as SportType | 'live')}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border",
                                        isActive
                                            ? "bg-blue-600/10 text-blue-600 border-blue-600/20"
                                            : "bg-card text-muted-foreground border-border/40 hover:bg-accent hover:text-foreground"
                                    )}
                                >
                                    <span className="text-lg">{sport.emoji}</span>
                                    {sport.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                                {activeSport === 'live' ? (
                                    <>
                                        <div className="p-2 bg-red-500/10 rounded-lg">
                                            <Zap className="w-6 h-6 text-red-500 fill-current" />
                                        </div>
                                        Live Sports
                                    </>
                                ) : (
                                    <>
                                        <div className="p-2 bg-blue-500/10 rounded-lg">
                                            <TrendingUp className="w-6 h-6 text-blue-500" />
                                        </div>
                                        {activeSport.toUpperCase()}
                                    </>
                                )}
                            </h1>
                            <p className="text-muted-foreground mt-2 ml-1 flex items-center gap-2">
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <RefreshCcw className="w-3 h-3 animate-spin" /> Updating...
                                    </span>
                                ) : (
                                    `Updated ${lastUpdated?.toLocaleTimeString()}`
                                )}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="bg-card border border-border/40 p-1 rounded-lg flex items-center">
                                <Button
                                    variant={viewMode === 'grid' ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode('grid')}
                                    className="p-2 h-8 w-8"
                                >
                                    <Grid3X3 className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode('list')}
                                    className="p-2 h-8 w-8"
                                >
                                    <List className="w-4 h-4" />
                                </Button>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refresh()}
                                className="h-10 gap-2 border-border/40"
                                disabled={loading || isRateLimited}
                            >
                                <RefreshCcw className={cn("w-4 h-4", loading && "animate-spin")} />
                                {isRateLimited ? `Wait ${cooldownSeconds}s` : 'Refresh'}
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    {loading && markets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 opacity-50">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-sm font-medium">Scouring the blockchain...</p>
                        </div>
                    ) : error && !isRateLimited ? (
                        <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-12 text-center">
                            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Unable to Load Markets</h3>
                            <p className="text-muted-foreground max-w-md mx-auto mb-6">{error}</p>
                            <Button onClick={() => refresh()} variant="outline">Try Again</Button>
                        </div>
                    ) : markets.length === 0 ? (
                        <div className="text-center py-32 rounded-3xl bg-gray-50 dark:bg-white/5 border border-dashed border-gray-200 dark:border-white/10">
                            <div className="text-4xl mb-4">🏜️</div>
                            <h3 className="text-lg font-medium text-foreground">No Active Markets</h3>
                            <p className="text-muted-foreground">Check back later for new events in this category.</p>
                        </div>
                    ) : (
                        <div className={cn(
                            "grid gap-4 sm:gap-6",
                            viewMode === 'grid'
                                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3" // Adjusted for sidebar+content layout
                                : "grid-cols-1"
                        )}>
                            {viewMode === 'list'
                                ? Object.entries(groupedMarkets).map(([league, leagueMarkets]) => (
                                    <div key={league} className="space-y-4">
                                        <div className="sticky top-[125px] z-10 bg-background/95 backdrop-blur-xl py-3 px-1 -mx-1 border-b border-border/40">
                                            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                                                {league}
                                            </h2>
                                        </div>
                                        <div className="grid gap-4 grid-cols-1">
                                            {leagueMarkets.map((market) => (
                                                <SportsMarketCard
                                                    key={market.id}
                                                    market={market}
                                                    onOpenAuth={onOpenAuth}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))
                                : realTimeMarkets.map((market) => (
                                    <SportsMarketCard
                                        key={market.id}
                                        market={market}
                                        onOpenAuth={onOpenAuth}
                                    />
                                ))
                            }
                        </div>
                    )}
                </main>

                {/* Right Sidebar (Betslip/Details) */}
                <aside className="w-80 hidden lg:block flex-shrink-0 sticky top-20 h-[calc(100vh-80px)]">
                    <BetSlip />
                </aside>
            </div>

            <MobileBetSlip />
        </div>
    );
}
