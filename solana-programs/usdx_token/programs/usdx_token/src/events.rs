use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub usdc_amount: u64,
    pub usdx_minted: u64,
    pub fee_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalInitiatedEvent {
    pub user: Pubkey,
    pub usdx_amount: u64,
    pub request_time: i64,
}

#[event]
pub struct WithdrawalCompletedEvent {
    pub user: Pubkey,
    pub usdx_burned: u64,
    pub usdc_received: u64,
    pub redemption_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProgramPausedEvent {
    pub authority: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityUpdatedEvent {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FeesWithdrawnEvent {
    pub authority: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
