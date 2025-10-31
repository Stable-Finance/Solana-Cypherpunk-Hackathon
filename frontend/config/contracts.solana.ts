// Solana USDX Program Configuration
export const SOLANA_CONTRACTS = {
  // USDX Program (deployed 2025-10-22)
  USDX_PROGRAM_ID: '5nt7ssXVY25hiykrbBPYagZn7WCM43dCLrS5ysfoZ4gn',
  USDX_MINT: '9Gst2E7KovZ9jwecyGqnnhpG1mhHKdyLpJQnZonkCFhA',
  USDX_METADATA: 'tXEjQaLGPzNc2GDridV6tWXbwC12GefB8MCJBKiXruj',
  STATE_PDA: '3ZUZ29kv6q9s9hS2AdFBFG1LbpYSrwb1Cko35Ada95iC',
  USDC_VAULT: '7E4Cn1bXQ1nzsihYjA8PnmZK4fgnEV3mVLS5Q8m9vgiu',

  // Solana USDC (official)
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

  // RPC Endpoint
  RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=11fe0962-e2a6-4d06-859d-465bee87d7cc',
} as const;
