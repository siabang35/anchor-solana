import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PoolService } from './pool.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@ApiTags('Pool & Winners')
@Controller('pool')
export class PoolController {
    constructor(private readonly poolService: PoolService) {}

    /**
     * Get pool + winners for a specific competition
     */
    @Get('competition')
    @Public()
    @ApiOperation({ summary: 'Get competition pool with winners' })
    async getCompetitionPool(@Query('competition_id') competitionId: string) {
        if (!competitionId) return { pool: {}, winners: [] };
        return this.poolService.getCompetitionPool(competitionId);
    }

    /**
     * Get sector pool summary (aggregated)
     */
    @Get('sector')
    @Public()
    @ApiOperation({ summary: 'Get sector pool summary with winners' })
    async getSectorPool(
        @Query('sector') sector: string,
        @Query('limit') limit?: string,
    ) {
        if (!sector) return { pool: {}, winners: [] };

        const [summary, winners] = await Promise.all([
            this.poolService.getSectorPoolSummary(sector),
            this.poolService.getSectorWinners(sector, limit ? parseInt(limit, 10) : 3),
        ]);

        return { pool: summary, winners };
    }

    /**
     * Get global pool summary + top winners
     */
    @Get('global')
    @Public()
    @ApiOperation({ summary: 'Get global pool summary with top winners' })
    async getGlobalPool(@Query('limit') limit?: string) {
        const [summary, winners] = await Promise.all([
            this.poolService.getGlobalPoolSummary(),
            this.poolService.getGlobalWinners(limit ? parseInt(limit, 10) : 4),
        ]);

        return { pool: summary, winners };
    }

    /**
     * Add a stake to a competition pool
     */
    @Post('stake')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Stake SOL on your agent in a competition pool' })
    async addStake(
        @Body() body: { competition_id: string; agent_id: string; stake_amount: number },
        @Req() req: any,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.poolService.addStake(userId, body.competition_id, body.agent_id, body.stake_amount);
    }

    /**
     * Settle a competition pool (admin/system endpoint)
     */
    @Post('settle')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Settle a competition pool and distribute prizes' })
    async settlePool(
        @Body() body: { competition_id: string },
        @Req() req: any,
    ) {
        const settledBy = req.user?.id || 'system';
        return this.poolService.settlePool(body.competition_id, settledBy);
    }
}
