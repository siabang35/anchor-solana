use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(
    ctx: Context<TakePosition>,
    outcome: u8,
    direction: u8,
    amount: u64,
) -> Result<()> {
    require!(amount >= MIN_POSITION_AMOUNT, ExoduzeError::AmountTooSmall);
    require!(outcome < MAX_OUTCOMES as u8, ExoduzeError::InvalidOutcome);
    require!(direction <= 1, ExoduzeError::InvalidDirection);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, ExoduzeError::MarketNotActive);

    // Check competition timing
    let now = Clock::get()?.unix_timestamp;
    if market.competition_start > 0 {
        require!(now >= market.competition_start, ExoduzeError::CompetitionNotStarted);
    }
    if market.competition_end > 0 {
        require!(now < market.competition_end, ExoduzeError::CompetitionEnded);
    }

    let platform = &mut ctx.accounts.platform;
    let position = &mut ctx.accounts.position;

    let outcome_enum = match outcome {
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

    let entry_prob = market.probabilities[outcome as usize];

    // Bonding curve pricing: effective_price = base_price * (1 + supply_factor)
    // supply_factor = (total_positions / 100) ^ (bonding_n / 100)
    // This creates a sigmoid-like curve that increases price as more positions are taken
    let bonding_premium = if market.bonding_k > 0 {
        let supply = market.total_positions;
        // Simplified bonding: premium = k * supply / BONDING_PRECISION
        // For devnet simplicity — a linear approximation of the sigmoid
        market.bonding_k
            .checked_mul(supply).ok_or(ExoduzeError::MathOverflow)?
            .checked_div(BONDING_PRECISION).ok_or(ExoduzeError::MathOverflow)?
    } else {
        0
    };

    let effective_amount = amount.checked_add(bonding_premium)
        .ok_or(ExoduzeError::MathOverflow)?;

    position.trader = ctx.accounts.trader.key();
    position.market = market.key();
    position.outcome = outcome_enum;
    position.direction = direction_enum;
    position.entry_probability = entry_prob;
    position.current_probability = entry_prob;
    position.amount = effective_amount;
    position.unrealized_pnl = 0;
    position.realized_pnl = 0;
    position.is_claimed = false;
    position.position_index = platform.total_positions;
    position.created_at = Clock::get()?.unix_timestamp;
    position.bump = ctx.bumps.position;

    // Transfer SOL to vault (original amount, premium stays in pool)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.trader.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update platform and market counters
    platform.total_positions = platform.total_positions.checked_add(1)
        .ok_or(ExoduzeError::MathOverflow)?;
    platform.pool_balance = platform.pool_balance.checked_add(amount)
        .ok_or(ExoduzeError::MathOverflow)?;

    market.total_positions = market.total_positions.checked_add(1)
        .ok_or(ExoduzeError::MathOverflow)?;
    market.total_volume = market.total_volume.checked_add(amount)
        .ok_or(ExoduzeError::MathOverflow)?;

    msg!(
        "Position taken: outcome={}, direction={}, amount={}, bonding_premium={}, entry_prob={}",
        outcome,
        direction,
        amount,
        bonding_premium,
        entry_prob
    );
    Ok(())
}

#[derive(Accounts)]
pub struct TakePosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Active @ ExoduzeError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = trader,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, trader.key().as_ref(), platform.total_positions.to_le_bytes().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Vault PDA for holding funds
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
