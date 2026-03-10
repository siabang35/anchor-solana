import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompetitionsService } from './competitions.service.js';
import { CreateCompetitionDto } from './dto/index.js';

@ApiTags('Competitions')
@Controller('competitions')
export class CompetitionsController {
    constructor(private readonly competitionsService: CompetitionsService) {}

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
     * Get competition by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get competition details by ID' })
    async findById(@Param('id') id: string) {
        return this.competitionsService.findById(id);
    }
}
