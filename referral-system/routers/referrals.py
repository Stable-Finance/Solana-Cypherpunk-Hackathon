"""
Referrals Router
Endpoints for referral program management.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from web3 import Web3

from services.referral_service import ReferralService
from services.web3_service import Web3Service
from services.cache import CacheService
from services.staking_calculator import StakingCalculator
from services.event_indexer import EventIndexer
from services.database import DatabaseService

router = APIRouter()

# Initialize services
referral_service = ReferralService()
w3_service = Web3Service()
cache_service = CacheService()
event_indexer = EventIndexer(w3_service)
staking_calculator = StakingCalculator(w3_service, cache_service, event_indexer)
db_service = DatabaseService()

# Request models
class UseReferralRequest(BaseModel):
    referral_code: str
    referred_address: str
    swap_amount_usdc: float

@router.get("/{address}/code")
async def get_referral_code(address: str):
    """
    Get or create a referral code for an address

    Returns:
    - referral_code: Unique code (e.g., GOLD-WHALE-42)
    - rarity: Tier (LEGENDARY, RARE, UNCOMMON, COMMON)
    - rolls_used: Number of rolls used
    - rolls_remaining: Number of regenerations left
    - share_url: Full URL to share with others

    Example:
    - GET /referrals/0x123.../code
    """
    try:
        # Validate address
        if not Web3.is_address(address):
            raise HTTPException(status_code=400, detail="Invalid Ethereum address")

        checksum_addr = Web3.to_checksum_address(address)

        # Get or create code
        code_data = referral_service.get_or_create_referral_code(checksum_addr)

        if code_data["code"] in ["DISABLED", "ERROR"]:
            raise HTTPException(
                status_code=503,
                detail="Referral service temporarily unavailable"
            )

        # Build share URL
        share_url = f"https://app.trystable.co?ref={code_data['code']}"

        return {
            "success": True,
            "data": {
                "referral_code": code_data["code"],
                "rarity": code_data["rarity"],
                "rolls_used": code_data["rolls_used"],
                "rolls_remaining": code_data["rolls_remaining"],
                "successful_referrals": code_data.get("successful_referrals", 0),
                "unlock_progress": code_data.get("unlock_progress", "0/10"),
                "share_url": share_url,
                "address": checksum_addr
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting referral code: {str(e)}"
        )

@router.post("/{address}/regenerate")
async def regenerate_referral_code(address: str):
    """
    Regenerate referral code (uses one roll)

    Returns:
    - New referral code with rarity
    - Updated roll counts
    - Unlock progress

    Limits:
    - 3 rolls initially
    - +3 rolls after 10 successful referrals
    - Max 6 rolls total, ever

    Example:
    - POST /referrals/0x123.../regenerate
    """
    try:
        # Validate address
        if not Web3.is_address(address):
            raise HTTPException(status_code=400, detail="Invalid Ethereum address")

        checksum_addr = Web3.to_checksum_address(address)

        # Regenerate code
        result = referral_service.regenerate_referral_code(checksum_addr)

        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to regenerate code")
            )

        # Build share URL
        share_url = f"https://app.trystable.co?ref={result['code']}"

        return {
            "success": True,
            "data": {
                "referral_code": result["code"],
                "rarity": result["rarity"],
                "rolls_used": result["rolls_used"],
                "rolls_remaining": result["rolls_remaining"],
                "successful_referrals": result.get("successful_referrals", 0),
                "unlock_progress": result.get("unlock_progress", "0/10"),
                "share_url": share_url,
                "address": checksum_addr
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error regenerating referral code: {str(e)}"
        )

@router.get("/check-referred/{address}")
async def check_if_already_referred(address: str):
    """
    Check if a user has already been referred

    Returns:
    - is_referred: Whether the user has already been referred
    - referrer_code: The referral code they used (if referred)
    - referrer_address: Address of the referrer (if referred)

    Example:
    - GET /referrals/check-referred/0x123...
    """
    try:
        # Validate address (supports both EVM and Solana)
        addr_info = referral_service._validate_address(address)
        if not addr_info["valid"]:
            raise HTTPException(status_code=400, detail="Invalid address (must be EVM or Solana)")

        normalized_addr = addr_info["normalized"]

        # Check if user has been referred
        result = referral_service.check_if_referred(normalized_addr)

        if not result:
            return {
                "success": True,
                "data": {
                    "is_referred": False,
                    "referrer_code": None,
                    "referrer_address": None
                },
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }

        # Unpack the tuple (referrer_address, referral_code)
        referrer_address, referrer_code = result

        return {
            "success": True,
            "data": {
                "is_referred": True,
                "referrer_code": referrer_code,
                "referrer_address": referrer_address
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error checking referral status: {str(e)}"
        )

@router.get("/validate/{code}")
async def validate_referral_code(code: str):
    """
    Validate if a referral code exists

    Returns:
    - valid: Whether the code exists
    - referrer_address: Address that owns the code (if valid)

    Example:
    - GET /referrals/validate/GOLD-WHALE-42
    """
    try:
        # Look up referrer by code
        referrer_address = referral_service.get_address_by_code(code.upper())

        if not referrer_address:
            return {
                "success": True,
                "data": {
                    "valid": False,
                    "referrer_address": None
                },
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }

        return {
            "success": True,
            "data": {
                "valid": True,
                "referrer_address": referrer_address
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error validating referral code: {str(e)}"
        )

@router.get("/check-code/{code}")
async def check_code_benefits(code: str):
    """
    Check the benefits of a referral code

    Returns:
    - is_valid: Whether the code is valid
    - is_special: Whether this is a special promotional code
    - min_swap: Minimum swap amount required (USDC)
    - bonus_points: Extra bonus points for the referee
    - description: Description of the code

    Example:
    - GET /referrals/check-code/PUNK
      Returns: { min_swap: 5, bonus_points: 500, is_special: true }
    """
    try:
        benefits = referral_service.get_code_benefits(code.upper())

        return {
            "success": True,
            "data": benefits,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error checking code benefits: {str(e)}"
        )

@router.post("/use")
async def use_referral_code(request: UseReferralRequest):
    """
    Record a referral usage when someone swaps with a referral code

    Body:
    - referral_code: The code being used
    - referred_address: Address of the person using the code
    - swap_amount_usdc: Amount swapped in USDC

    Returns:
    - success: Whether the referral was recorded
    - bonus_awarded: Amount of bonus points awarded to referrer

    Example:
    - POST /referrals/use
      {
        "referral_code": "ABC123",
        "referred_address": "0x456...",
        "swap_amount_usdc": 150.0
      }
    """
    try:
        # Validate referred address (supports both EVM and Solana)
        addr_info = referral_service._validate_address(request.referred_address)
        if not addr_info["valid"]:
            raise HTTPException(status_code=400, detail="Invalid address (must be EVM or Solana)")

        referred_checksum = addr_info["normalized"]

        # Look up referrer by code
        referrer_address = referral_service.get_address_by_code(request.referral_code)

        if not referrer_address:
            raise HTTPException(
                status_code=404,
                detail="Invalid referral code"
            )

        # Check if user already used a referral code
        existing_referral = referral_service.check_if_referred(referred_checksum)
        if existing_referral:
            raise HTTPException(
                status_code=400,
                detail="Address has already been referred"
            )

        # Check if user is trying to refer themselves
        if referrer_address.lower() == referred_checksum.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot refer yourself"
            )

        # Record the referral
        result = referral_service.record_referral(
            referrer_address,
            referred_checksum,
            request.swap_amount_usdc,
            request.referral_code
        )

        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to record referral")
            )

        # Build message with proper grammar
        message_parts = []
        if result["referrer_bonus"] > 0:
            message_parts.append(f"{result['referrer_bonus']} points awarded to referrer")
        if result["referee_bonus"] > 0:
            message_parts.append(f"{result['referee_bonus']} points awarded to you!")

        message = "Referral recorded! " + ", ".join(message_parts)
        if result["is_special"]:
            message += f" ({result['description']})"

        return {
            "success": True,
            "data": {
                "referrer_address": referrer_address,
                "referred_address": referred_checksum,
                "referrer_bonus": result["referrer_bonus"],
                "referee_bonus": result["referee_bonus"],
                "is_special": result["is_special"],
                "description": result["description"],
                "message": message
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error recording referral: {str(e)}"
        )

@router.get("/{address}/stats")
async def get_referral_stats(address: str):
    """
    Get referral statistics for an address

    Returns:
    - total_referrals: Number of people referred
    - signup_points: Points from signup bonuses (1000 per referral)
    - daily_points: Points from daily bonuses (0.1 per day per referred user)
    - total_referral_points: Total points from referrals
    - referred_addresses: List of addresses referred

    Example:
    - GET /referrals/0x123.../stats
    """
    try:
        # Validate address
        if not Web3.is_address(address):
            raise HTTPException(status_code=400, detail="Invalid Ethereum address")

        checksum_addr = Web3.to_checksum_address(address)

        # Get stats from referral service
        stats = referral_service.get_referrer_stats(checksum_addr)

        return {
            "success": True,
            "data": stats,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching referral stats: {str(e)}"
        )

@router.post("/snapshot")
async def trigger_daily_snapshot():
    """
    Manually trigger daily balance snapshot (for testing/admin)

    This takes a snapshot of all referred users' USDX balances
    and stores them in Google Sheets for daily points calculation.

    Normally runs automatically at midnight UTC.

    Returns:
    - date: Date of snapshot
    - addresses_checked: Number of referred addresses checked
    - balances_recorded: Number of non-zero balances recorded

    Example:
    - POST /referrals/snapshot
    """
    try:
        result = referral_service.snapshot_daily_balances(w3_service)

        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to take snapshot")
            )

        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error taking snapshot: {str(e)}"
        )

@router.get("/leaderboard-full")
async def get_full_leaderboard(
    limit: int = Query(100, description="Number of top users to return", ge=1, le=500)
):
    """
    Get FULL leaderboard showing ALL point earners (stakers + referrers)

    Query Parameters:
    - limit: Number of top users to return (default 100, max 500)

    Returns list of:
    - address: User wallet address
    - stable_points: Points from staking
    - referrals: Number of referrals
    - referral_points: Points from referrals
    - total_points: Combined total

    Example:
    - GET /referrals/leaderboard/full?limit=50
    """
    try:
        import time

        # Step 1: Get all stakers from blockchain
        # Note: We can't use the cached staking snapshot because it only has aggregate data,
        # not individual user data. We need to query each staker directly.
        all_stakers = await event_indexer.get_stakers_with_cache(cache_service)

        # Step 2: Get referral data from cache (or fetch if not cached)
        referral_cache = cache_service.get_referral_data()

        if referral_cache:
            # Use cached data (FAST!)
            referral_data = referral_cache['referral_leaderboard']
            referred_addresses = set(referral_cache['referred_addresses'])
        else:
            # Cache miss - fetch from Google Sheets (slow first time)
            referral_data = referral_service.get_leaderboard(limit=10000)
            referred_addresses = referral_service.get_all_referred_addresses()

            # Cache for 5 minutes
            cache_service.set_referral_data({
                'referral_leaderboard': referral_data,
                'referred_addresses': list(referred_addresses)
            }, ttl=300)

        # Create a map of address -> referral data for quick lookup
        referral_map = {}
        for entry in referral_data:
            referral_map[entry['address'].lower()] = {
                'referrals': entry['total_referrals'],
                'referral_points': entry['referral_points']
            }

        # Step 3: Build combined leaderboard by querying each staker
        leaderboard_dict = {}
        now = int(time.time())

        # Process all stakers from blockchain
        for address in all_stakers:
            try:
                checksum_addr = Web3.to_checksum_address(address)
                stable_points = 0

                # Query USDX staking and balance
                usdx_staked = 0
                usdx_balance = 0
                if w3_service.is_contract_available("USDX_STAKING"):
                    try:
                        usdx_contract = w3_service.get_contract("USDX_STAKING")
                        user_stakes = usdx_contract.functions.getUserStakingData(checksum_addr).call()
                        stored_points = user_stakes[1]
                        last_update = user_stakes[2]
                        staked_amount = user_stakes[0]
                        usdx_staked = staked_amount / 1e6
                        seconds_elapsed = now - last_update
                        pending_points_raw = (staked_amount * seconds_elapsed * 10**11) // (10**6 * 86400)
                        stable_points += (stored_points + pending_points_raw) / 1e11
                    except:
                        pass

                    # Get USDX token balance
                    try:
                        usdx_token = w3_service.get_contract("USDX")
                        usdx_balance = usdx_token.functions.balanceOf(checksum_addr).call() / 1e6
                    except:
                        pass

                # Query EURX staking and balance
                eurx_staked = 0
                eurx_balance = 0
                if w3_service.is_contract_available("EURX_STAKING"):
                    try:
                        eurx_contract = w3_service.get_contract("EURX_STAKING")
                        user_stakes = eurx_contract.functions.getUserStakingData(checksum_addr).call()
                        stored_points = user_stakes[1]
                        last_update = user_stakes[2]
                        staked_amount = user_stakes[0]
                        eurx_staked = staked_amount / 1e6
                        seconds_elapsed = now - last_update
                        pending_points_raw = (staked_amount * seconds_elapsed * 10**11) // (10**6 * 86400)
                        stable_points += (stored_points + pending_points_raw) / 1e11
                    except:
                        pass

                    # Get EURX token balance
                    try:
                        eurx_token = w3_service.get_contract("EURX")
                        eurx_balance = eurx_token.functions.balanceOf(checksum_addr).call() / 1e6
                    except:
                        pass

                # Query Legacy DualToken staking
                # NOTE: Legacy contract storage is corrupted, use hardcoded deposit data
                if hasattr(event_indexer, 'legacy_deposits') and checksum_addr.lower() in event_indexer.legacy_deposits:
                    try:
                        deposits = event_indexer.legacy_deposits[checksum_addr.lower()]

                        # Calculate points per deposit (1 stable point per day per token staked)
                        for amount, stake_time, is_eurx in deposits:
                            if is_eurx:
                                eurx_staked += amount / 1e6
                            else:
                                usdx_staked += amount / 1e6

                            # Calculate stable points for this deposit
                            seconds_staked = now - stake_time
                            points_for_deposit = (amount * seconds_staked * 10**11) // (10**6 * 86400)
                            stable_points += points_for_deposit / 1e11
                    except Exception as e:
                        print(f"[Leaderboard] Error calculating legacy deposits for {checksum_addr}: {e}")

                # Get referral data if exists
                ref_data = referral_map.get(address.lower(), {'referrals': 0, 'referral_points': 0})

                # Get referee bonus (1000 points if this user was referred)
                referee_bonus = referral_service.REFEREE_BONUS if address.lower() in referred_addresses else 0

                total_points = stable_points + ref_data['referral_points'] + referee_bonus

                # Only include if they have points
                if total_points > 0:
                    leaderboard_dict[address.lower()] = {
                        'address': checksum_addr,
                        'stable_points': round(stable_points, 2),
                        'referrals': ref_data['referrals'],
                        'referral_points': ref_data['referral_points'],
                        'referee_bonus': referee_bonus,
                        'total_points': round(total_points, 2),
                        'usdx_balance': round(usdx_balance, 2),
                        'eurx_balance': round(eurx_balance, 2),
                        'usdx_staked': round(usdx_staked, 2),
                        'eurx_staked': round(eurx_staked, 2),
                        'total_staked': round(usdx_staked + eurx_staked, 2)
                    }
            except Exception as e:
                print(f"[Leaderboard] Error processing staker {address}: {e}")
                continue

        # Add referrers who aren't already in the dict (people who only have referral points)
        for entry in referral_data:
            address = entry['address']
            addr_lower = address.lower()
            if addr_lower not in leaderboard_dict:
                # Check referee bonus for referrers too
                referee_bonus = referral_service.REFEREE_BONUS if addr_lower in referred_addresses else 0
                total_points = entry['referral_points'] + referee_bonus
                if total_points > 0:
                    leaderboard_dict[addr_lower] = {
                        'address': address,
                        'stable_points': 0.0,
                        'referrals': entry['total_referrals'],
                        'referral_points': entry['referral_points'],
                        'referee_bonus': referee_bonus,
                        'total_points': round(total_points, 2),
                        'usdx_balance': 0.0,
                        'eurx_balance': 0.0,
                        'usdx_staked': 0.0,
                        'eurx_staked': 0.0,
                        'total_staked': 0.0
                    }

        # Convert dict to list and sort by total points descending
        leaderboard = list(leaderboard_dict.values())
        leaderboard.sort(key=lambda x: x['total_points'], reverse=True)

        return {
            "success": True,
            "data": {
                "leaderboard": leaderboard[:limit],
                "total_entries": len(leaderboard)
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching full leaderboard: {str(e)}"
        )

@router.get("/leaderboard-cached")
async def get_leaderboard_cached(
    limit: int = Query(100, description="Number of top users to return", ge=1, le=500)
):
    """
    Get leaderboard from database cache (FAST!)

    This endpoint reads from a pre-computed database cache that is updated
    periodically by a background worker. Response time: <100ms.

    The cache is updated every hour (or on-demand via the update script).

    Query Parameters:
    - limit: Number of top users to return (default 100, max 500)

    Returns same structure as /leaderboard-full but much faster.

    Example:
    - GET /referrals/leaderboard-cached?limit=50
    """
    try:
        # Get leaderboard from database
        leaderboard = db_service.get_leaderboard(limit=limit)
        total_entries = db_service.get_total_entries()

        # Check if cache is empty (needs initialization)
        if total_entries == 0:
            return {
                "success": False,
                "message": "Leaderboard cache is empty. Please run: python update_leaderboard_cache.py",
                "data": {
                    "leaderboard": [],
                    "total_entries": 0
                },
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }

        return {
            "success": True,
            "data": {
                "leaderboard": leaderboard,
                "total_entries": total_entries
            },
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "cached": True
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching cached leaderboard: {str(e)}"
        )

@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = Query(100, description="Number of top users to return", ge=1, le=500)
):
    """
    Get referral leaderboard with combined staking + referral points
    (Only shows users who have made referrals)

    Query Parameters:
    - limit: Number of top users to return (default 100, max 500)

    Returns list of:
    - address: User wallet address
    - stable_points: Points from staking
    - referrals: Number of referrals
    - referral_points: Points from referrals
    - total_points: Combined total

    Example:
    - GET /referrals/leaderboard?limit=50
    """
    try:
        # Get referral leaderboard
        referral_data = referral_service.get_leaderboard(limit=limit)

        # Get all referred addresses for efficient referee bonus lookup
        referred_addresses = referral_service.get_all_referred_addresses()

        # For each user, fetch their staking points
        # Note: This is expensive. In production, consider caching or combining with hourly snapshot
        leaderboard = []

        for entry in referral_data:
            address = entry['address']

            # Skip invalid addresses
            try:
                checksum_addr = Web3.to_checksum_address(address)
            except Exception as e:
                print(f"[Leaderboard] Skipping invalid address: {address} ({e})")
                continue

            # Get staking points from staking calculator
            # We'll use a simplified approach: just get from the user endpoint data
            stable_points = 0
            try:
                import time
                now = int(time.time())

                # Query USDX staking
                if w3_service.is_contract_available("USDX_STAKING"):
                    try:
                        usdx_contract = w3_service.get_contract("USDX_STAKING")
                        user_stakes = usdx_contract.functions.getUserStakingData(checksum_addr).call()
                        stored_points = user_stakes[1]
                        last_update = user_stakes[2]
                        staked_amount = user_stakes[0]
                        seconds_elapsed = now - last_update
                        pending_points_raw = (staked_amount * seconds_elapsed * 10**11) // (10**6 * 86400)
                        stable_points += (stored_points + pending_points_raw) / 1e11
                    except:
                        pass

                # Query EURX staking
                if w3_service.is_contract_available("EURX_STAKING"):
                    try:
                        eurx_contract = w3_service.get_contract("EURX_STAKING")
                        user_stakes = eurx_contract.functions.getUserStakingData(checksum_addr).call()
                        stored_points = user_stakes[1]
                        last_update = user_stakes[2]
                        staked_amount = user_stakes[0]
                        seconds_elapsed = now - last_update
                        pending_points_raw = (staked_amount * seconds_elapsed * 10**11) // (10**6 * 86400)
                        stable_points += (stored_points + pending_points_raw) / 1e11
                    except:
                        pass

            except Exception as e:
                print(f"[Leaderboard] Error getting staking points for {address}: {e}")

            # Get referee bonus (1000 points if this user was referred)
            # Use set membership check instead of querying Google Sheets
            referee_bonus = referral_service.REFEREE_BONUS if checksum_addr.lower() in referred_addresses else 0

            # Add to leaderboard
            total_points = stable_points + entry['referral_points'] + referee_bonus

            leaderboard.append({
                "address": checksum_addr,
                "stable_points": round(stable_points, 2),
                "referrals": entry['total_referrals'],
                "referral_points": entry['referral_points'],
                "referee_bonus": referee_bonus,
                "total_points": round(total_points, 2)
            })

        # Sort by total points descending
        leaderboard.sort(key=lambda x: x['total_points'], reverse=True)

        return {
            "success": True,
            "data": {
                "leaderboard": leaderboard[:limit],
                "total_entries": len(leaderboard)
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching leaderboard: {str(e)}"
        )
