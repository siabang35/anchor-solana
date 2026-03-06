use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::DejavuError;
use crate::constants::*;

pub fn handler(
    ctx: Context<DeployAgent>,
    strategy_prompt: String,
    target_outcome: u8,
    direction: u8,
    risk_level: u8,
) -> Result<()> {
    require!(strategy_prompt.len() <= MAX_STRATEGY_LENGTH, DejavuError::StrategyTooLong);
    require!(target_outcome < MAX_OUTCOMES as u8, DejavuError::InvalidOutcome);
    require!(direction <= 1, DejavuError::InvalidDirection);
    require!(risk_level >= 1 && risk_level <= 5, DejavuError::InvalidRiskLevel);

    let market = &ctx.accounts.market;
    require!(market.status == MarketStatus::Active, DejavuError::MarketNotActive);

    let platform = &mut ctx.accounts.platform;
    let agent = &mut ctx.accounts.agent;

    let outcome_enum = match target_outcome {
        0 => Outcome::Home,
        1 => Outcome::Draw,
        2 => Outcome::Away,
        _ => return Err(DejavuError::InvalidOutcome.into()),
    };

    let direction_enum = match direction {
        0 => Direction::Long,
        1 => Direction::Short,
        _ => return Err(DejavuError::InvalidDirection.into()),
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

    platform.total_agents = platform.total_agents.checked_add(1)
        .ok_or(DejavuError::MathOverflow)?;

    msg!("AI Agent deployed at index {}", agent.agent_index);
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
        constraint = market.status == MarketStatus::Active @ DejavuError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

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
