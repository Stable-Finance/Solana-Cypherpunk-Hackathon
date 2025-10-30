import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Official USDC mint on Solana Devnet
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function main() {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.UsdxToken as Program;

  console.log("Program ID:", program.programId.toBase58());
  console.log("Wallet:", provider.wallet.publicKey.toBase58());

  // Derive PDAs
  const [statePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  const [usdxMintPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdx_mint")],
    program.programId
  );

  const [usdcVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  console.log("\nDerived PDAs:");
  console.log("State PDA:", statePDA.toBase58());
  console.log("USDX Mint PDA:", usdxMintPDA.toBase58());
  console.log("USDC Vault PDA:", usdcVaultPDA.toBase58());

  try {
    console.log("\nInitializing USDX program...");

    const tx = await program.methods
      .initialize()
      .accounts({
        authority: provider.wallet.publicKey,
        state: statePDA,
        usdxMint: usdxMintPDA,
        usdcMint: USDC_MINT_DEVNET,
        usdcVault: usdcVaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Initialize transaction signature:", tx);
    console.log("\n🎉 USDX Program initialized successfully!");
    console.log("\nKey addresses:");
    console.log("USDX Mint:", usdxMintPDA.toBase58());
    console.log("USDC Vault:", usdcVaultPDA.toBase58());
    console.log("\nView on Explorer:");
    console.log(`https://explorer.solana.com/address/${usdxMintPDA.toBase58()}?cluster=devnet`);

  } catch (error) {
    console.error("Error initializing program:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
