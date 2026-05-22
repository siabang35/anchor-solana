import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    Headers,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompetitionsService } from './competitions.service.js';
import { EtlIngestionService } from './services/etl-ingestion.service.js';
import { RealtimeCompetitionSeederService } from './services/realtime-competition-seeder.service.js';
import { CreateCompetitionDto, EtlWebhookDto } from './dto/index.js';

@ApiTags('Competitions')
@Controller('competitions')
export class CompetitionsController {
    constructor(
        private readonly competitionsService: CompetitionsService,
        private readonly etlIngestionService: EtlIngestionService,
        private readonly seederService: RealtimeCompetitionSeederService,
    ) {}

    /**
     * Create a new competition (admin/service only)
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new sector competition' })
    async create(@Body() dto: CreateCompetitionDto) {
        return this.competitionsService.create(dto);
    }

    /**
     * Webhook to receive real-time clustered data from ETL pipeline
     */
    @Post('etl-webhook')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Process incoming ETL news cluster' })
    async processEtlCluster(@Body() dto: EtlWebhookDto) {
        const result = await this.etlIngestionService.processCluster(
            dto.category,
            dto.articles,
            dto.title,
            dto.signals,
            dto.horizon
        );
        return { success: !!result };
    }

    /**
     * ADMIN: Force-reset all competitions and reseed with fresh data.
     * Settles all active/upcoming competitions, clears cooldowns,
     * then creates 4 fresh competitions per category (7 categories × 4 horizons = 28 total).
     */
    @Post('admin/reset-and-reseed')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Force reset all competitions and reseed with fresh data' })
    async forceResetAndReseed(
        @Headers('x-admin-key') adminKey?: string,
    ) {
        // Simple admin key protection
        const expectedKey = process.env.ADMIN_API_KEY || 'exoduze-admin-reset-2026';
        if (adminKey !== expectedKey) {
            throw new ForbiddenException('Invalid admin key');
        }

        const result = await this.seederService.forceResetAndReseed();
        return result;
    }

    /**
     * List active competitions
     */
    @Get()
    @ApiOperation({ summary: 'List active/upcoming competitions' })
    async findActive(
        @Query('sector') sector?: string,
        @Query('limit') limit?: string,
    ) {
        return this.competitionsService.findActive(
            sector,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    /**
     * Get sector competition summary (counts per sector)
     */
    @Get('sectors/summary')
    @ApiOperation({ summary: 'Get active competition counts per sector' })
    async getSectorSummary() {
        return this.competitionsService.getSectorSummary();
    }

    /**
     * Get historical sector stats (total volume, distributed, etc)
     */
    @Get('sectors/:sector/stats')
    @ApiOperation({ summary: 'Get historical stats for a sector' })
    async getSectorStats(@Param('sector') sector: string) {
        return this.competitionsService.getSectorStats(sector);
    }

    /**
     * Get competitions by sector
     */
    @Get('sector/:sector')
    @ApiOperation({ summary: 'Get competitions for a specific sector' })
    async findBySector(
        @Param('sector') sector: string,
        @Query('limit') limit?: string,
    ) {
        return this.competitionsService.findBySector(
            sector,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    /**
     * Get clusters for a competition
     */
    @Get('clusters')
    @ApiOperation({ summary: 'Get news clusters for a competition' })
    async getClusters(@Query('competition_id') competitionId?: string) {
        return this.competitionsService.getClusters(competitionId);
    }

    /**
     * Get competition by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get competition details by ID' })
    async findById(@Param('id') id: string) {
        return this.competitionsService.findById(id);
    }
}
