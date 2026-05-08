use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

/// Admin-only: Disburse prize from pool vault to a winner wallet.
/// Called by the backend settlement cron after determining winners.
/// Uses PDA signing for secure vault withdrawal.
pub fn admin_disburse_prize_handler(ctx: Context<AdminDisbursePrize>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.competition_pool;
    
    // Check auth: only platform admin can disburse
    require!(ctx.accounts.admin.key() == pool.authority, ExoduzeError::Unauthorized);
    
    // Ensure pool is settled before disbursing
    require!(pool.is_settled, ExoduzeError::PoolNotSettled);
    
    // Ensure sufficient distributable balance
    require!(amount <= pool.distributable_pool, ExoduzeError::InsufficientPoolFunds);
    
    // Transfer from vault to winner using PDA signing
    let market_key = ctx.accounts.market.key();
    let vault_seeds: &[&[u8]] = &[
        POOL_VAULT_SEED,
        market_key.as_ref(),
        &[ctx.bumps.pool_vault],
    ];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.winner.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount,
    )?;
    
    // Update pool state
    pool.distributable_pool = pool.distributable_pool
        .checked_sub(amount).ok_or(ExoduzeError::MathOverflow)?;
    pool.claims_count = pool.claims_count
        .checked_add(1).ok_or(ExoduzeError::MathOverflow)?;
    
    msg!("Admin disbursed {} lamports to {}", amount, ctx.accounts.winner.key());
    Ok(())
}

#[derive(Accounts)]
pub struct AdminDisbursePrize<'info> {
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
        seeds = [POOL_SEED, market.key().as_ref()],
        bump = competition_pool.bump,
        constraint = competition_pool.is_settled @ ExoduzeError::PoolNotSettled,
    )]
    pub competition_pool: Account<'info, CompetitionPool>,
    
    pub market: Account<'info, Market>,
    
    /// CHECK: Vault PDA — program-owned, uses PDA signing
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub pool_vault: AccountInfo<'info>,
    
    /// CHECK: Winner wallet — receives the prize
    #[account(mut)]
    pub winner: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}
