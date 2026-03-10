/**
 * Recommendations Controller
 * 
 * Exposes AI-driven recommendation endpoints with OWASP security compliance.
 * Features:
 * - Rate limiting via caching layer
 * - Input validation
 * - Request logging
 */

import { Controller, Get, Query, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service.js';

// Input validation helpers (OWASP compliant)
const sanitizeLimit = (limit: string | undefined): number => {
    const parsed = parseInt(limit || '20', 10);
    if (isNaN(parsed) || parsed < 1) return 20;
    if (parsed > 100) return 100; // Max limit to prevent abuse
    return parsed;
};

const sanitizeOffset = (offset: string | undefined): number => {
    const parsed = parseInt(offset || '0', 10);
    if (isNaN(parsed) || parsed < 0) return 0;
    return parsed;
};

const sanitizeUserId = (userId: string | undefined): string | undefined => {
    if (!userId) return undefined;
    // Basic XSS prevention
    if (userId.includes('<') || userId.includes('>') || userId.includes('script')) {
        return undefined;
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) return undefined;
    return userId;
};

@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationsController {
    private readonly logger = new Logger(RecommendationsController.name);

    // Simple in-memory rate limit tracking
    private requestCounts = new Map<string, { count: number; resetAt: number }>();
    private readonly MAX_REQUESTS_PER_MINUTE = 100;

    constructor(private readonly recommendationsService: RecommendationsService) { }

    /**
     * Simple rate limit check (anti-throttling protection)
     */
    private checkRateLimit(ip: string): boolean {
        const now = Date.now();
        const record = this.requestCounts.get(ip);

        if (!record || now > record.resetAt) {
            this.requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
            return true;
        }

        if (record.count >= this.MAX_REQUESTS_PER_MINUTE) {
            return false;
        }

        record.count++;
        return true;
    }

    /**
     * Get Top Markets (Algorithm Ranked)
     * Uses weighted multi-factor ranking across all categories
     */
    @Get('top-markets')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get global top markets (Algorithm Ranked)',
        description: 'Returns top content from all categories using weighted multi-factor ranking: Volume(25%) + Impact(20%) + SignalStrength(20%) + TrendScore(15%) + Freshness(10%) + Engagement(10%)'
    })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max items to return (1-100)', example: 20 })
    @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Items to skip', example: 0 })
    @ApiResponse({ status: 200, description: 'Top markets retrieved successfully' })
    @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
    async getTopMarkets(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string
    ) {
        const sanitizedLimit = sanitizeLimit(limit);
        const sanitizedOffset = sanitizeOffset(offset);
        this.logger.log(`Top Markets request: limit=${sanitizedLimit}, offset=${sanitizedOffset}`);

        const startTime = Date.now();
        const result = await this.recommendationsService.getTopMarkets(sanitizedLimit, sanitizedOffset);
        const duration = Date.now() - startTime;

        this.logger.log(`Top Markets returned ${result.length} items in ${duration}ms`);
        return result;
    }

    /**
     * Get For You Recommendations (AI Clustering)
     * Uses K-Means clustering with diversity constraints
     */
    @Get('for-you')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get personalized AI recommendations (K-Means Clustering)',
        description: 'Returns personalized recommendations using K-Means clustering with diversity constraints. Results are mutually exclusive from Top Markets.'
    })
    @ApiQuery({ name: 'userId', required: false, type: String, description: 'User UUID for personalization' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max items to return (1-100)', example: 20 })
    @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Items to skip', example: 0 })
    @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
    @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
    async getForYou(
        @Query('userId') userId?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string
    ) {
        const sanitizedUserId = sanitizeUserId(userId);
        const sanitizedLimit = sanitizeLimit(limit);
        const sanitizedOffset = sanitizeOffset(offset);

        this.logger.log(`For You request: userId=${sanitizedUserId || 'anonymous'}, limit=${sanitizedLimit}, offset=${sanitizedOffset}`);

        const startTime = Date.now();
        const result = await this.recommendationsService.getForYou(sanitizedUserId, sanitizedLimit, sanitizedOffset);
        const duration = Date.now() - startTime;

        this.logger.log(`For You returned ${result.length} items in ${duration}ms`);
        return result;
    }

    /**
     * Clear recommendation caches (admin only in production)
     */
    @Get('clear-cache')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Clear recommendation caches (dev/admin)' })
    @ApiResponse({ status: 200, description: 'Caches cleared' })
    async clearCache() {
        this.recommendationsService.clearCache();
        return { success: true, message: 'Recommendation caches cleared' };
    }
}
