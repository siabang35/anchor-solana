use anchor_lang::prelude::*;

/// Platform root account — stores admin and global state
#[account]
#[derive(InitSpace)]
pub struct Platform {
    pub admin: Pubkey,
    pub pool_balance: u64,
    pub total_markets: u64,
    pub total_positions: u64,
    pub total_agents: u64,
    pub bump: u8,
}

/// Market status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Active,
    Paused,
    Settled,
}

/// Direction enum: Long or Short
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Direction {
    Long,
    Short,
}

/// Outcome enum for 3-way market (Home/Draw/Away)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Home,
    Draw,
    Away,
}

/// Market account — represents a probability trading market
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    #[max_len(64)]
    pub title: String,
    #[max_len(32)]
    pub team_home: String,
    #[max_len(32)]
    pub team_away: String,
    /// Probabilities in basis points [home, draw, away], must sum to 10000
    pub probabilities: [u16; 3],
    pub status: MarketStatus,
    pub winning_outcome: Option<Outcome>,
    pub total_positions: u64,
    pub total_volume: u64,
    pub market_index: u64,
    pub created_at: i64,
    pub settled_at: Option<i64>,
    pub bump: u8,
}

/// Position account — trader's position on a market outcome
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub outcome: Outcome,
    pub direction: Direction,
    pub entry_probability: u16,
    pub current_probability: u16,
    pub amount: u64,
    pub unrealized_pnl: i64,
    pub realized_pnl: i64,
    pub is_claimed: bool,
    pub position_index: u64,
    pub created_at: i64,
    pub bump: u8,
}

/// AI Agent account — deployed strategy agent
#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner: Pubkey,
    pub market: Pubkey,
    #[max_len(256)]
    pub strategy_prompt: String,
    pub target_outcome: Outcome,
    pub direction: Direction,
    pub risk_level: u8,
    pub accuracy_score: u16,
    pub total_trades: u64,
    pub is_active: bool,
    pub agent_index: u64,
    pub created_at: i64,
    pub bump: u8,
}

/// Leaderboard entry account
#[account]
#[derive(InitSpace)]
pub struct LeaderboardEntry {
    pub trader: Pubkey,
    pub total_return: i64,
    pub accuracy: u16,
    pub total_trades: u64,
    pub rank: u32,
    pub bump: u8,
}
