import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import { CreateCompetitionDto, CompetitionResponseDto, SectorSummaryDto } from './dto/index.js';

@Injectable()
export class CompetitionsService {
    private readonly logger = new Logger(CompetitionsService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Create a new competition
     */
    async create(dto: CreateCompetitionDto): Promise<CompetitionResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('competitions')
            .insert({
                title: dto.title,
                description: dto.description || null,
                sector: dto.sector,
                team_home: dto.team_home || null,
                team_away: dto.team_away || null,
                outcomes: dto.outcomes || ['Yes', 'No'],
                competition_start: dto.competition_start,
                competition_end: dto.competition_end,
                probabilities: dto.probabilities || [5000, 5000],
                prize_pool: dto.prize_pool || 0,
                max_entries: dto.max_entries || 1000,
                bonding_k: dto.bonding_k || 100000,
                bonding_n: dto.bonding_n || 150,
                tags: dto.tags || [],
                image_url: dto.image_url || null,
                metadata: dto.metadata || {},
            })
            .select('*')
            .single();

        if (error) {
            this.logger.error(`Failed to create competition: ${error.message}`);
            throw new Error(`Failed to create competition: ${error.message}`);
        }

        this.logger.log(`Competition created: ${data.id} — ${dto.title}`);
        return this.toResponseDto(data);
    }

    /**
     * Find active competitions, optionally filtered by sector
     */
    async findActive(sector?: string, limit: number = 20): Promise<CompetitionResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('competitions')
            .select('*')
            .in('status', ['active', 'upcoming'])
            .order('competition_start', { ascending: true })
            .limit(limit);

        if (sector && sector !== 'all' && sector !== 'top' && sector !== 'foryou' && sector !== 'latest' && sector !== 'signals') {
            query = query.eq('sector', sector);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to fetch active competitions: ${error.message}`);
            return [];
        }

        return (data || []).map((c: any) => this.toResponseDto(c));
    }

    /**
     * Find competitions by sector
     */
    async findBySector(sector: string, limit: number = 20): Promise<CompetitionResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('sector', sector)
            .in('status', ['active', 'upcoming', 'settled'])
            .order('competition_start', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to fetch sector competitions: ${error.message}`);
            return [];
        }

        return (data || []).map((c: any) => this.toResponseDto(c));
    }

    /**
     * Get competition by ID
     */
    async findById(id: string): Promise<CompetitionResponseDto> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Competition not found: ${id}`);
        }

        return this.toResponseDto(data);
    }

    /**
     * Get count of active/upcoming competitions per sector
     */
    async getSectorSummary(): Promise<SectorSummaryDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('sector, status')
            .in('status', ['active', 'upcoming']);

        if (error) {
            this.logger.error(`Failed to fetch sector summary: ${error.message}`);
            return [];
        }

        // Aggregate in JS for simplicity
        const sectorMap = new Map<string, { active: number; upcoming: number }>();
        for (const row of data || []) {
            const existing = sectorMap.get(row.sector) || { active: 0, upcoming: 0 };
            if (row.status === 'active') existing.active++;
            else if (row.status === 'upcoming') existing.upcoming++;
            sectorMap.set(row.sector, existing);
        }

        return Array.from(sectorMap.entries()).map(([sector, counts]) => ({
            sector,
            active_count: counts.active,
            upcoming_count: counts.upcoming,
        }));
    }

    /**
     * Find active competitions for a specific sector + horizon
     */
    async findActiveByHorizon(sector: string, timeHorizon: string): Promise<CompetitionResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('sector', sector)
            .eq('time_horizon', timeHorizon)
            .in('status', ['active', 'upcoming'])
            .limit(1);

        if (error) {
            this.logger.error(`Failed to fetch by horizon: ${error.message}`);
            return [];
        }

        return (data || []).map((c: any) => this.toResponseDto(c));
    }

    /**
     * Update competition probabilities (used by on-chain sync)
     */
    async updateProbabilities(id: string, probabilities: number[]): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        await supabase
            .from('competitions')
            .update({ probabilities })
            .eq('id', id);
    }

    /**
     * Link on-chain market pubkey to competition
     */
    async linkOnChain(id: string, pubkey: string, txSignature: string): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        await supabase
            .from('competitions')
            .update({
                onchain_market_pubkey: pubkey,
                onchain_tx_signature: txSignature,
            })
            .eq('id', id);

        this.logger.log(`Competition ${id} linked to on-chain: ${pubkey}`);
    }

    // ========================
    // Helpers
    // ========================

    private toResponseDto(competition: any): CompetitionResponseDto {
        const now = Date.now();
        const endTime = new Date(competition.competition_end).getTime();
        const startTime = new Date(competition.competition_start).getTime();

        return {
            id: competition.id,
            title: competition.title,
            description: competition.description,
            sector: competition.sector,
            team_home: competition.team_home,
            team_away: competition.team_away,
            outcomes: competition.outcomes || ['Yes', 'No'],
            competition_start: competition.competition_start,
            competition_end: competition.competition_end,
            status: competition.status,
            winning_outcome: competition.winning_outcome,
            prize_pool: parseFloat(competition.prize_pool) || 0,
            entry_count: competition.entry_count || 0,
            max_entries: competition.max_entries || 1000,
            probabilities: competition.probabilities || [5000, 5000],
            onchain_market_pubkey: competition.onchain_market_pubkey,
            bonding_k: competition.bonding_k || 100000,
            bonding_n: competition.bonding_n || 150,
            image_url: competition.image_url,
            tags: competition.tags || [],
            metadata: competition.metadata || {},
            time_horizon: competition.time_horizon || null,
            seconds_remaining: Math.max(0, Math.floor((endTime - now) / 1000)),
            progress_pct: now < startTime ? 0 : now > endTime ? 100 :
                Math.round((now - startTime) / (endTime - startTime) * 100),
            capacity_pct: competition.max_entries > 0
                ? Math.round((competition.entry_count || 0) / competition.max_entries * 100)
                : 0,
            created_at: competition.created_at,
            updated_at: competition.updated_at,
        };
    }
}
