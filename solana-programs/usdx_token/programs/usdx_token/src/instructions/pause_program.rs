use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct PauseProgram<'info> {
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

pub fn pause_program_handler(ctx: Context<PauseProgram>) -> Result<()> {
    ctx.accounts.state.paused = true;
    msg!("Program paused by authority");

    emit!(crate::events::ProgramPausedEvent {
        authority: ctx.accounts.authority.key(),
        paused: true,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn unpause_program_handler(ctx: Context<PauseProgram>) -> Result<()> {
    ctx.accounts.state.paused = false;
    msg!("Program unpaused by authority");

    emit!(crate::events::ProgramPausedEvent {
        authority: ctx.accounts.authority.key(),
        paused: false,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
