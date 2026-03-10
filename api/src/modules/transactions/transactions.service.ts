import {
    Injectable,
    Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    TransactionDto,
    TransactionsQueryDto,
    TransactionSummaryDto,
    PnLDataDto,
    TransactionType,
    TransactionStatus,
} from './dto/index.js';

/**
 * TransactionsService
 * 
 * Manages transaction history and portfolio analytics:
 * - Unified transaction history
 * - Summary statistics
 * - PnL calculations
 * - Export functionality
 */
@Injectable()
export class TransactionsService {
    private readonly logger = new Logger(TransactionsService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Get transaction history with filters
     */
    async getTransactions(
        userId: string,
        query: TransactionsQueryDto,
    ): Promise<{ data: TransactionDto[]; total: number }> {
        const { page = 1, limit = 20, type, status, startDate, endDate } = query;
        const offset = (page - 1) * limit;

        let queryBuilder = this.supabaseService
            .getAdminClient()
            .from('transaction_ledger')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (type) {
            queryBuilder = queryBuilder.eq('transaction_type', type);
        }

        if (status) {
            queryBuilder = queryBuilder.eq('status', status);
        }

        if (startDate) {
            queryBuilder = queryBuilder.gte('created_at', startDate);
        }

        if (endDate) {
            queryBuilder = queryBuilder.lte('created_at', endDate);
        }

        queryBuilder = queryBuilder.range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to fetch transactions: ${error.message}`);
            return { data: [], total: 0 };
        }

        return {
            data: (data || []).map(this.mapToTransactionDto),
            total: count || 0,
        };
    }

    /**
     * Get transaction summary for a time period
     */
    async getSummary(
        userId: string,
        startDate?: string,
        endDate?: string
    ): Promise<TransactionSummaryDto> {
        // Use database function for efficient aggregation
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .rpc('get_transaction_summary', {
                p_user_id: userId,
                p_start_date: startDate || null,
                p_end_date: endDate || null,
            });

        if (error) {
            this.logger.error(`Failed to get summary: ${error.message}`);
            return {
                totalDeposits: 0,
                totalWithdrawals: 0,
                totalTradingVolume: 0,
                totalFees: 0,
                netPnL: 0,
                transactionCount: 0,
            };
        }

        return {
            totalDeposits: parseFloat(data.total_deposits) || 0,
            totalWithdrawals: parseFloat(data.total_withdrawals) || 0,
            totalTradingVolume: parseFloat(data.total_trading_volume) || 0,
            totalFees: parseFloat(data.total_fees) || 0,
            netPnL: parseFloat(data.net_pnl) || 0,
            transactionCount: data.transaction_count || 0,
        };
    }

    /**
     * Get PnL data for charts
     */
    async getPnLData(
        userId: string,
        period: 'day' | 'week' | 'month' | 'all' = 'month'
    ): Promise<PnLDataDto[]> {
        // Get daily balance snapshots
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('portfolio_snapshots')
            .select('snapshot_date, daily_pnl, cumulative_pnl')
            .eq('user_id', userId)
            .order('snapshot_date', { ascending: true })
            .limit(this.getPeriodLimit(period));

        if (error) {
            this.logger.error(`Failed to get PnL data: ${error.message}`);
            return [];
        }

        return (data || []).map(d => ({
            date: d.snapshot_date,
            pnl: parseFloat(d.daily_pnl) || 0,
            cumulativePnL: parseFloat(d.cumulative_pnl) || 0,
        }));
    }

    /**
     * Export transactions as CSV
     */
    async exportTransactions(
        userId: string,
        query: TransactionsQueryDto,
    ): Promise<string> {
        // Get all transactions matching query (no pagination)
        const { type, status, startDate, endDate } = query;

        let queryBuilder = this.supabaseService
            .getAdminClient()
            .from('transaction_ledger')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10000); // Max export

        if (type) queryBuilder = queryBuilder.eq('transaction_type', type);
        if (status) queryBuilder = queryBuilder.eq('status', status);
        if (startDate) queryBuilder = queryBuilder.gte('created_at', startDate);
        if (endDate) queryBuilder = queryBuilder.lte('created_at', endDate);

        const { data, error } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to export transactions: ${error.message}`);
            return '';
        }

        // Generate CSV
        const headers = ['Date', 'Type', 'Amount', 'Currency', 'Status', 'Description', 'TX Hash'];
        const rows = (data || []).map(t => [
            t.created_at,
            t.transaction_type,
            t.amount,
            t.currency,
            t.status,
            t.description || '',
            t.tx_hash || '',
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(r => r.map(v => `"${v}"`).join(',')),
        ].join('\n');

        return csv;
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private mapToTransactionDto(t: any): TransactionDto {
        return {
            id: t.id,
            type: t.transaction_type,
            amount: parseFloat(t.amount),
            currency: t.currency,
            status: t.status,
            description: t.description,
            txHash: t.tx_hash,
            chain: t.chain,
            resourceType: t.resource_type,
            resourceId: t.resource_id,
            balanceBefore: parseFloat(t.balance_before) || 0,
            balanceAfter: parseFloat(t.balance_after) || 0,
            createdAt: t.created_at,
        };
    }

    private getPeriodLimit(period: string): number {
        switch (period) {
            case 'day': return 24; // Hourly for day
            case 'week': return 7;
            case 'month': return 30;
            case 'all': return 365;
            default: return 30;
        }
    }
}
