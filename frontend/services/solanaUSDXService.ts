import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { SOLANA_CONTRACTS } from '../config/contracts.solana';

export class SolanaUSDXService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(SOLANA_CONTRACTS.RPC_URL, 'confirmed');
  }

  /**
   * Deposit USDC to get USDX (1:1 ratio minus 0.1% fee)
   */
  async depositUsdcForUsdx(
    wallet: WalletContextState,
    usdcAmount: number
  ): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const programId = new PublicKey(SOLANA_CONTRACTS.USDX_PROGRAM_ID);
    const usdcMint = new PublicKey(SOLANA_CONTRACTS.USDC_MINT);
    const usdxMint = new PublicKey(SOLANA_CONTRACTS.USDX_MINT);
    const statePda = new PublicKey(SOLANA_CONTRACTS.STATE_PDA);
    const usdcVault = new PublicKey(SOLANA_CONTRACTS.USDC_VAULT);

    // Get user's USDC token account
    const userUsdc = await getAssociatedTokenAddress(
      usdcMint,
      wallet.publicKey
    );

    // Get or create user's USDX token account
    const userUsdx = await getAssociatedTokenAddress(
      usdxMint,
      wallet.publicKey
    );

    // Instruction discriminator for deposit_usdc (sha256("global:deposit_usdc")[0..8])
    const discriminator = Buffer.from([184, 148, 250, 169, 224, 213, 34, 126]);

    // Encode amount as u64 (8 bytes, little-endian)
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(Math.floor(usdcAmount * 1_000_000))); // USDC has 6 decimals

    // Combine discriminator + amount
    const instructionData = Buffer.concat([discriminator, amountBuffer]);

    // Build accounts for deposit_usdc instruction
    const keys = [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },      // user
      { pubkey: statePda, isSigner: false, isWritable: true },             // state
      { pubkey: usdxMint, isSigner: false, isWritable: true },             // usdx_mint
      { pubkey: usdcVault, isSigner: false, isWritable: true },            // usdc_vault
      { pubkey: userUsdc, isSigner: false, isWritable: true },             // user_usdc
      { pubkey: userUsdx, isSigner: false, isWritable: true },             // user_usdx
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
    ];

    const instruction = new TransactionInstruction({
      keys,
      programId,
      data: instructionData,
    });

    // Create and send transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    // Sign and send
    const signed = await wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /**
   * Get user's USDX balance on Solana
   */
  async getUsdxBalance(userPublicKey: PublicKey): Promise<number> {
    try {
      const usdxMint = new PublicKey(SOLANA_CONTRACTS.USDX_MINT);
      const userUsdx = await getAssociatedTokenAddress(usdxMint, userPublicKey);

      const balance = await this.connection.getTokenAccountBalance(userUsdx);
      return balance.value.uiAmount || 0;
    } catch (error) {
      // User doesn't have USDX token account yet
      return 0;
    }
  }

  /**
   * Get user's USDC balance on Solana
   */
  async getUsdcBalance(userPublicKey: PublicKey): Promise<number> {
    try {
      const usdcMint = new PublicKey(SOLANA_CONTRACTS.USDC_MINT);
      const userUsdc = await getAssociatedTokenAddress(usdcMint, userPublicKey);

      const balance = await this.connection.getTokenAccountBalance(userUsdc);
      return balance.value.uiAmount || 0;
    } catch (error) {
      // User doesn't have USDC token account yet
      return 0;
    }
  }

  /**
   * Get USDC vault balance
   */
  async getVaultBalance(): Promise<number> {
    try {
      const usdcVault = new PublicKey(SOLANA_CONTRACTS.USDC_VAULT);
      const balance = await this.connection.getTokenAccountBalance(usdcVault);
      return balance.value.uiAmount || 0;
    } catch (error) {
      console.error('Failed to fetch vault balance:', error);
      return 0;
    }
  }

  /**
   * Get total USDX supply
   */
  async getTotalSupply(): Promise<number> {
    try {
      const usdxMint = new PublicKey(SOLANA_CONTRACTS.USDX_MINT);
      const supply = await this.connection.getTokenSupply(usdxMint);
      return supply.value.uiAmount || 0;
    } catch (error) {
      console.error('Failed to fetch total supply:', error);
      return 0;
    }
  }
}

export const solanaUSDXService = new SolanaUSDXService();
