use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct DepositTreasury<'info> {
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

    /// Authority's USDC token account to deposit from
    #[account(
        mut,
        token::mint = usdc_vault.mint,
        token::authority = authority
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn deposit_treasury_handler(ctx: Context<DepositTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Transfer USDC from authority to vault (no USDX minting)
    let cpi_accounts = Transfer {
        from: ctx.accounts.authority_usdc.to_account_info(),
        to: ctx.accounts.usdc_vault.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    msg!("Deposited {} USDC to treasury from authority", amount);

    Ok(())
}
