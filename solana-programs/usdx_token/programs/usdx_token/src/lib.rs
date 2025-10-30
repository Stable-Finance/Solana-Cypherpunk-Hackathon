pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("5nt7ssXVY25hiykrbBPYagZn7WCM43dCLrS5ysfoZ4gn");

#[program]
pub mod usdx_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::init_handler(ctx)
    }

    pub fn deposit_usdc(ctx: Context<DepositUsdc>, usdc_amount: u64) -> Result<()> {
        deposit_usdc::deposit_handler(ctx, usdc_amount)
    }

    pub fn initiate_withdrawal(ctx: Context<InitiateWithdrawal>, usdx_amount: u64) -> Result<()> {
        initiate_withdrawal::initiate_withdrawal_handler(ctx, usdx_amount)
    }

    pub fn complete_withdrawal(ctx: Context<CompleteWithdrawal>) -> Result<()> {
        complete_withdrawal::complete_withdrawal_handler(ctx)
    }

    pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
        pause_program::pause_program_handler(ctx)
    }

    pub fn unpause_program(ctx: Context<PauseProgram>) -> Result<()> {
        pause_program::unpause_program_handler(ctx)
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        update_authority::update_authority_handler(ctx, new_authority)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        withdraw_fees::withdraw_fees_handler(ctx, amount)
    }

    pub fn deposit_treasury(ctx: Context<DepositTreasury>, amount: u64) -> Result<()> {
        deposit_treasury::deposit_treasury_handler(ctx, amount)
    }

    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        withdraw_treasury::withdraw_treasury_handler(ctx, amount)
    }

    pub fn create_metadata(
        ctx: Context<CreateMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        create_metadata::create_metadata_handler(ctx, name, symbol, uri)
    }
}
