# USDX Solana Program - Comprehensive Integration Test Plan

## Overview
This document outlines all integration tests needed before mainnet deployment. Each test validates security fixes and business logic.

---

## Test Categories

### 1. INITIALIZATION TESTS
### 2. DEPOSIT TESTS
### 3. WITHDRAWAL TESTS
### 4. SECURITY & ACCESS CONTROL TESTS
### 5. PAUSE MECHANISM TESTS
### 6. ADMIN FUNCTION TESTS
### 7. EDGE CASE & FAILURE TESTS
### 8. STATE CONSISTENCY TESTS
### 9. EVENT EMISSION TESTS
### 10. END-TO-END USER JOURNEY TESTS

---

## 1. INITIALIZATION TESTS

### Test 1.1: Successful Initialization with Correct Authority
**Objective:** Verify only deployer can initialize
**Steps:**
1. Deploy program with deployer wallet (9TYUScB6w9hG4YACcHsWs93AEA5xQKuQhrC4p1mUGKGA)
2. Call initialize() with deployer as signer
3. Verify state is created with correct values
4. Verify USDX mint is created with freeze authority
5. Verify USDC vault is created
**Expected:** Success, all PDAs created, paused=false

### Test 1.2: Initialization Fails with Wrong Authority
**Objective:** Verify unauthorized users cannot initialize
**Steps:**
1. Create new wallet (not deployer)
2. Attempt to call initialize() with new wallet
**Expected:** Error: UnauthorizedInitializer (6001)

### Test 1.3: Initialization Validates USDC Mint (Mainnet)
**Objective:** Verify only official USDC mint is accepted
**Steps:**
1. Attempt initialize with fake USDC mint address
**Expected:** Error: InvalidUsdcMint (6002)

