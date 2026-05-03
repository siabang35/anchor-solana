use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(
    ctx: Context<UpdateProbabilities>,
    new_probabilities: [u16; 3],
) -> Result<()> {
    // Probabilities must sum to 10000 (100%)
    let sum: u32 = new_probabilities.iter().map(|p| *p as u32).sum();
    require!(sum == PROBABILITY_DECIMALS as u32, ExoduzeError::InvalidProbabilities);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, ExoduzeError::MarketNotActive);

    market.probabilities = new_probabilities;

    msg!(
        "Probabilities updated: Home={}%, Draw={}%, Away={}%",
        new_probabilities[0] as f64 / 100.0,
        new_probabilities[1] as f64 / 100.0,
        new_probabilities[2] as f64 / 100.0
    );
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProbabilities<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ ExoduzeError::Unauthorized,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Active @ ExoduzeError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,
}
