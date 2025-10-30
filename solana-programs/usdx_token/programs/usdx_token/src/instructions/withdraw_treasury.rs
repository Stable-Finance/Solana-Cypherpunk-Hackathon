use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
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

    /// Authority's USDC token account to receive treasury funds
    #[account(
        mut,
        token::mint = usdc_vault.mint,
        token::authority = authority
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_treasury_handler(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    // Calculate available treasury (vault balance minus what's needed to back USDX)
    let vault_balance = ctx.accounts.usdc_vault.amount;
    let usdx_backing_needed = ctx.accounts.state.total_usdx_minted;

    require!(
        vault_balance >= usdx_backing_needed,
        ErrorCode::InsufficientVaultBalance
    );

    let available_treasury = vault_balance
        .checked_sub(usdx_backing_needed)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    require!(
        amount <= available_treasury,
        ErrorCode::InsufficientVaultBalance
    );

    // Transfer treasury funds from vault to authority
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

    msg!("Withdrew {} USDC from treasury to authority", amount);

    Ok(())
}
