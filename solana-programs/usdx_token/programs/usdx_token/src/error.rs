use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Amount below minimum deposit")]
    AmountBelowMinimum,

    #[msg("Insufficient USDC vault balance")]
    InsufficientVaultBalance,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid mint authority")]
    InvalidMintAuthority,

    #[msg("Insufficient USDX balance")]
    InsufficientUsdxBalance,

    #[msg("Withdrawal delay not met (7 days required)")]
    WithdrawalDelayNotMet,

    #[msg("Unauthorized initializer - only deployer can initialize")]
    UnauthorizedInitializer,

    #[msg("Invalid USDC mint - must use official USDC")]
    InvalidUsdcMint,

    #[msg("Unauthorized withdrawal - user mismatch")]
    UnauthorizedWithdrawal,

    #[msg("Amount above maximum limit")]
    AmountAboveMaximum,

    #[msg("Unauthorized authority")]
    UnauthorizedAuthority,

    #[msg("Invalid amount - must be greater than zero")]
    InvalidAmount,

    #[msg("Program is paused")]
    ProgramPaused,

    #[msg("Insufficient fees collected")]
    InsufficientFees,
}
