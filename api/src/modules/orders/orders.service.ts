import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import { BuySharesDto, SellSharesDto, PositionResponseDto, OrderResponseDto } from './dto/index.js';
import { MarketsService } from '../markets/markets.service.js';

interface Order {
    id: string;
    user_id: string;
    market_id: string;
    type: 'buy' | 'sell';
    side: 'yes' | 'no';
    shares: number;
    price: number;
    total: number;
    status: 'pending' | 'filled' | 'cancelled' | 'failed';
    tx_hash?: string;
    idempotency_key?: string;
    created_at: string;
}

interface Position {
    id: string;
    user_id: string;
    market_id: string;
    yes_shares: number;
    no_shares: number;
    avg_yes_cost: number;
    avg_no_cost: number;
    realized_pnl: number;
    created_at: string;
    updated_at: string;
}

/**
 * Orders Service
 * 
 * Handles trading operations: buying/selling shares, position management
 */
@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly marketsService: MarketsService,
    ) { }

    /**
     * Buy shares in a market
     */
    async buyShares(userId: string, dto: BuySharesDto): Promise<OrderResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        // Check idempotency
        const existingOrder = await this.findByIdempotencyKey(dto.idempotencyKey, userId);
        if (existingOrder) {
            this.logger.warn(`Duplicate order rejected (idempotency): ${dto.idempotencyKey}`);
            return this.toOrderResponse(existingOrder);
        }

        // Validate market exists and is active
        const market = await this.marketsService.findById(dto.marketId);
        if (market.resolved) {
            throw new BadRequestException('Market is already resolved');
        }

        const now = new Date();
        if (new Date(market.endTime) < now) {
            throw new BadRequestException('Market has ended');
        }

        // Calculate shares based on current price
        const currentPrice = dto.isYes ? market.yesPrice : market.noPrice;
        const shares = dto.amount / currentPrice;
        const totalCost = dto.amount;

        // Verify slippage
        if (totalCost > dto.maxCost) {
            throw new BadRequestException(`Slippage exceeded: cost ${totalCost} > max ${dto.maxCost}`);
        }

        // Create order record
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                user_id: userId,
                market_id: dto.marketId,
                type: 'buy',
                side: dto.isYes ? 'yes' : 'no',
                shares,
                price: currentPrice,
                total: totalCost,
                status: 'filled', // Instant fill for now
                idempotency_key: dto.idempotencyKey,
            })
            .select()
            .single();

        if (orderError) {
            // Handle unique violation gracefully (race condition)
            if (orderError.code === '23505' && orderError.message.includes('idempotency_key')) {
                const retryOrder = await this.findByIdempotencyKey(dto.idempotencyKey, userId);
                if (retryOrder) return this.toOrderResponse(retryOrder);
            }

            this.logger.error(`Failed to create order: ${orderError.message}`);
            throw new Error(`Order failed: ${orderError.message}`);
        }

        // Update or create position
        await this.updatePosition(userId, dto.marketId, dto.isYes, shares, currentPrice);

        // Update market volume
        await this.updateMarketVolume(dto.marketId, totalCost);

        this.logger.log(`Order filled: ${order.id} - ${shares} ${dto.isYes ? 'YES' : 'NO'} shares`);
        return this.toOrderResponse(order);
    }

    /**
     * Sell shares in a market
     */
    async sellShares(userId: string, dto: SellSharesDto): Promise<OrderResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        // Check idempotency
        const existingOrder = await this.findByIdempotencyKey(dto.idempotencyKey, userId);
        if (existingOrder) {
            this.logger.warn(`Duplicate sell rejected (idempotency): ${dto.idempotencyKey}`);
            return this.toOrderResponse(existingOrder);
        }

        // Validate market
        const market = await this.marketsService.findById(dto.marketId);
        if (market.resolved) {
            throw new BadRequestException('Market is already resolved');
        }

        // Get user position
        const position = await this.getPosition(userId, dto.marketId);
        const availableShares = dto.isYes ? position.yesShares : position.noShares;

        if (availableShares < dto.shares) {
            throw new BadRequestException(`Insufficient shares: have ${availableShares}, selling ${dto.shares}`);
        }

        // Calculate return
        const currentPrice = dto.isYes ? market.yesPrice : market.noPrice;
        const totalReturn = dto.shares * currentPrice;

        // Verify slippage
        if (totalReturn < dto.minReturn) {
            throw new BadRequestException(`Slippage exceeded: return ${totalReturn} < min ${dto.minReturn}`);
        }

        // Create order record
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                user_id: userId,
                market_id: dto.marketId,
                type: 'sell',
                side: dto.isYes ? 'yes' : 'no',
                shares: dto.shares,
                price: currentPrice,
                total: totalReturn,
                status: 'filled',
                idempotency_key: dto.idempotencyKey,
            })
            .select()
            .single();

        if (orderError) {
            if (orderError.code === '23505' && orderError.message.includes('idempotency_key')) {
                const retryOrder = await this.findByIdempotencyKey(dto.idempotencyKey, userId);
                if (retryOrder) return this.toOrderResponse(retryOrder);
            }
            throw new Error(`Order failed: ${orderError.message}`);
        }

        // Update position (negative shares for sell)
        await this.updatePosition(userId, dto.marketId, dto.isYes, -dto.shares, currentPrice);

        this.logger.log(`Sell order filled: ${order.id}`);
        return this.toOrderResponse(order);
    }

    /**
     * Get user position in a market
     */
    async getPosition(userId: string, marketId: string): Promise<PositionResponseDto> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('positions')
            .select('*')
            .eq('user_id', userId)
            .eq('market_id', marketId)
            .single();

        if (error || !data) {
            // Return empty position
            return {
                id: '',
                userId,
                marketId,
                yesShares: 0,
                noShares: 0,
                avgYesCost: 0,
                avgNoCost: 0,
                realizedPnl: 0,
                unrealizedPnl: 0,
                createdAt: '',
                updatedAt: '',
            };
        }

        // Calculate unrealized PnL
        const market = await this.marketsService.findById(marketId);
        const unrealizedPnl = this.calculateUnrealizedPnl(data, market);

        return this.toPositionResponse(data, unrealizedPnl);
    }

    /**
     * Get all positions for a user
     */
    async getUserPositions(userId: string): Promise<PositionResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('positions')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch positions: ${error.message}`);
            return [];
        }

        return Promise.all((data || []).map(async (pos) => {
            try {
                const market = await this.marketsService.findById(pos.market_id);
                const unrealizedPnl = this.calculateUnrealizedPnl(pos, market);
                return this.toPositionResponse(pos, unrealizedPnl);
            } catch {
                return this.toPositionResponse(pos, 0);
            }
        }));
    }

    /**
     * Get order history for a user
     */
    async getOrderHistory(userId: string, limit: number = 50): Promise<OrderResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            return [];
        }

        return (data || []).map(this.toOrderResponse);
    }

    /**
     * Claim winnings from a resolved market
     */
    async claimWinnings(userId: string, marketId: string): Promise<{ amount: number }> {
        const supabase = this.supabaseService.getAdminClient();

        // Get market and validate
        const market = await this.marketsService.findById(marketId);
        if (!market.resolved) {
            throw new BadRequestException('Market is not resolved yet');
        }

        // Get position
        const position = await this.getPosition(userId, marketId);
        if (!position.id) {
            throw new NotFoundException('No position found');
        }

        // Calculate winnings
        const winningShares = market.outcome ? position.yesShares : position.noShares;
        const amount = winningShares; // Each winning share pays out 1 unit

        if (amount <= 0) {
            throw new BadRequestException('No winnings to claim');
        }

        // Mark position as claimed
        await supabase
            .from('positions')
            .update({ claimed: true, realized_pnl: amount })
            .eq('id', position.id);

        this.logger.log(`Winnings claimed: ${amount} for user ${userId} in market ${marketId}`);
        return { amount };
    }

    /**
     * Update user position
     */
    private async updatePosition(
        userId: string,
        marketId: string,
        isYes: boolean,
        sharesDelta: number,
        price: number,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Get existing position
        const { data: existing } = await supabase
            .from('positions')
            .select('*')
            .eq('user_id', userId)
            .eq('market_id', marketId)
            .single();

        if (existing) {
            // Update existing position
            const update: any = {
                updated_at: new Date().toISOString(),
            };

            if (isYes) {
                const newShares = existing.yes_shares + sharesDelta;
                update.yes_shares = Math.max(0, newShares);
                if (sharesDelta > 0) {
                    // Update average cost for buys
                    const totalCost = existing.avg_yes_cost * existing.yes_shares + price * sharesDelta;
                    update.avg_yes_cost = newShares > 0 ? totalCost / newShares : 0;
                }
            } else {
                const newShares = existing.no_shares + sharesDelta;
                update.no_shares = Math.max(0, newShares);
                if (sharesDelta > 0) {
                    const totalCost = existing.avg_no_cost * existing.no_shares + price * sharesDelta;
                    update.avg_no_cost = newShares > 0 ? totalCost / newShares : 0;
                }
            }

            await supabase
                .from('positions')
                .update(update)
                .eq('id', existing.id);
        } else {
            // Create new position
            await supabase.from('positions').insert({
                user_id: userId,
                market_id: marketId,
                yes_shares: isYes ? sharesDelta : 0,
                no_shares: isYes ? 0 : sharesDelta,
                avg_yes_cost: isYes ? price : 0,
                avg_no_cost: isYes ? 0 : price,
                realized_pnl: 0,
            });
        }
    }

    /**
     * Update market volume
     */
    private async updateMarketVolume(marketId: string, amount: number): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        // Get current volume
        const { data } = await supabase
            .from('markets')
            .select('volume')
            .eq('id', marketId)
            .single();

        if (data) {
            await supabase
                .from('markets')
                .update({ volume: data.volume + amount })
                .eq('id', marketId);
        }
    }

    /**
     * Calculate unrealized PnL
     */
    private calculateUnrealizedPnl(position: Position, market: any): number {
        const yesValue = position.yes_shares * market.yesPrice;
        const noValue = position.no_shares * market.noPrice;
        const yesCost = position.yes_shares * position.avg_yes_cost;
        const noCost = position.no_shares * position.avg_no_cost;

        return (yesValue + noValue) - (yesCost + noCost);
    }

    /**
     * Convert to order response
     */
    private toOrderResponse(order: Order): OrderResponseDto {
        return {
            id: order.id,
            userId: order.user_id,
            marketId: order.market_id,
            type: order.type,
            side: order.side,
            shares: order.shares,
            price: order.price,
            total: order.total,
            status: order.status,
            txHash: order.tx_hash,
            createdAt: order.created_at,
        };
    }

    /**
     * Convert to position response
     */
    private toPositionResponse(position: Position, unrealizedPnl: number): PositionResponseDto {
        return {
            id: position.id,
            userId: position.user_id,
            marketId: position.market_id,
            yesShares: position.yes_shares,
            noShares: position.no_shares,
            avgYesCost: position.avg_yes_cost,
            avgNoCost: position.avg_no_cost,
            realizedPnl: position.realized_pnl,
            unrealizedPnl,
            createdAt: position.created_at,
            updatedAt: position.updated_at,
        };
    }
    /**
     * Find order by idempotency key
     */
    private async findByIdempotencyKey(key: string, userId: string): Promise<Order | null> {
        if (!key) return null;

        const { data } = await this.supabaseService.getClient()
            .from('orders')
            .select('*')
            .eq('idempotency_key', key)
            .eq('user_id', userId)
            .single();

        return data;
    }
}
