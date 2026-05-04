use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(ctx: Context<AdminDisbursePrize>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.competition_pool;
    
    // Check auth
    require!(ctx.accounts.admin.key() == pool.authority, ExoduzeError::Unauthorized);
    
    // Transfer from vault to winner
    **ctx.accounts.pool_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += amount;
    
    // Update pool
    pool.distributable_pool = pool.distributable_pool.checked_sub(amount).unwrap_or(0);
    
    msg!("Disbursed {} lamports to {}", amount, ctx.accounts.winner.key());
    Ok(())
}

#[derive(Accounts)]
pub struct AdminDisbursePrize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [POOL_SEED, market.key().as_ref()],
        bump = competition_pool.bump,
    )]
    pub competition_pool: Account<'info, CompetitionPool>,
    
    pub market: Account<'info, Market>,
    
    /// CHECK: Vault
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub pool_vault: AccountInfo<'info>,
    
    /// CHECK: Winner wallet
    #[account(mut)]
    pub winner: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}
