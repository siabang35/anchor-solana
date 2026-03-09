use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(
    ctx: Context<CreateMarket>,
    title: String,
    team_home: String,
    team_away: String,
    initial_probabilities: [u16; 3],
) -> Result<()> {
    require!(title.len() <= MAX_TITLE_LENGTH, ExoduzeError::TitleTooLong);
    require!(team_home.len() <= MAX_TEAM_NAME_LENGTH, ExoduzeError::TeamNameTooLong);
    require!(team_away.len() <= MAX_TEAM_NAME_LENGTH, ExoduzeError::TeamNameTooLong);

    // Probabilities must sum to 10000 (100%)
    let sum: u32 = initial_probabilities.iter().map(|p| *p as u32).sum();
    require!(sum == PROBABILITY_DECIMALS as u32, ExoduzeError::InvalidProbabilities);

    let platform = &mut ctx.accounts.platform;
    let market = &mut ctx.accounts.market;

    market.authority = ctx.accounts.admin.key();
    market.title = title;
    market.team_home = team_home;
    market.team_away = team_away;
    market.probabilities = initial_probabilities;
    market.status = MarketStatus::Active;
    market.winning_outcome = None;
    market.total_positions = 0;
    market.total_volume = 0;
    market.market_index = platform.total_markets;
    market.created_at = Clock::get()?.unix_timestamp;
    market.settled_at = None;
    market.bump = ctx.bumps.market;

    platform.total_markets = platform.total_markets.checked_add(1)
        .ok_or(ExoduzeError::MathOverflow)?;

    msg!("Market '{}' created at index {}", market.title, market.market_index);
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ ExoduzeError::Unauthorized,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, platform.total_markets.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}
