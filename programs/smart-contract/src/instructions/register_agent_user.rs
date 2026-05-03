use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;

pub fn handler(ctx: Context<RegisterAgentUser>) -> Result<()> {
    let registry = &mut ctx.accounts.agent_registry;
    registry.user = ctx.accounts.user.key();
    registry.deploys_used = 0;
    registry.max_deploys = MAX_FREE_DEPLOYS;
    registry.bump = ctx.bumps.agent_registry;

    msg!("Agent registry created for user: {}", registry.user);
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAgentUser<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + AgentRegistry::INIT_SPACE,
        seeds = [AGENT_REGISTRY_SEED, user.key().as_ref()],
        bump,
    )]
    pub agent_registry: Account<'info, AgentRegistry>,

    pub system_program: Program<'info, System>,
}
