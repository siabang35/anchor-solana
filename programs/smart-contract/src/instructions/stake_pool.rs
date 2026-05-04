use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

/// Stake SOL into a competition's on-chain prize pool.
/// Each market has its own pool PDA. Funds go to a per-market vault PDA.
/// Anti-whale: enforces max stake per user. Platform takes 2% fee.
pub fn stake_pool_handler(
    ctx: Context<StakePool>,
    amount: u64,
) -> Result<()> {
    require!(amount >= MIN_POSITION_AMOUNT, ExoduzeError::AmountTooSmall);
    require!(amount <= MAX_POSITION_AMOUNT, ExoduzeError::AmountTooLarge);

    let market = &ctx.accounts.market;
    require!(market.status == MarketStatus::Active, ExoduzeError::MarketNotActive);

    // Check competition timing — only stake during active window
    let now = Clock::get()?.unix_timestamp;
    if market.competition_start > 0 {
        require!(now >= market.competition_start, ExoduzeError::CompetitionNotStarted);
    }
    if market.competition_end > 0 {
        require!(now < market.competition_end, ExoduzeError::CompetitionEnded);
    }

    let pool = &mut ctx.accounts.competition_pool;

    // Anti-whale: per-user max stake enforcement
    require!(amount <= pool.max_stake_per_user, ExoduzeError::AmountTooLarge);

    // Initialize pool if first stake (init_if_needed creates the account)
    if pool.total_staked == 0 {
        pool.authority = ctx.accounts.platform.admin;
        pool.market = market.key();
        pool.max_stake_per_user = MAX_POSITION_AMOUNT; // 10 SOL default
        pool.bump = ctx.bumps.competition_pool;
    }

    // Platform fee calculation (2% = 200 bps)
    let fee = amount
        .checked_mul(PLATFORM_FEE_BPS).ok_or(ExoduzeError::MathOverflow)?
        .checked_div(10_000).ok_or(ExoduzeError::MathOverflow)?;
    let distributable = amount.checked_sub(fee).ok_or(ExoduzeError::MathOverflow)?;

    // Update pool state
    pool.total_staked = pool.total_staked
        .checked_add(amount).ok_or(ExoduzeError::MathOverflow)?;
    pool.platform_fee = pool.platform_fee
        .checked_add(fee).ok_or(ExoduzeError::MathOverflow)?;
    pool.distributable_pool = pool.distributable_pool
        .checked_add(distributable).ok_or(ExoduzeError::MathOverflow)?;
    pool.stake_count = pool.stake_count
        .checked_add(1).ok_or(ExoduzeError::MathOverflow)?;

    // Transfer SOL from staker → pool vault PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.staker.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update global platform pool_balance
    let platform = &mut ctx.accounts.platform;
    platform.pool_balance = platform.pool_balance
        .checked_add(amount).ok_or(ExoduzeError::MathOverflow)?;

    msg!(
        "Pool stake: {} lamports by {} into market {}, pool_total={}, distributable={}",
        amount,
        ctx.accounts.staker.key(),
        market.key(),
        pool.total_staked,
        pool.distributable_pool,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct StakePool<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

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
        init_if_needed,
        payer = staker,
        space = 8 + CompetitionPool::INIT_SPACE,
        seeds = [POOL_SEED, market.key().as_ref()],
        bump,
    )]
    pub competition_pool: Account<'info, CompetitionPool>,

    /// CHECK: Pool vault PDA — program-owned, only this program can withdraw
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub pool_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
