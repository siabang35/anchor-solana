import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentsService } from './agents.service.js';
import { AgentRunnerService } from './services/agent-runner.service.js';
import { DeployAgentDto, DeployForecastingAgentDto } from './dto/index.js';

// Note: Using a simple guard placeholder — in production this should be your JwtAuthGuard
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('AI Agents')
@Controller('agents')
export class AgentsController {
    constructor(
        private readonly agentsService: AgentsService,
        private readonly agentRunner: AgentRunnerService,
    ) { }

    /**
     * Deploy a new AI agent
     */
    @Post('deploy')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Deploy a new AI agent (checks quota, max 7 free)' })
    async deploy(@Body() dto: DeployAgentDto, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.deploy(userId, dto);
    }

    /**
     * Deploy an autonomous forecasting AI agent
     */
    @Post('deploy-forecaster')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Deploy a forecasting agent (Qwen 9B, max 7 free prompts)' })
    async deployForecaster(@Body() dto: DeployForecastingAgentDto, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.deployForecaster(userId, dto);
    }

    /**
     * List user's forecaster agents
     */
    @Get('forecasters')
    @ApiOperation({ summary: "List user's forecaster agents with status filter" })
    async listForecasters(
        @Req() req: any,
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.listForecasters(
            userId,
            status,
            limit ? parseInt(limit, 10) : 20,
            offset ? parseInt(offset, 10) : 0,
        );
    }

    /**
     * Toggle forecaster agent status (active/paused)
     */
    @Patch('forecasters/:id/status')
    @ApiOperation({ summary: 'Pause or resume a forecaster agent' })
    async toggleForecasterStatus(
        @Param('id') id: string,
        @Body('status') status: 'active' | 'paused',
        @Req() req: any,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.toggleForecasterStatus(id, userId, status);
    }

    /**
     * Manually trigger the agent runner loop for testing
     */
    @Post('runner/trigger')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Manually trigger agent prediction loop' })
    async triggerAgentRunner() {
        // Run in background 
        this.agentRunner.runAgentLoop().catch(err => console.error(err));
        return { message: 'Agent prediction loop started' };
    }

    /**
     * Delete a forecaster agent permanently
     */
    @Delete('forecasters/:id/hard')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Permanently delete a forecaster agent and its history' })
    async deleteForecaster(@Param('id') id: string, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.deleteForecaster(id, userId);
    }

    /**
     * Create a wager on an agent-vs-agent competition
     */
    @Post('wager')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a wager on your agent (50% refund on loss)' })
    async createWager(@Body() body: { agent_id: string; competition_id: string; wager_amount: number }, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.createWager(userId, body);
    }

    /**
     * Get weighted live leaderboard with competition metadata
     */
    @Get('leaderboard/live')
    @ApiOperation({ summary: 'Get weighted live leaderboard with competition time remaining and rank trends' })
    async getWeightedLeaderboardLive(
        @Query('competition_id') competitionId: string,
        @Query('limit') limit?: string,
    ) {
        if (!competitionId) {
            return { entries: [], competition: null, time_remaining_ms: 0 };
        }
        return this.agentsService.getWeightedLeaderboardLive(
            competitionId,
            limit ? parseInt(limit, 10) : 50,
        );
    }

    /**
     * Get agent leaderboard
     */
    @Get('leaderboard')
    @ApiOperation({ summary: 'Get agent competition leaderboard (ranked by weighted score)' })
    async getLeaderboard(
        @Query('competition_id') competitionId?: string,
        @Query('limit') limit?: string,
    ) {
        return this.agentsService.getLeaderboard(
            competitionId,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    /**
     * Get all competitors for a competition (public, sanitized)
     */
    @Get('competitors')
    @ApiOperation({ summary: 'List all active agents competing in a competition (public, safe)' })
    async getCompetitors(
        @Query('competition_id') competitionId: string,
        @Query('limit') limit?: string,
    ) {
        return this.agentsService.getCompetitors(
            competitionId,
            limit ? parseInt(limit, 10) : 50,
        );
    }

    /**
     * List user's agents
     */
    @Get()
    @ApiOperation({ summary: "List user's deployed agents" })
    async list(
        @Req() req: any,
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.listByUser(
            userId,
            status,
            limit ? parseInt(limit, 10) : 20,
            offset ? parseInt(offset, 10) : 0,
        );
    }

    /**
     * Get available agent types
     */
    @Get('types')
    @ApiOperation({ summary: 'List available AI agent types by sector' })
    async listTypes(@Query('sector') sector?: string) {
        return this.agentsService.listTypes(sector);
    }

    /**
     * Get user's deploy quota
     */
    @Get('quota')
    @ApiOperation({ summary: "Get user's remaining deploy quota (max 7 free)" })
    async getQuota(@Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.getQuota(userId);
    }

    /**
     * Get agent by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get agent details by ID' })
    async findById(@Param('id') id: string, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.findById(id, userId);
    }

    /**
     * Get agent predictions
     */
    @Get(':id/predictions')
    @ApiOperation({ summary: 'Get agent prediction history' })
    async getPredictions(
        @Param('id') id: string,
        @Req() req: any,
        @Query('limit') limit?: string,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.getAgentPredictions(id, userId, limit ? parseInt(limit, 10) : 20);
    }

    /**
     * Get agent logs
     */
    @Get(':id/logs')
    @ApiOperation({ summary: 'Get agent execution logs' })
    async getLogs(
        @Param('id') id: string,
        @Req() req: any,
        @Query('limit') limit?: string,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.getLogs(id, userId, limit ? parseInt(limit, 10) : 50);
    }

    /**
     * Toggle agent status (active/paused)
     */
    @Patch(':id/toggle')
    @ApiOperation({ summary: 'Activate or pause an agent' })
    async toggleStatus(
        @Param('id') id: string,
        @Body('status') status: 'active' | 'paused',
        @Req() req: any,
    ) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.toggleStatus(id, userId, status);
    }

    /**
     * Terminate an agent (frees quota slot)
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Terminate an agent (frees deploy quota slot)' })
    async terminate(@Param('id') id: string, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.terminate(id, userId);
    }
}
