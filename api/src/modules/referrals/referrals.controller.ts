import {
    Controller,
    Get,
    Post,
    Body,
    UseGuards,
    Req,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReferralsService } from './referrals.service.js';
import {
    ReferralCodeDto,
    ReferralStatsDto,
    CreateReferralCodeDto,
    ApplyReferralCodeDto,
    ReferralRewardDto,
} from './dto/index.js';

interface AuthenticatedRequest extends Request {
    user: { sub: string };
}

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
    constructor(private readonly referralsService: ReferralsService) { }

    @Get('code')
    @ApiOperation({ summary: 'Get your referral code' })
    @ApiResponse({ status: 200, type: ReferralCodeDto })
    async getReferralCode(@Req() req: AuthenticatedRequest): Promise<ReferralCodeDto | null> {
        return this.referralsService.getReferralCode(req.user.sub);
    }

    @Post('code')
    @ApiOperation({ summary: 'Create a referral code' })
    @ApiResponse({ status: 201, type: ReferralCodeDto })
    async createReferralCode(
        @Body() dto: CreateReferralCodeDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ReferralCodeDto> {
        return this.referralsService.createReferralCode(req.user.sub, dto);
    }

    @Post('apply')
    @ApiOperation({ summary: 'Apply a referral code' })
    @ApiResponse({ status: 200 })
    async applyReferralCode(
        @Body() dto: ApplyReferralCodeDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.referralsService.applyReferralCode(req.user.sub, dto);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get referral statistics' })
    @ApiResponse({ status: 200, type: ReferralStatsDto })
    async getReferralStats(@Req() req: AuthenticatedRequest): Promise<ReferralStatsDto | null> {
        return this.referralsService.getReferralStats(req.user.sub);
    }

    @Get('rewards')
    @ApiOperation({ summary: 'Get pending rewards' })
    @ApiResponse({ status: 200, type: [ReferralRewardDto] })
    async getPendingRewards(@Req() req: AuthenticatedRequest): Promise<ReferralRewardDto[]> {
        return this.referralsService.getPendingRewards(req.user.sub);
    }
}
