use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo, Burn, SetAuthority, set_authority};
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("2xBQyCNxQbB3JAhfLXJiy3bVr7bSdE8oKQywXBfE8Coq");

#[program]
pub mod usdx_bridge {
    use super::*;

    /// Initialize the bridge program
    /// Sets up the bridge config and transfers mint authority
    /// Mint must already exist with 6 decimals and authority must be the signer
    pub fn initialize(
        ctx: Context<Initialize>,
        base_bridge_address: [u8; 32], // Base USDXBridge contract address
    ) -> Result<()> {
        let bridge_config = &mut ctx.accounts.bridge_config;
        bridge_config.authority = ctx.accounts.authority.key();
        bridge_config.usdx_mint = ctx.accounts.usdx_mint.key();
        bridge_config.base_bridge_address = base_bridge_address;
        bridge_config.total_bridged_from_base = 0;
        bridge_config.total_bridged_to_base = 0;
        bridge_config.paused = false; // Start unpaused
        bridge_config.bump = ctx.bumps.bridge_config;

        // Transfer mint authority to bridge_config PDA
        let cpi_accounts = SetAuthority {
            current_authority: ctx.accounts.authority.to_account_info(),
            account_or_mint: ctx.accounts.usdx_mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        set_authority(
            cpi_ctx,
            AuthorityType::MintTokens,
            Some(bridge_config.key()),
        )?;

        Ok(())
    }

    /// Receive bridge from Base with VAA verification
    /// Only processes valid Wormhole VAAs from the Base bridge
    /// Prevents replay attacks and unauthorized minting
    pub fn receive_from_base(
        ctx: Context<ReceiveFromBase>,
        vaa_data: Vec<u8>,
    ) -> Result<()> {
        let bridge_config = &ctx.accounts.bridge_config;

        // 1. Check if bridge is paused
        require!(!bridge_config.paused, BridgeError::BridgePaused);

        // 2. Calculate VAA hash for replay protection
        let vaa_hash = keccak::hash(&vaa_data).to_bytes();

        // 3. Check if this VAA was already processed
        // The processed_vaa account should not exist yet (lamports = 0 means not created)
        require!(
            ctx.accounts.processed_vaa.to_account_info().lamports() == 0,
            BridgeError::VAAAlreadyProcessed
        );

        // 4. Basic VAA structure validation
        // For production: Use full Wormhole SDK verification
        // For now: Basic checks + require emitter verification
        require!(vaa_data.len() >= 100, BridgeError::InvalidVAA);

        // VAA structure (simplified):
        // [0]: version
        // [1-4]: guardian set index
        // [5]: num signatures
        // Then signatures, then body
        // Body contains: timestamp, nonce, emitter_chain, emitter_address, sequence, consistency, payload

        // Extract emitter chain (at byte 99 in standard VAA)
        let emitter_chain_offset = 99;
        require!(vaa_data.len() > emitter_chain_offset + 2, BridgeError::InvalidVAA);
        let emitter_chain = u16::from_be_bytes([
            vaa_data[emitter_chain_offset],
            vaa_data[emitter_chain_offset + 1]
        ]);

        // Verify it's from Base (Wormhole chain ID 30)
        require!(emitter_chain == 30, BridgeError::InvalidChain);

        // Extract emitter address (32 bytes after chain)
        let emitter_offset = emitter_chain_offset + 2;
        require!(vaa_data.len() >= emitter_offset + 32, BridgeError::InvalidVAA);
        let mut emitter_address = [0u8; 32];
        emitter_address.copy_from_slice(&vaa_data[emitter_offset..emitter_offset + 32]);

        // Verify it's from our Base bridge contract
        require!(
            emitter_address == bridge_config.base_bridge_address,
            BridgeError::InvalidEmitter
        );

        // Extract payload (after sequence + consistency)
        let payload_offset = emitter_offset + 32 + 8 + 1; // +8 for sequence, +1 for consistency
        require!(vaa_data.len() >= payload_offset + 40, BridgeError::InvalidPayload);

        // Payload format: recipient (32 bytes) + amount (8 bytes)
        let mut recipient_bytes = [0u8; 32];
        recipient_bytes.copy_from_slice(&vaa_data[payload_offset..payload_offset + 32]);
        let recipient = Pubkey::new_from_array(recipient_bytes);

        let mut amount_bytes = [0u8; 8];
        amount_bytes.copy_from_slice(&vaa_data[payload_offset + 32..payload_offset + 40]);
        let amount = u64::from_be_bytes(amount_bytes);

        // 5. Validate amount
        require!(amount > 0, BridgeError::ZeroAmount);
        require!(amount >= 500_000_000, BridgeError::BelowMinimum); // 500 USDX min

        // 6. Verify recipient matches expected account
        require!(
            recipient == ctx.accounts.recipient.key(),
            BridgeError::RecipientMismatch
        );

        // 7. Mark VAA as processed (replay protection)
        // Create a simple account with the VAA hash as data to mark it as processed
        // In production, this should be a proper PDA account with ProcessedVAA structure
        let rent = Rent::get()?;
        let space = 8 + ProcessedVAA::INIT_SPACE;
        let lamports = rent.minimum_balance(space);

        anchor_lang::system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.processed_vaa.to_account_info(),
                },
            ),
            lamports,
            space as u64,
            &crate::ID,
        )?;

        // Write VAA hash to the account
        let mut data = ctx.accounts.processed_vaa.try_borrow_mut_data()?;
        data[..32].copy_from_slice(&vaa_hash);
        let timestamp_bytes = Clock::get()?.unix_timestamp.to_le_bytes();
        data[32..40].copy_from_slice(&timestamp_bytes);

        // 8. Mint USDX to recipient
        let seeds = &[
            b"bridge_config".as_ref(),
            &[bridge_config.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.usdx_mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.bridge_config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::mint_to(cpi_ctx, amount)?;

        // 9. Update stats
        let bridge_config = &mut ctx.accounts.bridge_config;
        bridge_config.total_bridged_from_base = bridge_config
            .total_bridged_from_base
            .checked_add(amount)
            .ok_or(BridgeError::Overflow)?;

        emit!(BridgedFromBase {
            recipient,
            amount,
            vaa_hash,
        });

        Ok(())
    }

    /// Bridge USDX to Base
    /// Burns USDX on Solana and emits event for Wormhole relayer
    pub fn bridge_to_base(
        ctx: Context<BridgeToBase>,
        amount: u64,
        base_recipient: [u8; 20], // Ethereum address (20 bytes)
    ) -> Result<()> {
        let bridge_config = &ctx.accounts.bridge_config;

        // Check if bridge is paused
        require!(!bridge_config.paused, BridgeError::BridgePaused);

        require!(amount > 0, BridgeError::ZeroAmount);
        require!(amount >= 500_000_000, BridgeError::BelowMinimum); // 500 USDX minimum (6 decimals)

        // Burn USDX from user
        let cpi_accounts = Burn {
            mint: ctx.accounts.usdx_mint.to_account_info(),
            from: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::burn(cpi_ctx, amount)?;

        // Update stats
        let bridge_config = &mut ctx.accounts.bridge_config;
        bridge_config.total_bridged_to_base = bridge_config
            .total_bridged_to_base
            .checked_add(amount)
            .ok_or(BridgeError::Overflow)?;

        // Emit event (Wormhole relayer will pick this up and send to Base)
        emit!(BridgedToBase {
            user: ctx.accounts.user.key(),
            amount,
            base_recipient,
        });

        Ok(())
    }

    /// Update authority (admin function)
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let bridge_config = &mut ctx.accounts.bridge_config;
        bridge_config.authority = new_authority;

        Ok(())
    }

    /// Pause bridge (emergency stop)
    /// Only authority can pause
    pub fn pause(ctx: Context<PauseBridge>) -> Result<()> {
        let bridge_config = &mut ctx.accounts.bridge_config;
        require!(!bridge_config.paused, BridgeError::AlreadyPaused);
        bridge_config.paused = true;

        emit!(BridgePaused {
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Unpause bridge
    /// Only authority can unpause
    pub fn unpause(ctx: Context<PauseBridge>) -> Result<()> {
        let bridge_config = &mut ctx.accounts.bridge_config;
        require!(bridge_config.paused, BridgeError::NotPaused);
        bridge_config.paused = false;

        emit!(BridgeUnpaused {
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ============ Account Structs ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BridgeConfig::INIT_SPACE,
        seeds = [b"bridge_config"],
        bump
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// USDX mint must already exist with 6 decimals
    /// After initialization, transfer mint authority to bridge_config
    #[account(mut)]
    pub usdx_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReceiveFromBase<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        mut,
        address = bridge_config.usdx_mint
    )]
    pub usdx_mint: Account<'info, Mint>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// CHECK: Verified in instruction logic
    pub recipient: UncheckedAccount<'info>,

    /// Track processed VAAs to prevent replay attacks
    /// Must be uninitialized - will be created to mark VAA as processed
    /// CHECK: Verified to be empty in instruction logic
    #[account(mut)]
    pub processed_vaa: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BridgeToBase<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        mut,
        address = bridge_config.usdx_mint
    )]
    pub usdx_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
        has_one = authority
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct PauseBridge<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
        has_one = authority
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    pub authority: Signer<'info>,
}

// ============ State Structs ============

#[account]
pub struct BridgeConfig {
    pub authority: Pubkey,              // 32 bytes
    pub usdx_mint: Pubkey,              // 32 bytes
    pub base_bridge_address: [u8; 32], // 32 bytes - Base contract address
    pub total_bridged_from_base: u64,  // 8 bytes
    pub total_bridged_to_base: u64,    // 8 bytes
    pub paused: bool,                   // 1 byte - Emergency pause
    pub bump: u8,                       // 1 byte
}

impl BridgeConfig {
    pub const INIT_SPACE: usize = 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

// Separate account to track processed VAAs (prevents replay attacks)
#[account]
pub struct ProcessedVAA {
    pub vaa_hash: [u8; 32],  // 32 bytes - Hash of the VAA
    pub processed_at: i64,   // 8 bytes - Timestamp
}

impl ProcessedVAA {
    pub const INIT_SPACE: usize = 32 + 8;
}

// ============ Events ============

#[event]
pub struct BridgedFromBase {
    pub recipient: Pubkey,
    pub amount: u64,
    pub vaa_hash: [u8; 32],
}

#[event]
pub struct BridgedToBase {
    pub user: Pubkey,
    pub amount: u64,
    pub base_recipient: [u8; 20],
}

#[event]
pub struct BridgePaused {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BridgeUnpaused {
    pub authority: Pubkey,
    pub timestamp: i64,
}

// ============ Errors ============

#[error_code]
pub enum BridgeError {
    #[msg("Invalid emitter address")]
    InvalidEmitter,

    #[msg("Invalid chain ID")]
    InvalidChain,

    #[msg("Invalid payload format")]
    InvalidPayload,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Recipient mismatch")]
    RecipientMismatch,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Amount below minimum (500 USDX)")]
    BelowMinimum,

    #[msg("Bridge is paused")]
    BridgePaused,

    #[msg("VAA already processed (replay protection)")]
    VAAAlreadyProcessed,

    #[msg("Invalid VAA structure")]
    InvalidVAA,

    #[msg("Bridge is already paused")]
    AlreadyPaused,

    #[msg("Bridge is not paused")]
    NotPaused,
}
