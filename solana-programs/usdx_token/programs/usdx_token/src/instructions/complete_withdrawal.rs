use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

// Redemption fee: 0.25% = 25 basis points
const REDEMPTION_FEE_BPS: u16 = 25;

#[derive(Accounts)]
pub struct CompleteWithdrawal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [STATE_SEED.as_bytes()],
        bump = state.bump
    )]
    pub state: Account<'info, ProgramState>,

    #[account(
        mut,
        address = state.usdx_mint
    )]
    pub usdx_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = state.usdc_vault
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    /// User's USDX token account
    #[account(
        mut,
        token::mint = usdx_mint,
        token::authority = user
    )]
    pub user_usdx: Account<'info, TokenAccount>,

    /// User's USDC token account
    #[account(
        mut,
        token::mint = usdc_vault.mint,
        token::authority = user
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [WITHDRAWAL_REQUEST_SEED.as_bytes(), user.key().as_ref()],
        bump = withdrawal_request.bump,
        close = user,
        constraint = withdrawal_request.user == user.key() @ ErrorCode::UnauthorizedWithdrawal
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    pub token_program: Program<'info, Token>,
}

pub fn complete_withdrawal_handler(ctx: Context<CompleteWithdrawal>) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProgramPaused);

    let withdrawal_request = &ctx.accounts.withdrawal_request;

    // Check that 7 days have passed
    let current_time = Clock::get()?.unix_timestamp;
    let elapsed = current_time - withdrawal_request.request_time;

    require!(
        elapsed >= WITHDRAWAL_DELAY,
        ErrorCode::WithdrawalDelayNotMet
    );

    let usdx_amount = withdrawal_request.usdx_amount;

    require!(
        ctx.accounts.user_usdx.amount >= usdx_amount,
        ErrorCode::InsufficientUsdxBalance
    );

    // Calculate redemption fee (0.25%)
    let fee_amount = usdx_amount
        .checked_mul(REDEMPTION_FEE_BPS as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let usdc_to_withdraw = usdx_amount
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Check vault has enough USDC
    require!(
        ctx.accounts.usdc_vault.amount >= usdc_to_withdraw,
        ErrorCode::InsufficientVaultBalance
    );

    // Burn USDX from user
    let cpi_accounts = Burn {
        mint: ctx.accounts.usdx_mint.to_account_info(),
        from: ctx.accounts.user_usdx.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, usdx_amount)?;

    // Transfer USDC from vault to user (amount after fee)
    let seeds = &[
        STATE_SEED.as_bytes(),
        &[ctx.accounts.state.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.usdc_vault.to_account_info(),
        to: ctx.accounts.user_usdc.to_account_info(),
        authority: ctx.accounts.state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, usdc_to_withdraw)?;

    // Update state accounting
    let state = &mut ctx.accounts.state;
    state.total_usdx_minted = state
        .total_usdx_minted
        .checked_sub(usdx_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    state.total_usdc_deposited = state
        .total_usdc_deposited
        .checked_sub(usdc_to_withdraw)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    state.total_fees_collected = state
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    msg!("Burned {} USDX", usdx_amount);
    msg!("Redemption fee: {} USDC equivalent", fee_amount);
    msg!("Withdrew {} USDC", usdc_to_withdraw);

    emit!(crate::events::WithdrawalCompletedEvent {
        user: ctx.accounts.user.key(),
        usdx_burned: usdx_amount,
        usdc_received: usdc_to_withdraw,
        redemption_fee: fee_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
