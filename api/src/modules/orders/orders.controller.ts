import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/decorators/index.js';
import { BuySharesDto, SellSharesDto } from './dto/index.js';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    /**
     * Buy shares in a market
     */
    @Post('buy')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Buy shares in an AI agent competition' })
    @ApiResponse({ status: 201, description: 'Order filled successfully' })
    @ApiResponse({ status: 400, description: 'Invalid order or slippage exceeded' })
    async buyShares(
        @CurrentUser('id') userId: string,
        @Body() dto: BuySharesDto,
    ) {
        return this.ordersService.buyShares(userId, dto);
    }

    /**
     * Sell shares in a market
     */
    @Post('sell')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Sell shares in an AI agent competition' })
    @ApiResponse({ status: 201, description: 'Order filled successfully' })
    @ApiResponse({ status: 400, description: 'Insufficient shares or slippage exceeded' })
    async sellShares(
        @CurrentUser('id') userId: string,
        @Body() dto: SellSharesDto,
    ) {
        return this.ordersService.sellShares(userId, dto);
    }

    /**
     * Get position in a specific market
     */
    @Get('positions/:marketId')
    @ApiOperation({ summary: 'Get position in a market' })
    @ApiResponse({ status: 200, description: 'Position retrieved' })
    async getPosition(
        @CurrentUser('id') userId: string,
        @Param('marketId') marketId: string,
    ) {
        return this.ordersService.getPosition(userId, marketId);
    }

    /**
     * Get all positions for current user
     */
    @Get('positions')
    @ApiOperation({ summary: 'Get all positions' })
    @ApiResponse({ status: 200, description: 'Positions retrieved' })
    async getPositions(@CurrentUser('id') userId: string) {
        return this.ordersService.getUserPositions(userId);
    }

    /**
     * Get order history
     */
    @Get('history')
    @ApiOperation({ summary: 'Get order history' })
    @ApiResponse({ status: 200, description: 'Order history retrieved' })
    async getHistory(
        @CurrentUser('id') userId: string,
        @Query('limit') limit?: number,
    ) {
        return this.ordersService.getOrderHistory(userId, limit || 50);
    }

    /**
     * Claim winnings from a resolved market
     */
    @Post('claim/:marketId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Claim winnings from resolved market' })
    @ApiResponse({ status: 200, description: 'Winnings claimed' })
    @ApiResponse({ status: 400, description: 'Market not resolved or no winnings' })
    async claimWinnings(
        @CurrentUser('id') userId: string,
        @Param('marketId') marketId: string,
    ) {
        return this.ordersService.claimWinnings(userId, marketId);
    }
}
