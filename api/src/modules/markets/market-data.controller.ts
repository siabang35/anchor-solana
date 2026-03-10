/**
 * Market Data Controller
 * 
 * REST API endpoints for accessing ETL market data.
 * Separate from the MarketsController which handles AI agent competition CRUD.
 */

import { Controller, Get, Param, Query, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketDataService } from './market-data.service.js';

@ApiTags('Market Data')
@Controller('market-data')
export class MarketDataController {
    constructor(private readonly marketDataService: MarketDataService) { }

    /**
     * Get market data by category
     */
    @Get(':category')
    @ApiOperation({ summary: 'Get market data items by category' })
    @ApiResponse({ status: 200, description: 'Data retrieved successfully' })
    async getByCategory(
        @Param('category') category: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('contentType') contentType?: string
    ) {
        return this.marketDataService.getByCategory(
            category,
            parseInt(limit || '20', 10),
            parseInt(offset || '0', 10),
            contentType
        );
    }

    /**
     * Get latest items by category
     */
    @Get(':category/latest')
    @ApiOperation({ summary: 'Get latest market data for category' })
    async getLatest(
        @Param('category') category: string,
        @Query('limit') limit?: string
    ) {
        return this.marketDataService.getLatest(category, parseInt(limit || '10', 10));
    }

    /**
     * Get single item by ID
     */
    @Get('item/:id')
    @ApiOperation({ summary: 'Get single market data item by ID' })
    async getById(@Param('id') id: string) {
        return this.marketDataService.getById(id);
    }

    /**
     * Get top signals
     */
    @Get('signals/top')
    @ApiOperation({ summary: 'Get top market signals' })
    async getTopSignals(
        @Query('category') category?: string,
        @Query('hours') hours?: string,
        @Query('limit') limit?: string
    ) {
        return this.marketDataService.getTopSignals(
            category,
            parseInt(hours || '24', 10),
            parseInt(limit || '20', 10)
        );
    }

    /**
     * Get trending topics
     */
    @Get('signals/trending')
    @ApiOperation({ summary: 'Get trending topics across categories' })
    async getTrending(
        @Query('category') category?: string,
        @Query('limit') limit?: string
    ) {
        return this.marketDataService.getTrendingTopics(
            category,
            parseInt(limit || '10', 10)
        );
    }

    /**
     * Get crypto assets (featured)
     */
    @Get('crypto/assets')
    @ApiOperation({ summary: 'Get featured crypto assets' })
    async getCryptoAssets() {
        return this.marketDataService.getFeaturedCrypto();
    }

    /**
     * Get crypto Fear & Greed Index
     */
    @Get('crypto/fear-greed')
    @ApiOperation({ summary: 'Get crypto Fear & Greed Index' })
    async getFearGreed() {
        return this.marketDataService.getCryptoFearGreed();
    }

    /**
     * Manual sync trigger (requires admin)
     */
    @Post('sync/:category')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Trigger manual sync for category (admin only)' })
    async triggerSync(@Param('category') category: string) {
        return this.marketDataService.triggerSync(category);
    }

    /**
     * Get sync status
     */
    @Get('status/sync')
    @ApiOperation({ summary: 'Get ETL sync status' })
    async getSyncStatus() {
        return this.marketDataService.getSyncStatus();
    }
}
