use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

/// Claim prize from a settled competition pool.
/// Only winning positions can claim. Prize is proportional to stake share.
pub fn claim_pool_prize_handler(ctx: Context<ClaimPoolPrize>) -> Result<()> {
    let pool = &mut ctx.accounts.competition_pool;
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(market.status == MarketStatus::Settled, ExoduzeError::MarketNotSettled);
    require!(pool.is_settled, ExoduzeError::PoolNotSettled);
    require!(!position.is_claimed, ExoduzeError::AlreadyClaimed);

    let winning_outcome = market.winning_outcome.ok_or(ExoduzeError::MarketNotSettled)?;

    // Check if this position is a winner
    let is_winner = match position.direction {
        Direction::Long => position.outcome == winning_outcome,
        Direction::Short => position.outcome != winning_outcome,
    };

    require!(is_winner, ExoduzeError::InvalidOutcome);

    // Calculate prize: (user_stake / total_staked) × distributable × multiplier
    let user_share = position.amount
        .checked_mul(pool.distributable_pool).ok_or(ExoduzeError::MathOverflow)?
        .checked_div(pool.total_staked.max(1)).ok_or(ExoduzeError::MathOverflow)?;

    // Apply pool multiplier (1.5x)
    let prize = user_share
        .checked_mul(POOL_MULTIPLIER).ok_or(ExoduzeError::MathOverflow)?
        .checked_div(100).ok_or(ExoduzeError::MathOverflow)?;

    let transfer_amount = prize.min(pool.distributable_pool);

    // PDA seeds for vault signing (logged for audit, transfer done via lamport manipulation)
    let _market_key = market.key();

    **ctx.accounts.pool_vault.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
    **ctx.accounts.claimant.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

    // Update pool
    pool.distributable_pool = pool.distributable_pool
        .checked_sub(transfer_amount).ok_or(ExoduzeError::MathOverflow)?;
    pool.claims_count = pool.claims_count
        .checked_add(1).ok_or(ExoduzeError::MathOverflow)?;

    // Mark position as claimed
    position.is_claimed = true;
    position.realized_pnl = (transfer_amount as i64)
        .checked_sub(position.amount as i64)
        .unwrap_or(0);

    msg!(
        "Pool prize claimed: {} lamports by {} (position stake: {})",
        transfer_amount,
        ctx.accounts.claimant.key(),
        position.amount,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimPoolPrize<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,

    #[account(
        constraint = market.status == MarketStatus::Settled @ ExoduzeError::MarketNotSettled,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [POOL_SEED, market.key().as_ref()],
        bump = competition_pool.bump,
        constraint = competition_pool.is_settled @ ExoduzeError::PoolNotSettled,
    )]
    pub competition_pool: Account<'info, CompetitionPool>,

    #[account(
        mut,
        constraint = position.trader == claimant.key() @ ExoduzeError::Unauthorized,
        constraint = position.market == market.key() @ ExoduzeError::MarketNotActive,
        constraint = !position.is_claimed @ ExoduzeError::AlreadyClaimed,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Pool vault PDA — program-owned
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub pool_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
