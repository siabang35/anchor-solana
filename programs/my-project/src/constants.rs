// PDA Seeds
pub const PLATFORM_SEED: &[u8] = b"platform";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const AGENT_SEED: &[u8] = b"agent";
pub const LEADERBOARD_SEED: &[u8] = b"leaderboard";
pub const VAULT_SEED: &[u8] = b"vault";

// Platform Constants
pub const MAX_TITLE_LENGTH: usize = 64;
pub const MAX_TEAM_NAME_LENGTH: usize = 32;
pub const MAX_STRATEGY_LENGTH: usize = 256;
pub const PROBABILITY_DECIMALS: u64 = 10_000; // 100.00% = 10000
pub const POOL_MULTIPLIER: u64 = 150; // 1.5x multiplier (divide by 100)
pub const PLATFORM_FEE_BPS: u64 = 200; // 2% fee in basis points
pub const MIN_POSITION_AMOUNT: u64 = 10_000_000; // 0.01 SOL in lamports
pub const MAX_OUTCOMES: usize = 3; // Home, Draw, Away
