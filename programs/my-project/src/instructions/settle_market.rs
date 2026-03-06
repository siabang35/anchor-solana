use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::DejavuError;
use crate::constants::*;

pub fn handler(
    ctx: Context<SettleMarket>,
    winning_outcome: u8,
) -> Result<()> {
    require!(winning_outcome < MAX_OUTCOMES as u8, DejavuError::InvalidOutcome);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, DejavuError::MarketNotActive);

    let outcome_enum = match winning_outcome {
        0 => Outcome::Home,
        1 => Outcome::Draw,
        2 => Outcome::Away,
        _ => return Err(DejavuError::InvalidOutcome.into()),
    };

    market.status = MarketStatus::Settled;
    market.winning_outcome = Some(outcome_enum);
    market.settled_at = Some(Clock::get()?.unix_timestamp);

    msg!("Market '{}' settled with outcome: {}", market.title, winning_outcome);
    Ok(())
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ DejavuError::Unauthorized,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Active @ DejavuError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,
}
