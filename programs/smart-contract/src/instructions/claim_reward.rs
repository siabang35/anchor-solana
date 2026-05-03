use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ExoduzeError;
use crate::constants::*;

pub fn handler(ctx: Context<ClaimReward>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    let market = &ctx.accounts.market;
    let platform = &mut ctx.accounts.platform;

    require!(market.status == MarketStatus::Settled, ExoduzeError::MarketNotSettled);
    require!(!position.is_claimed, ExoduzeError::AlreadyClaimed);

    let winning_outcome = market.winning_outcome.ok_or(ExoduzeError::MarketNotSettled)?;

    // Calculate reward based on: Accuracy × Exposure × Probability Shift × Pool Multiplier
    let is_correct_outcome = position.outcome == winning_outcome;
    let is_correct_direction = match position.direction {
        Direction::Long => is_correct_outcome,
        Direction::Short => !is_correct_outcome,
    };

    let reward: u64 = if is_correct_direction {
        // Probability shift from entry to final
        let final_prob = market.probabilities[outcome_to_index(&position.outcome)] as u64;
        let entry_prob = position.entry_probability as u64;

        let prob_shift = if final_prob > entry_prob {
            final_prob.checked_sub(entry_prob).ok_or(ExoduzeError::MathOverflow)?
        } else {
            entry_prob.checked_sub(final_prob).ok_or(ExoduzeError::MathOverflow)?
        };

        // Reward = amount × (prob_shift / 10000) × pool_multiplier(1.5)
        let base_reward = position.amount
            .checked_mul(prob_shift).ok_or(ExoduzeError::MathOverflow)?
            .checked_div(PROBABILITY_DECIMALS).ok_or(ExoduzeError::MathOverflow)?;

        let reward_with_multiplier = base_reward
            .checked_mul(POOL_MULTIPLIER).ok_or(ExoduzeError::MathOverflow)?
            .checked_div(100).ok_or(ExoduzeError::MathOverflow)?;

        // Add back original amount
        position.amount.checked_add(reward_with_multiplier).ok_or(ExoduzeError::MathOverflow)?
    } else {
        // Incorrect: return a portion of position (non-zero-sum, not full loss)
        position.amount
            .checked_mul(50).ok_or(ExoduzeError::MathOverflow)?
            .checked_div(100).ok_or(ExoduzeError::MathOverflow)?
    };

    require!(reward <= platform.pool_balance, ExoduzeError::InsufficientPoolFunds);

    // Transfer reward from vault to trader
    let vault_bump = ctx.bumps.vault;
    let seeds = &[VAULT_SEED, &[vault_bump]];
    let signer_seeds = &[&seeds[..]];

    let transfer_amount = reward;
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
    **ctx.accounts.trader.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

    // Mark claimed and update
    position.is_claimed = true;
    position.realized_pnl = if is_correct_direction {
        (reward as i64).checked_sub(position.amount as i64).unwrap_or(0)
    } else {
        -((position.amount as i64).checked_sub(reward as i64).unwrap_or(0))
    };

    platform.pool_balance = platform.pool_balance.checked_sub(transfer_amount)
        .ok_or(ExoduzeError::MathOverflow)?;

    // Suppress unused variable warning
    let _ = signer_seeds;

    msg!("Reward claimed: {} lamports (correct={})", reward, is_correct_direction);
    Ok(())
}

fn outcome_to_index(outcome: &Outcome) -> usize {
    match outcome {
        Outcome::Home => 0,
        Outcome::Draw => 1,
        Outcome::Away => 2,
    }
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        constraint = market.status == MarketStatus::Settled @ ExoduzeError::MarketNotSettled,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        has_one = trader,
        has_one = market,
        constraint = !position.is_claimed @ ExoduzeError::AlreadyClaimed,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Vault PDA for fund transfer
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
