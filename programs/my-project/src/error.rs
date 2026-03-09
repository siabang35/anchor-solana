use anchor_lang::prelude::*;

#[error_code]
pub enum ExoduzeError {
    #[msg("Title too long")]
    TitleTooLong,
    #[msg("Team name too long")]
    TeamNameTooLong,
    #[msg("Strategy prompt too long")]
    StrategyTooLong,
    #[msg("Probabilities must sum to 10000 (100%)")]
    InvalidProbabilities,
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market is not settled")]
    MarketNotSettled,
    #[msg("Market already settled")]
    MarketAlreadySettled,
    #[msg("Invalid outcome index (must be 0, 1, or 2)")]
    InvalidOutcome,
    #[msg("Invalid direction (0=Long, 1=Short)")]
    InvalidDirection,
    #[msg("Position amount below minimum")]
    AmountTooSmall,
    #[msg("Insufficient funds in Value Creation Pool")]
    InsufficientPoolFunds,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
    #[msg("Invalid risk level (1-5)")]
    InvalidRiskLevel,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