### Test 1.4: Initialization Validates USDC Mint (Devnet)
**Objective:** Verify devnet USDC mint is accepted on devnet
**Steps:**
1. Initialize with devnet USDC mint (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
**Expected:** Success

### Test 1.5: Cannot Re-Initialize
**Objective:** Verify program can only be initialized once
**Steps:**
1. Initialize successfully
2. Attempt to initialize again
**Expected:** Error: Account already initialized

---

## 2. DEPOSIT TESTS

### Test 2.1: Successful Small Deposit (Tier 1 Fee)
**Objective:** Verify deposit works with 1% fee
**Steps:**
1. User has 1000 USDC
2. Approve and deposit 1000 USDC
3. Verify user receives 990 USDX (1% fee = 10 USDC)
4. Verify vault has 1000 USDC
5. Verify state: total_usdc_deposited = 1000, total_usdx_minted = 990, total_fees_collected = 10
**Expected:** Success, correct amounts

### Test 2.2: Successful Large Deposit (Tier 2 Fee)
**Objective:** Verify tiered fee calculation
**Steps:**
1. Deposit 1,000,000 USDC (above tier 1 threshold of 500,000)
2. Calculate expected fee:
   - First 500k: 500k * 1% = 5,000 USDC
   - Next 500k: 500k * 0.5% = 2,500 USDC
   - Total fee: 7,500 USDC
3. Verify user receives 992,500 USDX
**Expected:** Success, correct tiered fee applied

### Test 2.3: Successful Mega Deposit (Tier 3 Fee)
**Objective:** Verify tier 3 fee calculation
**Steps:**
1. Deposit 10,000,000 USDC (above tier 2 threshold of 5M)
2. Calculate expected fee:
   - First 500k @ 1% = 5,000
   - Next 4.5M @ 0.5% = 22,500
   - Next 5M @ 0.1% = 5,000
   - Total: 32,500 USDC
3. Verify user receives 9,967,500 USDX
**Expected:** Success, all tiers applied correctly

### Test 2.4: Reject Below Minimum Deposit
**Objective:** Verify minimum deposit enforcement
**Steps:**
1. Attempt to deposit 0.5 USDC (below 1 USDC minimum)
**Expected:** Error: AmountBelowMinimum (6000)

### Test 2.5: Reject Above Maximum Deposit
**Objective:** Verify maximum deposit enforcement
**Steps:**
1. Attempt to deposit 101,000,000 USDC (above 100M max)
**Expected:** Error: AmountAboveMaximum (6003)

### Test 2.6: Deposit Creates USDX Token Account
**Objective:** Verify auto-creation of user USDX account
**Steps:**
1. User has no USDX token account
2. Deposit USDC
3. Verify USDX associated token account is created
4. Verify USDX tokens are minted to new account
**Expected:** Success, account created automatically

### Test 2.7: Deposit When Paused
**Objective:** Verify pause blocks deposits
**Steps:**
1. Authority pauses program
2. Attempt deposit
**Expected:** Error: ProgramPaused (6006)

### Test 2.8: Insufficient USDC Balance
**Objective:** Verify proper error handling
**Steps:**
1. User has 100 USDC
2. Attempt to deposit 1000 USDC
**Expected:** Error: Insufficient funds (SPL Token error)

### Test 2.9: DepositEvent Emission
**Objective:** Verify event is emitted
**Steps:**
1. Deposit 1000 USDC
2. Check transaction logs for DepositEvent
3. Verify event data: user, usdc_amount, usdx_minted, fee_amount, timestamp
**Expected:** Event emitted with correct data

---

## 3. WITHDRAWAL TESTS

### Test 3.1: Successful Initiate Withdrawal
**Objective:** Verify withdrawal request creation
**Steps:**
1. User has 100 USDX
2. Initiate withdrawal for 50 USDX
3. Verify WithdrawalRequest PDA is created
4. Verify request has: user, usdx_amount=50, request_time, bump
5. Verify USDX tokens NOT burned yet
**Expected:** Success, request created, tokens remain

### Test 3.2: Cannot Initiate Withdrawal with Zero Amount
**Objective:** Verify zero amount validation
**Steps:**
1. Attempt to initiate withdrawal for 0 USDX
**Expected:** Error: InvalidAmount (6005)

### Test 3.3: Cannot Initiate Withdrawal Above Maximum
**Objective:** Verify maximum withdrawal limit
**Steps:**
1. Attempt to initiate withdrawal for 101,000,000 USDX
**Expected:** Error: AmountAboveMaximum (6003)

### Test 3.4: Cannot Initiate Withdrawal Without Sufficient Balance
**Objective:** Verify balance check
**Steps:**
1. User has 10 USDX
2. Attempt to initiate withdrawal for 100 USDX
**Expected:** Error: InsufficientUsdxBalance (6004)

### Test 3.5: Cannot Initiate Second Withdrawal
**Objective:** Verify one withdrawal request per user
**Steps:**
1. Initiate withdrawal successfully
2. Attempt to initiate another withdrawal
**Expected:** Error: Account already exists

### Test 3.6: Complete Withdrawal Before 7 Days
**Objective:** Verify time-lock enforcement
**Steps:**
1. Initiate withdrawal
2. Immediately attempt to complete withdrawal
**Expected:** Error: WithdrawalDelayNotMet (6005)

### Test 3.7: Successful Complete Withdrawal After 7 Days
**Objective:** Verify full withdrawal cycle
**Steps:**
1. Initiate withdrawal for 100 USDX
2. Wait 7 days (or manipulate time in test)
3. Complete withdrawal
4. Calculate redemption fee: 100 * 0.25% = 0.25 USDX
5. Verify user receives 99.75 USDC
6. Verify 100 USDX burned
7. Verify WithdrawalRequest account closed
8. Verify state updated:
   - total_usdx_minted -= 100
   - total_usdc_deposited -= 99.75
   - total_fees_collected += 0.25
**Expected:** Success, correct amounts, state consistent

### Test 3.8: Complete Withdrawal User Mismatch
**Objective:** Verify only request owner can complete
**Steps:**
1. User A initiates withdrawal
2. User B attempts to complete User A's withdrawal
**Expected:** Error: UnauthorizedWithdrawal (6002) or PDA derivation fails

### Test 3.9: Withdrawal When Paused
**Objective:** Verify pause blocks withdrawals
**Steps:**
1. Initiate withdrawal (should fail if paused)
2. OR: Initiate before pause, try to complete during pause
**Expected:** Error: ProgramPaused (6006)

### Test 3.10: WithdrawalInitiatedEvent and WithdrawalCompletedEvent
**Objective:** Verify both events emitted
**Steps:**
1. Initiate withdrawal - check for WithdrawalInitiatedEvent
2. Complete withdrawal - check for WithdrawalCompletedEvent
**Expected:** Both events emitted with correct data

---

## 4. SECURITY & ACCESS CONTROL TESTS

### Test 4.1: Freeze Authority Works
**Objective:** Verify USDX mint has freeze authority
**Steps:**
1. Check USDX mint freeze_authority = state PDA
2. Authority freezes user's USDX account
3. User attempts to transfer USDX
**Expected:** Transfer blocked, account frozen

### Test 4.2: Mint Authority Cannot Be Changed
**Objective:** Verify mint authority is locked to state
**Steps:**
1. Attempt to change USDX mint authority
**Expected:** Error: Only current authority can change

### Test 4.3: Vault Authority Protected
**Objective:** Verify USDC vault can only be accessed by program
**Steps:**
1. Attempt direct withdrawal from vault (not via program)
**Expected:** Error: Invalid authority

### Test 4.4: PDA Derivation Protection
**Objective:** Verify PDAs cannot be spoofed
**Steps:**
1. Create fake state account with same key
2. Attempt to use in transaction
**Expected:** Error: Constraint violation or incorrect owner

---

## 5. PAUSE MECHANISM TESTS

### Test 5.1: Authority Can Pause
**Objective:** Verify pause functionality
**Steps:**
1. Authority calls pause_program()
2. Verify state.paused = true
3. Verify ProgramPausedEvent emitted
**Expected:** Success, program paused

### Test 5.2: Non-Authority Cannot Pause
**Objective:** Verify access control
**Steps:**
1. Non-authority wallet calls pause_program()
**Expected:** Error: UnauthorizedAuthority (6004)

### Test 5.3: All Operations Blocked When Paused
**Objective:** Verify pause blocks everything
**Steps:**
1. Pause program
2. Attempt deposit - expect ProgramPaused error
3. Attempt initiate_withdrawal - expect ProgramPaused error
4. Attempt complete_withdrawal - expect ProgramPaused error
**Expected:** All blocked with ProgramPaused (6006)

### Test 5.4: Authority Can Unpause
**Objective:** Verify unpause functionality
**Steps:**
1. Pause program
2. Authority calls unpause_program()
3. Verify state.paused = false
4. Verify ProgramPausedEvent emitted (paused=false)
5. Attempt deposit
**Expected:** Unpause succeeds, operations resume

### Test 5.5: Non-Authority Cannot Unpause
**Objective:** Verify access control
**Steps:**
1. Pause program
2. Non-authority attempts unpause
**Expected:** Error: UnauthorizedAuthority (6004)

---

## 6. ADMIN FUNCTION TESTS

### Test 6.1: Authority Can Update Authority
**Objective:** Verify authority transfer
**Steps:**
1. Current authority calls update_authority(new_pubkey)
2. Verify state.authority = new_pubkey
3. Verify AuthorityUpdatedEvent emitted
4. Old authority attempts admin action
**Expected:** Transfer succeeds, old authority loses access

### Test 6.2: Non-Authority Cannot Update Authority
**Objective:** Verify access control
**Steps:**
1. Non-authority attempts update_authority()
**Expected:** Error: UnauthorizedAuthority (6004)

### Test 6.3: Authority Can Withdraw Fees
**Objective:** Verify fee withdrawal
**Steps:**
1. Accumulate fees (10 USDC from deposits)
2. Authority calls withdraw_fees(5)
3. Verify 5 USDC transferred to authority
4. Verify state.total_fees_collected = 5 (was 10)
5. Verify FeesWithdrawnEvent emitted
**Expected:** Success, correct amounts

### Test 6.4: Cannot Withdraw More Fees Than Collected
**Objective:** Verify fee balance check
**Steps:**
1. total_fees_collected = 10 USDC
2. Attempt withdraw_fees(20)
**Expected:** Error: InsufficientFees (6007)

### Test 6.5: Non-Authority Cannot Withdraw Fees
**Objective:** Verify access control
**Steps:**
1. Non-authority attempts withdraw_fees()
**Expected:** Error: UnauthorizedAuthority (6004)

---

## 7. EDGE CASE & FAILURE TESTS

### Test 7.1: Deposit Exactly at Minimum
**Objective:** Verify boundary condition
**Steps:**
1. Deposit exactly 1 USDC (minimum)
**Expected:** Success

### Test 7.2: Deposit Exactly at Tier Threshold
**Objective:** Verify tier calculation at boundary
**Steps:**
1. Deposit exactly 500,000 USDC (tier 1 threshold)
2. Verify fee = 500,000 * 1% = 5,000 USDC
**Expected:** Success, tier 1 fee applied

### Test 7.3: Withdraw Exactly at 7 Days
**Objective:** Verify time boundary
**Steps:**
1. Initiate withdrawal at time T
2. Complete at exactly T + 604800 seconds (7 days)
**Expected:** Success

### Test 7.4: Vault Insufficient Balance (Extreme)
**Objective:** Verify vault protection
**Steps:**
1. Somehow drain vault (test scenario only)
2. Attempt complete withdrawal
**Expected:** Error: InsufficientVaultBalance (6001)

### Test 7.5: Arithmetic Overflow Protection
**Objective:** Verify checked math prevents overflows
**Steps:**
1. Attempt operations that would overflow u64
**Expected:** Error: ArithmeticOverflow (6002)

### Test 7.6: Very Small Amounts (Precision)
**Objective:** Verify rounding behavior
**Steps:**
1. Deposit 100 USDC
2. Fee = 100 * 1% / 10000 = 0.01 USDC (1 unit)
3. Verify fee collected = 1, minted = 99
**Expected:** Success, minimal precision loss

### Test 7.7: Maximum Deposit Exactly
**Objective:** Verify boundary
**Steps:**
1. Deposit exactly 100,000,000 USDC
**Expected:** Success

### Test 7.8: Concurrent Withdrawals (Different Users)
**Objective:** Verify no race conditions
**Steps:**
1. User A initiates withdrawal
2. User B initiates withdrawal
3. Both complete after 7 days
**Expected:** Both succeed independently

---

## 8. STATE CONSISTENCY TESTS

### Test 8.1: Invariant: Vault = Total Deposited - Total Fees + Fees Unclaimed
**Objective:** Verify accounting accuracy
**Steps:**
1. After multiple deposits and withdrawals
2. Check: vault_balance = total_usdc_deposited + total_fees_collected
**Expected:** Equality holds

### Test 8.2: Invariant: USDX Total Supply = Total Minted
**Objective:** Verify token accounting
**Steps:**
1. After multiple operations
2. Check: USDX mint total_supply = state.total_usdx_minted
**Expected:** Equality holds

### Test 8.3: State Consistency After Deposit
**Objective:** Verify state updates correctly
**Steps:**
1. Note initial state
2. Deposit 1000 USDC (990 USDX minted, 10 fee)
3. Verify:
   - total_usdc_deposited increased by 1000
   - total_usdx_minted increased by 990
   - total_fees_collected increased by 10
**Expected:** All deltas correct

### Test 8.4: State Consistency After Withdrawal
**Objective:** Verify state updates correctly
**Steps:**
1. Note initial state
2. Complete withdrawal of 100 USDX (99.75 USDC out, 0.25 fee)
3. Verify:
   - total_usdx_minted decreased by 100
   - total_usdc_deposited decreased by 99.75
   - total_fees_collected increased by 0.25
**Expected:** All deltas correct

### Test 8.5: State Consistency After Fee Withdrawal
**Objective:** Verify fee accounting
**Steps:**
1. total_fees_collected = 100
2. Withdraw 50 USDC in fees
3. Verify total_fees_collected = 50
4. Verify vault decreased by 50
**Expected:** Correct

---

## 9. EVENT EMISSION TESTS

### Test 9.1: All Events Emit Correct Data
**Objective:** Verify event schema
**Steps:**
For each event type, verify:
- DepositEvent: user, usdc_amount, usdx_minted, fee_amount, timestamp
- WithdrawalInitiatedEvent: user, usdx_amount, request_time
- WithdrawalCompletedEvent: user, usdx_burned, usdc_received, redemption_fee, timestamp
- ProgramPausedEvent: authority, paused, timestamp
- AuthorityUpdatedEvent: old_authority, new_authority, timestamp
- FeesWithdrawnEvent: authority, amount, timestamp
**Expected:** All fields populated correctly

### Test 9.2: Events Can Be Indexed
**Objective:** Verify events work with indexers
**Steps:**
1. Perform operations
2. Use event listener/indexer to capture events
3. Verify all events captured
**Expected:** Success

### Test 9.3: Timestamps Are Accurate
**Objective:** Verify timestamp consistency
**Steps:**
1. Note current time
2. Perform operation
3. Check event timestamp ≈ current time (within seconds)
**Expected:** Timestamps accurate

---

## 10. END-TO-END USER JOURNEY TESTS

### Test 10.1: Complete User Journey - Happy Path
**Objective:** Simulate real user flow
**Steps:**
1. User deposits 10,000 USDC
2. Receives 9,900 USDX (1% fee)
3. Waits some time
4. Initiates withdrawal for 5,000 USDX
5. Waits 7 days
6. Completes withdrawal
7. Receives 4,987.5 USDC (0.25% redemption fee = 12.5)
8. Still holds 4,900 USDX
**Expected:** All steps succeed, balances correct

### Test 10.2: Complete User Journey - Multiple Deposits
**Objective:** Test sequential deposits
**Steps:**
1. Deposit 1,000 USDC → 990 USDX
2. Deposit 500 USDC → 495 USDX
3. Deposit 2,000 USDC → 1,980 USDX
4. Total: 3,465 USDX
5. Verify vault = 3,500 USDC
6. Verify fees = 35 USDC
**Expected:** Accounting correct

### Test 10.3: Emergency Pause During User Journey
**Objective:** Test pause impact
**Steps:**
1. User deposits 1,000 USDC successfully
2. Authority pauses program
3. User attempts another deposit - fails
4. User attempts withdrawal - fails
5. Authority unpauses
6. User successfully withdraws
**Expected:** Pause blocks, unpause restores

### Test 10.4: Authority Transfer During Operations
**Objective:** Test authority change impact
**Steps:**
1. Users deposit USDC
2. Authority transfers to new wallet
3. Old authority cannot pause - fails
4. New authority can pause - succeeds
5. New authority withdraws fees - succeeds
**Expected:** Transfer seamless, permissions correct

### Test 10.5: Fee Accumulation and Withdrawal
**Objective:** Test fee lifecycle
**Steps:**
1. 10 users each deposit 1,000 USDC
2. Total fees = 100 USDC
3. Authority withdraws 50 USDC
4. 5 users initiate withdrawals
5. Wait 7 days, complete withdrawals
6. Redemption fees collected
7. Authority withdraws remaining fees
**Expected:** All fees accounted for

---

## TEST EXECUTION MATRIX

| Test Category | Total Tests | Priority | Estimated Time |
|--------------|-------------|----------|----------------|
| Initialization | 5 | CRITICAL | 15 min |
| Deposit | 9 | CRITICAL | 30 min |
| Withdrawal | 10 | CRITICAL | 45 min |
| Security & Access | 4 | CRITICAL | 20 min |
| Pause Mechanism | 5 | HIGH | 25 min |
| Admin Functions | 5 | HIGH | 25 min |
| Edge Cases | 8 | MEDIUM | 40 min |
| State Consistency | 5 | HIGH | 25 min |
| Event Emission | 3 | MEDIUM | 15 min |
| E2E Journeys | 5 | HIGH | 45 min |
| **TOTAL** | **59** | - | **~4.5 hours** |

---

## AUTOMATION RECOMMENDATIONS

### Priority 1 (Automate First):
- All initialization tests
- Deposit with different amounts and fee tiers
- Withdrawal cycle (initiate → wait → complete)
- Pause/unpause functionality
- State consistency checks

### Priority 2 (Automate Next):
- Access control tests
- Admin function tests
- Event emission verification
- Edge cases

### Priority 3 (Manual OK):
- Complex E2E scenarios
- Cross-user interactions
- Performance/load testing

---

## TEST DATA SETS

### Users:
- **User A**: 100,000 USDC, tests large deposits
- **User B**: 1,000 USDC, tests small deposits
- **User C**: 10,000,000 USDC, tests tier 3 fees
- **Authority**: Deployer wallet
- **New Authority**: Transfer target wallet

### Time Scenarios:
- **Instant**: Complete immediately (should fail)
- **6 days 23 hours**: Just before deadline (should fail)
- **7 days**: Exactly at deadline (should succeed)
- **7 days 1 hour**: After deadline (should succeed)

---

## SUCCESS CRITERIA

### Must Pass (All):
- ✅ All 59 tests pass
- ✅ No unexpected errors
- ✅ State invariants hold
- ✅ Events emit correctly
- ✅ Access control enforced
- ✅ Pause mechanism works
- ✅ Fee calculations accurate

### Additional Validation:
- ✅ Gas costs reasonable
- ✅ No transaction reverts in happy paths
- ✅ Error messages helpful
- ✅ Edge cases handled gracefully

---

## TESTING TOOLS

1. **Anchor Test Framework** - Primary test runner
2. **Solana Test Validator** - Local blockchain
3. **ts-mocha** - Test execution
4. **@solana/web3.js** - Transaction building
5. **Custom Scripts** - Complex scenarios

---

## NEXT STEPS AFTER TESTING

1. ✅ All tests pass
2. Fix any issues found
3. Re-run full suite
4. Document any edge cases
5. External security audit
6. Mainnet deployment
7. Continuous monitoring

---

## NOTES

- Time manipulation for 7-day tests may require custom test validator settings
- Some tests may need to run sequentially (state dependency)
- Event testing requires log parsing capability
- Consider adding fuzz testing for extreme values
- Performance testing separate from functional testing
