use anchor_lang::prelude::*;

#[account]
pub struct ProgramState {
    pub authority: Pubkey,
    pub usdx_mint: Pubkey,
    pub usdc_vault: Pubkey,
    pub total_usdx_minted: u64,
    pub total_usdc_deposited: u64,
    pub total_fees_collected: u64,
    pub paused: bool,
    pub bump: u8,
}

impl ProgramState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // usdx_mint
        32 + // usdc_vault
        8 +  // total_usdx_minted
        8 +  // total_usdc_deposited
        8 +  // total_fees_collected
        1 +  // paused
        1;   // bump
}

#[account]
pub struct WithdrawalRequest {
    pub user: Pubkey,
    pub usdx_amount: u64,
    pub request_time: i64,
    pub bump: u8,
}

impl WithdrawalRequest {
    pub const LEN: usize = 8 + // discriminator
        32 + // user
        8 +  // usdx_amount
        8 +  // request_time
        1;   // bump
}
