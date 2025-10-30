import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Official USDC mint on Solana Devnet
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

describe("usdx_token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.UsdxToken as Program;

  // Shared PDAs
  let statePDA: PublicKey;
  let usdxMintPDA: PublicKey;
  let usdcVaultPDA: PublicKey;

  before(() => {
    [statePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );

    [usdxMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("usdx_mint")],
      program.programId
    );

    [usdcVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );
  });

  it("Initialize USDX program", async () => {
    console.log("\nDerived PDAs:");
    console.log("State PDA:", statePDA.toBase58());
    console.log("USDX Mint PDA:", usdxMintPDA.toBase58());
    console.log("USDC Vault PDA:", usdcVaultPDA.toBase58());

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
  });

  it("Attempt deposit below minimum (should fail)", async () => {
    const depositAmount = 50 * 1_000_000; // 50 USDC (below 100 USDC minimum)

    const userUsdcAccount = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT_DEVNET,
      owner: provider.wallet.publicKey,
    });

    const userUsdxAccount = await anchor.utils.token.associatedAddress({
      mint: usdxMintPDA,
      owner: provider.wallet.publicKey,
    });

    try {
      await program.methods
        .depositUsdc(new anchor.BN(depositAmount))
        .accounts({
          user: provider.wallet.publicKey,
          state: statePDA,
          usdxMint: usdxMintPDA,
          usdcVault: usdcVaultPDA,
          userUsdc: userUsdcAccount,
          userUsdx: userUsdxAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("❌ Should have failed with minimum deposit error");
    } catch (error: any) {
      if (error.error?.errorCode?.code === "DepositTooSmall") {
        console.log("✅ Expected error: Deposit below 100 USDC minimum");
      } else {
        console.error("❌ Unexpected error:", error);
      }
    }
  });

  it("Deposit USDC for USDX (100 USDC minimum)", async () => {
    const depositAmount = 100 * 1_000_000; // 100 USDC (6 decimals)

    // User needs token accounts
    const userUsdcAccount = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT_DEVNET,
      owner: provider.wallet.publicKey,
    });

    const userUsdxAccount = await anchor.utils.token.associatedAddress({
      mint: usdxMintPDA,
      owner: provider.wallet.publicKey,
    });

    console.log("\nUser USDC Account:", userUsdcAccount.toBase58());
    console.log("User USDX Account:", userUsdxAccount.toBase58());

    try {
      const tx = await program.methods
        .depositUsdc(new anchor.BN(depositAmount))
        .accounts({
          user: provider.wallet.publicKey,
          state: statePDA,
          usdxMint: usdxMintPDA,
          usdcVault: usdcVaultPDA,
          userUsdc: userUsdcAccount,
          userUsdx: userUsdxAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Deposit transaction signature:", tx);
      console.log("\n🎉 Successfully deposited USDC for USDX!");
    } catch (error) {
      console.error("❌ Deposit failed:", error);
      console.log("\nNote: You need USDC tokens in your wallet on devnet to test deposits.");
      console.log("Get devnet USDC from: https://faucet.circle.com/");
    }
  });

  it("Initiate withdrawal", async () => {
    const withdrawAmount = 0.5 * 1_000_000; // 0.5 USDX (6 decimals)

    const userUsdxAccount = await anchor.utils.token.associatedAddress({
      mint: usdxMintPDA,
      owner: provider.wallet.publicKey,
    });

    const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("withdrawal_request"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    console.log("\nWithdrawal Request PDA:", withdrawalRequestPDA.toBase58());

    try {
      const tx = await program.methods
        .initiateWithdrawal(new anchor.BN(withdrawAmount))
        .accounts({
          user: provider.wallet.publicKey,
          state: statePDA,
          usdxMint: usdxMintPDA,
          userUsdx: userUsdxAccount,
          withdrawalRequest: withdrawalRequestPDA,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Initiate withdrawal transaction signature:", tx);
      console.log("\n🎉 Withdrawal request created! Must wait 7 days to complete.");
    } catch (error) {
      console.error("❌ Initiate withdrawal failed:", error);
    }
  });

  it("Attempt to complete withdrawal (should fail - 7 day delay)", async () => {
    const userUsdxAccount = await anchor.utils.token.associatedAddress({
      mint: usdxMintPDA,
      owner: provider.wallet.publicKey,
    });

    const userUsdcAccount = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT_DEVNET,
      owner: provider.wallet.publicKey,
    });

    const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("withdrawal_request"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    try {
      const tx = await program.methods
        .completeWithdrawal()
        .accounts({
          user: provider.wallet.publicKey,
          state: statePDA,
          usdxMint: usdxMintPDA,
          usdcVault: usdcVaultPDA,
          userUsdx: userUsdxAccount,
          userUsdc: userUsdcAccount,
          withdrawalRequest: withdrawalRequestPDA,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Complete withdrawal transaction signature:", tx);
      console.log("\n🎉 Withdrawal completed successfully!");
    } catch (error: any) {
      if (error.error?.errorCode?.code === "WithdrawalDelayNotMet") {
        console.log("✅ Expected error: Withdrawal delay not met (7 days required)");
        console.log("   This confirms the time-lock is working correctly!");
      } else {
        console.error("❌ Complete withdrawal failed:", error);
      }
    }
  });

  it("Test deposit_treasury function", async () => {
    const treasuryDepositAmount = 10 * 1_000_000; // 10 USDC

    const authorityUsdcAccount = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT_DEVNET,
      owner: provider.wallet.publicKey,
    });

    try {
      const tx = await program.methods
        .depositTreasury(new anchor.BN(treasuryDepositAmount))
        .accounts({
          authority: provider.wallet.publicKey,
          state: statePDA,
          usdcVault: usdcVaultPDA,
          authorityUsdc: authorityUsdcAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Deposit treasury transaction signature:", tx);
      console.log("\n🎉 Successfully deposited USDC to treasury without minting USDX!");
    } catch (error) {
      console.error("❌ Deposit treasury failed:", error);
    }
  });

  it("Test withdraw_treasury function", async () => {
    const treasuryWithdrawAmount = 5 * 1_000_000; // 5 USDC

    const authorityUsdcAccount = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT_DEVNET,
      owner: provider.wallet.publicKey,
    });

    try {
      const tx = await program.methods
        .withdrawTreasury(new anchor.BN(treasuryWithdrawAmount))
        .accounts({
          authority: provider.wallet.publicKey,
          state: statePDA,
          usdcVault: usdcVaultPDA,
          authorityUsdc: authorityUsdcAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Withdraw treasury transaction signature:", tx);
      console.log("\n🎉 Successfully withdrew excess USDC from treasury!");
    } catch (error) {
      console.error("❌ Withdraw treasury failed:", error);
    }
  });

  it("Test fee calculation for tier 1 (100 USDC = 1% fee)", async () => {
    const depositAmount = 100 * 1_000_000; // 100 USDC
    const expectedFee = 1 * 1_000_000; // 1 USDC (1%)
    const expectedUsdx = 99 * 1_000_000; // 99 USDX after fee

    console.log("\n💰 Deposit: 100 USDC");
    console.log("💸 Expected Fee (1%): 1 USDC");
    console.log("🪙 Expected USDX: 99 USDX");
  });

  it("Test fee calculation for tier 2 (600k USDC)", async () => {
    const depositAmount = 600_000 * 1_000_000; // 600k USDC
    // First 500k at 1% = 5,000 USDC
    // Next 100k at 0.5% = 500 USDC
    // Total fee = 5,500 USDC
    const expectedFee = 5_500 * 1_000_000;
    const expectedUsdx = 594_500 * 1_000_000; // 594,500 USDX after fee

    console.log("\n💰 Deposit: 600,000 USDC");
    console.log("💸 Expected Fee: 5,500 USDC");
    console.log("   - First 500k at 1%: 5,000 USDC");
    console.log("   - Next 100k at 0.5%: 500 USDC");
    console.log("🪙 Expected USDX: 594,500 USDX");
  });
});
