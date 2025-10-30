use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use mpl_token_metadata::instructions::CreateMetadataAccountV3Cpi;
use mpl_token_metadata::types::DataV2;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct CreateMetadata<'info> {
    #[account(
        constraint = authority.key() == state.authority @ ErrorCode::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STATE_SEED.as_bytes()],
        bump = state.bump
    )]
    pub state: Account<'info, ProgramState>,

    /// CHECK: This is the USDX mint PDA
    #[account(
        address = state.usdx_mint
    )]
    pub usdx_mint: UncheckedAccount<'info>,

    /// CHECK: This is the metadata account that will be created
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: This is the Metaplex Token Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub rent: Sysvar<'info, Rent>,
}

pub fn create_metadata_handler(
    ctx: Context<CreateMetadata>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    msg!("Creating metadata for USDX token");

    let state = &ctx.accounts.state;

    // Create metadata using Metaplex
    let data_v2 = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    // Create CPI instruction
    let create_ix = mpl_token_metadata::instructions::CreateMetadataAccountV3 {
        metadata: ctx.accounts.metadata.key(),
        mint: ctx.accounts.usdx_mint.key(),
        mint_authority: state.key(), // State PDA is the mint authority
        payer: ctx.accounts.payer.key(),
        update_authority: (ctx.accounts.authority.key(), true), // Authority as update authority
        system_program: ctx.accounts.system_program.key(),
        rent: Some(ctx.accounts.rent.key()),
    };

    let create_ix_args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
        data: data_v2,
        is_mutable: true,
        collection_details: None,
    };

    let account_infos = vec![
        ctx.accounts.metadata.to_account_info(),
        ctx.accounts.usdx_mint.to_account_info(),
        state.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.rent.to_account_info(),
    ];

    // Sign with state PDA (the mint authority)
    let seeds = &[STATE_SEED.as_bytes(), &[state.bump]];
    let signer = &[&seeds[..]];

    invoke_signed(
        &create_ix.instruction(create_ix_args),
        &account_infos,
        signer,
    )?;

    msg!("Metadata created successfully");

    Ok(())
}
