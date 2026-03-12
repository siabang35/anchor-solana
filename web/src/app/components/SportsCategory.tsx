import { useState } from 'react';
import { SportsSidebar, sportsCategories } from './SportsSidebar';
import { SportsTicker } from './SportsTicker';
import { SportsCard } from './SportsCard';
import { SportsMarketCreationModal } from './SportsMarketCreationModal';
import { Loader2, Calendar, RefreshCcw, Plus } from 'lucide-react';
import { cn } from './ui/utils';
import { Button } from './ui/button';
import useSportsData from '../hooks/useSportsData';
import { useSportsRealtime } from '../hooks/useSportsRealtime';
import { SportType, SportsEvent } from '../../services/sports.service';

export default function SportsCategory() {
    const [activeSport, setActiveSport] = useState<SportType | 'live'>('live');

    const {
        events: sportEvents, // Rename to avoid confusion
        liveEvents,
        loading,
        error,
        refresh,
        lastUpdated
    } = useSportsData({
        sport: activeSport === 'live' ? undefined : activeSport,
        autoRefresh: true,
        refreshInterval: 60000
    });

    // Determines which events to show
    const events = activeSport === 'live' ? liveEvents : sportEvents;

    // Enable real-time updates
    const { } = useSportsRealtime({
        activeSport: activeSport === 'live' ? undefined : activeSport,
        onEventUpdate: (updatedEvent) => {
            // In a real app we'd merge this into the events list
            // For now rely on auto-refresh or add manual merge logic
            console.log('Real-time update:', updatedEvent.id);
            refresh();
        }
    });

    // Market creation state
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<SportsEvent | null>(null);

    const handleCreateMarket = (event: SportsEvent) => {
        setSelectedEvent(event);
        setCreateModalOpen(true);
    };

    // Filter events based on active sport (Frontend filtering for smoother UX)
    // The hook handles API filtering, but we can do extra here if needed

    // Group events by league
    const groupedEvents = events.reduce((acc, event) => {
        const leagueName = event.league?.name || event.metadata?.leagueName || 'Other';
        if (!acc[leagueName]) acc[leagueName] = [];
        acc[leagueName].push(event);
        return acc;
    }, {} as Record<string, SportsEvent[]>);

    return (
        <div className="container mx-auto px-4 py-6 max-w-[1600px]">
            {/* Ticker Section - Full Width */}
            <SportsTicker />

            <div className="flex gap-6">
                {/* Left Sidebar (Desktop) */}
                <SportsSidebar activeSport={activeSport} onSelectSport={(id) => setActiveSport(id as SportType | 'live')} />

                {/* Main Content Area */}
                <main className="flex-1 min-w-0">
                    {/* Mobile Category Selector */}
                    <div className="md:hidden overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide flex gap-2 sticky top-[60px] z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 mb-4">
                        {sportsCategories.map((sport) => {
                            const isActive = activeSport === sport.id;
                            return (
                                <button
                                    key={sport.id}
                                    onClick={() => setActiveSport(sport.id as SportType)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                                        isActive
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                            : "bg-secondary/50 text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground"
                                    )}
                                >
                                    <span className="text-base">{sport.emoji}</span>
                                    {sport.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-bold mb-1 capitalize flex items-center gap-2">
                                {activeSport === 'live' ? <span className="flex w-3 h-3 rounded-full bg-red-500 animate-pulse" /> : null}
                                {activeSport === 'live' ? 'Live Events' : activeSport || 'All Sports'}
                            </h1>
                            <p className="text-muted-foreground flex items-center gap-2 text-sm">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                {lastUpdated && (
                                    <span className="text-xs ml-2 opacity-70">
                                        Updated {lastUpdated.toLocaleTimeString()}
                                    </span>
                                )}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => refresh()}>
                            <RefreshCcw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </Button>
                    </div>

                    {loading && events.length === 0 ? (
                        <div className="flex h-[40vh] items-center justify-center">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-destructive/5 rounded-xl border border-destructive/20 text-destructive">
                            <p className="mb-2 font-medium">Unable to load sports data</p>
                            <Button variant="outline" size="sm" onClick={() => refresh()}>Try Again</Button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {Object.entries(groupedEvents).map(([league, leagueEvents]) => (
                                <div key={league} className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        {leagueEvents[0].league?.logoUrl && (
                                            <img src={leagueEvents[0].league.logoUrl} alt={league} className="w-6 h-6 object-contain" />
                                        )}
                                        <h2 className="font-bold text-lg">{league}</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {leagueEvents.map(event => (
                                            <div key={event.id} className="relative group">
                                                <SportsCard market={{
                                                    id: event.id,
                                                    marketType: 'binary',
                                                    question: `${event.homeTeam?.name || event.metadata?.homeTeamName} vs ${event.awayTeam?.name || event.metadata?.awayTeamName}`,
                                                    outcomes: ['Win', 'Lose'], // Simplified for event view
                                                    outcomePrices: ['0.50', '0.50'], // Default/Placeholder
                                                    volume: '0',
                                                    liquidity: '0',
                                                    image: event.homeTeam?.logoUrl,
                                                    endDate: event.startTime,
                                                    active: event.status === 'live',
                                                    sport: event.sport,
                                                    groupItemTitle: event.statusDetail || new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                }} />

                                                {/* Admin/Creator Action Overlay */}
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="sm"
                                                        className="h-7 text-xs bg-primary/90 hover:bg-primary shadow-lg"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            handleCreateMarket(event);
                                                        }}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" />
                                                        Market
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {events.length === 0 && (
                                <div className="text-center py-20 text-muted-foreground bg-accent/20 rounded-xl border border-border/40">
                                    <p>No events found for {activeSport || 'this category'}.</p>
                                    <Button variant="link" onClick={() => setActiveSport('live')}>Check Live Events</Button>
                                </div>
                            )}
                        </div>
                    )}
                </main>

                {/* Right Sidebar (Bet Slip / Mini View) */}
                <aside className="w-80 hidden xl:block flex-shrink-0">
                    <div className="rounded-xl border border-border/40 bg-card p-4 h-full min-h-[500px] sticky top-24">
                        <div className="flex items-center justify-between mb-4">
                            <span className="font-bold">Bet Slip</span>
                            <span className="text-xs text-muted-foreground">0 selections</span>
                        </div>
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm border-2 border-dashed border-border/40 rounded-lg bg-accent/10">
                            <p>Select a market outcome</p>
                            <p className="text-xs opacity-70 mt-1">to add to your bet slip</p>
                        </div>
                    </div>
                </aside>
            </div>

            <SportsMarketCreationModal
                event={selectedEvent}
                open={createModalOpen}
                onOpenChange={setCreateModalOpen}
                onSuccess={() => {
                    refresh();
                    // Show success toast
                }}
            />
        </div>
    );
}
