use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        constraint = authority.key() == state.authority @ ErrorCode::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STATE_SEED.as_bytes()],
        bump = state.bump
    )]
    pub state: Account<'info, ProgramState>,

    #[account(
        mut,
        address = state.usdc_vault
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    /// Authority's USDC token account to receive fees
    #[account(
        mut,
        token::mint = usdc_vault.mint,
        token::authority = authority
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_fees_handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(
        amount <= ctx.accounts.state.total_fees_collected,
        ErrorCode::InsufficientFees
    );

    // Transfer fees from vault to authority
    let seeds = &[
        STATE_SEED.as_bytes(),
        &[ctx.accounts.state.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.usdc_vault.to_account_info(),
        to: ctx.accounts.authority_usdc.to_account_info(),
        authority: ctx.accounts.state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, amount)?;

    // Update state
    ctx.accounts.state.total_fees_collected = ctx.accounts.state
        .total_fees_collected
        .checked_sub(amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    msg!("Withdrew {} USDC in fees to authority", amount);

    emit!(crate::events::FeesWithdrawnEvent {
        authority: ctx.accounts.authority.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
