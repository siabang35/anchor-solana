import { Controller, Get, Query, Post, Inject, forwardRef } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SignalsService } from './signals.service.js';
import { Public } from '../auth/decorators/index.js';
import { PoliticsETLOrchestrator, TechETLOrchestrator, SignalsETLOrchestrator } from './etl/index.js';

@ApiTags('Signals')
@Controller('signals')
export class SignalsController {
    constructor(
        private readonly signalsService: SignalsService,
        @Inject(forwardRef(() => PoliticsETLOrchestrator)) private readonly politicsEtl: PoliticsETLOrchestrator,
        @Inject(forwardRef(() => TechETLOrchestrator)) private readonly techEtl: TechETLOrchestrator,
        @Inject(forwardRef(() => SignalsETLOrchestrator)) private readonly signalsEtl: SignalsETLOrchestrator,
    ) { }

    @Get()
    @Public()
    @ApiOperation({ summary: 'Get recent market signals' })
    @ApiResponse({ status: 200, description: 'Signals retrieved successfully' })
    async findAll(@Query('limit') limit?: number, @Query('offset') offset?: number, @Query('category') category?: string) {
        // Anti-throttling / Security: Enforce max limit
        const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
        const safeOffset = Math.max(offset || 0, 0);
        return this.signalsService.findAll(safeLimit, safeOffset, category);
    }

    @Post('trigger-etl')
    @Public() // For demo purposes, usually Admin
    @ApiOperation({ summary: 'Trigger Real-time ETL Pipeline (Politics, Tech, Signals)' })
    async triggerEtl() {
        // Run in background to avoid timeout
        this.runPipelines();
        return { message: 'ETL Pipeline triggered for Politics, Tech, and Signals' };
    }

    private async runPipelines() {
        try {
            console.log('Starting Manual ETL Trigger...');
            await Promise.all([
                this.politicsEtl.sync(),
                this.techEtl.sync()
            ]);
            // Run signals aggregator after others
            await this.signalsEtl.sync();
            console.log('Manual ETL Trigger Completed');
        } catch (e) {
            console.error('ETL Trigger Failed', e);
        }
    }
}
