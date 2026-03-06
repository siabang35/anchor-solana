use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::constants::*;

pub fn handler(ctx: Context<InitializePlatform>, pool_deposit: u64) -> Result<()> {
    let platform = &mut ctx.accounts.platform;
    platform.admin = ctx.accounts.admin.key();
    platform.pool_balance = pool_deposit;
    platform.total_markets = 0;
    platform.total_positions = 0;
    platform.total_agents = 0;
    platform.bump = ctx.bumps.platform;

    // Transfer SOL to vault for the Value Creation Pool
    if pool_deposit > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            pool_deposit,
        )?;
    }

    msg!("DeJaVu Platform initialized with pool: {} lamports", pool_deposit);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Platform::INIT_SPACE,
        seeds = [PLATFORM_SEED],
        bump,
    )]
    pub platform: Account<'info, Platform>,

    /// CHECK: Vault PDA to hold SOL for Value Creation Pool
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}