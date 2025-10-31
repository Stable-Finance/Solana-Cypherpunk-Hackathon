# USDX Solana Bridge - Deployment Status

## ✅ Completed

### Base Side (Ethereum/Base)
- **SimpleTreasury**: Deployed to Base Sepolia at `0x09eFdfAf292E058b244ECF1Ce936F4AeA773b013`
- **USDXToken**: Modified with tiered minting fees (0.5% to 0.1%)
- **USDXBridge.sol**: Complete with:
  - Burn/mint bridge functionality
  - Wormhole integration for cross-chain messaging
  - Tiered bridge fees
  - Can pay fees in ETH or USDX
  - Fee alternation (treasury/burn)
  - Chainlink ETH/USD price feed integration

### Solana Side
- **Program Built**: Successfully compiled with Anchor framework
- **Program ID**: `C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH`
- **Deployed to Devnet**: Transaction `5AjWwm73jiiRE1Zme5dFBsZqoJiM2LeGSxQTFj8BxiZaXUJxy636aaakxKX7faaohiBkKmmUPo6TwA4HshJ7mvy9`
- **Bridge Config PDA**: `7Q3b1tx6z1WkJs76XP6XCUsJuPcMvqe1mYDmj2fbyDfr`
- **Deployer Wallet**: `9TYUScB6w9hG4YACcHsWs93AEA5xQKuQhrC4p1mUGKGA`

### Program Features
- Initialize bridge with USDX mint
- `bridge_to_base`: Burns USDX on Solana, emits event for Wormhole
- `receive_from_base`: Mints USDX when receiving from Base (Wormhole verified)
- `update_authority`: Admin function to change authority
- Minimum bridge amount: 500 USDX
- 6 decimal USDX token

## 🔄 In Progress / Needs Work

### Initialization Issue
The deployed devnet program has a small mismatch - it expects a `rent` sysvar that was removed in the updated code. To fix:

1. **Option A**: Get more devnet SOL (1.7 SOL) to redeploy updated program
2. **Option B**: Wait for devnet airdrop rate limit to reset
3. **Option C**: Deploy directly to mainnet with corrected code

### Code Fix Applied (Not Yet Deployed)
- Updated `Initialize` struct to accept existing mint and transfer authority
- Removed `rent` sysvar dependency
- Added proper mint authority transfer logic

## 📋 Mainnet Deployment Checklist

### Prerequisites
- [ ] ~1.7 SOL for program deployment (~$240 at current prices)
- [ ] Deploy Base USDXBridge contract to Base mainnet
- [ ] Get actual Base USDXBridge contract address (not placeholder zeros)
- [ ] Fund Solana deployer wallet: `9TYUScB6w9hG4YACcHsWs93AEA5xQKuQhrC4p1mUGKGA`

### Deployment Steps
1. Update `base_bridge_address` in initialization with actual Base contract address
2. Deploy Solana program to mainnet:
   ```bash
   solana config set --url mainnet-beta
   solana program deploy programs/usdx-bridge/target/deploy/usdx_bridge.so \
     --program-id programs/usdx-bridge/target/deploy/usdx_bridge-keypair.json
   ```
3. Create USDX SPL token mint (6 decimals)
4. Initialize bridge with mint
5. Configure Base USDXBridge with Solana program ID
6. Test with small amounts first

### Post-Deployment
- [ ] Set up Wormhole relayer configuration
- [ ] Add bridge UI to app.trystable.co
- [ ] Test bridging both directions
- [ ] Monitor for any issues
- [ ] Apply for Chainlink price feeds (USDX/USD, USDX/ETH, USDX/SOL)

## 🔗 Important Addresses

### Devnet
- **Program**: `C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH`
- **Explorer**: https://explorer.solana.com/address/C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH?cluster=devnet

### Base Sepolia
- **SimpleTreasury**: `0x09eFdfAf292E058b244ECF1Ce936F4AeA773b013`

### Mainnet (To Be Deployed)
- **Base USDXBridge**: TBD
- **Solana Program**: Will use same Program ID `C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH`
- **USDX Mint (Solana)**: TBD (created during initialization)

## 💰 Cost Summary

### One-Time Costs
- **Solana Program Deployment**: ~1.7 SOL (~$240)
- **Base Contract Deployments**: ~$5-20 in gas (already done for testnet)

### Ongoing Costs
- **Wormhole Relayer**: Per-transaction fee (paid by users)
- **Bridge Fees**: 0.5% to 0.1% (paid by users, goes to treasury or burned)

## 🚀 Next Steps

1. **Short Term**: Get more devnet SOL to test initialization
2. **Medium Term**: Complete devnet testing with end-to-end bridge
3. **Long Term**: Deploy to mainnet and integrate with frontend

## 📝 Notes

- Program is upgradeable on Solana (deployer wallet is upgrade authority)
- Base contracts should be made upgradeable with UUPS pattern (if not already)
- Keep contracts private (don't verify on blockchain explorers as requested)
- All code uses audited libraries (OpenZeppelin, Anchor, SPL Token)
