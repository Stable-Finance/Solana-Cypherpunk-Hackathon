use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
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
}

pub fn update_authority_handler(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
    let old_authority = ctx.accounts.state.authority;
    ctx.accounts.state.authority = new_authority;

    msg!("Authority updated from {} to {}", old_authority, new_authority);

    emit!(crate::events::AuthorityUpdatedEvent {
        old_authority,
        new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
