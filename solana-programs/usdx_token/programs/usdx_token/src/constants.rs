use anchor_lang::prelude::*;

#[constant]
pub const USDX_MINT_SEED: &str = "usdx_mint";

#[constant]
pub const VAULT_SEED: &str = "vault";

#[constant]
pub const STATE_SEED: &str = "state";

#[constant]
pub const WITHDRAWAL_REQUEST_SEED: &str = "withdrawal_request";

// Expected deployer authority (Stable's deployer wallet)
pub const EXPECTED_AUTHORITY: &str = "9TYUScB6w9hG4YACcHsWs93AEA5xQKuQhrC4p1mUGKGA";

// Official USDC mint addresses
pub const USDC_MINT_MAINNET: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDC_MINT_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Withdrawal delay (7 days in seconds)
pub const WITHDRAWAL_DELAY: i64 = 7 * 24 * 60 * 60;

// Fee structure (in basis points, 1 bp = 0.01%)
pub const FEE_TIER_1_THRESHOLD: u64 = 500_000_000_000; // 500,000 USDC (6 decimals)

pub const FEE_TIER_1: u16 = 100; // 1.0% = 100 basis points
pub const FEE_TIER_2: u16 = 50;  // 0.5% = 50 basis points

// Minimum deposit
pub const MIN_DEPOSIT: u64 = 100_000_000; // 100 USDC (6 decimals)

// Maximum deposit and withdrawal limits
pub const MAX_DEPOSIT: u64 = 100_000_000_000_000; // 100M USDC (6 decimals)
pub const MAX_WITHDRAWAL: u64 = 100_000_000_000_000; // 100M USDX (6 decimals)

// Decimals
pub const USDX_DECIMALS: u8 = 6;
