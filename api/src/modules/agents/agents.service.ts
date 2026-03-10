import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    DeployAgentDto,
    AgentResponseDto,
    AgentTypeResponseDto,
    AgentQuotaResponseDto,
} from './dto/index.js';

const MAX_FREE_DEPLOYS = 10;

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
    ) {}

    /**
     * Deploy a new AI agent (checks quota + optional on-chain)
     */
    async deploy(userId: string, dto: DeployAgentDto): Promise<AgentResponseDto> {
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

        // 3. Insert agent
        const { data: agent, error: insertError } = await supabase
            .from('ai_agents')
            .insert({
                user_id: userId,
                agent_type_id: dto.agent_type_id,
                market_id: dto.market_id || null,
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
     * List user's agents
     */
    async listByUser(
        userId: string,
        status?: string,
        limit: number = 20,
        offset: number = 0,
    ): Promise<{ data: AgentResponseDto[]; total: number }> {
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
    async findById(agentId: string, userId: string): Promise<AgentResponseDto> {
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
    async getQuota(userId: string): Promise<AgentQuotaResponseDto> {
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
        userId: string,
        newStatus: 'active' | 'paused',
    ): Promise<AgentResponseDto> {
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
    async terminate(agentId: string, userId: string): Promise<void> {
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

    /**
     * Get agent execution logs
     */
    async getLogs(
        agentId: string,
        userId: string,
        limit: number = 50,
    ): Promise<any[]> {
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
            market_id: agent.market_id,
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
