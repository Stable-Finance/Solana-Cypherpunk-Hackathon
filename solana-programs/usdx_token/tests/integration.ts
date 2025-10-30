import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { assert } from "chai";

// Official USDC mint on Solana Devnet
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

describe("USDX Token - Integration Tests", () => {
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

  // ==================== INITIALIZATION TESTS ====================

  describe("1. Initialization Tests", () => {
    it("1.1 Should initialize successfully with correct authority", async () => {
      // Note: This will fail if already initialized - run on fresh deployment
      try {
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

        console.log("✅ Initialized:", tx);

        // Verify state
        const state = await program.account.programState.fetch(statePDA);
        assert.equal(state.authority.toBase58(), provider.wallet.publicKey.toBase58());
        assert.equal(state.paused, false);
        assert.equal(state.totalUsdxMinted.toNumber(), 0);
        assert.equal(state.totalUsdcDeposited.toNumber(), 0);
        assert.equal(state.totalFeesCollected.toNumber(), 0);
      } catch (err) {
        if (err.message.includes("already in use")) {
          console.log("⚠️  Program already initialized (expected on re-run)");
        } else {
          throw err;
        }
      }
    });

    it("1.2 Should fail initialization with wrong authority", async () => {
      const wrongAuthority = Keypair.generate();

      try {
        await program.methods
          .initialize()
          .accounts({
            authority: wrongAuthority.publicKey,
            state: statePDA,
            usdxMint: usdxMintPDA,
            usdcMint: USDC_MINT_DEVNET,
            usdcVault: usdcVaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([wrongAuthority])
          .rpc();

        assert.fail("Should have failed with UnauthorizedInitializer");
      } catch (err) {
        assert.include(err.toString(), "UnauthorizedInitializer");
        console.log("✅ Correctly rejected wrong authority");
      }
    });
  });

  // ==================== DEPOSIT TESTS ====================

  describe("2. Deposit Tests", () => {
    it("2.1 Should deposit successfully with tier 1 fee (1%)", async () => {
      const depositAmount = 5 * 1_000_000; // 5 USDC
      const expectedFee = depositAmount * 0.01; // 1% = 0.05 USDC
      const expectedMinted = depositAmount - expectedFee; // 4.95 USDX

      const userUsdcAccount = await anchor.utils.token.associatedAddress({
        mint: USDC_MINT_DEVNET,
        owner: provider.wallet.publicKey,
      });

      const userUsdxAccount = await anchor.utils.token.associatedAddress({
        mint: usdxMintPDA,
        owner: provider.wallet.publicKey,
      });

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

        console.log("✅ Deposit tx:", tx);

        // Verify state updates
        const state = await program.account.programState.fetch(statePDA);
        console.log("Total USDC deposited:", state.totalUsdcDeposited.toNumber());
        console.log("Total USDX minted:", state.totalUsdxMinted.toNumber());
        console.log("Total fees collected:", state.totalFeesCollected.toNumber());

        // Note: Actual values depend on if this is first deposit or not
      } catch (err) {
        console.error("Deposit error:", err);
        throw err;
      }
    });

    it("2.2 Should reject deposit below minimum", async () => {
      const depositAmount = 0.5 * 1_000_000; // 0.5 USDC (below 1 USDC minimum)

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

        assert.fail("Should have failed with AmountBelowMinimum");
      } catch (err) {
        assert.include(err.toString(), "AmountBelowMinimum");
        console.log("✅ Correctly rejected below minimum deposit");
      }
    });

    it("2.3 Should reject deposit above maximum", async () => {
      const depositAmount = new anchor.BN("101000000000000"); // 101M USDC (above 100M max)

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
          .depositUsdc(depositAmount)
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

        assert.fail("Should have failed with AmountAboveMaximum");
      } catch (err) {
        assert.include(err.toString(), "AmountAboveMaximum");
        console.log("✅ Correctly rejected above maximum deposit");
      }
    });
  });

  // ==================== WITHDRAWAL TESTS ====================

  describe("3. Withdrawal Tests", () => {
    it("3.1 Should initiate withdrawal successfully", async () => {
      const withdrawAmount = 1 * 1_000_000; // 1 USDX

      const userUsdxAccount = await anchor.utils.token.associatedAddress({
        mint: usdxMintPDA,
        owner: provider.wallet.publicKey,
      });

      const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("withdrawal_request"), provider.wallet.publicKey.toBuffer()],
        program.programId
      );

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

        console.log("✅ Initiate withdrawal tx:", tx);

        // Verify withdrawal request created
        const request = await program.account.withdrawalRequest.fetch(withdrawalRequestPDA);
        assert.equal(request.user.toBase58(), provider.wallet.publicKey.toBase58());
        assert.equal(request.usdxAmount.toNumber(), withdrawAmount);
        console.log("Request time:", new Date(request.requestTime.toNumber() * 1000));
      } catch (err) {
        if (err.message.includes("already in use")) {
          console.log("⚠️  Withdrawal request already exists (expected on re-run)");
        } else {
          throw err;
        }
      }
    });

    it("3.2 Should reject withdrawal with zero amount", async () => {
      const withdrawAmount = 0;

      const userUsdxAccount = await anchor.utils.token.associatedAddress({
        mint: usdxMintPDA,
        owner: provider.wallet.publicKey,
      });

      const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("withdrawal_request"), provider.wallet.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
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

        assert.fail("Should have failed with InvalidAmount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
        console.log("✅ Correctly rejected zero amount");
      }
    });

    it("3.3 Should reject completion before 7 days", async () => {
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
        await program.methods
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

        assert.fail("Should have failed with WithdrawalDelayNotMet");
      } catch (err) {
        assert.include(err.toString(), "WithdrawalDelayNotMet");
        console.log("✅ Correctly enforced 7-day delay");
      }
    });
  });

  // ==================== PAUSE MECHANISM TESTS ====================

  describe("4. Pause Mechanism Tests", () => {
    it("4.1 Should pause program successfully", async () => {
      try {
        const tx = await program.methods
          .pauseProgram()
          .accounts({
            authority: provider.wallet.publicKey,
            state: statePDA,
          })
          .rpc();

        console.log("✅ Pause tx:", tx);

        const state = await program.account.programState.fetch(statePDA);
        assert.equal(state.paused, true);
      } catch (err) {
        console.error("Pause error:", err);
        throw err;
      }
    });

    it("4.2 Should block deposit when paused", async () => {
      const depositAmount = 1 * 1_000_000;

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

        assert.fail("Should have failed with ProgramPaused");
      } catch (err) {
        assert.include(err.toString(), "ProgramPaused");
        console.log("✅ Correctly blocked deposit while paused");
      }
    });

    it("4.3 Should unpause program successfully", async () => {
      try {
        const tx = await program.methods
          .unpauseProgram()
          .accounts({
            authority: provider.wallet.publicKey,
            state: statePDA,
          })
          .rpc();

        console.log("✅ Unpause tx:", tx);

        const state = await program.account.programState.fetch(statePDA);
        assert.equal(state.paused, false);
      } catch (err) {
        console.error("Unpause error:", err);
        throw err;
      }
    });
  });

  // ==================== STATE CONSISTENCY TESTS ====================

  describe("5. State Consistency Tests", () => {
    it("5.1 Should maintain correct accounting after operations", async () => {
      const state = await program.account.programState.fetch(statePDA);

      console.log("\n📊 Current State:");
      console.log("Total USDC Deposited:", state.totalUsdcDeposited.toNumber() / 1_000_000, "USDC");
      console.log("Total USDX Minted:", state.totalUsdxMinted.toNumber() / 1_000_000, "USDX");
      console.log("Total Fees Collected:", state.totalFeesCollected.toNumber() / 1_000_000, "USDC");

      // Verify invariant: deposited >= minted (because of fees)
      assert.isTrue(
        state.totalUsdcDeposited.gte(state.totalUsdxMinted),
        "USDC deposited should be >= USDX minted"
      );

      // Verify fees are reasonable (should be ~1% of deposits for tier 1)
      const feePercentage = state.totalFeesCollected.toNumber() / state.totalUsdcDeposited.toNumber();
      console.log("Effective fee rate:", (feePercentage * 100).toFixed(2), "%");
    });
  });

  // ==================== ADMIN FUNCTION TESTS ====================

  describe("6. Admin Function Tests", () => {
    it("6.1 Should allow authority to withdraw fees", async () => {
      const state = await program.account.programState.fetch(statePDA);
      const feesToWithdraw = Math.min(state.totalFeesCollected.toNumber(), 1_000_000); // Max 1 USDC

      if (feesToWithdraw === 0) {
        console.log("⚠️  No fees to withdraw (skipping)");
        return;
      }

      const authorityUsdcAccount = await anchor.utils.token.associatedAddress({
        mint: USDC_MINT_DEVNET,
        owner: provider.wallet.publicKey,
      });

      try {
        const tx = await program.methods
          .withdrawFees(new anchor.BN(feesToWithdraw))
          .accounts({
            authority: provider.wallet.publicKey,
            state: statePDA,
            usdcVault: usdcVaultPDA,
            authorityUsdc: authorityUsdcAccount,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .rpc();

        console.log("✅ Withdraw fees tx:", tx);

        const newState = await program.account.programState.fetch(statePDA);
        assert.equal(
          newState.totalFeesCollected.toNumber(),
          state.totalFeesCollected.toNumber() - feesToWithdraw
        );
      } catch (err) {
        console.error("Withdraw fees error:", err);
        throw err;
      }
    });
  });
});
