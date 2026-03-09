pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("95fmbWqB23YMi5xTEZzwQmgnGUbHDWCA6MR7Es4G6NxN");

#[program]
pub mod exoduze {
    use super::*;

    /// Initialize the ExoDuZe platform with a Value Creation Pool deposit
    pub fn initialize_platform(ctx: Context<InitializePlatform>, pool_deposit: u64) -> Result<()> {
        instructions::initialize::handler(ctx, pool_deposit)
    }

    /// Create a new probability market (e.g. football match)
    pub fn create_market(
        ctx: Context<CreateMarket>,
        title: String,
        team_home: String,
        team_away: String,
        initial_probabilities: [u16; 3],
    ) -> Result<()> {
        instructions::create_market::handler(ctx, title, team_home, team_away, initial_probabilities)
    }

    /// Take a position (Long/Short) on a market outcome
    pub fn take_position(
        ctx: Context<TakePosition>,
        outcome: u8,
        direction: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::take_position::handler(ctx, outcome, direction, amount)
    }

    /// Deploy an AI agent with custom strategy
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
