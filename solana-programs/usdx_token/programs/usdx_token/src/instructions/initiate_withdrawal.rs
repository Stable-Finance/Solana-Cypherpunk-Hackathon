use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct InitiateWithdrawal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [STATE_SEED.as_bytes()],
        bump = state.bump
    )]
    pub state: Account<'info, ProgramState>,

    #[account(
        address = state.usdx_mint
    )]
    pub usdx_mint: Account<'info, Mint>,

    /// User's USDX token account
    #[account(
        mut,
        token::mint = usdx_mint,
        token::authority = user
    )]
    pub user_usdx: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        space = WithdrawalRequest::LEN,
        seeds = [WITHDRAWAL_REQUEST_SEED.as_bytes(), user.key().as_ref()],
        bump
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn initiate_withdrawal_handler(ctx: Context<InitiateWithdrawal>, usdx_amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProgramPaused);

    require!(
        usdx_amount > 0,
        ErrorCode::InvalidAmount
    );

    require!(
        usdx_amount <= MAX_WITHDRAWAL,
        ErrorCode::AmountAboveMaximum
    );

    require!(
        ctx.accounts.user_usdx.amount >= usdx_amount,
        ErrorCode::InsufficientUsdxBalance
    );

    let withdrawal_request = &mut ctx.accounts.withdrawal_request;
    withdrawal_request.user = ctx.accounts.user.key();
    withdrawal_request.usdx_amount = usdx_amount;
    withdrawal_request.request_time = Clock::get()?.unix_timestamp;
    withdrawal_request.bump = ctx.bumps.withdrawal_request;

    msg!("Withdrawal initiated for {} USDX", usdx_amount);
    msg!("Can be completed after 7 days");

    emit!(crate::events::WithdrawalInitiatedEvent {
        user: ctx.accounts.user.key(),
        usdx_amount,
        request_time: withdrawal_request.request_time,
    });

    Ok(())
}
