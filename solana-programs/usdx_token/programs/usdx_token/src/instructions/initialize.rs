use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::str::FromStr;

use crate::constants::*;
use crate::state::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        mut,
        constraint = authority.key() == Pubkey::from_str(EXPECTED_AUTHORITY).unwrap()
            @ ErrorCode::UnauthorizedInitializer
    )]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = ProgramState::LEN,
        seeds = [STATE_SEED.as_bytes()],
        bump
    )]
    pub state: Account<'info, ProgramState>,

    #[account(
        init,
        payer = authority,
        mint::decimals = USDX_DECIMALS,
        mint::authority = state,
        mint::freeze_authority = state,
        seeds = [USDX_MINT_SEED.as_bytes()],
        bump
    )]
    pub usdx_mint: Account<'info, Mint>,

    /// USDC mint (official Solana USDC - SPL Token)
    #[account(
        constraint = usdc_mint.key() == Pubkey::from_str(USDC_MINT_MAINNET).unwrap()
            || usdc_mint.key() == Pubkey::from_str(USDC_MINT_DEVNET).unwrap()
            @ ErrorCode::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = state,
        seeds = [VAULT_SEED.as_bytes()],
        bump
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn init_handler(ctx: Context<Initialize>) -> Result<()> {
    let state = &mut ctx.accounts.state;

    state.authority = ctx.accounts.authority.key();
    state.usdx_mint = ctx.accounts.usdx_mint.key();
    state.usdc_vault = ctx.accounts.usdc_vault.key();
    state.total_usdx_minted = 0;
    state.total_usdc_deposited = 0;
    state.total_fees_collected = 0;
    state.paused = false;
    state.bump = ctx.bumps.state;

    msg!("USDX Program initialized");
    msg!("Authority: {}", state.authority);
    msg!("USDX Mint: {}", state.usdx_mint);
    msg!("USDC Vault: {}", state.usdc_vault);

    Ok(())
}
