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
import { DeployAgentDto } from './dto/index.js';

// Note: Using a simple guard placeholder — in production this should be your JwtAuthGuard
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('AI Agents')
@Controller('agents')
export class AgentsController {
    constructor(private readonly agentsService: AgentsService) { }

    /**
     * Deploy a new AI agent
     */
    @Post('deploy')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Deploy a new AI agent (checks quota, max 10 free)' })
    async deploy(@Body() dto: DeployAgentDto, @Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.agentsService.deploy(userId, dto);
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
    @ApiOperation({ summary: "Get user's remaining deploy quota (max 10 free)" })
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
