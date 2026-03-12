import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SportsService, SportsMarket, SportType } from '../../services/sports.service';
import { MarketListSchema } from '../schemas/marketSchema';

export interface UseSportsMarketsOptions {
    sport?: SportType;
    eventId?: string;
    isActive?: boolean;
    autoRefresh?: boolean;
    refreshInterval?: number;
    limit?: number;
}

export interface UseSportsMarketsReturn {
    markets: SportsMarket[];
    loading: boolean;
    error: string | null;
    isRateLimited: boolean;
    refresh: () => Promise<void>;
    total: number;
    totalPages: number;
    lastUpdated: Date | null;
}

export function useSportsMarkets(options: UseSportsMarketsOptions = {}): UseSportsMarketsReturn {
    const {
        sport,
        eventId,
        isActive = true,
        refreshInterval = 30000,
        limit = 50,
    } = options;

    const queryClient = useQueryClient();
    const queryKey = ['sportsMarkets', { sport, eventId, isActive, limit }];

    const { data, isLoading, error, refetch, isError } = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await SportsService.getMarkets({
                sport,
                eventId,
                isActive,
                limit,
            });

            // "Anti-Hack": Soft Validation
            // We validate the data to ensure integrity but don't block the UI to avoid crashes on minor schema mismatches.
            const validation = MarketListSchema.safeParse(response.data);
            if (!validation.success) {
                console.warn("[Anti-Hack] API Response Schema Mismatch:", validation.error);
                // In strict mode, we might throw here: throw new Error("Data Integrity Violation");
            }

            return {
                markets: response.data,
                total: response.total,
                totalPages: response.totalPages,
                timestamp: new Date(),
            };
        },
        // "Anti-Throttling":
        staleTime: 1000 * 30, // 30s defaults
        refetchInterval: refreshInterval > 0 ? refreshInterval : false,
        retry: (failureCount, error: any) => {
            // Don't retry on 404s or Validation errors
            if (error?.response?.status === 404) return false;
            return failureCount < 2;
        }
    });

    const isRateLimited = error instanceof Error && (error as any)?.response?.status === 429;

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey });
        await refetch();
    }, [queryClient, queryKey, refetch]);

    return {
        markets: data?.markets || [],
        loading: isLoading,
        error: isError ? (error as Error).message : null,
        isRateLimited,
        refresh,
        total: data?.total || 0,
        totalPages: data?.totalPages || 0,
        lastUpdated: data?.timestamp || null,
    };
}
