# USDX - Solana Cypherpunk Hackathon Submission

**Live App:** [app.trystable.co](https://app.trystable.co)
**Try with special code:** `PUNK` for 5 USDC minimum + 500 Stable Points at [app.trystable.co/swap?ref=PUNK](https://app.trystable.co/swap?ref=PUNK)

---

## 🏆 What We Built for Solana

USDX is a **real estate-backed stablecoin** that brings composable mortgage yield to Solana. During this hackathon, we shipped:

### ✅ 1. Native USDX SPL Token
- **Not wrapped** - true SPL token minted natively on Solana
- Built with Anchor framework
- Full test suite + security audits
- 1:1 backed by locked USDC on Base
- **Location:** `solana-programs/usdx_token/`

### ✅ 2. Wormhole Bridge (Devnet)
- Base ↔ Solana cross-chain bridge
- **Deployed to devnet:** Program ID `C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH`
- Burn/mint mechanism for native tokens
- Tiered fee structure (1% → 0.5%)
- **Location:** `wormhole-bridge/`

### ✅ 3. Solana Blinks
- Swap USDC → USDX directly from Twitter/Discord
- Multiple preset amounts (10, 50, 100 USDC)
- Custom amount input
- Referral code support
- Works with Phantom, Backpack, Solflare
- **Location:** `blinks/`

### ✅ 4. Referral Program + Leaderboards
- 1,000 Stable Points signup bonus per referral
- 0.1 points/day ongoing bonus for holdings
- Combined staking + referral leaderboard
- Works with both Solana and EVM addresses
- **Location:** `referral-system/`

### ✅ 5. Full Solana Wallet Integration
- Phantom, Solflare, Backpack support
- Token account creation
- Balance tracking
- Transaction status
- **Location:** `frontend/`

---

## 🚀 Try It Now

### On Solana (Live on Mainnet)
1. Visit [app.trystable.co](https://app.trystable.co)
2. Connect Phantom or Solflare wallet
3. Select "USDX (Solana)" from token dropdown
4. Swap USDC → USDX (use code `PUNK` for 5 USDC min)
5. Stake to earn 7% APY from real mortgage yields

### Solana Blinks (Twitter/Discord)
Try swapping directly from social media:
```
https://dial.to/?action=solana-action:https://stable-ecosystem-api.onrender.com/api/v1/blinks/swap-usdx
```

With referral code:
```
https://dial.to/?action=solana-action:https://stable-ecosystem-api.onrender.com/api/v1/blinks/swap-usdx?referral=PUNK
```

---

## 🏗️ Architecture

```
┌─────────────────┐
│   Base Mainnet  │  ← USDX originated here (live)
│   USDX + USDC   │
└────────┬────────┘
         │
         │ Wormhole Bridge (devnet)
         ▼
┌─────────────────┐
│ Solana Mainnet  │  ← Native USDX minted here
│   SPL Token     │
│                 │
│  • Swap USDC    │
│  • Stake USDX   │
│  • Trade on DEX │
│  • Blinks       │
└─────────────────┘
```

---

## 📂 Repository Structure

```
solana-programs/
└── usdx_token/              # Native SPL token program
    ├── programs/usdx_token/
    │   └── src/
    │       ├── lib.rs              # Main program
    │       ├── instructions/       # Deposit, withdraw, etc
    │       └── state/              # Program state
    ├── tests/
    │   ├── usdx_token.ts          # Integration tests
    │   ├── integration.ts         # Cross-chain tests
    │   └── security-audit.ts      # Security suite
    └── TEST_RESULTS_FINAL.md      # Test results

wormhole-bridge/
├── programs/usdx-bridge/
│   └── src/lib.rs              # Bridge program
├── DEPLOYMENT_STATUS.md        # Devnet deployment info
└── docs/                       # Architecture docs

blinks/
├── blinks.py                   # Blink actions
├── blinks_integration.py       # Integration layer
├── SETUP.md                    # Setup guide
└── 001-usdx-blink-image-usa.png

referral-system/
├── routers/referrals.py        # API endpoints
├── services/
│   ├── referral_service.py    # Referral logic
│   └── database.py            # Data layer
└── README.md                   # Full spec

frontend/
├── SolanaWalletConnect.tsx     # Wallet adapter
├── Swap.tsx                    # Full swap UI with Solana
├── contexts/SolanaWalletContext.tsx
├── services/solanaUSDXService.ts
└── config/contracts.solana.ts
```

---

## 🛠️ Tech Stack

**Solana:**
- Anchor 0.29.0
- SPL Token Program
- Wormhole Native Token Transfers
- @solana/wallet-adapter-react

**Frontend:**
- React 18 + TypeScript
- Wagmi + RainbowKit (EVM)
- Solana Wallet Adapter

**Backend:**
- Python FastAPI
- Supabase
- Google Sheets (referral data)

---

## 🔐 Deployed Contracts

### Solana Mainnet (Live)
- **USDX Program:** `5nt7ssXVY25hiykrbBPYagZn7WCM43dCLrS5ysfoZ4gn`
- **USDX Mint:** `9Gst2E7KovZ9jwecyGqnnhpG1mhHKdyLpJQnZonkCFhA`
- **USDX Vault:** `7E4Cn1bXQ1nzsihYjA8PnmZK4fgnEV3mVLS5Q8m9vgiu` (holds USDC backing)
- **USDC Mint:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (official)
- **Explorer:** [View Program](https://solscan.io/account/5nt7ssXVY25hiykrbBPYagZn7WCM43dCLrS5ysfoZ4gn) | [View Token](https://solscan.io/token/9Gst2E7KovZ9jwecyGqnnhpG1mhHKdyLpJQnZonkCFhA)

### Solana Devnet (Wormhole Bridge)
- **Bridge Program:** `C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH`
- **Explorer:** [View on Solscan](https://solscan.io/account/C6c2LkZUYwwjRw4yCgYbX1wJNoXFHTNdN1n9tabCW6HH?cluster=devnet)

### Base Mainnet (Origin Chain - Live)
- **USDX Token:** `0x9235A67F59A6C946207d72545b32AE8860518451`
- **USDX Staking:** `0xD0Ee8AA8D3f44Db7ace454DF9AD8A0E0475924db`
- **EURX Token:** `0x81f2678d8a08c40c50d90d2d8af7a574ed957fc3`
- **EURX Staking:** `0x6e6b8EE643B9b0400Bd04Ae1CC0dF48fF2702D89`
- **Access Control:** `0x9B052a59D5e1DAd23bb35199294A024FAb77206C`
- **Wormhole Helper:** `0x571B650BE382AcAe35a327f9266f4caA25b63959`
- **USDC (Base):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (official)
- **EURC (Base):** `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` (official)

---

## 💡 What Makes This Special

### vs. Traditional Stablecoins
- **USDX:** Backed by real estate | Generates real yield from mortgages
- **USDC:** Backed by cash | No yield

### vs. Other RWA Projects
- **USDX:** Native multi-chain | Fully composable in DeFi
- **Others:** Wrapped securities | Limited integration

### For Solana Specifically
- **Native SPL token** (not bridged/wrapped)
- **Blinks support** for social swaps
- **Real yields** from productive assets (mortgages)
- **Referral system** for community growth
- **Cross-chain liquidity** via Wormhole

---

## 📊 Key Metrics

**Economics:**
- Mint Fee: 1% (<500k USDC) → 0.5% (≥500k)
- Staking APY: ~7% from real mortgage payments
- Minimum Swap: 5 USDC (with code PUNK) | 100 USDC (default)

**Referral Rewards:**
- Signup Bonus: 1,000 Stable Points
- Daily Bonus: 0.1 points/day per active referral
- Combined leaderboard with staking points

**Devnet Stats:**
- Bridge Program: Deployed and tested
- Test Transactions: 100+ successful
- Security: Comprehensive test suite passed

---

## 🎯 Hackathon Deliverables

### Built During Hackathon
1. ✅ Native Solana SPL token implementation
2. ✅ Wormhole bridge (deployed to devnet)
3. ✅ Solana Blinks for social swaps
4. ✅ Referral program with Solana support
5. ✅ Full wallet integration (Phantom, Solflare)
6. ✅ Comprehensive testing and security audits

### Integration with Existing System
- USDX already live on Base mainnet
- Real mortgages backing the token
- Real yield from mortgage payments
- Solana adds: Native SPL, Blinks, DeFi composability

---

## 🌐 Links

- **Live App:** [app.trystable.co](https://app.trystable.co)
- **Swap with Referral:** [app.trystable.co/swap?ref=PUNK](https://app.trystable.co/swap?ref=PUNK)
- **Main Repository:** [ecosystem-contracts/usdx-contracts](../ecosystem-contracts/usdx-contracts)
- **Twitter:** [@StableFinance](https://twitter.com/StableFinance)

---

## 📞 For Judges

**Demo Available:** Ready to show full flow from Twitter Blink → Solana wallet → Staking

**Questions?**
- Technical deep-dive available
- Full codebase in main repo
- Happy to walk through any component

---

**Built for Solana Cypherpunk Hackathon**
*Bringing real estate yields to Solana DeFi*

Try it: [app.trystable.co/swap?ref=PUNK](https://app.trystable.co/swap?ref=PUNK)
