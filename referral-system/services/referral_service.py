"""
Referral Service
Manages referral codes and tracking using Google Sheets as the data store.
"""

import gspread
from google.oauth2.service_account import Credentials
import os
import random
import time
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from web3 import Web3
from solders.pubkey import Pubkey
from solana.rpc.api import Client as SolanaClient

class ReferralService:
    """Manages referral program data via Google Sheets"""

    # Referral rewards
    SIGNUP_BONUS = 1000  # 1000 Stable Points for referrer (person who referred)
    REFEREE_BONUS = 1000  # 1000 Stable Points for referee (person being referred)
    DAILY_BONUS_RATE = 0.1  # 0.1 Stable Points per day per USDX held/staked by referred users
    MIN_SWAP_AMOUNT = 100  # Minimum 100 USDC swap to qualify (default)

    # Special referral codes with custom benefits
    SPECIAL_CODES = {
        'PUNK': {
            'min_swap': 5,  # 5 USDC minimum (vs 100 USDC default)
            'bonus_points': 500,  # Extra 500 points for referee
            'description': 'Solana Cypherpunk Hackathon code'
        },
        'LAUNCH': {
            'min_swap': 10,  # 10 USDC minimum
            'bonus_points': 250,  # Extra 250 points for referee
            'description': 'Launch week special'
        },
        'VIP': {
            'min_swap': 5,  # 5 USDC minimum
            'bonus_points': 1000,  # Extra 1000 points for referee
            'description': 'VIP early access'
        }
    }

    # Regeneration limits
    BASE_ROLLS = 3  # Everyone gets 3 rolls
    BONUS_ROLLS = 3  # Unlock 3 more after 3 successful referrals
    UNLOCK_THRESHOLD = 3  # Number of referrals needed to unlock bonus rolls

    # Rarity tiers and word lists
    RARITY_TIERS = {
        'MYTHIC': {
            'weight': 0.005,  # 0.5%
            'colors': ['GOLD', 'RAINBOW', 'COSMIC', 'DIVINE', 'CELESTIAL', 'ETERNAL'],
            'words': ['SATOSHI', 'WHALE', 'MOON', 'LEGEND', 'TITAN', 'INFINITY']
        },
        'LEGENDARY': {
            'weight': 0.03,  # 3%
            'colors': ['DIAMOND', 'PLATINUM', 'LASER', 'CRYSTAL', 'PRISMATIC', 'RADIANT'],
            'words': ['LAMBO', 'ROCKET', 'BULL', 'APE', 'HODL', 'DRAGON', 'PHOENIX']
        },
        'EPIC': {
            'weight': 0.06,  # 6%
            'colors': ['VIOLET', 'AMETHYST', 'ORCHID', 'MAGENTA', 'INDIGO', 'ROYAL'],
            'words': ['COMET', 'NOVA', 'METEOR', 'THUNDER', 'LIGHTNING', 'TEMPEST', 'STORM']
        },
        'RARE': {
            'weight': 0.14,  # 14%
            'colors': ['SAPPHIRE', 'AZURE', 'COBALT', 'NAVY', 'OCEAN', 'STEEL'],
            'words': ['STAR', 'GALAXY', 'ORBIT', 'STELLAR', 'QUANTUM', 'NEBULA', 'COSMIC']
        },
        'UNCOMMON': {
            'weight': 0.25,  # 25%
            'colors': ['EMERALD', 'JADE', 'FOREST', 'LIME', 'MINT', 'OLIVE'],
            'words': ['BLAZE', 'FROST', 'SHADOW', 'CLOUD', 'ECHO', 'FLASH', 'SPARK']
        },
        'COMMON': {
            'weight': 0.515,  # 51.5%
            'colors': ['GRAY', 'SILVER', 'ASH', 'SLATE', 'SMOKE', 'STONE', 'IRON'],
            'words': ['WAVE', 'WIND', 'FIRE', 'LEAF', 'RIVER', 'SAND', 'SKY', 'DAWN']
        }
    }

    # Number length distribution
    LENGTH_WEIGHTS = {
        1: 0.05,   # 5% chance of 1 digit
        2: 0.85,   # 85% chance of 2 digits
        3: 0.10    # 10% chance of 3 digits
    }

    # Special number patterns by length
    SPECIAL_NUMBERS = {
        1: {
            'lucky': [7, 8, 9],  # 30% of single digits
            'regular': [0, 1, 2, 3, 4, 5, 6]  # 70%
        },
        2: {
            'ultra_rare': [69, 42, 88, 77, 99],  # 5.5%
            'rare': [11, 22, 33, 44, 55, 66],  # 6.7% (repeating, excluding ultra-rare)
            'uncommon': [12, 23, 34, 45, 56, 67, 78, 89, 21, 32, 43, 54, 65, 76, 87, 98],  # 17.8% (sequential)
            'common': []  # 70% (everything else)
        },
        3: {
            'ultra_rare': [420, 666, 888, 777, 999],  # 0.55%
            'rare': [111, 222, 333, 444, 555],  # 0.55% (repeating, excluding ultra-rare)
            'uncommon': [123, 234, 345, 456, 567, 678, 789, 321, 432, 543, 654, 765, 876, 987],  # 1.55% (sequential)
            'common': []  # ~97.35% (everything else)
        }
    }

    # Weights for selecting special numbers within each length
    NUMBER_PATTERN_WEIGHTS = {
        1: {
            'lucky': 0.30,
            'regular': 0.70
        },
        2: {
            'ultra_rare': 0.055,
            'rare': 0.067,
            'uncommon': 0.178,
            'common': 0.70
        },
        3: {
            'ultra_rare': 0.0055,
            'rare': 0.0055,
            'uncommon': 0.0155,
            'common': 0.9735
        }
    }

    def __init__(self):
        """Initialize Google Sheets connection"""
        # Get credentials from environment
        credentials_file = os.getenv("GOOGLE_SHEETS_CREDENTIALS_FILE")
        spreadsheet_id = os.getenv("GOOGLE_SHEETS_REFERRAL_ID")

        if not credentials_file or not spreadsheet_id:
            print("[ReferralService] WARNING: Google Sheets credentials not configured")
            self.enabled = False
            return

        try:
            # Authenticate with Google Sheets
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            creds = Credentials.from_service_account_file(credentials_file, scopes=scopes)
            self.client = gspread.authorize(creds)
            self.spreadsheet = self.client.open_by_key(spreadsheet_id)

            # Get or create worksheets
            self.referrals_sheet = self._get_or_create_worksheet("Referrals")
            self.codes_sheet = self._get_or_create_worksheet("Codes")
            self.daily_balances_sheet = self._get_or_create_worksheet("DailyBalances")

            self.enabled = True
            print("[ReferralService] Successfully connected to Google Sheets")

        except Exception as e:
            print(f"[ReferralService] Failed to initialize Google Sheets: {e}")
            self.enabled = False

    def _get_or_create_worksheet(self, title: str):
        """Get existing worksheet or create new one with headers"""
        try:
            worksheet = self.spreadsheet.worksheet(title)
        except gspread.WorksheetNotFound:
            worksheet = self.spreadsheet.add_worksheet(title=title, rows=1000, cols=15)

            # Add headers based on sheet type
            if title == "Referrals":
                headers = [
                    "referrer_address",
                    "referral_code",
                    "referred_address",
                    "swap_amount_usdc",
                    "swap_timestamp",
                    "signup_bonus_paid",
                    "referee_bonus_paid",
                    "created_at"
                ]
            elif title == "Codes":
                headers = [
                    "address",
                    "referral_code",
                    "rarity",
                    "rolls_used",
                    "is_active",
                    "created_at"
                ]
            elif title == "DailyBalances":
                headers = [
                    "date",
                    "referred_address",
                    "usdx_balance",
                    "recorded_at"
                ]

            worksheet.update('A1:Z1', [headers])

        return worksheet

    def _select_rarity_tier(self) -> str:
        """Select a rarity tier based on weighted probabilities"""
        rand = random.random()
        cumulative = 0

        for tier_name, tier_data in self.RARITY_TIERS.items():
            cumulative += tier_data['weight']
            if rand <= cumulative:
                return tier_name

        # Fallback to COMMON
        return 'COMMON'

    def _select_number_length(self) -> int:
        """Select number length (1, 2, or 3 digits) based on weighted probabilities"""
        rand = random.random()
        cumulative = 0

        for length, weight in self.LENGTH_WEIGHTS.items():
            cumulative += weight
            if rand <= cumulative:
                return length

        # Fallback to 2 digits
        return 2

    def _generate_special_number(self, length: int) -> int:
        """Generate a number with special pattern based on length"""
        if length == 1:
            # Select between lucky and regular
            rand = random.random()
            if rand <= self.NUMBER_PATTERN_WEIGHTS[1]['lucky']:
                return random.choice(self.SPECIAL_NUMBERS[1]['lucky'])
            else:
                return random.choice(self.SPECIAL_NUMBERS[1]['regular'])

        elif length == 2:
            # Select pattern type
            rand = random.random()
            cumulative = 0

            for pattern_type, weight in self.NUMBER_PATTERN_WEIGHTS[2].items():
                cumulative += weight
                if rand <= cumulative:
                    if pattern_type == 'common':
                        # Generate random 2-digit number not in special lists
                        special_set = set(
                            self.SPECIAL_NUMBERS[2]['ultra_rare'] +
                            self.SPECIAL_NUMBERS[2]['rare'] +
                            self.SPECIAL_NUMBERS[2]['uncommon']
                        )
                        while True:
                            num = random.randint(10, 99)
                            if num not in special_set:
                                return num
                    else:
                        return random.choice(self.SPECIAL_NUMBERS[2][pattern_type])

            # Fallback
            return random.randint(10, 99)

        elif length == 3:
            # Select pattern type
            rand = random.random()
            cumulative = 0

            for pattern_type, weight in self.NUMBER_PATTERN_WEIGHTS[3].items():
                cumulative += weight
                if rand <= cumulative:
                    if pattern_type == 'common':
                        # Generate random 3-digit number not in special lists
                        special_set = set(
                            self.SPECIAL_NUMBERS[3]['ultra_rare'] +
                            self.SPECIAL_NUMBERS[3]['rare'] +
                            self.SPECIAL_NUMBERS[3]['uncommon']
                        )
                        while True:
                            num = random.randint(100, 999)
                            if num not in special_set:
                                return num
                    else:
                        return random.choice(self.SPECIAL_NUMBERS[3][pattern_type])

            # Fallback
            return random.randint(100, 999)

        # Fallback to 2-digit
        return random.randint(10, 99)

    def generate_referral_code(self, address: str = None) -> Tuple[str, str]:
        """
        Generate a unique referral code with multi-dimensional rarity
        Format: COLOR-WORD-# or COLOR-WORD-## or COLOR-WORD-###
        Examples: GOLD-WHALE-7, DIAMOND-LAMBO-42, VIOLET-NOVA-420

        Multi-dimensional rarity:
        - Tier rarity (MYTHIC 0.5%, LEGENDARY 3%, EPIC 6%, RARE 14%, UNCOMMON 25%, COMMON 51.5%)
        - Length rarity (1 digit 5%, 2 digits 85%, 3 digits 10%)
        - Number pattern rarity (varies by length)

        Returns:
            Tuple[str, str]: (code, rarity_tier)
        """
        max_attempts = 100

        for _ in range(max_attempts):
            # Step 1: Select rarity tier (word/color combination)
            tier_name = self._select_rarity_tier()
            tier_data = self.RARITY_TIERS[tier_name]

            # Step 2: Select random color and word from tier
            color = random.choice(tier_data['colors'])
            word = random.choice(tier_data['words'])

            # Step 3: Select number length
            length = self._select_number_length()

            # Step 4: Generate special number based on length
            number = self._generate_special_number(length)

            # Format code based on length
            if length == 1:
                code = f"{color}-{word}-{number}"
            elif length == 2:
                code = f"{color}-{word}-{number:02d}"
            else:  # length == 3
                code = f"{color}-{word}-{number:03d}"

            # Check if code already exists (check ALL codes, active or inactive)
            try:
                expected_headers = ['address', 'referral_code', 'rarity', 'rolls_used', 'is_active', 'created_at']
                codes = self.codes_sheet.get_all_records(expected_headers=expected_headers)
                existing_codes = [row['referral_code'] for row in codes]
                if code not in existing_codes:
                    return (code, tier_name)
            except:
                # If we can't check, just return (first run or error)
                return (code, tier_name)

        # If we somehow can't find unique code after 100 attempts,
        # append timestamp
        timestamp = int(time.time()) % 100
        code = f"{color}-{word}-{timestamp:02d}"
        return (code, tier_name)

    def get_or_create_referral_code(self, address: str) -> Dict:
        """
        Get existing referral code or create a new one

        Returns:
            Dict with code, rarity, rolls_used, rolls_remaining
        """
        if not self.enabled:
            return {
                "code": "DISABLED",
                "rarity": "UNKNOWN",
                "rolls_used": 0,
                "rolls_remaining": 0
            }

        try:
            address = address.lower()

            # Check if active code already exists (only return active codes)
            expected_headers = ['address', 'referral_code', 'rarity', 'rolls_used', 'is_active', 'created_at']
            codes = self.codes_sheet.get_all_records(expected_headers=expected_headers)

            # Find the active code for this address
            for row in codes:
                if row['address'].lower() == address and str(row.get('is_active', 'true')).lower() == 'true':
                    # Calculate rolls remaining
                    rolls_used = int(row.get('rolls_used', 1))
                    successful_refs = self._count_successful_referrals(address)

                    max_rolls = self.BASE_ROLLS
                    if successful_refs >= self.UNLOCK_THRESHOLD:
                        max_rolls = self.BASE_ROLLS + self.BONUS_ROLLS

                    rolls_remaining = max(0, max_rolls - rolls_used)

                    return {
                        "code": row['referral_code'],
                        "rarity": row.get('rarity', 'COMMON'),
                        "rolls_used": rolls_used,
                        "rolls_remaining": rolls_remaining,
                        "successful_referrals": successful_refs,
                        "unlock_progress": f"{successful_refs}/{self.UNLOCK_THRESHOLD}"
                    }

            # Create new code (this counts as roll #1)
            code, rarity = self.generate_referral_code(address)
            timestamp = datetime.utcnow().isoformat() + "Z"

            self.codes_sheet.append_row([
                address,
                code,
                rarity,
                1,  # rolls_used starts at 1
                "true",  # is_active
                timestamp
            ])

            print(f"[ReferralService] Created new referral code {code} ({rarity}) for {address}")

            return {
                "code": code,
                "rarity": rarity,
                "rolls_used": 1,
                "rolls_remaining": self.BASE_ROLLS - 1,
                "successful_referrals": 0,
                "unlock_progress": f"0/{self.UNLOCK_THRESHOLD}"
            }

        except Exception as e:
            print(f"[ReferralService] Error getting/creating referral code: {e}")
            return {
                "code": "ERROR",
                "rarity": "UNKNOWN",
                "rolls_used": 0,
                "rolls_remaining": 0
            }

    def regenerate_referral_code(self, address: str) -> Dict:
        """
        Regenerate referral code (uses one roll)
        Marks old code(s) as inactive and creates new active code.
        All old codes remain in history and still work for crediting referrals.

        Returns:
            Dict with new code, rarity, and roll status
        """
        if not self.enabled:
            return {"success": False, "error": "Service disabled"}

        try:
            address = address.lower()

            # Get all codes for this address
            expected_headers = ['address', 'referral_code', 'rarity', 'rolls_used', 'is_active', 'created_at']
            codes = self.codes_sheet.get_all_records(expected_headers=expected_headers)

            user_codes = []
            for idx, row in enumerate(codes):
                if row['address'].lower() == address:
                    user_codes.append({
                        'row_index': idx + 2,  # +2 for header and 0-index
                        'rolls_used': int(row.get('rolls_used', 1)),
                        'is_active': str(row.get('is_active', 'true')).lower() == 'true'
                    })

            if not user_codes:
                return {"success": False, "error": "No referral code found"}

            # Get current rolls used from the most recent code
            current_rolls_used = max(c['rolls_used'] for c in user_codes)

            # Check if user has rolls remaining
            successful_refs = self._count_successful_referrals(address)
            max_rolls = self.BASE_ROLLS
            if successful_refs >= self.UNLOCK_THRESHOLD:
                max_rolls = self.BASE_ROLLS + self.BONUS_ROLLS

            if current_rolls_used >= max_rolls:
                return {
                    "success": False,
                    "error": f"No rolls remaining ({current_rolls_used}/{max_rolls})",
                    "unlock_progress": f"{successful_refs}/{self.UNLOCK_THRESHOLD}"
                }

            # Mark all existing codes as inactive (preserve history)
            for user_code in user_codes:
                if user_code['is_active']:
                    self.codes_sheet.update_cell(user_code['row_index'], 5, "false")  # is_active column

            # Generate new code
            new_code, new_rarity = self.generate_referral_code(address)
            new_rolls_used = current_rolls_used + 1
            timestamp = datetime.utcnow().isoformat() + "Z"

            # Append new active code (preserves all history)
            self.codes_sheet.append_row([
                address,
                new_code,
                new_rarity,
                new_rolls_used,
                "true",  # is_active
                timestamp
            ])

            rolls_remaining = max_rolls - new_rolls_used

            print(f"[ReferralService] Regenerated code for {address}: {new_code} ({new_rarity}) - old codes preserved in history")

            return {
                "success": True,
                "code": new_code,
                "rarity": new_rarity,
                "rolls_used": new_rolls_used,
                "rolls_remaining": rolls_remaining,
                "successful_referrals": successful_refs,
                "unlock_progress": f"{successful_refs}/{self.UNLOCK_THRESHOLD}"
            }

        except Exception as e:
            print(f"[ReferralService] Error regenerating code: {e}")
            return {"success": False, "error": str(e)}

    def _count_successful_referrals(self, address: str) -> int:
        """Count number of successful referrals for an address"""
        try:
            address = address.lower()
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)
            count = sum(1 for r in referrals if r['referrer_address'].lower() == address)
            return count
        except Exception as e:
            print(f"[ReferralService] Error counting referrals: {e}")
            return 0

    def get_address_by_code(self, code: str) -> Optional[str]:
        """
        Look up address by referral code
        Searches ALL codes (active and inactive) so old codes still work for crediting
        """
        if not self.enabled:
            return None

        try:
            # Check if it's a special code first (these don't need to be in the sheet)
            if code.upper() in self.SPECIAL_CODES:
                # Special codes are universal - anyone can use them
                # Return a special marker to indicate it's a special code
                return "SPECIAL_CODE"

            expected_headers = ['address', 'referral_code', 'rarity', 'rolls_used', 'is_active', 'created_at']
            codes = self.codes_sheet.get_all_records(expected_headers=expected_headers)
            for row in codes:
                if row['referral_code'].upper() == code.upper():
                    # Return address regardless of is_active status
                    # This allows old codes to still work for crediting referrals
                    return row['address']
            return None

        except Exception as e:
            print(f"[ReferralService] Error looking up referral code: {e}")
            return None

    def get_code_benefits(self, code: str) -> Dict:
        """
        Get the benefits of a referral code (minimum swap, bonus points, etc.)

        Returns:
            Dict with min_swap, bonus_points, description, is_special
        """
        code_upper = code.upper()

        # Check if it's a special code
        if code_upper in self.SPECIAL_CODES:
            benefits = self.SPECIAL_CODES[code_upper].copy()
            benefits['is_special'] = True
            benefits['is_valid'] = True
            return benefits

        # Regular code - check if it exists
        referrer = self.get_address_by_code(code)
        if referrer and referrer != "SPECIAL_CODE":
            return {
                'min_swap': self.MIN_SWAP_AMOUNT,
                'bonus_points': 0,
                'description': 'Standard referral code',
                'is_special': False,
                'is_valid': True
            }

        # Invalid code
        return {
            'min_swap': self.MIN_SWAP_AMOUNT,
            'bonus_points': 0,
            'description': 'Invalid code',
            'is_special': False,
            'is_valid': False
        }

    def record_referral(
        self,
        referrer_address: str,
        referred_address: str,
        swap_amount_usdc: float,
        referral_code: str
    ) -> Dict:
        """
        Record a successful referral

        Returns:
            Dict with success, message, and bonus amounts
        """
        if not self.enabled:
            return {"success": False, "error": "Service disabled"}

        try:
            # Check code benefits FIRST (to get correct minimum)
            code_benefits = self.get_code_benefits(referral_code)
            if not code_benefits['is_valid']:
                print(f"[ReferralService] Invalid referral code: {referral_code}")
                return {"success": False, "error": "Invalid referral code"}

            # Get the correct minimum for this code
            min_amount = code_benefits['min_swap']

            # Normalize addresses (checksum for EVM, preserve casing for Solana)
            # Special codes don't have a referrer address
            if referrer_address == "SPECIAL_CODE":
                # For special codes, use a placeholder address
                referrer_address = "0x0000000000000000000000000000000000000000"
            else:
                referrer_info = self._validate_address(referrer_address)
                if not referrer_info["valid"]:
                    print(f"[ReferralService] Invalid referrer address format")
                    return {"success": False, "error": "Invalid referrer address"}
                referrer_address = referrer_info["normalized"]

            referred_info = self._validate_address(referred_address)
            if not referred_info["valid"]:
                print(f"[ReferralService] Invalid referred address format")
                return {"success": False, "error": "Invalid referred address"}
            referred_address = referred_info["normalized"]

            # Check if this referral already exists
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)
            for row in referrals:
                if row['referred_address'].lower() == referred_address.lower():
                    print(f"[ReferralService] Referral already exists for {referred_address}")
                    return {"success": False, "error": "Address already referred"}

            # Check minimum swap amount (using code-specific minimum)
            if swap_amount_usdc < min_amount:
                print(f"[ReferralService] Swap amount {swap_amount_usdc} below minimum {min_amount}")
                return {
                    "success": False,
                    "error": f"Swap amount must be at least {min_amount} USDC"
                }

            # Calculate bonuses
            referrer_bonus = self.SIGNUP_BONUS if referrer_address != "0x0000000000000000000000000000000000000000" else 0
            referee_bonus = self.REFEREE_BONUS + code_benefits['bonus_points']

            # Record the referral
            timestamp = datetime.utcnow().isoformat() + "Z"

            self.referrals_sheet.append_row([
                referrer_address,
                referral_code,
                referred_address,
                swap_amount_usdc,
                timestamp,
                "true",  # signup_bonus_paid
                "true",  # referee_bonus_paid
                timestamp  # created_at
            ])

            print(f"[ReferralService] Recorded referral: {referrer_address} -> {referred_address} ({swap_amount_usdc} USDC)")
            print(f"[ReferralService] Bonuses: referrer={referrer_bonus}, referee={referee_bonus}")

            return {
                "success": True,
                "referrer_bonus": referrer_bonus,
                "referee_bonus": referee_bonus,
                "is_special": code_benefits['is_special'],
                "description": code_benefits['description']
            }

        except Exception as e:
            print(f"[ReferralService] Error recording referral: {e}")
            return {"success": False, "error": str(e)}

    def get_referrer_stats(self, address: str) -> Dict:
        """Get referral statistics for an address"""
        if not self.enabled:
            return {
                "total_referrals": 0,
                "signup_points": 0,
                "daily_points": 0,
                "total_referral_points": 0,
                "referred_addresses": []
            }

        try:
            address = address.lower()
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)

            # Filter referrals by this address
            user_referrals = [r for r in referrals if r['referrer_address'].lower() == address]

            total_referrals = len(user_referrals)
            signup_points = total_referrals * self.SIGNUP_BONUS

            # Calculate daily bonus points from DailyBalances snapshots
            # Formula: 0.1 points per USDX per day
            daily_points = 0
            referred_addresses = [r['referred_address'] for r in user_referrals]

            # Get all daily snapshots for referred addresses
            try:
                balance_headers = ['date', 'referred_address', 'usdx_balance', 'recorded_at']
                snapshots = self.daily_balances_sheet.get_all_records(expected_headers=balance_headers)

                # Filter snapshots to only referred addresses
                referred_set = set(addr.lower() for addr in referred_addresses)

                for snapshot in snapshots:
                    if snapshot['referred_address'].lower() in referred_set:
                        # Each snapshot represents one day of holding USDX
                        # Points = usdx_balance * 0.1
                        usdx_balance = float(snapshot['usdx_balance'])
                        daily_points += usdx_balance * self.DAILY_BONUS_RATE
            except Exception as e:
                print(f"[ReferralService] Error calculating daily points from snapshots: {e}")
                # Fall back to 0 if snapshots don't exist yet
                daily_points = 0

            total_points = signup_points + daily_points

            return {
                "total_referrals": total_referrals,
                "signup_points": signup_points,
                "daily_points": round(daily_points, 2),
                "total_referral_points": round(total_points, 2),
                "referred_addresses": referred_addresses
            }

        except Exception as e:
            print(f"[ReferralService] Error getting referrer stats: {e}")
            return {
                "total_referrals": 0,
                "signup_points": 0,
                "daily_points": 0,
                "total_referral_points": 0,
                "referred_addresses": []
            }

    def get_leaderboard(self, limit: int = 100) -> List[Dict]:
        """
        Get referral leaderboard
        Returns list of users with their referral stats and staking points

        Note: Staking points will be fetched separately by the router
        """
        if not self.enabled:
            return []

        try:
            # Get all referrals
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)

            # Group by referrer
            referrer_map = {}
            for referral in referrals:
                referrer = referral['referrer_address'].lower()
                if referrer not in referrer_map:
                    referrer_map[referrer] = []
                referrer_map[referrer].append(referral)

            # Get all daily snapshots once
            balance_headers = ['date', 'referred_address', 'usdx_balance', 'recorded_at']
            try:
                snapshots = self.daily_balances_sheet.get_all_records(expected_headers=balance_headers)
            except:
                snapshots = []

            # Calculate points for each referrer
            leaderboard = []

            for referrer, user_referrals in referrer_map.items():
                total_referrals = len(user_referrals)
                signup_points = total_referrals * self.SIGNUP_BONUS
                daily_points = 0

                # Get referred addresses for this referrer
                referred_addresses = set(r['referred_address'].lower() for r in user_referrals)

                # Calculate daily points from snapshots
                for snapshot in snapshots:
                    if snapshot['referred_address'].lower() in referred_addresses:
                        try:
                            usdx_balance = float(snapshot['usdx_balance'])
                            daily_points += usdx_balance * self.DAILY_BONUS_RATE
                        except:
                            pass

                total_referral_points = signup_points + daily_points

                leaderboard.append({
                    "address": referrer,
                    "total_referrals": total_referrals,
                    "referral_points": round(total_referral_points, 2)
                })

            # Sort by referral points descending
            leaderboard.sort(key=lambda x: x['referral_points'], reverse=True)

            return leaderboard[:limit]

        except Exception as e:
            print(f"[ReferralService] Error getting leaderboard: {e}")
            return []

    def check_if_referred(self, address: str) -> Optional[Tuple[str, str]]:
        """
        Check if an address has already been referred
        Returns (referrer_address, referral_code) or None
        """
        if not self.enabled:
            return None

        try:
            address = address.lower()
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)

            for row in referrals:
                if row['referred_address'].lower() == address:
                    return (row['referrer_address'], row['referral_code'])

            return None

        except Exception as e:
            print(f"[ReferralService] Error checking if referred: {e}")
            return None

    def get_referee_bonus(self, address: str) -> int:
        """
        Get referee bonus for a user (1000 points if they were referred)

        Returns:
            1000 if user was referred, 0 otherwise
        """
        if not self.enabled:
            return 0

        try:
            referral_info = self.check_if_referred(address)
            if referral_info:
                # User was referred, give them the 1000 point bonus
                return self.REFEREE_BONUS
            return 0

        except Exception as e:
            print(f"[ReferralService] Error getting referee bonus: {e}")
            return 0

    def get_all_referred_addresses(self) -> set:
        """
        Get set of all addresses that have been referred (for bulk operations)
        More efficient than calling get_referee_bonus() in a loop

        Returns:
            Set of lowercase addresses that were referred
        """
        if not self.enabled:
            return set()

        try:
            expected_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=expected_headers)

            # Return set of referred addresses (lowercase for easy lookup)
            return set(row['referred_address'].lower() for row in referrals)

        except Exception as e:
            print(f"[ReferralService] Error getting all referred addresses: {e}")
            return set()

    def _validate_address(self, address: str) -> Dict:
        """
        Validate and identify address type (EVM or Solana)

        Returns:
            {"valid": bool, "type": "evm"|"solana"|None, "normalized": str}
        """
        # Try EVM first
        if Web3.is_address(address):
            return {
                "valid": True,
                "type": "evm",
                "normalized": Web3.to_checksum_address(address)
            }

        # Try Solana
        try:
            Pubkey.from_string(address)
            return {
                "valid": True,
                "type": "solana",
                "normalized": address
            }
        except:
            pass

        return {"valid": False, "type": None, "normalized": address}

    def snapshot_daily_balances(self, w3_service) -> Dict:
        """
        Take daily snapshot of all referred users' USDX balances (Base + Solana)
        Should be called once per day by scheduler

        Returns dict with snapshot stats
        """
        if not self.enabled:
            return {"success": False, "error": "Service disabled"}

        try:
            # Get today's date (UTC)
            today = datetime.utcnow().date().isoformat()

            # Check if we already snapshotted today
            expected_headers = ['date', 'referred_address', 'usdx_balance', 'recorded_at']
            existing_snapshots = self.daily_balances_sheet.get_all_records(expected_headers=expected_headers)

            # Check if snapshot already exists for today
            if any(row['date'] == today for row in existing_snapshots):
                print(f"[ReferralService] Daily snapshot already taken for {today}")
                return {"success": False, "error": f"Snapshot already exists for {today}"}

            # Get all referred addresses
            referral_headers = ['referrer_address', 'referral_code', 'referred_address', 'swap_amount_usdc', 'swap_timestamp', 'signup_bonus_paid', 'referee_bonus_paid', 'created_at']
            referrals = self.referrals_sheet.get_all_records(expected_headers=referral_headers)

            unique_referred_addresses = list(set(r['referred_address'] for r in referrals))

            print(f"[ReferralService] Taking daily snapshot for {len(unique_referred_addresses)} referred users")

            snapshot_rows = []
            timestamp = datetime.utcnow().isoformat() + "Z"

            # Initialize Solana client
            solana_rpc_url = os.getenv("SOLANA_RPC_URL")
            solana_usdx_mint = os.getenv("SOLANA_USDX_MINT")
            solana_client = SolanaClient(solana_rpc_url) if solana_rpc_url else None

            for address in unique_referred_addresses:
                try:
                    # Validate address type
                    addr_info = self._validate_address(address)
                    if not addr_info["valid"]:
                        print(f"[ReferralService] Invalid address: {address}")
                        continue

                    total_balance = 0

                    if addr_info["type"] == "evm":
                        # Query Base (EVM) balance (USDX + EURX combined)
                        checksum_addr = addr_info["normalized"]

                        # ERC20 ABI for balanceOf
                        erc20_abi = [{"constant": True, "inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "balance", "type": "uint256"}], "type": "function"}]

                        # Query USDX wallet balance
                        usdx_token_addr = os.getenv("USDX_TOKEN_ADDRESS")
                        if usdx_token_addr:
                            try:
                                usdx_token = w3_service.w3.eth.contract(address=Web3.to_checksum_address(usdx_token_addr), abi=erc20_abi)
                                wallet_balance = usdx_token.functions.balanceOf(checksum_addr).call()
                                total_balance += wallet_balance
                            except Exception as e:
                                print(f"[ReferralService] Error querying USDX wallet balance for {address}: {e}")

                        # Query EURX wallet balance
                        eurx_token_addr = os.getenv("EURX_TOKEN_ADDRESS")
                        if eurx_token_addr:
                            try:
                                eurx_token = w3_service.w3.eth.contract(address=Web3.to_checksum_address(eurx_token_addr), abi=erc20_abi)
                                eurx_wallet_balance = eurx_token.functions.balanceOf(checksum_addr).call()
                                total_balance += eurx_wallet_balance
                            except Exception as e:
                                print(f"[ReferralService] Error querying EURX wallet balance for {address}: {e}")

                        # Query USDX staked balance
                        if w3_service.is_contract_available("USDX_STAKING"):
                            try:
                                staking_contract = w3_service.get_contract("USDX_STAKING")
                                user_stakes = staking_contract.functions.getUserStakingData(checksum_addr).call()
                                staked_balance = user_stakes[0]  # totalStaked
                                total_balance += staked_balance
                            except Exception as e:
                                print(f"[ReferralService] Error querying USDX staked balance for {address}: {e}")

                        # Query EURX staked balance
                        if w3_service.is_contract_available("EURX_STAKING"):
                            try:
                                eurx_staking_contract = w3_service.get_contract("EURX_STAKING")
                                eurx_stakes = eurx_staking_contract.functions.getUserStakingData(checksum_addr).call()
                                eurx_staked_balance = eurx_stakes[0]  # totalStaked
                                total_balance += eurx_staked_balance
                            except Exception as e:
                                print(f"[ReferralService] Error querying EURX staked balance for {address}: {e}")

                        # Convert from wei to USDX/EURX (both have 6 decimals)
                        usdx_balance = total_balance / 1e6

                    elif addr_info["type"] == "solana":
                        # Query Solana balance
                        if not solana_client or not solana_usdx_mint:
                            print(f"[ReferralService] Solana not configured, skipping {address}")
                            continue

                        try:
                            from solders.pubkey import Pubkey
                            from solana.rpc.commitment import Confirmed

                            user_pubkey = Pubkey.from_string(address)
                            mint_pubkey = Pubkey.from_string(solana_usdx_mint)

                            # Derive Associated Token Account (ATA)
                            # ATA Program ID
                            ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
                            # Token Program ID
                            TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

                            # Find PDA for ATA: [user, token_program, mint]
                            seeds = [bytes(user_pubkey), bytes(TOKEN_PROGRAM_ID), bytes(mint_pubkey)]
                            ata, _ = Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)

                            # Query balance
                            response = solana_client.get_token_account_balance(ata, commitment=Confirmed)
                            if hasattr(response, 'value') and response.value:
                                # USDX on Solana has 6 decimals
                                total_balance = int(response.value.amount)
                                usdx_balance = total_balance / 1e6
                            else:
                                # ATA doesn't exist or has 0 balance
                                usdx_balance = 0

                        except Exception as e:
                            print(f"[ReferralService] Error querying Solana balance for {address}: {e}")
                            usdx_balance = 0

                    # Only record if balance > 0
                    if usdx_balance > 0:
                        snapshot_rows.append([
                            today,
                            address,
                            usdx_balance,
                            timestamp
                        ])

                except Exception as e:
                    print(f"[ReferralService] Error processing address {address}: {e}")

            # Batch write to Google Sheets
            if snapshot_rows:
                self.daily_balances_sheet.append_rows(snapshot_rows)
                print(f"[ReferralService] Snapshot complete: {len(snapshot_rows)} balances recorded for {today}")
            else:
                print(f"[ReferralService] No balances to record for {today}")

            return {
                "success": True,
                "date": today,
                "addresses_checked": len(unique_referred_addresses),
                "balances_recorded": len(snapshot_rows)
            }

        except Exception as e:
            print(f"[ReferralService] Error taking daily snapshot: {e}")
            return {"success": False, "error": str(e)}
