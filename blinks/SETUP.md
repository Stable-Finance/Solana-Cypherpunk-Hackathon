# Solana Blinks/Actions Setup Guide

Solana Blinks let users perform blockchain transactions directly from Twitter, Discord, and other platforms without leaving the app.

## What's Implemented

Two Blinks for swapping USDC:
- **USDC → USDX**: Swap USDC for treasury-backed USDX on Solana
- **USDC → EURX**: Swap USDC for euro-backed EURX on Solana

Features:
- ✅ Shareable links for Twitter/Discord
- ✅ Multiple preset amounts (10, 50, 100 USDC)
- ✅ Custom amount input
- ✅ Referral code support
- ✅ Works with Phantom, Backpack, Solflare wallets

## Prerequisites

### 1. Deploy SPL Tokens on Solana

You need to deploy USDX and EURX as SPL tokens on Solana:

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Create token mints
solana-keygen new --outfile ~/.config/solana/usdx-mint.json
solana-keygen new --outfile ~/.config/solana/eurx-mint.json

# Deploy using spl-token CLI
spl-token create-token --decimals 6 ~/.config/solana/usdx-mint.json
spl-token create-token --decimals 6 ~/.config/solana/eurx-mint.json
```

### 2. Set Environment Variables

Add to `.env`:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # or devnet for testing
SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  # USDC mint
SOLANA_USDX_MINT=your_usdx_mint_address
SOLANA_EURX_MINT=your_eurx_mint_address
SOLANA_TREASURY_ADDRESS=your_treasury_address
SOLANA_SWAP_PROGRAM_ID=your_swap_program_id  # Optional: custom swap program
```

## Testing Locally

### 1. Start the API

```bash
cd ecosystem-api
python main.py
```

### 2. Test Blink Endpoints

**Test USDX Blink metadata:**
```bash
curl http://localhost:8000/api/v1/blinks/swap-usdx
```

**Test transaction creation:**
```bash
curl -X POST http://localhost:8000/api/v1/blinks/swap-usdx?amount=100 \
  -H "Content-Type: application/json" \
  -d '{"account":"YOUR_SOLANA_PUBLIC_KEY"}'
```

### 3. Use Dialect Blinks Inspector

Visit https://dial.to/devnet and paste your Blink URL:
```
http://localhost:8000/api/v1/blinks/swap-usdx
```

This will show you how the Blink appears in wallets.

## Production Deployment

### 1. Add to Render Environment

In your Render dashboard, add these environment variables:
- `SOLANA_RPC_URL`
- `SOLANA_USDC_MINT`
- `SOLANA_USDX_MINT`
- `SOLANA_EURX_MINT`
- `SOLANA_TREASURY_ADDRESS`

### 2. Deploy

```bash
git add ecosystem-api/
git commit -m "Add Solana Blinks for USDC swaps"
git push
```

Render will auto-deploy. Your Blink URLs will be:
- `https://your-api.onrender.com/api/v1/blinks/swap-usdx`
- `https://your-api.onrender.com/api/v1/blinks/swap-eurx`

## Sharing Your Blinks

### Twitter/X

Use the `dial.to` unfurler:
```
https://dial.to/?action=solana-action:https://your-api.onrender.com/api/v1/blinks/swap-usdx
```

Tweet this link and it will unfurl as an interactive Blink!

### Discord

Same link works in Discord with Dialect bot installed.

### Direct Link

Users can also paste the action URL directly into Phantom/Backpack:
```
solana-action:https://your-api.onrender.com/api/v1/blinks/swap-usdx
```

## Adding Referral Codes

Users can add referral codes to the Blink URL:

```
https://dial.to/?action=solana-action:https://your-api.onrender.com/api/v1/blinks/swap-usdx?referral=GOLD-WHALE-7
```

The referral will be tracked automatically when the swap completes.

## Customization

### Add Your Logo

1. Add logo images to `ecosystem-api/static/`:
   - `usdx-logo.png` (500x500 recommended)
   - `eurx-logo.png` (500x500 recommended)

2. Update the icon URLs in `blinks.py`:
```python
icon=f"{base_url}/static/usdx-logo.png"
```

### Change Preset Amounts

Edit the `links.actions` array in `blinks.py`:
```python
LinkedAction(
    label="Swap 250 USDC",  # Your custom amount
    href=f"{base_url}/api/v1/blinks/swap-usdx?amount=250"
)
```

### Modify Min/Max Amounts

Update the validation in the POST endpoints:
```python
if amount < 10:  # Change minimum
    raise HTTPException(status_code=400, detail="Minimum swap amount is 10 USDC")
if amount > 10000:  # Change maximum
    raise HTTPException(status_code=400, detail="Maximum swap amount is 10,000 USDC")
```

## Integrating Your Swap Program

The current implementation uses a placeholder transaction. To integrate your actual Solana swap program:

1. **Create swap instruction builder:**
```python
from solders.instruction import Instruction, AccountMeta

def create_swap_instruction(
    user_pubkey: Pubkey,
    usdc_amount: int,
    token_type: str
) -> Instruction:
    # Your program's instruction data
    instruction_data = encode_swap_instruction(usdc_amount, token_type)

    # Account metas
    accounts = [
        AccountMeta(user_pubkey, is_signer=True, is_writable=True),
        AccountMeta(user_usdc_ata, is_signer=False, is_writable=True),
        AccountMeta(user_token_ata, is_signer=False, is_writable=True),
        AccountMeta(treasury_usdc_ata, is_signer=False, is_writable=True),
        AccountMeta(treasury_token_ata, is_signer=False, is_writable=True),
        # ... other accounts
    ]

    return Instruction(
        program_id=Pubkey.from_string(PROGRAM_ID),
        data=instruction_data,
        accounts=accounts
    )
```

2. **Replace placeholder in `create_swap_transaction()`:**
```python
# Replace this:
ix = transfer(TransferParams(...))

# With this:
ix = create_swap_instruction(user_pubkey, usdc_lamports, token_type)
```

## Testing with Devnet

For testing, use Solana devnet:

1. Set `SOLANA_RPC_URL=https://api.devnet.solana.com`
2. Get devnet SOL: `solana airdrop 2`
3. Create test tokens on devnet
4. Test with devnet wallets

## Monitoring

Check Blink usage:
```bash
# API logs
tail -f logs/api.log | grep blinks

# Monitor transactions
solana confirm -v <TRANSACTION_SIGNATURE>
```

## Hackathon Demo Tips

1. **Create QR Code**: Generate QR for your Blink URL - easy for mobile demos
2. **Tweet Thread**: Show the Blink in action with screenshots
3. **Video Demo**: Record swapping directly from Twitter
4. **Stress Test**: Show multiple users swapping simultaneously
5. **Referral Chain**: Demo referral codes working in Blinks

## Troubleshooting

**Blink doesn't appear in Twitter:**
- Ensure CORS allows `*` origin
- Check URL is publicly accessible
- Verify dial.to unfurler is working

**Transaction fails:**
- Check user has enough SOL for fees
- Verify token accounts exist (or create them in instruction)
- Check program ID is correct
- Ensure treasury has enough tokens

**CORS errors:**
- Make sure `allow_origins=["*"]` is set
- Check `expose_headers=["*"]` is included
- Verify OPTIONS endpoint returns correct headers

## Resources

- [Solana Actions Spec](https://solana.com/docs/advanced/actions)
- [Dialect Blinks](https://docs.dialect.to/documentation/actions/actions)
- [Example Blinks](https://github.com/solana-labs/solana-actions-examples)
- [Actions SDK](https://github.com/dialectlabs/actions-sdk)
