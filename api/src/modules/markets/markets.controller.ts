import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MarketsService } from './markets.service.js';
import { CompetitionClusteringService } from './competition-clustering.service.js';
import { JwtAuthGuard } from '../auth/guards/index.js';
import { CurrentUser, Public } from '../auth/decorators/index.js';
import { CreateMarketDto, MarketQueryDto, ResolveMarketDto } from './dto/index.js';

@ApiTags('Markets')
@Controller('markets')
export class MarketsController {
    constructor(
        private readonly marketsService: MarketsService,
        private readonly clusteringService: CompetitionClusteringService
    ) { }

    @Post('trigger-clustering')
    @Public()
    @ApiOperation({ summary: 'Manually trigger the daily competition clustering' })
    async triggerClustering() {
        // Trigger asynchronously to not block the request
        this.clusteringService.handleDailyClustering().catch(e => console.error(e));
        return { success: true, message: 'Clustering job started in background' };
    }

    /**
     * Create a new AI agent competition
     */
    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new AI agent competition' })
    @ApiResponse({ status: 201, description: 'Market created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async create(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateMarketDto,
    ) {
        return this.marketsService.create(userId, dto);
    }

    /**
     * Get all markets with filters
     */
    @Get()
    @Public()
    @ApiOperation({ summary: 'Get all markets with filters and pagination' })
    @ApiResponse({ status: 200, description: 'Markets retrieved successfully' })
    async findAll(@Query() query: MarketQueryDto) {
        // Compatibility: Convert offset to page if page is missing
        if (query.offset !== undefined && query.page === undefined) {
            const limit = query.limit || 10;
            query.page = Math.floor(query.offset / limit) + 1;
        }
        return this.marketsService.findAll(query);
    }

    /**
     * Get category feed data from ETL-populated market_data_items
     * This endpoint serves data for category pages (Politics, Finance, Tech, etc.)
     * Also used for Search functionality with multi-field search
     * 
     * @security Public with anti-throttling measures
     * @security Input sanitization via middleware + service layer
     */
    @Get('feed')
    @Public()
    @ApiOperation({ summary: 'Get market feed items by category (ETL data)' })
    @ApiResponse({ status: 200, description: 'Feed items retrieved successfully' })
    async getCategoryFeed(
        @Query('category') category?: string,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number,
        @Query('search') search?: string,
        @Query('sortBy') sortBy?: 'relevance' | 'date' | 'engagement'
    ) {
        // Anti-throttling: Enforce limits at controller level
        const safeLimit = Math.min(Number(limit) || 20, 100);
        const safeOffset = Math.max(Number(offset) || 0, 0);
        const safeSortBy = ['relevance', 'date', 'engagement'].includes(sortBy || '')
            ? sortBy as 'relevance' | 'date' | 'engagement'
            : 'date';

        return this.marketsService.findCategoryFeed(
            category || 'latest',
            safeLimit,
            safeOffset,
            search,
            safeSortBy
        );
    }


    /**
     * Get featured/trending markets
     */
    @Get('featured')
    @Public()
    @ApiOperation({ summary: 'Get featured/trending markets' })
    @ApiResponse({ status: 200, description: 'Featured markets retrieved' })
    async getFeatured(@Query('limit') limit?: number) {
        return this.marketsService.getFeatured(limit || 10);
    }

    /**
     * Get market by ID
     */
    @Get(':id')
    @Public()
    @ApiOperation({ summary: 'Get market by ID' })
    @ApiResponse({ status: 200, description: 'Market retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Market not found' })
    async findById(@Param('id') id: string) {
        return this.marketsService.findById(id);
    }

    /**
     * Get markets created by user
     */
    @Get('user/:userId')
    @Public()
    @ApiOperation({ summary: 'Get markets by creator' })
    @ApiResponse({ status: 200, description: 'Markets retrieved successfully' })
    async findByCreator(@Param('userId') userId: string) {
        return this.marketsService.findByCreator(userId);
    }



    /**
     * Resolve a market
     */
    @Patch(':id/resolve')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Resolve an AI agent competition' })
    @ApiResponse({ status: 200, description: 'Market resolved successfully' })
    @ApiResponse({ status: 403, description: 'Not authorized to resolve' })
    @ApiResponse({ status: 404, description: 'Market not found' })
    async resolve(
        @CurrentUser('id') userId: string,
        @Param('id') marketId: string,
        @Body() dto: ResolveMarketDto,
    ) {
        return this.marketsService.resolve(marketId, userId, dto);
    }
}
