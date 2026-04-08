import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service.js';
import { AgentRunnerService } from './services/agent-runner.service.js';
import {
    DeployAgentDto,
    DeployForecastingAgentDto,
    AgentResponseDto,
    AgentTypeResponseDto,
    AgentQuotaResponseDto,
} from './dto/index.js';

const MAX_FREE_DEPLOYS = 7;

// Anchor program constants (must match programs/my-project/src/constants.rs)
const PROGRAM_ID = '56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7';
const PLATFORM_SEED = Buffer.from('platform');
const AGENT_SEED = Buffer.from('agent');
const AGENT_REGISTRY_SEED = Buffer.from('agent_registry');

@Injectable()
export class AgentsService {
    private readonly logger = new Logger(AgentsService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
        private readonly agentRunnerService: AgentRunnerService,
    ) {}

    private async resolveUserId(identifier: string): Promise<string | null> {
        if (!identifier) return null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        if (isUuid) return identifier;

        const supabase = this.supabaseService.getAdminClient();
        const { data: wData } = await supabase.from('wallet_addresses').select('user_id').eq('address', identifier.toLowerCase()).single();
        if (wData?.user_id) return wData.user_id;

        const { data: profiles } = await supabase.from('profiles').select('id, wallet_addresses');
        if (profiles) {
            const found = profiles.find((p) => p.wallet_addresses?.some((w: any) => w.address?.toLowerCase() === identifier.toLowerCase()));
            if (found) return found.id;
        }

        // Auto-provision a user if it's a valid Base58 Solana address structure (roughly 32-44 characters)
        if (identifier.length >= 32 && identifier.length <= 44 && !identifier.includes('@')) {
            try {
                this.logger.log(`Auto-provisioning wallet user for: ${identifier}`);
                const randomPassword = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    email: `${identifier.slice(0, 8)}_${Date.now()}@wallet.exoduze.app`,
                    password: randomPassword,
                    email_confirm: true,
                    user_metadata: {
                        wallet_address: identifier,
                        chain: 'solana',
                    },
                });

                if (authData?.user) {
                    const newUserId = authData.user.id;
                    // Create Profile
                    await supabase.from('profiles').insert({
                        id: newUserId,
                        wallet_addresses: [{ address: identifier.toLowerCase(), chain: 'solana', isPrimary: true }]
                    });
                    // Insert Wallet Address Record
                    await supabase.from('wallet_addresses').insert({
                        user_id: newUserId,
                        address: identifier.toLowerCase(),
                        chain: 'solana',
                        is_primary: true
                    });
                    this.logger.log(`Successfully provisioned dynamic user UUID [${newUserId}] for wallet [${identifier}]`);
                    return newUserId;
                } else if (authError) {
                    this.logger.warn(`Auth Error resolving user auto-provision: ${authError.message}`);
                }
            } catch (e) {
                this.logger.error(`Auto-provision failed for ${identifier}`, e);
            }
        }
        
        return null;
    }

    /**
     * Deploy a new AI agent (checks quota + optional on-chain)
     */
    async deploy(rawUserId: string, dto: DeployAgentDto): Promise<AgentResponseDto> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Wallet not connected or missing User ID');

        const supabase = this.supabaseService.getClient();

        // 1. Check quota
        const quota = await this.getQuota(userId);
        if (quota.deploys_remaining <= 0) {
            throw new BadRequestException(
                `Agent deploy limit reached (${MAX_FREE_DEPLOYS}/${MAX_FREE_DEPLOYS}). ` +
                `Terminate an existing agent to free a slot.`,
            );
        }

        // 2. Validate agent type exists
        const { data: agentType, error: typeError } = await supabase
            .from('ai_agent_types')
            .select('*')
            .eq('id', dto.agent_type_id)
            .eq('is_enabled', true)
            .single();

        if (typeError || !agentType) {
            throw new NotFoundException('Agent type not found or disabled');
        }

        // 2. Format configuration array
        const marketIds = dto.market_ids && dto.market_ids.length > 0 ? dto.market_ids : [];
        if (marketIds.length > 3) {
            throw new BadRequestException('Cannot deploy agent to more than 3 markets at once.');
        }

        const configuration = {
            risk_level: dto.risk_level,
            target_outcome: dto.target_outcome,
            direction: dto.direction,
            market_ids: marketIds,
        };

        // 3. Insert agent
        const { data: agent, error: insertError } = await supabase
            .from('ai_agents')
            .insert({
                user_id: userId,
                agent_type_id: dto.agent_type_id,
                market_id: marketIds.length > 0 ? marketIds[0] : null,
                configuration: configuration,
                name: dto.name,
                strategy_prompt: dto.strategy_prompt,
                target_outcome: dto.target_outcome || 'home',
                direction: dto.direction || 'long',
                risk_level: dto.risk_level || 3,
                status: 'active',
                deployed_at: new Date().toISOString(),
            })
            .select('*')
            .single();

        if (insertError) {
            // The DB trigger will throw if quota exceeded
            if (insertError.message?.includes('deploy limit')) {
                throw new BadRequestException(insertError.message);
            }
            this.logger.error(`Failed to deploy agent: ${insertError.message}`);
            throw new BadRequestException(`Failed to deploy agent: ${insertError.message}`);
        }

        // 4. Log deployment
        await supabase.from('ai_agent_logs').insert({
            agent_id: agent.id,
            action: 'deploy',
            message: `Agent "${dto.name}" deployed with strategy for ${agentType.sector} sector`,
            details: {
                agent_type: agentType.slug,
                risk_level: dto.risk_level,
                target_outcome: dto.target_outcome,
                direction: dto.direction,
            },
        });

        this.logger.log(`Agent deployed: ${agent.id} by user ${userId} (deploy #${agent.deploy_number})`);

        // 5. Attempt on-chain deployment (async, non-blocking)
        this.deployOnChain(agent.id, dto).catch((err) => {
            this.logger.warn(`On-chain deploy skipped for agent ${agent.id}: ${err.message}`);
        });

        return this.toResponseDto(agent, agentType);
    }

    /**
     * Deploy an autonomous forecasting AI agent
     */
    async deployForecaster(rawUserId: string, dto: DeployForecastingAgentDto): Promise<any> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Wallet not connected or missing User ID');
        
        // Use admin client to bypass RLS since the backend already authenticated the user
        const supabase = this.supabaseService.getAdminClient();

        // 1. Check quota
        const quota = await this.getQuota(userId);
        if (quota.deploys_remaining <= 0) {
            throw new BadRequestException(
                `Agent deploy limit reached (${MAX_FREE_DEPLOYS}/${MAX_FREE_DEPLOYS}). ` +
                `Terminate an existing agent to free a slot.`
            );
        }

        // 2. Insert forecaster agent into the new agents table
        const { data: agent, error: insertError } = await supabase
            .from('agents')
            .insert({
                user_id: userId,
                name: dto.name,
                system_prompt: dto.system_prompt,
                model: 'Qwen/Qwen2.5-7B-Instruct',
                status: 'active',
            })
            .select('*')
            .single();

        if (insertError) {
            this.logger.error(`Failed to deploy forecaster agent: ${insertError.message}`);
            throw new BadRequestException(`Failed to deploy forecaster agent: ${insertError.message}`);
        }

        // 3. Link agent to competition if competition_ids provided
        const competitionIds = dto.competition_ids || [];
        if (competitionIds.length > 3) {
            throw new BadRequestException('Cannot deploy forecaster agent to more than 3 competitions at once.');
        }

        if (competitionIds.length > 0) {
            const entries = competitionIds.map(compId => ({
                agent_id: agent.id,
                competition_id: compId,
                user_id: userId,
                status: 'active',
            }));
            
            await supabase.from('agent_competition_entries').insert(entries);
        }

        this.logger.log(`Forecasting Agent deployed: ${agent.id} by user ${userId} (max ${MAX_FREE_DEPLOYS} free prompts)`);

        // Trigger immediate first prediction so the frontend updates instantly
        this.agentRunnerService.runSingleAgentId(agent.id).catch(err => {
            this.logger.warn(`Failed to trigger immediate run for agent ${agent.id}: ${err.message}`);
        });

        return { ...agent, max_free_prompts: MAX_FREE_DEPLOYS, prompts_used: 0 };
    }

    /**
     * List user's forecaster agents (from `agents` table)
     */
    async listForecasters(
        rawUserId: string,
        status?: string,
        limit: number = 20,
        offset: number = 0,
    ): Promise<{ data: any[]; total: number }> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) return { data: [], total: 0 };
        const supabase = this.supabaseService.getAdminClient();

        let query = supabase
            .from('agents')
            .select('*, agent_competition_entries(competition_id, brier_score, status, final_rank, competitions(title, sector))', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error, count } = await query;

        if (error) {
            this.logger.error(`Failed to list forecaster agents: ${error.message}`);
            return { data: [], total: 0 };
        }

        // Enrich with prompt usage count
        const enriched = await Promise.all(
            (data || []).map(async (agent: any) => {
                const { data: latestPreds, count: promptCount } = await supabase
                    .from('agent_predictions')
                    .select('reasoning', { count: 'exact' })
                    .eq('agent_id', agent.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const latestReasoning = latestPreds && latestPreds.length > 0 ? latestPreds[0].reasoning : null;

                return {
                    ...agent,
                    latest_reasoning: latestReasoning,
                    prompts_used: promptCount || 0,
                    max_free_prompts: MAX_FREE_DEPLOYS,
                    competitions: (agent.agent_competition_entries || []).map((e: any) => ({
                        competition_id: e.competition_id,
                        brier_score: e.brier_score,
                        status: e.status,
                        final_rank: e.final_rank,
                        title: e.competitions?.title,
                        sector: e.competitions?.sector,
                    })),
                };
            }),
        );

        return { data: enriched, total: count || 0 };
    }

    /**
     * Toggle forecaster agent status (active/paused)
     */
    async toggleForecasterStatus(
        agentId: string,
        rawUserId: string,
        newStatus: 'active' | 'paused',
    ): Promise<any> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('agents')
            .update({ status: newStatus })
            .eq('id', agentId)
            .eq('user_id', userId)
            .select('*')
            .single();

        if (error || !data) {
            throw new NotFoundException('Forecaster agent not found');
        }

        this.logger.log(`Forecaster ${agentId} status changed to ${newStatus} by user ${userId}`);
        return data;
    }

    /**
     * Terminate a forecaster agent (frees quota slot)
     */
    async terminateForecaster(agentId: string, rawUserId: string): Promise<void> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('agents')
            .update({ status: 'terminated' })
            .eq('id', agentId)
            .eq('user_id', userId)
            .select('id')
            .single();

        if (error || !data) {
            throw new NotFoundException('Forecaster agent not found');
        }

        // Also deactivate competition entries
        await supabase
            .from('agent_competition_entries')
            .update({ status: 'terminated' })
            .eq('agent_id', agentId);

        this.logger.log(`Forecaster ${agentId} terminated by user ${userId}`);
    }

    /**
     * Delete a forecaster agent permanently
     */
    async deleteForecaster(agentId: string, rawUserId: string): Promise<void> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getAdminClient();

        // 1. Delete associated competition entries first (FK constraint)
        await supabase
            .from('agent_competition_entries')
            .delete()
            .eq('agent_id', agentId);

        // 2. Delete predictions (FK constraint)
        await supabase
            .from('agent_predictions')
            .delete()
            .eq('agent_id', agentId);

        // 3. Delete the agent itself
        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', agentId)
            .eq('user_id', userId);

        if (error) {
            throw new BadRequestException(`Failed to delete agent: ${error.message}`);
        }

        this.logger.log(`Forecaster ${agentId} permanently deleted by user ${userId}`);
    }

    /**
     * List user's agents
     */
    async listByUser(
        rawUserId: string,
        status?: string,
        limit: number = 20,
        offset: number = 0,
    ): Promise<{ data: AgentResponseDto[]; total: number }> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) return { data: [], total: 0 };
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('ai_agents')
            .select('*, ai_agent_types(*)', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error, count } = await query;

        if (error) {
            this.logger.error(`Failed to list agents: ${error.message}`);
            return { data: [], total: 0 };
        }

        return {
            data: (data || []).map((a: any) => this.toResponseDto(a, a.ai_agent_types)),
            total: count || 0,
        };
    }

    /**
     * Get agent by ID
     */
    async findById(agentId: string, rawUserId: string): Promise<AgentResponseDto> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('ai_agents')
            .select('*, ai_agent_types(*)')
            .eq('id', agentId)
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Agent not found');
        }

        return this.toResponseDto(data, data.ai_agent_types);
    }

    /**
     * List available agent types
     */
    async listTypes(sector?: string): Promise<AgentTypeResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('ai_agent_types')
            .select('*')
            .eq('is_enabled', true)
            .order('sector', { ascending: true });

        if (sector) {
            query = query.eq('sector', sector);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to list agent types: ${error.message}`);
            return [];
        }

        return (data || []).map(this.toTypeResponseDto);
    }

    /**
     * Get user's deploy quota
     */
    async getQuota(rawUserId: string): Promise<AgentQuotaResponseDto> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) {
            return {
                deploys_used: 0,
                max_deploys: MAX_FREE_DEPLOYS,
                deploys_remaining: 0,
            };
        }

        const supabase = this.supabaseService.getClient();

        const { count, error } = await supabase
            .from('ai_agents')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .neq('status', 'terminated');

        if (error) {
            this.logger.error(`Failed to get quota: ${error.message}`);
        }

        const used = count || 0;
        return {
            deploys_used: used,
            max_deploys: MAX_FREE_DEPLOYS,
            deploys_remaining: Math.max(0, MAX_FREE_DEPLOYS - used),
        };
    }

    /**
     * Toggle agent status (activate/pause)
     */
    async toggleStatus(
        agentId: string,
        rawUserId: string,
        newStatus: 'active' | 'paused',
    ): Promise<AgentResponseDto> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('ai_agents')
            .update({ status: newStatus })
            .eq('id', agentId)
            .eq('user_id', userId)
            .select('*, ai_agent_types(*)')
            .single();

        if (error || !data) {
            throw new NotFoundException('Agent not found');
        }

        // Log status change
        await supabase.from('ai_agent_logs').insert({
            agent_id: agentId,
            action: newStatus === 'active' ? 'activate' : 'pause',
            message: `Agent status changed to ${newStatus}`,
        });

        return this.toResponseDto(data, data.ai_agent_types);
    }

    /**
     * Terminate (soft-delete) an agent — frees quota slot
     */
    async terminate(agentId: string, rawUserId: string): Promise<void> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('ai_agents')
            .update({
                status: 'terminated',
                terminated_at: new Date().toISOString(),
            })
            .eq('id', agentId)
            .eq('user_id', userId)
            .select('id')
            .single();

        if (error || !data) {
            throw new NotFoundException('Agent not found');
        }

        await supabase.from('ai_agent_logs').insert({
            agent_id: agentId,
            action: 'terminate',
            message: 'Agent terminated by user',
        });

        this.logger.log(`Agent ${agentId} terminated by user ${userId}`);
    }

    // ========================
    // Wagering & Leaderboard
    // ========================

    /**
     * Create a wager between two agents on a competition
     */
    async createWager(rawUserId: string, data: {
        agent_id: string;
        competition_id: string;
        wager_amount: number;
    }): Promise<any> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');
        const supabase = this.supabaseService.getClient();

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', data.agent_id)
            .eq('user_id', userId)
            .single();

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        // Create wager record
        const { data: wager, error } = await supabase
            .from('agent_wagers')
            .insert({
                agent_id: data.agent_id,
                user_id: userId,
                competition_id: data.competition_id,
                wager_amount: data.wager_amount,
                refund_rate: 0.5, // 50% refund on loss
                status: 'active',
            })
            .select('*')
            .single();

        if (error) {
            this.logger.error(`Failed to create wager: ${error.message}`);
            throw new BadRequestException(`Failed to create wager: ${error.message}`);
        }

        this.logger.log(`Wager created: ${wager.id} — ${data.wager_amount} SOL on agent ${data.agent_id}`);
        return wager;
    }

    /**
     * Get agent leaderboard for a competition — ranked by weighted_score (lower = better).
     * Falls back to raw brier_score for agents without weighted scores.
     */
    async getLeaderboard(competitionId?: string, limit: number = 20): Promise<any[]> {
        const supabase = this.supabaseService.getAdminClient();

        // If competition_id provided, use the DB function for weighted ranking
        if (competitionId) {
            const { data, error } = await supabase.rpc('get_weighted_leaderboard', {
                p_competition_id: competitionId,
                p_limit: Math.min(Math.max(1, limit), 100),
            });

            if (!error && data && data.length > 0) {
                return data.map((row: any) => ({
                    rank: row.rank_position,
                    agent_id: row.agent_id,
                    agent_name: row.agent_name,
                    user_id: null, // sanitized
                    brier_score: row.raw_brier_avg ? Number(row.raw_brier_avg) : null,
                    weighted_score: row.weighted_score ? Number(row.weighted_score) : null,
                    prediction_count: row.prediction_count || 0,
                    last_scored_at: row.last_scored_at,
                    rank_trend: row.rank_trend || 0,
                    has_min_predictions: row.has_min_predictions,
                    competition_id: competitionId,
                    status: row.agent_status,
                }));
            }
        }

        // Fallback: global leaderboard or no weighted scores yet
        let query = supabase
            .from('agent_competition_entries')
            .select('*, agents(id, name, user_id, model)')
            .order('weighted_score', { ascending: true, nullsFirst: false })
            .limit(limit);

        if (competitionId) {
            query = query.eq('competition_id', competitionId);
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to get leaderboard: ${error.message}`);
            return [];
        }

        return (data || []).map((entry: any, index: number) => ({
            rank: index + 1,
            agent_id: entry.agent_id,
            agent_name: entry.agents?.name || 'Unknown',
            user_id: null,
            brier_score: entry.brier_score,
            weighted_score: entry.weighted_score ? Number(entry.weighted_score) : null,
            prediction_count: entry.prediction_count || 0,
            last_scored_at: entry.last_scored_at,
            rank_trend: entry.rank_trend || 0,
            has_min_predictions: (entry.prediction_count || 0) >= 3,
            competition_id: entry.competition_id,
            status: entry.status,
        }));
    }

    /**
     * Get all active competitors for a competition (public, sanitized)
     * Returns only safe-to-display fields — no system_prompt, no user secrets
     * Now includes weighted_score, prediction_count, rank_trend for live leaderboard
     */
    async getCompetitors(
        competitionId: string,
        limit: number = 50,
    ): Promise<any[]> {
        if (!competitionId) return [];

        // Input validation: must be UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(competitionId)) {
            this.logger.warn(`Invalid competition_id format: ${competitionId}`);
            return [];
        }

        // Clamp limit to prevent abuse
        const safeLimit = Math.min(Math.max(1, limit), 100);

        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('agent_competition_entries')
            .select('agent_id, brier_score, weighted_score, prediction_count, last_scored_at, rank_trend, status, agents(id, name, model, status, created_at)')
            .eq('competition_id', competitionId)
            .in('status', ['active', 'paused'])
            .order('weighted_score', { ascending: true, nullsFirst: false })
            .limit(safeLimit);

        if (error) {
            this.logger.error(`Failed to get competitors: ${error.message}`);
            return [];
        }

        // Sanitize: only return public-safe fields, no system_prompt or user_id
        return (data || []).map((entry: any, index: number) => ({
            rank: index + 1,
            agent_id: entry.agent_id,
            agent_name: entry.agents?.name || 'Unknown Agent',
            model: entry.agents?.model || 'Unknown',
            agent_status: entry.agents?.status || entry.status,
            brier_score: entry.brier_score,
            weighted_score: entry.weighted_score ? Number(entry.weighted_score) : null,
            prediction_count: entry.prediction_count || 0,
            last_scored_at: entry.last_scored_at,
            rank_trend: entry.rank_trend || 0,
            has_min_predictions: (entry.prediction_count || 0) >= 3,
            competition_id: competitionId,
            deployed_at: entry.agents?.created_at,
        }));
    }

    /**
     * Get weighted live leaderboard with competition metadata and time remaining.
     * Used by the /agents/leaderboard/live endpoint for real-time UI.
     */
    async getWeightedLeaderboardLive(
        competitionId: string,
        limit: number = 50,
    ): Promise<{ entries: any[]; competition: any; time_remaining_ms: number }> {
        const supabase = this.supabaseService.getAdminClient();

        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(competitionId)) {
            return { entries: [], competition: null, time_remaining_ms: 0 };
        }

        // Get competition metadata
        const { data: comp } = await supabase
            .from('competitions')
            .select('id, title, sector, competition_start, competition_end, status, probabilities, base_probability')
            .eq('id', competitionId)
            .single();

        const timeRemainingMs = comp
            ? Math.max(0, new Date(comp.competition_end).getTime() - Date.now())
            : 0;

        // Use the DB function for ranked results
        const safeLimit = Math.min(Math.max(1, limit), 100);
        const { data, error } = await supabase.rpc('get_weighted_leaderboard', {
            p_competition_id: competitionId,
            p_limit: safeLimit,
        });

        if (error) {
            this.logger.error(`Failed to get weighted leaderboard live: ${error.message}`);
            return { entries: [], competition: comp, time_remaining_ms: timeRemainingMs };
        }

        const entries = (data || []).map((row: any) => ({
            rank: row.rank_position,
            agent_id: row.agent_id,
            agent_name: row.agent_name,
            model: row.model,
            agent_status: row.agent_status,
            weighted_score: row.weighted_score ? Number(row.weighted_score) : null,
            raw_brier_avg: row.raw_brier_avg ? Number(row.raw_brier_avg) : null,
            prediction_count: row.prediction_count || 0,
            last_scored_at: row.last_scored_at,
            rank_trend: row.rank_trend || 0,
            deployed_at: row.deployed_at,
            has_min_predictions: row.has_min_predictions,
            competition_id: competitionId,
        }));

        return { entries, competition: comp, time_remaining_ms: timeRemainingMs };
    }

    /**
     * Get predictions for an agent
     */
    async getAgentPredictions(agentId: string, rawUserId: string, limit: number = 20): Promise<any[]> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) return [];
        const supabase = this.supabaseService.getClient();

        // Verify ownership
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', agentId)
            .eq('user_id', userId)
            .single();

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        const { data, error } = await supabase
            .from('agent_predictions')
            .select('*')
            .eq('agent_id', agentId)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to get predictions: ${error.message}`);
            return [];
        }

        return data || [];
    }

    /**
     * Get agent execution logs
     */
    async getLogs(
        agentId: string,
        rawUserId: string,
        limit: number = 50,
    ): Promise<any[]> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) return [];
        const supabase = this.supabaseService.getClient();

        // Verify ownership
        const { data: agent } = await supabase
            .from('ai_agents')
            .select('id')
            .eq('id', agentId)
            .eq('user_id', userId)
            .single();

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        const { data, error } = await supabase
            .from('ai_agent_logs')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to get agent logs: ${error.message}`);
            return [];
        }

        return data || [];
    }

    // ========================
    // On-Chain Integration
    // ========================

    /**
     * Deploy agent on-chain via Anchor program (async, non-blocking)
     * Stores the on-chain agent PDA pubkey and tx signature back to Supabase
     */
    private async deployOnChain(agentId: string, dto: DeployAgentDto): Promise<void> {
        try {
            // Dynamic import to avoid hard dependency
            const anchor = await import('@coral-xyz/anchor');
            const { PublicKey, Keypair, Connection, clusterApiUrl } = await import('@solana/web3.js');

            const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL') || clusterApiUrl('devnet');
            const connection = new Connection(rpcUrl, 'confirmed');

            // Load wallet from env (base58 private key or path)
            const walletKey = this.configService.get<string>('SOLANA_WALLET_KEY');
            if (!walletKey) {
                throw new Error('SOLANA_WALLET_KEY not configured');
            }

            let keypair: InstanceType<typeof Keypair>;
            try {
                const secretKey = JSON.parse(walletKey);
                keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
            } catch {
                // Try base58 decode
                const bs58 = await import('bs58');
                keypair = Keypair.fromSecretKey(bs58.default.decode(walletKey));
            }

            const wallet = new anchor.Wallet(keypair);
            const provider = new anchor.AnchorProvider(connection, wallet, {
                commitment: 'confirmed',
            });

            const programId = new PublicKey(PROGRAM_ID);

            // Find platform PDA
            const [platformPda] = PublicKey.findProgramAddressSync(
                [PLATFORM_SEED],
                programId,
            );

            // Find agent registry PDA for user
            const [registryPda] = PublicKey.findProgramAddressSync(
                [AGENT_REGISTRY_SEED, wallet.publicKey.toBuffer()],
                programId,
            );

            // Note: The actual on-chain deploy requires the market account and IDL.
            // For now, we store a marker indicating on-chain readiness.
            // In production, this would call program.methods.deployAgent(...)

            // Store on-chain reference
            const supabase = this.supabaseService.getAdminClient();
            await supabase
                .from('ai_agents')
                .update({
                    onchain_registry_pubkey: registryPda.toBase58(),
                    onchain_agent_pubkey: `pending-${platformPda.toBase58().slice(0, 16)}`,
                })
                .eq('id', agentId);

            // Log on-chain attempt
            await supabase.from('ai_agent_logs').insert({
                agent_id: agentId,
                action: 'onchain_register',
                message: `On-chain registry PDA: ${registryPda.toBase58()} (devnet)`,
                details: {
                    program_id: PROGRAM_ID,
                    cluster: 'devnet',
                    registry_pda: registryPda.toBase58(),
                    platform_pda: platformPda.toBase58(),
                },
            });

            this.logger.log(`On-chain registration prepared for agent ${agentId}`);
        } catch (err: any) {
            this.logger.warn(`On-chain deploy failed for agent ${agentId}: ${err.message}`);
            // Non-blocking — agent still works off-chain
        }
    }

    // ========================
    // Helpers
    // ========================

    private toResponseDto(agent: any, agentType?: any): AgentResponseDto {
        return {
            id: agent.id,
            user_id: agent.user_id,
            agent_type_id: agent.agent_type_id,
            market_ids: agent.configuration?.market_ids || (agent.market_id ? [agent.market_id] : []),
            market_id: agent.configuration?.market_ids?.[0] || agent.market_id,
            name: agent.name,
            strategy_prompt: agent.strategy_prompt,
            target_outcome: agent.target_outcome,
            direction: agent.direction,
            risk_level: agent.risk_level,
            onchain_agent_pubkey: agent.onchain_agent_pubkey,
            onchain_tx_signature: agent.onchain_tx_signature,
            status: agent.status,
            accuracy_score: parseFloat(agent.accuracy_score) || 0,
            total_trades: agent.total_trades || 0,
            total_pnl: parseFloat(agent.total_pnl) || 0,
            win_rate: parseFloat(agent.win_rate) || 0,
            deploy_number: agent.deploy_number,
            deployed_at: agent.deployed_at,
            last_trade_at: agent.last_trade_at,
            created_at: agent.created_at,
            updated_at: agent.updated_at,
            agent_type: agentType ? this.toTypeResponseDto(agentType) : undefined,
        };
    }

    private toTypeResponseDto(type: any): AgentTypeResponseDto {
        return {
            id: type.id,
            name: type.name,
            slug: type.slug,
            description: type.description,
            sector: type.sector,
            default_strategy: type.default_strategy,
            example_prompts: type.example_prompts || [],
            icon_emoji: type.icon_emoji,
            color_hex: type.color_hex,
            is_premium: type.is_premium,
        };
    }
}
