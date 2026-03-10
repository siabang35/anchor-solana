pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7");

#[program]
pub mod exoduze {
    use super::*;

    /// Initialize the ExoDuZe platform with a Value Creation Pool deposit
    pub fn initialize_platform(ctx: Context<InitializePlatform>, pool_deposit: u64) -> Result<()> {
        instructions::initialize::handler(ctx, pool_deposit)
    }

    /// Create a new probability market with sector, competition timing, and bonding curve
    pub fn create_market(
        ctx: Context<CreateMarket>,
        title: String,
        team_home: String,
        team_away: String,
        initial_probabilities: [u16; 3],
        sector: String,
        competition_start: i64,
        competition_end: i64,
        bonding_k: u64,
        bonding_n: u16,
    ) -> Result<()> {
        instructions::create_market::handler(
            ctx, title, team_home, team_away, initial_probabilities,
            sector, competition_start, competition_end, bonding_k, bonding_n,
        )
    }

    /// Take a position (Long/Short) on a market outcome with bonding curve pricing
    pub fn take_position(
        ctx: Context<TakePosition>,
        outcome: u8,
        direction: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::take_position::handler(ctx, outcome, direction, amount)
    }

    /// Register user for AI agent deployment (creates quota PDA)
    pub fn register_agent_user(ctx: Context<RegisterAgentUser>) -> Result<()> {
        instructions::register_agent_user::handler(ctx)
    }

    /// Deploy an AI agent with custom strategy (checks quota)
    pub fn deploy_agent(
        ctx: Context<DeployAgent>,
        strategy_prompt: String,
        target_outcome: u8,
        direction: u8,
        risk_level: u8,
    ) -> Result<()> {
        instructions::deploy_agent::handler(ctx, strategy_prompt, target_outcome, direction, risk_level)
    }

    /// Update market probabilities (admin only, simulates AI-driven shifts)
    pub fn update_probabilities(
        ctx: Context<UpdateProbabilities>,
        new_probabilities: [u16; 3],
    ) -> Result<()> {
        instructions::update_probabilities::handler(ctx, new_probabilities)
    }

    /// Settle a market with the winning outcome
    pub fn settle_market(ctx: Context<SettleMarket>, winning_outcome: u8) -> Result<()> {
        instructions::settle_market::handler(ctx, winning_outcome)
    }

    /// Claim reward from Value Creation Pool
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        instructions::claim_reward::handler(ctx)
    }
}
