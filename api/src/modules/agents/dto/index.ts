import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsUUID, IsArray } from 'class-validator';

export enum AgentDirection {
    LONG = 'long',
    SHORT = 'short',
}

export enum AgentTargetOutcome {
    HOME = 'home',
    DRAW = 'draw',
    AWAY = 'away',
}

export class DeployAgentDto {
    @IsUUID()
    agent_type_id: string;

    @IsString()
    name: string;

    @IsString()
    strategy_prompt: string;

    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    market_ids?: string[];

    @IsOptional()
    @IsEnum(AgentTargetOutcome)
    target_outcome?: string = 'home';

    @IsOptional()
    @IsEnum(AgentDirection)
    direction?: string = 'long';

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5)
    risk_level?: number = 3;
}

export class DeployForecastingAgentDto {
    @IsString()
    name: string;

    @IsString()
    system_prompt: string;

    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    competition_ids?: string[];
}

export class ToggleAgentDto {
    @IsEnum(['active', 'paused'])
    status: 'active' | 'paused';
}

export class AgentQueryDto {
    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    sector?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;

    @IsOptional()
    @IsInt()
    @Min(0)
    offset?: number = 0;
}

export class AgentResponseDto {
    id: string;
    user_id: string;
    agent_type_id: string;
    market_id: string | null;
    market_ids?: string[] | null;
    name: string;
    strategy_prompt: string;
    target_outcome: string;
    direction: string;
    risk_level: number;
    onchain_agent_pubkey: string | null;
    onchain_tx_signature: string | null;
    status: string;
    accuracy_score: number;
    total_trades: number;
    total_pnl: number;
    win_rate: number;
    deploy_number: number;
    deployed_at: string | null;
    last_trade_at: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    agent_type?: AgentTypeResponseDto;
}

export class AgentTypeResponseDto {
    id: string;
    name: string;
    slug: string;
    description: string;
    sector: string;
    default_strategy: string;
    example_prompts: string[];
    icon_emoji: string;
    color_hex: string;
    is_premium: boolean;
}

export class AgentQuotaResponseDto {
    deploys_used: number;
    max_deploys: number;
    deploys_remaining: number;
}
