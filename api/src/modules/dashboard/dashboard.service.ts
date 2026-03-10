import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { UsersService } from '../users/users.service';

interface WalletRow {
    address: string;
    chain: string;
    is_primary: boolean;
}

/**
 * Dashboard Service
 * Provides dashboard data and statistics
 */
@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly usersService: UsersService,
    ) { }

    /**
     * Get dashboard overview data
     */
    async getDashboardData(userId: string) {
        const [profile, wallets, stats] = await Promise.all([
            this.usersService.findById(userId),
            this.usersService.getWalletAddresses(userId),
            this.getUserStats(userId),
        ]);

        return {
            user: {
                id: userId,
                email: profile?.email,
                fullName: profile?.full_name,
                avatarUrl: profile?.avatar_url,
                createdAt: profile?.created_at,
            },
            wallets: wallets.map((w: WalletRow) => ({
                address: w.address,
                chain: w.chain,
                isPrimary: w.is_primary,
            })),
            stats,
            notifications: [], // Placeholder for notifications
        };
    }

    /**
     * Get user statistics
     */
    async getUserStats(_userId: string) {
        // Placeholder - implement real stats from predictions/markets tables
        return {
            totalPredictions: 0,
            winRate: 0,
            totalWinnings: 0,
            activePredictions: 0,
            portfolioValue: 0,
            rank: null,
        };
    }

    /**
     * Get recent user activity
     */
    async getRecentActivity(_userId: string) {
        // Placeholder - implement when predictions table exists
        return {
            activities: [],
            hasMore: false,
        };
    }

    /**
     * Get user portfolio/positions
     */
    async getPortfolio(_userId: string) {
        // Placeholder - implement when predictions/markets exist
        return {
            positions: [],
            totalValue: 0,
            unrealizedPnL: 0,
            realizedPnL: 0,
        };
    }
}
