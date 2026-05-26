import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import { UsersService } from '../users/users.service.js';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

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
     * Resolve userId from UUID or wallet address
     */
    private async resolveUserId(userIdOrWallet: string): Promise<string | null> {
        if (!userIdOrWallet) return null;
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(userIdOrWallet)) {
            return userIdOrWallet;
        }
        
        const profile = await this.usersService.findByWalletAddress(userIdOrWallet, 'solana');
        if (profile) return profile.id;
        
        return null;
    }

    /**
     * Get dashboard overview data
     */
    async getDashboardData(userIdOrWallet: string) {
        const userId = await this.resolveUserId(userIdOrWallet);
        if (!userId) return null;

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
            notifications: [],
        };
    }

    /**
     * Get user statistics
     */
    async getUserStats(userIdOrWallet: string) {
        const userId = await this.resolveUserId(userIdOrWallet);
        if (!userId) {
            return {
                totalPnl: 0,
                winRate: 0,
                avgReturn: 0,
                totalTrades: 0,
                activePositions: 0,
                accuracyScore: 0,
                bestTrade: 0,
                exposureLevel: 0,
                portfolioValue: 0,
                activeStakedSol: 0,
                totalWonSol: 0,
            };
        }

        const supabase = this.supabaseService.getAdminClient();

        // 1. Get stakes
        const { data: stakes } = await supabase
            .from('pool_stakes')
            .select('stake_amount, status, competition_id, competitions(status)')
            .eq('user_id', userId);

        // 2. Get wins
        const { data: wins } = await supabase
            .from('pool_winners')
            .select('prize_amount, rank, final_accuracy, prediction_count, competition_id')
            .eq('user_id', userId);

        const totalStakes = stakes || [];
        const totalWins = wins || [];

        // Filter active vs settled stakes
        const activeStakes = totalStakes.filter((s: any) => 
            s.competitions?.status === 'active' || s.competitions?.status === 'upcoming'
        );
        const settledStakes = totalStakes.filter((s: any) => 
            s.competitions?.status === 'settled'
        );

        const activeStakedSol = activeStakes.reduce((acc, curr) => acc + parseFloat(curr.stake_amount), 0);
        const settledStakedSol = settledStakes.reduce((acc, curr) => acc + parseFloat(curr.stake_amount), 0);
        const totalWonSol = totalWins.reduce((acc, curr) => acc + parseFloat(curr.prize_amount), 0);

        // PNL = Total Won (Settled) - Total Staked (Settled)
        const totalPnl = totalWonSol - settledStakedSol;

        const settledStakesCount = settledStakes.length;
        const winsCount = totalWins.length;
        const winRate = settledStakesCount > 0 ? Math.round((winsCount / settledStakesCount) * 100) : 0;
        const avgReturn = settledStakedSol > 0 ? Math.round((totalPnl / settledStakedSol) * 100) : 0;

        const totalTradesCount = totalWins.reduce((acc, curr) => acc + (curr.prediction_count || 0), 0);
        const avgAccuracy = totalWins.length > 0
            ? Math.round(totalWins.reduce((acc, curr) => acc + parseFloat(curr.final_accuracy || 0), 0) / totalWins.length)
            : 0;

        let bestTrade = 0;
        for (const w of totalWins) {
            const matchStake = settledStakes.find((s: any) => s.competition_id === w.competition_id);
            const stakeAmt = matchStake ? parseFloat(matchStake.stake_amount) : 0;
            const netWin = parseFloat(w.prize_amount) - stakeAmt;
            if (netWin > bestTrade) {
                bestTrade = netWin;
            }
        }

        // Wallet Balance for exposure level
        let walletBalanceSol = 0;
        const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
        try {
            const wallets = await this.usersService.getWalletAddresses(userId);
            const primarySolWallet = wallets.find((w: any) => w.chain === 'solana');
            if (primarySolWallet && primarySolWallet.address) {
                try {
                    const pubkey = new PublicKey(primarySolWallet.address);
                    const balanceLamports = await connection.getBalance(pubkey);
                    walletBalanceSol = balanceLamports / 1000000000;
                } catch (pubkeyErr: any) {
                    this.logger.warn(`Invalid Solana address format "${primarySolWallet.address}": ${pubkeyErr.message}`);
                }
            }
        } catch (err: any) {
            this.logger.error(`Failed to get Solana wallet balance: ${err.message}`);
        }

        const totalPortfolioVal = walletBalanceSol + activeStakedSol + totalWonSol;
        const exposureLevel = totalPortfolioVal > 0 ? Math.round((activeStakedSol / totalPortfolioVal) * 100) : 0;

        return {
            totalPnl,
            winRate,
            avgReturn,
            totalTrades: totalTradesCount || totalStakes.length,
            activePositions: activeStakes.length,
            accuracyScore: avgAccuracy,
            bestTrade,
            exposureLevel,
            portfolioValue: totalPortfolioVal,
            activeStakedSol,
            totalWonSol,
        };
    }

    /**
     * Get recent user activity
     */
    async getRecentActivity(userIdOrWallet: string) {
        const userId = await this.resolveUserId(userIdOrWallet);
        if (!userId) return { activities: [], hasMore: false };

        const supabase = this.supabaseService.getAdminClient();

        // 1. Fetch Stakes
        const { data: stakes } = await supabase
            .from('pool_stakes')
            .select(`
                id,
                stake_amount,
                staked_at,
                onchain_tx,
                status,
                competition_id,
                competitions ( title, sector )
            `)
            .eq('user_id', userId)
            .order('staked_at', { ascending: false })
            .limit(10);

        // 2. Fetch Agent deployments
        const { data: agents } = await supabase
            .from('ai_agents')
            .select('id, name, status, created_at, onchain_tx_signature')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        // 3. Fetch Wins
        const { data: wins } = await supabase
            .from('pool_winners')
            .select(`
                id,
                rank,
                prize_amount,
                created_at,
                competition_id,
                competitions ( title )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        const activities: any[] = [];

        if (stakes) {
            for (const s of stakes) {
                activities.push({
                    id: s.id,
                    type: 'stake',
                    title: `Staked ${s.stake_amount} SOL`,
                    description: `Staked in ${(s.competitions as any)?.title || 'Competition'} (${(s.competitions as any)?.sector || 'general'})`,
                    timestamp: new Date(s.staked_at).getTime(),
                    txSignature: s.onchain_tx,
                    status: s.status,
                });
            }
        }

        if (agents) {
            for (const a of agents) {
                activities.push({
                    id: a.id,
                    type: 'deploy',
                    title: `Deployed Agent: ${a.name}`,
                    description: `Agent status is now ${a.status}`,
                    timestamp: new Date(a.created_at).getTime(),
                    txSignature: a.onchain_tx_signature,
                    status: a.status,
                });
            }
        }

        if (wins) {
            for (const w of wins) {
                activities.push({
                    id: w.id,
                    type: 'win',
                    title: `Won Prize: +${w.prize_amount} SOL`,
                    description: `Finished Rank #${w.rank} in ${(w.competitions as any)?.title || 'Competition'}`,
                    timestamp: new Date(w.created_at).getTime(),
                    txSignature: null,
                    status: 'completed',
                });
            }
        }

        activities.sort((a, b) => b.timestamp - a.timestamp);

        return {
            activities: activities.slice(0, 15),
            hasMore: activities.length > 15,
        };
    }

    /**
     * Get user portfolio/positions
     */
    async getPortfolio(userIdOrWallet: string) {
        const userId = await this.resolveUserId(userIdOrWallet);
        if (!userId) {
            return {
                positions: [],
                totalValue: 0,
                unrealizedPnL: 0,
                realizedPnL: 0,
            };
        }

        const supabase = this.supabaseService.getAdminClient();

        // Get all active wagers (positions)
        const { data: stakes } = await supabase
            .from('pool_stakes')
            .select(`
                id,
                stake_amount,
                staked_at,
                agent_id,
                competition_id,
                competitions ( title, sector, status, ends_at )
            `)
            .eq('user_id', userId);

        const totalStakes = stakes || [];
        const positions = totalStakes.map((s: any) => ({
            id: s.id,
            competitionTitle: s.competitions?.title || 'Unknown',
            sector: s.competitions?.sector || 'general',
            amount: parseFloat(s.stake_amount),
            status: s.competitions?.status || 'active',
            endsAt: s.competitions?.ends_at,
            stakedAt: s.staked_at,
        }));

        const stats = await this.getUserStats(userId);

        return {
            positions,
            totalValue: stats.portfolioValue,
            unrealizedPnL: stats.activePositions > 0 ? stats.totalPnl * 0.1 : 0, // estimate unrealized movement
            realizedPnL: stats.totalPnl,
        };
    }
}
