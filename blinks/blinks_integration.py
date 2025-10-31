"""
Helper functions for building Solana transactions for Blinks
Integrates with the deployed USDX Solana program
"""

import struct
from typing import List, Optional
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID

# Memo program ID
MEMO_PROGRAM_ID = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")


def get_associated_token_address(owner: Pubkey, mint: Pubkey) -> Pubkey:
    """Derive Associated Token Account address"""
    seeds = [
        bytes(owner),
        bytes(TOKEN_PROGRAM_ID),
        bytes(mint)
    ]
    return Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)[0]


def build_deposit_usdc_instruction(
    program_id: Pubkey,
    user: Pubkey,
    usdx_mint: Pubkey,
    usdc_mint: Pubkey,
    usdc_vault: Pubkey,
    usdc_amount: int
) -> Instruction:
    """
    Build deposit_usdc instruction for USDX Solana program

    Args:
        program_id: USDX program ID
        user: User's public key
        usdx_mint: USDX token mint
        usdc_mint: USDC token mint
        usdc_vault: Program's USDC vault
        usdc_amount: Amount in lamports (6 decimals)

    Returns:
        Solana Instruction to deposit USDC and mint USDX
    """

    # Derive PDA for program state
    state_seeds = [b"state"]
    state_pda, _ = Pubkey.find_program_address(state_seeds, program_id)

    # Derive user's token accounts
    user_usdc_ata = get_associated_token_address(user, usdc_mint)
    user_usdx_ata = get_associated_token_address(user, usdx_mint)

    # Build instruction discriminator (first 8 bytes of sha256("global:deposit_usdc"))
    discriminator = bytes([184, 148, 250, 169, 224, 213, 34, 126])

    # Encode instruction data: discriminator + u64 amount
    instruction_data = discriminator + struct.pack('<Q', usdc_amount)

    # Build account metas (order must match the Anchor program)
    accounts = [
        AccountMeta(user, is_signer=True, is_writable=True),                    # user
        AccountMeta(state_pda, is_signer=False, is_writable=True),              # state (PDA)
        AccountMeta(usdx_mint, is_signer=False, is_writable=True),              # usdx_mint
        AccountMeta(usdc_vault, is_signer=False, is_writable=True),             # usdc_vault
        AccountMeta(user_usdc_ata, is_signer=False, is_writable=True),          # user_usdc
        AccountMeta(user_usdx_ata, is_signer=False, is_writable=True),          # user_usdx (ATA, auto-created)
        AccountMeta(TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),      # token_program
        AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),  # associated_token_program
        AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),     # system_program
    ]

    return Instruction(
        program_id=program_id,
        data=instruction_data,
        accounts=accounts
    )


def build_memo_instruction(memo_text: str, signer: Pubkey) -> Instruction:
    """
    Build a memo instruction to attach text to a transaction

    Args:
        memo_text: Text to include in the memo
        signer: Signer pubkey (user)

    Returns:
        Memo instruction
    """
    # Encode memo as UTF-8
    memo_data = memo_text.encode('utf-8')

    return Instruction(
        program_id=MEMO_PROGRAM_ID,
        data=memo_data,
        accounts=[AccountMeta(signer, is_signer=True, is_writable=False)]
    )


def build_deposit_usdc_instruction_with_compute(
    program_id: Pubkey,
    user: Pubkey,
    usdx_mint: Pubkey,
    usdc_mint: Pubkey,
    usdc_vault: Pubkey,
    usdc_amount: int,
    compute_units: int = 200_000,
    priority_fee: int = 1,
    referral_code: Optional[str] = None
) -> List[Instruction]:
    """
    Build deposit instruction with compute budget instructions and optional referral memo

    Returns:
        List of instructions: [set_compute_units, set_priority_fee, memo?, deposit]
    """
    from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price

    instructions = []

    # Set compute unit limit
    instructions.append(set_compute_unit_limit(compute_units))

    # Set priority fee (micro-lamports per compute unit)
    if priority_fee > 0:
        instructions.append(set_compute_unit_price(priority_fee))

    # Add memo instruction with referral code if provided
    if referral_code:
        memo_text = f"REFERRAL:{referral_code}"
        instructions.append(build_memo_instruction(memo_text, user))

    # Add deposit instruction
    instructions.append(
        build_deposit_usdc_instruction(
            program_id=program_id,
            user=user,
            usdx_mint=usdx_mint,
            usdc_mint=usdc_mint,
            usdc_vault=usdc_vault,
            usdc_amount=usdc_amount
        )
    )

    return instructions
