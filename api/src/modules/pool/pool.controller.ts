import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
    HttpCode,
    HttpStatus,
    UseGuards,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PoolService } from './pool.service.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { ClaimRateLimitGuard } from './guards/claim-rate-limit.guard.js';
import { ClaimPrizeDto, SettlePoolDto } from './dto/claim-prize.dto.js';

@ApiTags('Pool & Winners')
@Controller('pool')
export class PoolController {
    private readonly logger = new Logger(PoolController.name);

    constructor(private readonly poolService: PoolService) {}

    /**
     * Get pool + winners for a specific competition
     */
    @Get('competition')
    @Public()
    @ApiOperation({ summary: 'Get competition pool with winners' })
    async getCompetitionPool(@Query('competition_id') competitionId: string) {
        if (!competitionId) return { pool: {}, winners: [] };
        // Validate UUID format to prevent injection
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(competitionId)) {
            return { pool: {}, winners: [] };
        }
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
        // Sanitize sector — alphanumeric + underscore only
        if (!/^[a-zA-Z0-9_-]+$/.test(sector)) {
            return { pool: {}, winners: [] };
        }

        const parsedLimit = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 3), 10) : 3;

        const [summary, winners] = await Promise.all([
            this.poolService.getSectorPoolSummary(sector),
            this.poolService.getSectorWinners(sector, parsedLimit),
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
        const parsedLimit = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 4), 20) : 4;

        const [summary, winners] = await Promise.all([
            this.poolService.getGlobalPoolSummary(),
            this.poolService.getGlobalWinners(parsedLimit),
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
        @Body() body: SettlePoolDto,
        @Req() req: any,
    ) {
        const settledBy = req.user?.id || 'system';
        return this.poolService.settlePool(body.competition_id, settledBy);
    }

    /**
     * Claim prize — User-initiated pull mechanism with enterprise-grade security.
     *
     * Security layers applied:
     * 1. ClaimRateLimitGuard — anti-throttling (per-wallet + per-IP + cooldown)
     * 2. ClaimPrizeDto — UUID validation (anti-injection)
     * 3. PoolService.claimPrize — wallet ownership verification + pessimistic DB lock (anti-manipulation)
     * 4. Audit trail — immutable event logging for forensics
     */
    @Post('claim')
    @UseGuards(ClaimRateLimitGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Claim prize for a winning position (wallet-verified)' })
    @ApiResponse({ status: 200, description: 'Prize claimed successfully with on-chain TX' })
    @ApiResponse({ status: 400, description: 'Invalid claim — already claimed, wrong wallet, or prize is 0' })
    @ApiResponse({ status: 429, description: 'Rate limited — too many claim attempts' })
    async claimPrize(
        @Body() body: ClaimPrizeDto,
        @Req() req: any,
    ) {
        const requestingWallet = req.user?.id || req.headers['x-user-id'];
        if (!requestingWallet || typeof requestingWallet !== 'string' || requestingWallet.length < 32) {
            this.logger.warn(`Claim attempt with invalid wallet header: ${requestingWallet}`);
            throw new BadRequestException('Valid wallet address is required to claim a prize');
        }

        // Additional Solana pubkey format validation
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(requestingWallet)) {
            this.logger.warn(`Claim attempt with malformed wallet: ${requestingWallet.slice(0, 12)}...`);
            throw new BadRequestException('Invalid Solana wallet address format');
        }

        this.logger.log(`📥 Claim request: winner=${body.winner_id} wallet=${requestingWallet.slice(0, 8)}...`);

        return this.poolService.claimPrize(body.winner_id, requestingWallet, req);
    }

    /**
     * Check claim eligibility — returns winner IDs that the connected wallet can claim
     */
    @Get('claim-eligibility')
    @Public()
    @ApiOperation({ summary: 'Check which winners the connected wallet can claim' })
    async checkClaimEligibility(
        @Query('competition_id') competitionId: string,
        @Query('wallet') wallet: string,
    ) {
        if (!competitionId || !wallet) return { claimable: [] };

        // Validate UUID format
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(competitionId)) {
            return { claimable: [] };
        }

        // Validate Solana pubkey format
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
            return { claimable: [] };
        }

        const claimable = await this.poolService.checkClaimEligibility(competitionId, wallet);
        return { claimable };
    }
}
