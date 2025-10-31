"""
Solana Blinks/Actions API
Implements the Solana Actions specification for shareable blockchain links
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import os
import base64
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.system_program import TransferParams, transfer
from solders.message import Message
from solana.rpc.api import Client as SolanaClient
import json

router = APIRouter()

# Solana configuration
SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
USDC_MINT = os.getenv("SOLANA_USDC_MINT")  # USDC SPL token mint
USDX_MINT = os.getenv("SOLANA_USDX_MINT")  # USDX SPL token mint
EURX_MINT = os.getenv("SOLANA_EURX_MINT")  # EURX SPL token mint
TREASURY_ADDRESS = os.getenv("SOLANA_TREASURY_ADDRESS")  # Where USDC goes
PROGRAM_ID = os.getenv("SOLANA_SWAP_PROGRAM_ID")  # Your swap program

# Actions API models
class ActionError(BaseModel):
    message: str

class LinkedAction(BaseModel):
    label: str
    href: str
    parameters: Optional[List[Dict]] = None

class ActionGetResponse(BaseModel):
    icon: str  # URL to image
    title: str
    description: str
    label: str
    links: Optional[Dict[str, List[LinkedAction]]] = None
    disabled: Optional[bool] = False
    error: Optional[ActionError] = None

class ActionPostRequest(BaseModel):
    account: str  # User's Solana public key

class ActionPostResponse(BaseModel):
    transaction: str  # Base64 encoded serialized transaction
    message: Optional[str] = None


@router.get("/swap-usdx", response_model=ActionGetResponse)
async def get_swap_usdx_action(request: Request, referral: Optional[str] = None):
    """
    GET endpoint for USDC → USDX swap Blink
    Returns metadata about the action
    """
    base_url = str(request.base_url).rstrip('/')

    # Build referral param suffix for action links
    referral_param = f"&referral={referral}" if referral else ""

    return ActionGetResponse(
        icon="https://app.trystable.co/usdx-icon-black.png",
        title="Swap USDC for USDX",
        description="Trade USDC for USDX on Solana. Backed by US Mortgages 🇺🇸",
        label="Swap",
        links={
            "actions": [
                LinkedAction(
                    label="Swap 12 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-usdx?amount=12{referral_param}"
                ),
                LinkedAction(
                    label="Swap 67 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-usdx?amount=67{referral_param}"
                ),
                LinkedAction(
                    label="Swap 1,000 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-usdx?amount=1000{referral_param}"
                ),
                LinkedAction(
                    label="Swap Custom Amount",
                    href=f"{base_url}/api/v1/blinks/swap-usdx?amount={{amount}}{referral_param}",
                    parameters=[{
                        "name": "amount",
                        "label": "Enter USDC amount",
                        "required": True
                    }]
                )
            ]
        }
    )


@router.post("/swap-usdx", response_model=ActionPostResponse)
async def post_swap_usdx_action(
    request: ActionPostRequest,
    amount: float = 100.0,
    referral: Optional[str] = None
):
    """
    POST endpoint for USDC → USDX swap Blink
    Creates and returns a transaction for the user to sign
    """
    try:
        # Validate user account
        user_pubkey = Pubkey.from_string(request.account)

        # Validate amount
        if amount < 10:
            raise HTTPException(status_code=400, detail="Minimum swap amount is 10 USDC")
        if amount > 10000:
            raise HTTPException(status_code=400, detail="Maximum swap amount is 10,000 USDC")

        # Check if required config is available
        if not USDC_MINT or not USDX_MINT or not PROGRAM_ID:
            raise HTTPException(status_code=500, detail="Swap not configured on Solana")

        # Create swap transaction
        transaction = await create_swap_transaction(
            user_pubkey=user_pubkey,
            usdc_amount=amount,
            referral_code=referral
        )

        # Serialize transaction to base64
        serialized = base64.b64encode(bytes(transaction)).decode('utf-8')

        message = f"Swapping {amount} USDC for {amount} USDX"
        if referral:
            message += f" with referral code {referral}"

        return ActionPostResponse(
            transaction=serialized,
            message=message
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/swap-eurx", response_model=ActionGetResponse)
async def get_swap_eurx_action(request: Request, referral: Optional[str] = None):
    """
    GET endpoint for USDC → EURX swap Blink
    """
    base_url = str(request.base_url).rstrip('/')

    # Build referral param suffix for action links
    referral_param = f"&referral={referral}" if referral else ""

    return ActionGetResponse(
        icon="https://app.trystable.co/usdx-icon-black.png",  # Using USDX icon for now
        title="Swap USDC for EURX",
        description="Trade USDC for EURX on Solana. Backed by European bonds 🇪🇺",
        label="Swap",
        links={
            "actions": [
                LinkedAction(
                    label="Swap 12 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-eurx?amount=12{referral_param}"
                ),
                LinkedAction(
                    label="Swap 67 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-eurx?amount=67{referral_param}"
                ),
                LinkedAction(
                    label="Swap 1,000 USDC",
                    href=f"{base_url}/api/v1/blinks/swap-eurx?amount=1000{referral_param}"
                ),
                LinkedAction(
                    label="Swap Custom Amount",
                    href=f"{base_url}/api/v1/blinks/swap-eurx?amount={{amount}}{referral_param}",
                    parameters=[{
                        "name": "amount",
                        "label": "Enter USDC amount",
                        "required": True
                    }]
                )
            ]
        }
    )


@router.post("/swap-eurx", response_model=ActionPostResponse)
async def post_swap_eurx_action(
    request: ActionPostRequest,
    amount: float = 100.0,
    referral: Optional[str] = None
):
    """
    POST endpoint for USDC → EURX swap Blink
    """
    try:
        user_pubkey = Pubkey.from_string(request.account)

        if amount < 10:
            raise HTTPException(status_code=400, detail="Minimum swap amount is 10 USDC")
        if amount > 10000:
            raise HTTPException(status_code=400, detail="Maximum swap amount is 10,000 USDC")

        if not USDC_MINT or not EURX_MINT or not PROGRAM_ID:
            raise HTTPException(status_code=500, detail="Swap not configured on Solana")

        transaction = await create_swap_transaction(
            user_pubkey=user_pubkey,
            usdc_amount=amount,
            token_type="EURX",
            referral_code=referral
        )

        serialized = base64.b64encode(bytes(transaction)).decode('utf-8')

        # Get EUR/USD price for display
        eurx_amount = amount  # 1:1 for now, adjust with real price

        message = f"Swapping {amount} USDC for ~{eurx_amount:.2f} EURX"
        if referral:
            message += f" with referral code {referral}"

        return ActionPostResponse(
            transaction=serialized,
            message=message
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def create_swap_transaction(
    user_pubkey: Pubkey,
    usdc_amount: float,
    token_type: str = "USDX",
    referral_code: Optional[str] = None
) -> Transaction:
    """
    Create a swap transaction using your deployed USDX Solana program

    Calls deposit_usdc instruction to mint USDX/EURX
    """
    from .blinks_integration import build_deposit_usdc_instruction_with_compute

    # Convert USDC amount to lamports (USDC has 6 decimals)
    usdc_lamports = int(usdc_amount * 1_000_000)

    # Get mint address based on token type
    if token_type == "USDX":
        token_mint_str = USDX_MINT
    elif token_type == "EURX":
        token_mint_str = EURX_MINT
    else:
        raise ValueError(f"Invalid token type: {token_type}")

    if not token_mint_str or not USDC_MINT or not PROGRAM_ID:
        raise ValueError("Solana program not fully configured")

    # Parse pubkeys
    program_id = Pubkey.from_string(PROGRAM_ID)
    usdx_mint = Pubkey.from_string(token_mint_str)
    usdc_mint = Pubkey.from_string(USDC_MINT)

    # Derive USDC vault (PDA owned by program)
    # Vault is derived from ["vault"] seed (from constants.rs VAULT_SEED)
    vault_seeds = [b"vault"]
    usdc_vault, _ = Pubkey.find_program_address(vault_seeds, program_id)

    # Build deposit instruction with compute budget
    instructions = build_deposit_usdc_instruction_with_compute(
        program_id=program_id,
        user=user_pubkey,
        usdx_mint=usdx_mint,
        usdc_mint=usdc_mint,
        usdc_vault=usdc_vault,
        usdc_amount=usdc_lamports,
        compute_units=200_000,
        priority_fee=1,
        referral_code=referral_code
    )

    # Get recent blockhash
    client = SolanaClient(SOLANA_RPC_URL)
    recent_blockhash_resp = client.get_latest_blockhash()
    recent_blockhash = recent_blockhash_resp.value.blockhash

    # Create message with all instructions
    msg = Message.new_with_blockhash(
        instructions,
        user_pubkey,
        recent_blockhash
    )

    # Create unsigned transaction (user will sign it in their wallet)
    # For Blinks, we just need the serialized message
    tx = Transaction.new_unsigned(msg)

    # TODO: Record referral if referral_code provided
    # This would be done after transaction confirms

    return tx


# CORS headers for Blinks (required by wallets)
@router.options("/swap-usdx")
@router.options("/swap-eurx")
async def options_handler():
    """Handle OPTIONS requests for CORS"""
    return {
        "Allow": "GET, POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Accept-Encoding"
    }
