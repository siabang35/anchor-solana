use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(
    ctx: Context<DeployAgent>,
    strategy_prompt: String,
    target_outcome: u8,
    direction: u8,
    risk_level: u8,
) -> Result<()> {
    require!(strategy_prompt.len() <= MAX_STRATEGY_LENGTH, ExoduzeError::StrategyTooLong);
    require!(target_outcome < MAX_OUTCOMES as u8, ExoduzeError::InvalidOutcome);
    require!(direction <= 1, ExoduzeError::InvalidDirection);
    require!(risk_level >= 1 && risk_level <= 5, ExoduzeError::InvalidRiskLevel);

    let market = &ctx.accounts.market;
    require!(market.status == MarketStatus::Active, ExoduzeError::MarketNotActive);

    // Check competition timing
    let now = Clock::get()?.unix_timestamp;
    if market.competition_start > 0 {
        require!(now >= market.competition_start, ExoduzeError::CompetitionNotStarted);
    }
    if market.competition_end > 0 {
        require!(now < market.competition_end, ExoduzeError::CompetitionEnded);
    }

    // Check agent deploy quota
    let registry = &mut ctx.accounts.agent_registry;
    require!(registry.deploys_used < registry.max_deploys, ExoduzeError::AgentDeployLimitReached);

    let platform = &mut ctx.accounts.platform;
    let agent = &mut ctx.accounts.agent;

    let outcome_enum = match target_outcome {
        0 => Outcome::Home,
        1 => Outcome::Draw,
        2 => Outcome::Away,
        _ => return Err(ExoduzeError::InvalidOutcome.into()),
    };

    let direction_enum = match direction {
        0 => Direction::Long,
        1 => Direction::Short,
        _ => return Err(ExoduzeError::InvalidDirection.into()),
    };

    agent.owner = ctx.accounts.owner.key();
    agent.market = market.key();
    agent.strategy_prompt = strategy_prompt;
    agent.target_outcome = outcome_enum;
    agent.direction = direction_enum;
    agent.risk_level = risk_level;
    agent.accuracy_score = 0;
    agent.total_trades = 0;
    agent.is_active = true;
    agent.agent_index = platform.total_agents;
    agent.created_at = Clock::get()?.unix_timestamp;
    agent.bump = ctx.bumps.agent;

    // Increment counters
    platform.total_agents = platform.total_agents.checked_add(1)
        .ok_or(ExoduzeError::MathOverflow)?;
    registry.deploys_used = registry.deploys_used.checked_add(1)
        .ok_or(ExoduzeError::MathOverflow)?;

    msg!("AI Agent deployed at index {} (deploys: {}/{})", 
        agent.agent_index, registry.deploys_used, registry.max_deploys);
    Ok(())
}

#[derive(Accounts)]
pub struct DeployAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        constraint = market.status == MarketStatus::Active @ ExoduzeError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [AGENT_REGISTRY_SEED, owner.key().as_ref()],
        bump = agent_registry.bump,
        constraint = agent_registry.user == owner.key() @ ExoduzeError::Unauthorized,
    )]
    pub agent_registry: Account<'info, AgentRegistry>,

    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [AGENT_SEED, owner.key().as_ref(), platform.total_agents.to_le_bytes().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,

    pub system_program: Program<'info, System>,
}
