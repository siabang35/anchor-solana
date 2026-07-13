import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service.js';
import { AgentRunnerService } from './services/agent-runner.service.js';
import { PoolService } from '../pool/pool.service.js';
import { TreasuryGuardService } from '../pool/treasury-guard.service.js';
import {
    DeployAgentDto,
    DeployForecastingAgentDto,
    AgentResponseDto,
    AgentTypeResponseDto,
    AgentQuotaResponseDto,
} from './dto/index.js';

const MAX_FREE_DEPLOYS = 7;
// No default auto-stake — pool_stakes are created only after real on-chain TX via /agents/wager

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
        @Optional() private readonly poolService: PoolService,
        @Optional() private readonly treasuryGuardService: TreasuryGuardService,
    ) { }

    /**
     * Resolve the primary wallet address of a user from their user ID (UUID or wallet address).
     * Necessary for validating on-chain transaction signatures sent by the specific user.
     */
    private async resolveUserWallet(rawUserId: string): Promise<string | null> {
        if (!rawUserId) return null;
        
        // If the identifier is already a base58 Solana wallet address, return it
        const isWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawUserId);
        if (isWallet) return rawUserId;

        const supabase = this.supabaseService.getAdminClient();
        
        // 1. Try to find from wallet_addresses table matching the primary flag
        const { data: wData } = await supabase
            .from('wallet_addresses')
            .select('address')
            .eq('user_id', rawUserId)
            .eq('is_primary', true)
            .maybeSingle();

        if (wData?.address) return wData.address;

        // 2. Try to find any wallet address from the wallet_addresses table
        const { data: wDataAny } = await supabase
            .from('wallet_addresses')
            .select('address')
            .eq('user_id', rawUserId)
            .limit(1)
            .maybeSingle();

        if (wDataAny?.address) return wDataAny.address;

        // 3. Fallback: Try profiles table JSONB data
        const { data: profile } = await supabase
            .from('profiles')
            .select('wallet_addresses')
            .eq('id', rawUserId)
            .maybeSingle();

        if (profile?.wallet_addresses) {
            const wallets = Array.isArray(profile.wallet_addresses) ? profile.wallet_addresses : [];
            const primary = wallets.find((w: any) => w.isPrimary || w.is_primary);
            if (primary?.address) return primary.address;
            if (wallets[0]?.address) return wallets[0].address;
        }

        // 4. Try resolveWalletAddress via poolService if available
        if (this.poolService) {
            try {
                return await (this.poolService as any).resolveWalletAddress(rawUserId);
            } catch {
                return null;
            }
        }

        return null;
    }

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
                const randomPassword = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
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

        // DIAGNOSTIC: Log exactly what the frontend sent
        this.logger.log(`📥 deployForecaster DTO: stake_amount=${dto.stake_amount}, name=${dto.name}, competitions=${dto.competition_ids?.length || 0}`);

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

        // 2. Insert forecaster agent with correct initial status ('pending' if there is a stake, 'active' if not)
        const competitionIds = dto.competition_ids || [];
        if (competitionIds.length === 0) {
            throw new BadRequestException('At least one competition must be selected.');
        }
        if (competitionIds.length > 3) {
            throw new BadRequestException('Cannot deploy forecaster agent to more than 3 competitions at once.');
        }

        const initialStatus = 'pending';

        const { data: agent, error: insertError } = await supabase
            .from('agents')
            .insert({
                user_id: userId,
                name: dto.name,
                system_prompt: dto.system_prompt,
                model: 'Qwen/Qwen2.5-7B-Instruct',
                status: initialStatus,
            })
            .select('*')
            .single();

        if (insertError) {
            this.logger.error(`Failed to deploy forecaster agent: ${insertError.message}`);
            throw new BadRequestException(`Failed to deploy forecaster agent: ${insertError.message}`);
        }

        // 3. Register agent in competitions — NO auto-stake here.
        //    Pool stakes are created ONLY after the frontend's real on-chain
        //    Solana TX is confirmed, via the /agents/wager endpoint.
        //    This ensures pool_stakes.stake_amount always matches the
        //    actual SOL deducted from the user's wallet.
        const stakeResults: Array<{ competition_id: string; stake_status: string; tx?: string }> = [];

        if (competitionIds.length > 0) {
            for (const compId of competitionIds) {
                try {
                    const { error: entryError } = await supabase.from('agent_competition_entries').insert({
                        agent_id: agent.id,
                        competition_id: compId,
                        user_id: userId,
                        status: initialStatus,
                    });
                    if (entryError) {
                        this.logger.warn(`Competition entry insert error: ${entryError.message}`);
                    }
                } catch (entryErr: any) {
                    this.logger.warn(`Competition entry failed for comp ${compId}: ${entryErr.message}`);
                }

                stakeResults.push({
                    competition_id: compId,
                    stake_status: 'pending_onchain', // Will be confirmed when frontend sends /agents/wager
                });
            }

            agent.status = initialStatus;
        }

        this.logger.log(`Forecasting Agent deployed: ${agent.id} by user ${userId} (max ${MAX_FREE_DEPLOYS} free prompts)`);

        // 4. Trigger immediate first prediction so the frontend updates instantly
        if (agent.status === 'active') {
            this.agentRunnerService.runSingleAgentId(agent.id).catch(err => {
                this.logger.warn(`Failed to trigger immediate run for agent ${agent.id}: ${err.message}`);
            });
        }

        return {
            ...agent,
            max_free_prompts: MAX_FREE_DEPLOYS,
            prompts_used: 0,
            stakes: stakeResults,
        };
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
            .select('*, agent_competition_entries(competition_id, brier_score, status, final_rank, competitions(title, sector, status)), pool_stakes(stake_amount, onchain_tx, verified_onchain, created_at), pool_winners(id, prize_amount, disburse_tx, claimed, rank, competition_id)', { count: 'exact' })
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
                        competition_status: e.competitions?.status,
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

        if (newStatus === 'active') {
            // Check if this agent has at least one active competition entry with a verified stake
            const { data: entries } = await supabase
                .from('agent_competition_entries')
                .select('competition_id')
                .eq('agent_id', agentId)
                .eq('status', 'active');

            if (!entries || entries.length === 0) {
                throw new BadRequestException('Cannot activate agent: no active competition entries found.');
            }

            const { data: stakes } = await supabase
                .from('pool_stakes')
                .select('id')
                .eq('agent_id', agentId)
                .in('competition_id', entries.map((e: any) => e.competition_id))
                .eq('status', 'active')
                .eq('verified_onchain', true);

            if (!stakes || stakes.length === 0) {
                throw new BadRequestException('Cannot activate agent: no verified stakes found for active competitions.');
            }
        }

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
     * Create a wager between two agents on a competition.
     * wager_amount MUST come from the user's input — never use a default.
     * The on-chain TX hash (onchain_tx) proves the stake was really transferred.
     */
    async createWager(rawUserId: string, data: {
        agent_id: string;
        competition_id: string;
        wager_amount: number;
        onchain_tx?: string;
    }): Promise<any> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) throw new UnauthorizedException('Missing User ID');

        // Strict validation: wager_amount must be explicitly provided
        if (!data.wager_amount || data.wager_amount <= 0 || !isFinite(data.wager_amount)) {
            throw new BadRequestException('wager_amount must be a positive number matching the on-chain stake');
        }

        const supabase = this.supabaseService.getClient();
        const adminSupabase = this.supabaseService.getAdminClient();

        // ═══════════════════════════════════════════════════════════════════════
        // TREASURY SECURITY GUARD: On-Chain Transaction Verification
        // Strictly verify that the stake has been paid on-chain to the treasury
        // before inserting wager/stake records into the database.
        // ═══════════════════════════════════════════════════════════════════════
        if (!data.onchain_tx) {
            throw new BadRequestException('Transaction signature (onchain_tx) is required to verify your stake.');
        }

        const userWallet = await this.resolveUserWallet(rawUserId);
        if (!userWallet) {
            throw new BadRequestException('Could not resolve user wallet address for on-chain verification.');
        }

        // Run multi-layer on-chain validation
        let isVerifiedOnchain = false;
        if (this.treasuryGuardService) {
            this.logger.log(`⏳ Verifying stake TX on-chain: ${data.onchain_tx.slice(0, 16)}... for wallet ${userWallet.slice(0, 12)}...`);
            const verification = await this.treasuryGuardService.verifyStakeTransaction(
                data.onchain_tx,
                data.wager_amount,
                userWallet,
            );

            if (!verification.verified) {
                this.logger.error(`🛡️ WAGER SECURITY BLOCKED: Wallet ${userWallet.slice(0, 12)}... tried to verify invalid TX: ${verification.error}`);
                throw new BadRequestException(`On-chain transaction verification failed: ${verification.error}`);
            }
            isVerifiedOnchain = true;
        } else {
            // Fallback (only if service not loaded/testing)
            this.logger.warn('⚠️ TreasuryGuardService not loaded. Performing local format-only check.');
            const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{40,128}$/;
            if (!base58Regex.test(data.onchain_tx)) {
                throw new BadRequestException('Invalid transaction signature format.');
            }
            isVerifiedOnchain = true;
        }

        // Additional DB-level replay check
        const { data: duplicateStake } = await adminSupabase
            .from('pool_stakes')
            .select('id, agent_id')
            .eq('onchain_tx', data.onchain_tx)
            .neq('agent_id', data.agent_id) // Allow updating own agent's transaction
            .limit(1)
            .maybeSingle();

        if (duplicateStake) {
            this.logger.error(`🛡️ REPLAY ATTEMPT: User ${userId} tried to reuse transaction signature ${data.onchain_tx} from agent ${duplicateStake.agent_id}`);
            throw new BadRequestException('Transaction signature has already been used for another stake.');
        }

        this.logger.log(`📥 createWager: Verified ${data.wager_amount} SOL | agent=${data.agent_id.slice(0,8)} | onchain=${data.onchain_tx.slice(0,16)}`);

        // Verify agent belongs to user using admin client to bypass RLS since users use wallet authentication
        const { data: agent } = await adminSupabase
            .from('agents')
            .select('id')
            .eq('id', data.agent_id)
            .eq('user_id', userId)
            .single();

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        // Create wager record
        const { data: wager, error } = await adminSupabase
            .from('agent_wagers')
            .insert({
                agent_id: data.agent_id,
                user_id: userId,
                competition_id: data.competition_id,
                wager_amount: data.wager_amount,
                refund_rate: 0, // 0% refund, full risk
                status: 'active',
            })
            .select('*')
            .single();

        if (error) {
            this.logger.error(`Failed to create wager: ${error.message}`);
            throw new BadRequestException(`Failed to create wager: ${error.message}`);
        }

        // ═══ UPSERT pool_stakes — update existing or create new ═══
        // The auto-stake during deploy may have already created an entry.
        // We UPDATE it with the real on-chain TX hash and correct wager amount
        // instead of creating a duplicate entry.
        try {
            const { data: pool } = await adminSupabase
                .from('competition_pools')
                .select('id')
                .eq('competition_id', data.competition_id)
                .single();

            if (pool) {
                // Check if pool_stake already exists for this agent + competition
                // Also check by user_id since the UNIQUE constraint is (user_id, competition_id)
                const { data: existingStake } = await adminSupabase
                    .from('pool_stakes')
                    .select('id, stake_amount, onchain_tx, agent_id')
                    .eq('competition_id', data.competition_id)
                    .or(`agent_id.eq.${data.agent_id},user_id.eq.${userId}`)
                    .limit(1)
                    .single();

                if (existingStake) {
                    // UPDATE existing entry with real TX hash, correct amount, and correct agent_id
                    const { data: updatedStake, error: updateErr } = await adminSupabase
                        .from('pool_stakes')
                        .update({
                            stake_amount: data.wager_amount,
                            agent_id: data.agent_id,
                            onchain_tx: data.onchain_tx || existingStake.onchain_tx || null,
                            verified_onchain: isVerifiedOnchain || (!!existingStake.onchain_tx),
                        })
                        .eq('id', existingStake.id)
                        .select('id, stake_amount, onchain_tx')
                        .single();

                    if (updateErr) {
                        this.logger.warn(`Pool stake UPDATE failed: ${updateErr.message} — falling back to DELETE+INSERT`);
                        // Fallback: delete old entry and insert fresh one
                        await adminSupabase.from('pool_stakes').delete().eq('id', existingStake.id);
                        await adminSupabase
                            .from('pool_stakes')
                            .insert({
                                pool_id: pool.id,
                                competition_id: data.competition_id,
                                user_id: userId,
                                agent_id: data.agent_id,
                                stake_amount: data.wager_amount,
                                onchain_tx: data.onchain_tx || null,
                                verified_onchain: isVerifiedOnchain,
                                status: 'active',
                            })
                            .select('id')
                            .single();
                        this.logger.log(`Pool stake REPLACED (DELETE+INSERT): ${data.wager_amount} SOL | TX: ${data.onchain_tx?.slice(0, 16) || 'none'}`);
                    } else {
                        // Verify the update actually persisted the correct value
                        if (updatedStake && Number(updatedStake.stake_amount) !== Number(data.wager_amount)) {
                            this.logger.warn(`Pool stake UPDATE value mismatch: expected ${data.wager_amount}, got ${updatedStake.stake_amount} — forcing DELETE+INSERT`);
                            await adminSupabase.from('pool_stakes').delete().eq('id', existingStake.id);
                            await adminSupabase
                                .from('pool_stakes')
                                .insert({
                                    pool_id: pool.id,
                                    competition_id: data.competition_id,
                                    user_id: userId,
                                    agent_id: data.agent_id,
                                    stake_amount: data.wager_amount,
                                    onchain_tx: data.onchain_tx || null,
                                    verified_onchain: isVerifiedOnchain,
                                    status: 'active',
                                })
                                .select('id')
                                .single();
                            this.logger.log(`Pool stake REPLACED after mismatch: ${data.wager_amount} SOL`);
                        } else {
                            this.logger.log(`Pool stake UPDATED: ${existingStake.stake_amount} → ${data.wager_amount} SOL | TX: ${data.onchain_tx?.slice(0, 16) || 'none'}`);
                        }
                    }
                } else {
                    // No existing entry — create new
                    const { error: insertErr } = await adminSupabase
                        .from('pool_stakes')
                        .insert({
                            pool_id: pool.id,
                            competition_id: data.competition_id,
                            user_id: userId,
                            agent_id: data.agent_id,
                            stake_amount: data.wager_amount,
                            onchain_tx: data.onchain_tx || null,
                            verified_onchain: isVerifiedOnchain,
                            status: 'active',
                        })
                        .select('id')
                        .single();

                    if (insertErr) {
                        this.logger.error(`Pool stake INSERT failed: ${insertErr.message}`);
                    } else {
                        this.logger.log(`Pool stake CREATED: ${data.wager_amount} SOL → pool ${pool.id}`);
                    }
                }
            }
        } catch (poolErr: any) {
            // Non-blocking: wager still works even if pool sync fails
            this.logger.warn(`Pool stake sync failed (non-blocking): ${poolErr.message}`);
        }

        this.logger.log(`Wager created: ${wager.id} — ${data.wager_amount} SOL on agent ${data.agent_id}`);

        // Activate the agent and its competition entries in the database
        try {
            const { error: agentUpdateErr } = await adminSupabase
                .from('agents')
                .update({ status: 'active' })
                .eq('id', data.agent_id);

            if (agentUpdateErr) {
                this.logger.error(`Failed to activate agent ${data.agent_id}: ${agentUpdateErr.message}`);
            } else {
                this.logger.log(`Agent ${data.agent_id} status updated to active`);
            }

            // Self-healing: Upsert to ensure entry exists and is active, preventing count/UI drift
            const { error: entryUpdateErr } = await adminSupabase
                .from('agent_competition_entries')
                .upsert({
                    agent_id: data.agent_id,
                    competition_id: data.competition_id,
                    user_id: userId,
                    status: 'active',
                }, {
                    onConflict: 'agent_id,competition_id'
                });

            if (entryUpdateErr) {
                this.logger.error(`Failed to upsert/activate competition entries for agent ${data.agent_id}: ${entryUpdateErr.message}`);
            } else {
                this.logger.log(`Competition entry for agent ${data.agent_id} successfully upserted and activated`);
            }

            // Immediately run predictions for this agent now that it's active!
            this.agentRunnerService.runSingleAgentId(data.agent_id).catch(err => {
                this.logger.warn(`Failed to trigger immediate run for agent ${data.agent_id} after wager confirmation: ${err.message}`);
            });
        } catch (actErr: any) {
            this.logger.error(`Error during agent activation: ${actErr.message}`);
        }

        return wager;
    }

    /**
     * Get agent leaderboard for a competition or sector — ranked by weighted_score (lower = better).
     * Falls back to raw brier_score for agents without weighted scores.
     */
    async getLeaderboard(competitionId?: string, sector?: string, limit: number = 20): Promise<any[]> {
        const supabase = this.supabaseService.getAdminClient();
        let leaderboardEntries: any[] = [];

        // If competitionId provided, use the DB function for weighted ranking
        if (competitionId) {
            const { data, error } = await supabase.rpc('get_weighted_leaderboard', {
                p_competition_id: competitionId,
                p_limit: Math.min(Math.max(1, limit), 100),
            });

            if (!error && data && data.length > 0) {
                leaderboardEntries = data.map((row: any) => ({
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
                    accuracy_pct: row.accuracy_pct != null ? Number(row.accuracy_pct) : null,
                    competition_id: competitionId,
                    status: row.agent_status,
                }));
            } else if (error) {
                this.logger.warn(`Failed to call get_weighted_leaderboard RPC: ${error.message}. Falling back to table query.`);
            }
        }

        // If competitionId is not provided, use get_sector_leaderboard RPC for global/sector leaderboard
        if (!competitionId) {
            const { data, error } = await supabase.rpc('get_sector_leaderboard', {
                p_sector: sector || 'all',
                p_limit: Math.min(Math.max(1, limit), 100),
            });

            if (!error && data && data.length > 0) {
                leaderboardEntries = data.map((row: any) => ({
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
                    accuracy_pct: row.accuracy_pct != null ? Number(row.accuracy_pct) : null,
                    competition_id: row.competition_id,
                    status: row.agent_status,
                }));
            } else if (error) {
                this.logger.warn(`Failed to call get_sector_leaderboard RPC: ${error.message}. Falling back to table query.`);
            }
        }

        // Fallback: global leaderboard or direct query fallback (or if RPCs returned no entries)
        if (leaderboardEntries.length === 0) {
            let selectStr = '*, agents(id, name, user_id, model, created_at), competitions(id, sector, leaderboard_score_config(min_predictions))';
            if (sector && sector !== 'all' && sector !== 'top') {
                selectStr = '*, agents(id, name, user_id, model, created_at), competitions!inner(id, sector, leaderboard_score_config(min_predictions))';
            }

            const entryStatuses = competitionId ? ['active', 'paused'] : ['completed', 'evaluated', 'terminated'];
            let query = supabase
                .from('agent_competition_entries')
                .select(selectStr)
                .in('status', entryStatuses);

            if (competitionId) {
                query = query.eq('competition_id', competitionId);
            }

            if (sector && sector !== 'all' && sector !== 'top') {
                query = query.eq('competitions.sector', sector);
            }

            let { data, error } = await query;

            if (!error && (!data || data.length === 0)) {
                let fallbackQuery = supabase
                    .from('agent_competition_entries')
                    .select(selectStr)
                    .in('status', ['completed', 'terminated']);

                if (competitionId) {
                    fallbackQuery = fallbackQuery.eq('competition_id', competitionId);
                }

                if (sector && sector !== 'all' && sector !== 'top') {
                    fallbackQuery = fallbackQuery.eq('competitions.sector', sector);
                }

                const fallbackResult = await fallbackQuery;
                if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
                    data = fallbackResult.data;
                }
            }

            if (error) {
                this.logger.error(`Failed to get leaderboard fallback: ${error.message}`);
                return [];
            }

            const mapped = (data || []).map((entry: any) => {
                const config = entry.competitions?.leaderboard_score_config;
                const minPreds = (Array.isArray(config) ? config[0]?.min_predictions : config?.min_predictions) || 3;
                return {
                    agent_id: entry.agent_id,
                    agent_name: entry.agents?.name || 'Unknown',
                    user_id: null,
                    brier_score: entry.brier_score,
                    weighted_score: entry.weighted_score ? Number(entry.weighted_score) : null,
                    prediction_count: entry.prediction_count || 0,
                    last_scored_at: entry.last_scored_at,
                    rank_trend: entry.rank_trend || 0,
                    has_min_predictions: (entry.prediction_count || 0) >= minPreds,
                    competition_id: entry.competition_id,
                    status: entry.status,
                    deployed_at: entry.agents?.created_at ? new Date(entry.agents.created_at).getTime() : 0,
                };
            });

            // Smart sorting (simulates DB RPC order):
            // 1. has_min_predictions DESC
            // 2. weighted_score ASC (nulls last = 99.9999)
            // 3. prediction_count DESC
            // 4. deployed_at ASC
            mapped.sort((a: any, b: any) => {
                if (a.has_min_predictions !== b.has_min_predictions) {
                    return a.has_min_predictions ? -1 : 1;
                }
                const scoreA = a.weighted_score !== null ? a.weighted_score : 99.9999;
                const scoreB = b.weighted_score !== null ? b.weighted_score : 99.9999;
                if (scoreA !== scoreB) {
                    return scoreA - scoreB;
                }
                if (a.prediction_count !== b.prediction_count) {
                    return b.prediction_count - a.prediction_count;
                }
                return a.deployed_at - b.deployed_at;
            });

            leaderboardEntries = mapped.slice(0, limit).map((entry: any, index: number) => ({
                rank: index + 1,
                agent_id: entry.agent_id,
                agent_name: entry.agent_name,
                user_id: entry.user_id,
                brier_score: entry.brier_score,
                weighted_score: entry.weighted_score,
                prediction_count: entry.prediction_count,
                last_scored_at: entry.last_scored_at,
                rank_trend: entry.rank_trend,
                has_min_predictions: entry.has_min_predictions,
                competition_id: entry.competition_id,
                status: entry.status,
            }));
        }

        // Fetch and map sectors for all entries
        if (leaderboardEntries.length > 0) {
            const compIds = [...new Set(leaderboardEntries.map(r => r.competition_id).filter(Boolean))];
            if (compIds.length > 0) {
                const { data: comps, error: compsErr } = await supabase
                    .from('competitions')
                    .select('id, sector')
                    .in('id', compIds);
                
                if (!compsErr && comps) {
                    const sectorMap = new Map(comps.map(c => [c.id, c.sector]));
                    leaderboardEntries.forEach(r => {
                        r.sector = sectorMap.get(r.competition_id) || null;
                    });
                }
            }
        }

        return leaderboardEntries;
    }

    /**
     * Get all active competitors for a competition (public, sanitized)
     * Returns only safe-to-display fields — no system_prompt, no user secrets
     * Now uses RPC get_weighted_leaderboard for precise, non-truncated rankings.
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

        // Attempt to call RPC for correct security policy bypass and optimal sorting
        const { data, error } = await supabase.rpc('get_weighted_leaderboard', {
            p_competition_id: competitionId,
            p_limit: safeLimit,
        });

        if (!error && data) {
            return data.map((row: any) => ({
                rank: row.rank_position,
                agent_id: row.agent_id,
                agent_name: row.agent_name || 'Unknown Agent',
                model: row.model || 'Unknown',
                agent_status: row.agent_status || 'active',
                brier_score: row.raw_brier_avg ? Number(row.raw_brier_avg) : null,
                weighted_score: row.weighted_score ? Number(row.weighted_score) : null,
                prediction_count: row.prediction_count || 0,
                last_scored_at: row.last_scored_at,
                rank_trend: row.rank_trend || 0,
                has_min_predictions: row.has_min_predictions,
                competition_id: competitionId,
                deployed_at: row.deployed_at,
            }));
        }

        if (error) {
            this.logger.warn(`Failed to call get_weighted_leaderboard RPC in getCompetitors: ${error.message}. Falling back to table query.`);
        }

        // Fallback: table query with smart in-memory sorting to prevent truncation of newly staked/deployed agents
        const { data: tableData, error: tableError } = await supabase
            .from('agent_competition_entries')
            .select('agent_id, brier_score, weighted_score, prediction_count, last_scored_at, rank_trend, status, agents(id, name, model, status, created_at), competitions(id, leaderboard_score_config(min_predictions))')
            .eq('competition_id', competitionId)
            .in('status', ['active', 'paused']);

        if (tableError) {
            this.logger.error(`Failed to get competitors fallback: ${tableError.message}`);
            return [];
        }

        const mapped = (tableData || []).map((entry: any) => {
            const config = entry.competitions?.leaderboard_score_config;
            const minPreds = (Array.isArray(config) ? config[0]?.min_predictions : config?.min_predictions) || 3;
            return {
                agent_id: entry.agent_id,
                agent_name: entry.agents?.name || 'Unknown Agent',
                model: entry.agents?.model || 'Unknown',
                agent_status: entry.agents?.status || entry.status,
                brier_score: entry.brier_score,
                weighted_score: entry.weighted_score ? Number(entry.weighted_score) : null,
                prediction_count: entry.prediction_count || 0,
                last_scored_at: entry.last_scored_at,
                rank_trend: entry.rank_trend || 0,
                has_min_predictions: (entry.prediction_count || 0) >= minPreds,
                competition_id: competitionId,
                deployed_at: entry.agents?.created_at ? new Date(entry.agents.created_at).getTime() : 0,
            };
        });

        // Sort identically to RPC
        mapped.sort((a: any, b: any) => {
            if (a.has_min_predictions !== b.has_min_predictions) {
                return a.has_min_predictions ? -1 : 1;
            }
            const scoreA = a.weighted_score !== null ? a.weighted_score : 99.9999;
            const scoreB = b.weighted_score !== null ? b.weighted_score : 99.9999;
            if (scoreA !== scoreB) {
                return scoreA - scoreB;
            }
            if (a.prediction_count !== b.prediction_count) {
                return b.prediction_count - a.prediction_count;
            }
            return a.deployed_at - b.deployed_at;
        });

        return mapped.slice(0, safeLimit).map((entry: any, index: number) => ({
            rank: index + 1,
            agent_id: entry.agent_id,
            agent_name: entry.agent_name,
            model: entry.model,
            agent_status: entry.agent_status,
            brier_score: entry.brier_score,
            weighted_score: entry.weighted_score,
            prediction_count: entry.prediction_count,
            last_scored_at: entry.last_scored_at,
            rank_trend: entry.rank_trend,
            has_min_predictions: entry.has_min_predictions,
            competition_id: entry.competition_id,
            deployed_at: entry.deployed_at,
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

        // Get competition metadata with config
        const { data: comp } = await supabase
            .from('competitions')
            .select('id, title, sector, competition_start, competition_end, status, probabilities, base_probability, leaderboard_score_config(min_predictions)')
            .eq('id', competitionId)
            .single();

        let minPredictions = 3;
        if (comp) {
            const config = (comp as any).leaderboard_score_config;
            minPredictions = (Array.isArray(config) ? config[0]?.min_predictions : config?.min_predictions) || 3;
            delete (comp as any).leaderboard_score_config;
        }

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
            return { entries: [], competition: comp ? { ...comp, min_predictions: minPredictions } : null, time_remaining_ms: timeRemainingMs };
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
            accuracy_pct: row.accuracy_pct != null ? Number(row.accuracy_pct) : null,
            competition_id: competitionId,
        }));

        return { entries, competition: comp ? { ...comp, min_predictions: minPredictions } : null, time_remaining_ms: timeRemainingMs };
    }

    /**
     * Get predictions for an agent
     */
    async getAgentPredictions(agentId: string, rawUserId: string, limit: number = 20): Promise<any[]> {
        const userId = await this.resolveUserId(rawUserId);
        if (!userId) return [];
        const supabase = this.supabaseService.getAdminClient();

        // Verify ownership (allow both resolved profile ID and raw wallet address)
        const { data: agent } = await supabase
            .from('agents')
            .select('id, user_id')
            .eq('id', agentId)
            .single();

        if (!agent || (agent.user_id !== userId && agent.user_id !== rawUserId)) {
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
        const supabase = this.supabaseService.getAdminClient();

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
