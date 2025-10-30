use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
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

    /// User's USDC token account
    #[account(
        mut,
        token::mint = usdc_vault.mint,
        token::authority = user
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    /// User's USDX token account (auto-create if needed)
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = usdx_mint,
        associated_token::authority = user
    )]
    pub user_usdx: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_handler(ctx: Context<DepositUsdc>, usdc_amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProgramPaused);

    require!(
        usdc_amount >= MIN_DEPOSIT,
        ErrorCode::AmountBelowMinimum
    );

    require!(
        usdc_amount <= MAX_DEPOSIT,
        ErrorCode::AmountAboveMaximum
    );

    // Calculate progressive tiered fee
    let fee_amount = calculate_fee(usdc_amount);
    let usdx_to_mint = usdc_amount
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Transfer USDC from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_usdc.to_account_info(),
        to: ctx.accounts.usdc_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, usdc_amount)?;

    // Mint USDX to user (amount after fee)
    let seeds = &[
        STATE_SEED.as_bytes(),
        &[ctx.accounts.state.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.usdx_mint.to_account_info(),
        to: ctx.accounts.user_usdx.to_account_info(),
        authority: ctx.accounts.state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::mint_to(cpi_ctx, usdx_to_mint)?;

    // Update state
    let state = &mut ctx.accounts.state;
    state.total_usdc_deposited = state
        .total_usdc_deposited
        .checked_add(usdc_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    state.total_usdx_minted = state
        .total_usdx_minted
        .checked_add(usdx_to_mint)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    state.total_fees_collected = state
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    msg!("Deposited {} USDC", usdc_amount);
    msg!("Fee: {} USDC", fee_amount);
    msg!("Minted {} USDX", usdx_to_mint);

    emit!(crate::events::DepositEvent {
        user: ctx.accounts.user.key(),
        usdc_amount,
        usdx_minted: usdx_to_mint,
        fee_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Calculate progressive tiered fee
fn calculate_fee(amount: u64) -> u64 {
    if amount < FEE_TIER_1_THRESHOLD {
        // Tier 1: 1.0%
        amount * FEE_TIER_1 as u64 / 10000
    } else {
        // Tier 1 portion (first 500k at 1%)
        let tier1_fee = FEE_TIER_1_THRESHOLD * FEE_TIER_1 as u64 / 10000;

        // Tier 2 portion (everything above 500k at 0.5%)
        let tier2_amount = amount - FEE_TIER_1_THRESHOLD;
        let tier2_fee = tier2_amount * FEE_TIER_2 as u64 / 10000;

        tier1_fee + tier2_fee
    }
}
