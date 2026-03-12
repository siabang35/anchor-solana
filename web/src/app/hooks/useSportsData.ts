/**
 * useSportsData Hook
 * 
 * React hook for fetching and managing sports data.
 * Provides state management for events, leagues, and real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    SportsService,
    SportsEvent,
    SportsLeague,
    SportType,
    SPORT_CATEGORIES,
} from '../../services/sports.service';

export interface UseSportsDataOptions {
    sport?: SportType;
    autoRefresh?: boolean;
    refreshInterval?: number; // in ms
    initialFetch?: boolean;
}

export interface UseSportsDataReturn {
    // Data
    events: SportsEvent[];
    liveEvents: SportsEvent[];
    upcomingEvents: SportsEvent[];
    leagues: SportsLeague[];

    // State
    loading: boolean;
    error: string | null;

    // Actions
    refresh: () => Promise<void>;
    setActiveSport: (sport: SportType | undefined) => void;

    // Meta
    activeSport: SportType | undefined;
    lastUpdated: Date | null;
}

export function useSportsData(options: UseSportsDataOptions = {}): UseSportsDataReturn {
    const {
        sport: initialSport,
        autoRefresh = false,
        refreshInterval = 30000, // 30 seconds
        initialFetch = true,
    } = options;

    const [events, setEvents] = useState<SportsEvent[]>([]);
    const [liveEvents, setLiveEvents] = useState<SportsEvent[]>([]);
    const [upcomingEvents, setUpcomingEvents] = useState<SportsEvent[]>([]);
    const [leagues, setLeagues] = useState<SportsLeague[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSport, setActiveSport] = useState<SportType | undefined>(initialSport);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        try {
            const [
                eventsResponse,
                liveResponse,
                upcomingResponse,
                leaguesResponse,
            ] = await Promise.all([
                SportsService.getEvents({
                    sport: activeSport,
                    limit: 50,
                    sortBy: 'startTime',
                    sortOrder: 'asc',
                }),
                SportsService.getLiveEvents(activeSport),
                SportsService.getUpcomingEvents(activeSport, 20),
                SportsService.getLeagues({ sport: activeSport, limit: 50 }),
            ]);

            setEvents(eventsResponse.data);
            setLiveEvents(liveResponse);
            setUpcomingEvents(upcomingResponse);
            setLeagues(leaguesResponse.data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch sports data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load sports data');
        } finally {
            setLoading(false);
        }
    }, [activeSport]);

    const refresh = useCallback(async () => {
        await fetchData(true); // Silent refresh
    }, [fetchData]);

    // Initial fetch
    useEffect(() => {
        if (initialFetch) {
            fetchData();
        }
    }, [fetchData, initialFetch]);

    // Refetch when sport changes
    useEffect(() => {
        fetchData();
    }, [activeSport, fetchData]);

    // Auto-refresh
    useEffect(() => {
        if (autoRefresh && refreshInterval > 0) {
            intervalRef.current = setInterval(() => {
                fetchData(true);
            }, refreshInterval);

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
            };
        }
    }, [autoRefresh, refreshInterval, fetchData]);

    return {
        events,
        liveEvents,
        upcomingEvents,
        leagues,
        loading,
        error,
        refresh,
        setActiveSport,
        activeSport,
        lastUpdated,
    };
}

// ========================
// Additional Hooks
// ========================

/**
 * Hook for live events with auto-refresh
 */
export function useLiveEvents(sport?: SportType, refreshInterval = 10000) {
    const [events, setEvents] = useState<SportsEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLive = useCallback(async () => {
        try {
            const data = await SportsService.getLiveEvents(sport);
            setEvents(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load live events');
        } finally {
            setLoading(false);
        }
    }, [sport]);

    useEffect(() => {
        fetchLive();
        const interval = setInterval(fetchLive, refreshInterval);
        return () => clearInterval(interval);
    }, [fetchLive, refreshInterval]);

    return { events, loading, error, refresh: fetchLive };
}

/**
 * Hook for a single event
 */
export function useSportsEvent(eventId: string | undefined) {
    const [event, setEvent] = useState<SportsEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!eventId) {
            setEvent(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        SportsService.getEvent(eventId)
            .then(setEvent)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [eventId]);

    return { event, loading, error };
}

/**
 * Hook for sport categories
 */
export function useSportCategories() {
    // Use static categories for now
    return {
        categories: SPORT_CATEGORIES,
        loading: false,
        error: null,
    };
}

export default useSportsData;
