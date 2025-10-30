import React, { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSearchParams } from 'react-router-dom';
import { CONTRACTS } from '../config/contracts';
import { USDX_TOKEN_ABI, EURX_TOKEN_ABI, ERC20_ABI } from '../abis';
import CrossChainSwap from './CrossChainSwap';
import { addUSDXToWallet } from '../utils/addTokenToWallet';
import { fetchEurUsd24hChange, PriceChangeData } from '../services/priceApiService';
import { useChainSelection } from '../contexts/ChainSelectionContext';
import { solanaUSDXService } from '../services/solanaUSDXService';
import { SOLANA_CONTRACTS } from '../config/contracts.solana';
import './Swap.css';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const; // Official USDC on Base
const EURX_TOKEN_ADDRESS = '0x81F2678D8a08c40c50D90d2d8AF7a574ED957fC3' as const; // EURX on Base
const CHAINLINK_EUR_USD_FEED = '0xc91D87E81faB8f93699ECf7Ee9B44D11e1D53F0F' as const; // Chainlink EUR/USD on Base

// Calculate Solana fee based on tiered structure
const calculateSolanaFee = (amount: number): number => {
  const amountInMicroUsdc = amount * 1_000_000;
  if (amountInMicroUsdc < 500_000_000_000) {
    // Tier 1: 1.0% for amounts < 500k USDC
    return amount * 0.01;
  } else {
    // Tier 1 portion (first 500k at 1%)
    const tier1Fee = 500_000 * 0.01;
    // Tier 2 portion (everything above 500k at 0.5%)
    const tier2Amount = amount - 500_000;
    const tier2Fee = tier2Amount * 0.005;
    return tier1Fee + tier2Fee;
  }
};

// Token selection type with chain support
type SelectedTokenType =
  | { token: 'usdx', chain: 'base' }
  | { token: 'eurx', chain: 'base' }
  | { token: 'usdx', chain: 'solana' };

const Swap: React.FC = () => {
  const { address, isConnected } = useAccount();
  const solanaWallet = useWallet();
  const { setSelectedChain } = useChainSelection();
  const [searchParams] = useSearchParams();
  const swapDirection = 'usdc-to-usdx' as const;
  const [activeTab, setActiveTab] = useState<'same-chain' | 'cross-chain'>('same-chain');
  const [selectedToken, setSelectedToken] = useState<SelectedTokenType>({ token: 'usdx', chain: 'base' });
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [lastApprovedAmount, setLastApprovedAmount] = useState<string>('');
  const [lastTransactionType, setLastTransactionType] = useState<'approval' | 'swap' | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [priceChangeData, setPriceChangeData] = useState<PriceChangeData | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');

  // Solana balances
  const [solanaUsdcBalance, setSolanaUsdcBalance] = useState<number>(0);
  const [solanaUsdxBalance, setSolanaUsdxBalance] = useState<number>(0);
  const [solanaVaultBalance, setSolanaVaultBalance] = useState<number>(0);
  const [solanaTotalSupply, setSolanaTotalSupply] = useState<number>(0);
  const [solanaSwapSuccess, setSolanaSwapSuccess] = useState<string | null>(null);

  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Get user's USDC balance
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  // Get user's USDX balance
  const { data: usdxBalance, refetch: refetchUsdxBalance } = useReadContract({
    address: CONTRACTS.USDX_TOKEN as `0x${string}`,
    abi: USDX_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  // Get user's EURX balance
  const { data: eurxBalance, refetch: refetchEurxBalance } = useReadContract({
    address: EURX_TOKEN_ADDRESS,
    abi: EURX_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  // Get USDC allowance for USDX contract
  const { data: usdcAllowanceForUsdx, refetch: refetchUsdcAllowanceForUsdx } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, CONTRACTS.USDX_TOKEN as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected && selectedToken.token === 'usdx' && selectedToken.chain === 'base',
    },
  });

  // Get USDC allowance for EURX contract
  const { data: usdcAllowanceForEurx, refetch: refetchUsdcAllowanceForEurx } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, EURX_TOKEN_ADDRESS] : undefined,
    query: {
      enabled: !!address && isConnected && selectedToken.token === 'eurx',
    },
  });

  const usdcAllowance = selectedToken.token === 'usdx' && selectedToken.chain === 'base' ? usdcAllowanceForUsdx : usdcAllowanceForEurx;
  const refetchUsdcAllowance = selectedToken.token === 'usdx' && selectedToken.chain === 'base' ? refetchUsdcAllowanceForUsdx : refetchUsdcAllowanceForEurx;

  // Get USDC reserves in USDX contract
  const { data: usdcReserves } = useReadContract({
    address: CONTRACTS.USDX_TOKEN as `0x${string}`,
    abi: USDX_TOKEN_ABI,
    functionName: 'getUsdcReserves',
    query: {
      enabled: isConnected,
    },
  });

  // Get total USDC backed amount
  const { data: totalUsdcBacked } = useReadContract({
    address: CONTRACTS.USDX_TOKEN as `0x${string}`,
    abi: USDX_TOKEN_ABI,
    functionName: 'getTotalUsdcBacked',
    query: {
      enabled: isConnected,
    },
  });

  // Get EURC reserves in EURX contract
  const { data: eurcReserves, refetch: refetchEurcReserves } = useReadContract({
    address: EURX_TOKEN_ADDRESS,
    abi: EURX_TOKEN_ABI,
    functionName: 'getEurcReserves',
    query: {
      enabled: isConnected,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Get total EURX backed amount
  const { data: totalEurxBacked, refetch: refetchTotalEurxBacked } = useReadContract({
    address: EURX_TOKEN_ADDRESS,
    abi: EURX_TOKEN_ABI,
    functionName: 'totalSupply',
    query: {
      enabled: isConnected,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Get EUR/USD price from Chainlink
  const { data: eurUsdPrice } = useReadContract({
    address: CHAINLINK_EUR_USD_FEED,
    abi: [{
      type: 'function',
      name: 'latestRoundData',
      stateMutability: 'view',
      inputs: [],
      outputs: [
        { name: 'roundId', type: 'uint80' },
        { name: 'answer', type: 'int256' },
        { name: 'startedAt', type: 'uint256' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'answeredInRound', type: 'uint80' }
      ],
    }],
    functionName: 'latestRoundData',
    chainId: 8453, // Base
  });

  // Get EUR/USD price (e.g., 1.05 means 1 EUR = 1.05 USD)
  const eurUsdRate = eurUsdPrice
    ? Number(eurUsdPrice[1]) / 1e8 // Chainlink uses 8 decimals
    : 1.18; // Fallback to approximate rate

  // Calculate USD to EUR rate (invert EUR/USD)
  const usdToEurRate = 1 / eurUsdRate; // e.g., if 1 EUR = 1.18 USD, then 1 USD = 0.847 EUR

  // Check for referral code in URL params or localStorage
  useEffect(() => {
    const refParam = searchParams.get('ref');
    const storedRef = localStorage.getItem('pendingReferralCode');

    if (refParam) {
      setReferralCode(refParam.toUpperCase());
      localStorage.setItem('pendingReferralCode', refParam.toUpperCase());
    } else if (storedRef) {
      setReferralCode(storedRef);
    }
  }, [searchParams]);

  // Fetch EUR/USD 24h price change data
  useEffect(() => {
    const fetchPriceChange = async () => {
      const data = await fetchEurUsd24hChange();
      setPriceChangeData(data);
    };

    // Initial fetch
    fetchPriceChange();

    // Refresh every 5 minutes
    const interval = setInterval(fetchPriceChange, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Update chain selection when token changes
  useEffect(() => {
    setSelectedChain(selectedToken.chain);
  }, [selectedToken, setSelectedChain]);

  // Fetch Solana balances and pool data
  useEffect(() => {
    const fetchSolanaData = async () => {
      try {
        // Always fetch pool data
        const [vault, supply] = await Promise.all([
          solanaUSDXService.getVaultBalance(),
          solanaUSDXService.getTotalSupply(),
        ]);
        setSolanaVaultBalance(vault);
        setSolanaTotalSupply(supply);

        // Fetch user balances if wallet is connected
        if (solanaWallet.publicKey) {
          const [usdc, usdx] = await Promise.all([
            solanaUSDXService.getUsdcBalance(solanaWallet.publicKey),
            solanaUSDXService.getUsdxBalance(solanaWallet.publicKey),
          ]);
          setSolanaUsdcBalance(usdc);
          setSolanaUsdxBalance(usdx);
        } else {
          setSolanaUsdcBalance(0);
          setSolanaUsdxBalance(0);
        }
      } catch (error) {
        console.error('Failed to fetch Solana data:', error);
      }
    };

    fetchSolanaData();

    // Refetch every 5 seconds
    const interval = setInterval(fetchSolanaData, 5000);

    return () => clearInterval(interval);
  }, [solanaWallet.publicKey]);

  // Helper function to format output amount intelligently
  const formatOutputAmount = (amount: number): string => {
    // Round to 2 decimal places
    const rounded = Math.round(amount * 100) / 100;
    // If the amount is a whole number, show no decimals
    if (rounded === Math.floor(rounded)) {
      return rounded.toString();
    }
    // Otherwise show up to 2 decimal places, removing trailing zeros
    return parseFloat(rounded.toFixed(2)).toString();
  };

  // Clear Solana success message when user starts new swap
  useEffect(() => {
    if (solanaSwapSuccess) {
      setSolanaSwapSuccess(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputAmount]);

  // Update output amount when input changes
  useEffect(() => {
    if (inputAmount && !isNaN(Number(inputAmount))) {
      if (selectedToken.token === 'usdx') {
        // USDX on Base: 1:1 minus 0.5% mint fee
        // USDX on Solana: 1:1 minus tiered fee (1% or 0.5%)
        if (selectedToken.chain === 'solana') {
          const fee = calculateSolanaFee(Number(inputAmount));
          const afterFee = Number(inputAmount) - fee;
          setOutputAmount(formatOutputAmount(afterFee));
        } else {
          // Base USDX: deduct 0.5% mint fee
          const afterFee = Number(inputAmount) * 0.995;
          setOutputAmount(formatOutputAmount(afterFee));
        }
      } else {
        // EURX: 0.5% fee taken from USDC, then swapped to EURC, then minted 1:1 as EURX
        // So (USDC amount - 0.5% fee) × usdToEurRate = EURX amount
        const afterFee = Number(inputAmount) * 0.995;
        const eurxAmount = afterFee * usdToEurRate;
        setOutputAmount(formatOutputAmount(eurxAmount));
      }
    } else {
      setOutputAmount('');
    }
  }, [inputAmount, selectedToken, usdToEurRate]);

  // Handle transaction completion
  useEffect(() => {
    if (isConfirmed) {
      if (lastTransactionType === 'approval') {
        setLastApprovedAmount(inputAmount);
        setIsApproving(false);
        // Refresh allowance after approval
        refetchUsdcAllowance();
      } else if (lastTransactionType === 'swap') {
        // Submit referral if there's a pending code
        if (referralCode && inputAmount) {
          submitReferral(inputAmount);
        }

        setInputAmount('');
        setOutputAmount('');
        setIsLoading(false);
        setLastApprovedAmount('');
        // Refresh balances after swap
        refetchUsdcBalance();
        refetchUsdxBalance();
        refetchEurxBalance();
        // Refresh EURX reserves
        refetchEurcReserves();
        refetchTotalEurxBacked();
      }
      setLastTransactionType(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, lastTransactionType, inputAmount, refetchUsdcAllowance, refetchUsdcBalance, refetchUsdxBalance, refetchEurxBalance, refetchEurcReserves, refetchTotalEurxBacked]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Submit referral code after successful swap
  const submitReferral = async (swapAmountUsdc: string, solanaAddress?: string) => {
    const walletAddress = solanaAddress || address;
    if (!referralCode || !walletAddress) return;

    const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://stable-ecosystem-api.onrender.com';

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/referrals/use`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referral_code: referralCode,
          referred_address: walletAddress,
          swap_amount_usdc: parseFloat(swapAmountUsdc),
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('Referral recorded successfully:', data);
        // Clear the referral code after successful use
        localStorage.removeItem('pendingReferralCode');
        setReferralCode('');
      } else {
        console.log('Referral submission failed:', data);
      }
    } catch (error) {
      console.error('Error submitting referral:', error);
    }
  };

  const handleApprove = async () => {
    if (!inputAmount || !address) return;

    // Solana doesn't need approval
    if (selectedToken.chain === 'solana') return;

    setIsApproving(true);
    setLastTransactionType('approval');
    const amount = parseUnits(inputAmount, 6); // USDC has 6 decimals

    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [
        selectedToken.token === 'usdx'
          ? CONTRACTS.USDX_TOKEN as `0x${string}`
          : EURX_TOKEN_ADDRESS,
        amount
      ],
    });
  };

  const handleSwap = async () => {
    if (!inputAmount) return;

    // Solana swap logic
    if (selectedToken.chain === 'solana') {
      if (!solanaWallet.publicKey || !solanaWallet.signTransaction) {
        alert('Please connect your Solana wallet');
        return;
      }

      setIsLoading(true);
      setLastTransactionType('swap');

      try {
        const signature = await solanaUSDXService.depositUsdcForUsdx(
          solanaWallet,
          Number(inputAmount)
        );
        console.log('Solana swap successful:', signature);

        // Set success state with transaction signature
        setSolanaSwapSuccess(signature);

        // Submit referral if there's a pending code
        if (referralCode && inputAmount && solanaWallet.publicKey) {
          submitReferral(inputAmount, solanaWallet.publicKey.toString());
        }

        setInputAmount('');
        setOutputAmount('');

        // Refetch Solana balances
        if (solanaWallet.publicKey) {
          const [usdc, usdx] = await Promise.all([
            solanaUSDXService.getUsdcBalance(solanaWallet.publicKey),
            solanaUSDXService.getUsdxBalance(solanaWallet.publicKey),
          ]);
          setSolanaUsdcBalance(usdc);
          setSolanaUsdxBalance(usdx);
        }
      } catch (error: any) {
        console.error('Solana swap failed:', error);
        alert(`Swap failed: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Base (EVM) swap logic
    if (!address) return;

    setIsLoading(true);
    setLastTransactionType('swap');
    const amount = parseUnits(inputAmount, 6); // USDC has 6 decimals

    if (selectedToken.token === 'usdx') {
      writeContract({
        address: CONTRACTS.USDX_TOKEN as `0x${string}`,
        abi: USDX_TOKEN_ABI,
        functionName: 'depositUsdcForUsdx',
        args: [amount],
      });
    } else {
      // EURX: Calculate minimum output with 0.5% slippage tolerance
      const minEurxOut = parseUnits((Number(outputAmount) * 0.995).toFixed(6), 6);
      writeContract({
        address: EURX_TOKEN_ADDRESS,
        abi: EURX_TOKEN_ABI,
        functionName: 'swapUsdcToEurx',
        args: [amount, minEurxOut],
      });
    }
  };

  const needsApproval = inputAmount &&
    usdcAllowance !== undefined &&
    parseUnits(inputAmount, 6) > (usdcAllowance as bigint);

  // Use Solana balances when on Solana chain, otherwise use Base balances
  const maxInput = selectedToken.chain === 'solana'
    ? solanaUsdcBalance.toString()
    : (usdcBalance ? formatUnits(usdcBalance as bigint, 6) : '0');

  const formattedBalance = selectedToken.chain === 'solana'
    ? solanaUsdcBalance.toFixed(2)
    : (usdcBalance ? Number(formatUnits(usdcBalance as bigint, 6)).toFixed(2) : '0.00');


  const minDeposit = 100; // 100 USDC minimum for all chains
  const canSwap = inputAmount &&
    Number(inputAmount) > 0 &&
    Number(inputAmount) <= Number(maxInput) &&
    Number(inputAmount) >= minDeposit;

  if (!isConnected) {
    return (
      <div className="swap-container">
        <div className="swap-card">
          <div className="swap-header">
            <h2>USDC ⇄ USDX Swap</h2>
            <p>Please connect your wallet to use the swap.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jupiter-swap-container">
      <div className="jupiter-swap-card">
        <div className="jupiter-swap-header">
          <h2>Swap</h2>
        </div>

        {/* Tab Navigation */}
        <div className="swap-tabs">
          <button
            className={`swap-tab ${activeTab === 'same-chain' ? 'active' : ''}`}
            onClick={() => setActiveTab('same-chain')}
          >
            Swap
          </button>
          <button
            className={`swap-tab ${activeTab === 'cross-chain' ? 'active' : ''}`}
            onClick={() => setActiveTab('cross-chain')}
          >
            Bridge USDC
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'same-chain' ? (
          <div className="jupiter-swap-form">
            {/* Selling Box */}
            <div className="jupiter-token-box selling">
              <div className="jupiter-token-header">
                <span className="jupiter-token-label">You're selling</span>
                <span className="jupiter-balance">Balance: {formattedBalance} USDC</span>
              </div>
              <div className="jupiter-token-input-row">
                <div className="jupiter-token-info">
                  <div className="jupiter-token-icon">
                    <img
                      src="https://wsrv.nl/?w=48&h=48&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                      alt="USDC"
                      className="jupiter-token-logo"
                    />
                  </div>
                  <div className="jupiter-token-details">
                    <span className="jupiter-token-symbol">USDC</span>
                    <span className="jupiter-token-name">USD Coin</span>
                  </div>
                </div>
                <div className="jupiter-input-section">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty or valid numbers
                      if (value === '' || !isNaN(Number(value))) {
                        // Limit to 2 decimal places
                        if (value.includes('.')) {
                          const parts = value.split('.');
                          if (parts[1] && parts[1].length > 2) {
                            setInputAmount(`${parts[0]}.${parts[1].slice(0, 2)}`);
                            return;
                          }
                        }
                        setInputAmount(value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="0.00"
                    className="jupiter-amount-input"
                    step="0.01"
                    min="0"
                  />
                  <button
                    className="jupiter-max-btn"
                    onClick={() => setInputAmount(maxInput)}
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>

            {/* Swap Arrow */}
            <div className="jupiter-swap-arrow-container">
              <div className="jupiter-swap-arrow">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1V15M8 15L3 10M8 15L13 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Buying Box */}
            <div className="jupiter-token-box buying" style={{position: 'relative'}}>
              <div className="jupiter-token-header">
                <span className="jupiter-token-label">To receive</span>
                <span className="jupiter-balance">
                  Balance: {
                    selectedToken.token === 'usdx' && selectedToken.chain === 'solana'
                      ? solanaUsdxBalance.toFixed(2)
                      : selectedToken.token === 'usdx'
                        ? (usdxBalance ? formatUnits(usdxBalance as bigint, 6) : '0')
                        : (eurxBalance ? formatUnits(eurxBalance as bigint, 6) : '0')
                  } {selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}
                </span>
              </div>
              <div className="jupiter-token-input-row">
                <div className="jupiter-token-info" onClick={() => setTokenSelectorOpen(!tokenSelectorOpen)} style={{cursor: 'pointer'}}>
                  <div className="jupiter-token-icon">
                    <img
                      src={selectedToken.token === 'usdx' ? '/usdx-icon-black.png' : '/usdx-icon-black.png'}
                      alt={selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}
                      className="jupiter-token-logo"
                    />
                  </div>
                  <div className="jupiter-token-details">
                    <span className="jupiter-token-symbol">
                      {selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}
                    </span>
                    <span className="jupiter-token-name">
                      {selectedToken.token === 'usdx' ? 'USDX Token' : 'EURX Token'}
                      {selectedToken.chain === 'solana' && ' (Solana)'}
                      {selectedToken.chain === 'base' && ' (Base)'}
                    </span>
                  </div>
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{marginLeft: '8px'}}>
                    <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="jupiter-input-section">
                  <input
                    type="number"
                    value={outputAmount}
                    placeholder="0.00"
                    className="jupiter-amount-input"
                    disabled
                  />
                </div>
              </div>

              {/* Token Selector Dropdown */}
              {tokenSelectorOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
                  right: '0',
                  background: '#ffffff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '12px',
                  marginTop: '8px',
                  padding: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 1000,
                }}>
                  <div
                    onClick={() => { setSelectedToken({ token: 'usdx', chain: 'base' }); setTokenSelectorOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedToken.token === 'usdx' && selectedToken.chain === 'base' ? '#f5f1e8' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f1e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedToken.token === 'usdx' && selectedToken.chain === 'base' ? '#f5f1e8' : 'transparent'}
                  >
                    <img src="/usdx-icon-black.png" alt="USDX" style={{width: '32px', height: '32px'}} />
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '600', fontSize: '14px'}}>USDX</div>
                      <div style={{fontSize: '12px', color: '#666'}}>Base</div>
                    </div>
                    <div style={{fontSize: '12px', color: '#666'}}>1.00 USD : 1.00 USDX</div>
                  </div>
                  <div
                    onClick={() => { setSelectedToken({ token: 'usdx', chain: 'solana' }); setTokenSelectorOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedToken.token === 'usdx' && selectedToken.chain === 'solana' ? '#f5f1e8' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f1e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedToken.token === 'usdx' && selectedToken.chain === 'solana' ? '#f5f1e8' : 'transparent'}
                  >
                    <img src="/usdx-icon-black.png" alt="USDX Solana" style={{width: '32px', height: '32px'}} />
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '600', fontSize: '14px'}}>USDX</div>
                      <div style={{fontSize: '12px', color: '#666'}}>Solana</div>
                    </div>
                    <div style={{fontSize: '12px', color: '#666'}}>1.00 USD : 1.00 USDX</div>
                  </div>
                  <div
                    onClick={() => { setSelectedToken({ token: 'eurx', chain: 'base' }); setTokenSelectorOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedToken.token === 'eurx' ? '#f5f1e8' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f1e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedToken.token === 'eurx' ? '#f5f1e8' : 'transparent'}
                  >
                    <img src="/usdx-icon-black.png" alt="EURX" style={{width: '32px', height: '32px'}} />
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '600', fontSize: '14px'}}>EURX</div>
                      <div style={{fontSize: '12px', color: '#666'}}>Base</div>
                    </div>
                    <div style={{fontSize: '12px', color: '#666', position: 'relative'}}>
                      1.00 USD : {usdToEurRate.toFixed(2)} EURX
                      <a
                        href="https://data.chain.link/feeds/base/base/eur-usd"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-12px',
                          color: '#666',
                          textDecoration: 'none',
                          fontSize: '8px',
                        }}
                        title="Live rate from Chainlink price feed"
                      >
                        ⓘ
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Connect/Action Button */}
            {needsApproval ? (
              <button
                className="jupiter-connect-btn approve"
                onClick={handleApprove}
                disabled={isPending || isConfirming}
              >
                {isPending || isConfirming ? 'Approving...' : 'Approve USDC'}
              </button>
            ) : (
              <button
                className="jupiter-connect-btn"
                onClick={handleSwap}
                disabled={!canSwap || isPending || isConfirming || isLoading}
              >
                {isPending || isConfirming || isLoading ? 'Swapping...' : 'Swap'}
              </button>
            )}

            {/* Error/Success Messages */}
            {inputAmount && Number(inputAmount) > 0 && Number(inputAmount) < minDeposit && (
              <div className="jupiter-error-message">
                Minimum deposit is {minDeposit} USDC
              </div>
            )}

            {writeError && (
              <div className="jupiter-error-message">
                Error: {writeError.message}
              </div>
            )}

            {isConfirmed && lastTransactionType === 'swap' && selectedToken.chain !== 'solana' && (
              <div className="jupiter-success-message">
                Swap completed successfully!
              </div>
            )}

            {solanaSwapSuccess && selectedToken.chain === 'solana' && (
              <div className="jupiter-success-message">
                Swap completed successfully!{' '}
                <a
                  href={`https://solscan.io/tx/${solanaSwapSuccess}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#d4af37', textDecoration: 'underline', marginLeft: '8px' }}
                  onClick={() => setSolanaSwapSuccess(null)}
                >
                  View on Solscan →
                </a>
              </div>
            )}

            {/* Token Information Row */}
            <div className="jupiter-token-info-row">
              <div className="jupiter-token-stats selling-stats">
                <div className="jupiter-token-icon-large">
                  <img
                    src="https://wsrv.nl/?w=48&h=48&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                    alt="USDC"
                    className="jupiter-token-logo-large"
                  />
                </div>
                <div className="jupiter-token-meta">
                  <div className="jupiter-token-symbol-large">USDC</div>
                  <div className="jupiter-token-address">
                    {selectedToken.chain === 'solana'
                      ? `${SOLANA_CONTRACTS.USDC_MINT.slice(0, 6)}...${SOLANA_CONTRACTS.USDC_MINT.slice(-4)}`
                      : `${USDC_ADDRESS.slice(0, 6)}...${USDC_ADDRESS.slice(-4)}`}
                  </div>
                  <div className="jupiter-token-price">$1.00</div>
                  <div className="jupiter-token-change positive">+0.00%</div>
                </div>
              </div>

              <div className="jupiter-token-stats buying-stats">
                <div className="jupiter-token-icon-large">
                  <img
                    src="/usdx-icon-black.png"
                    alt={selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}
                    className="jupiter-token-logo-large"
                  />
                </div>
                <div className="jupiter-token-meta">
                  <div className="jupiter-token-symbol-large">{selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}</div>
                  <div className="jupiter-token-address">
                    {selectedToken.token === 'usdx' && selectedToken.chain === 'solana'
                      ? `${SOLANA_CONTRACTS.USDX_MINT.slice(0, 6)}...${SOLANA_CONTRACTS.USDX_MINT.slice(-4)}`
                      : selectedToken.token === 'usdx'
                        ? `${CONTRACTS.USDX_TOKEN.slice(0, 6)}...${CONTRACTS.USDX_TOKEN.slice(-4)}`
                        : `${EURX_TOKEN_ADDRESS.slice(0, 6)}...${EURX_TOKEN_ADDRESS.slice(-4)}`}
                  </div>
                  <div className="jupiter-token-price">
                    {selectedToken.token === 'usdx' ? '$1.00' : `$${eurUsdRate.toFixed(2)}`}
                  </div>
                  <div className={`jupiter-token-change ${
                    selectedToken.token === 'usdx'
                      ? 'neutral'
                      : priceChangeData
                        ? (priceChangeData.change_24h_percent >= 0 ? 'positive' : 'negative')
                        : 'neutral'
                  }`}>
                    {selectedToken.token === 'usdx'
                      ? '+0.00%'
                      : priceChangeData
                        ? `${priceChangeData.change_24h_percent >= 0 ? '+' : ''}${priceChangeData.change_24h_percent.toFixed(2)}%`
                        : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Pool Information */}
            <div className="jupiter-pool-info">
              <h3>Pool Information ({selectedToken.token === 'usdx' ? 'USDX' : 'EURX'}{selectedToken.chain === 'solana' ? ' (Solana)' : ' (Base)'})</h3>
              <div className="jupiter-info-grid">
                {selectedToken.token === 'usdx' && selectedToken.chain === 'base' ? (
                  <>
                    <div className="jupiter-info-item">
                      <span>USDC Reserves:</span>
                      <span>{usdcReserves ? Number(formatUnits(usdcReserves as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} USDC</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>USDX Backed:</span>
                      <span>{totalUsdcBacked ? Number(formatUnits(totalUsdcBacked as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} USDX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Rate:</span>
                      <span>1 USDC = 0.995 USDX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Mint Fee:</span>
                      <span>0.5%</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Minimum Deposit:</span>
                      <span>100 USDC</span>
                    </div>
                  </>
                ) : selectedToken.token === 'usdx' && selectedToken.chain === 'solana' ? (
                  <>
                    <div className="jupiter-info-item">
                      <span>USDC Vault:</span>
                      <span>{solanaVaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>USDX Minted:</span>
                      <span>{solanaTotalSupply.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Rate:</span>
                      <span>1 USDC = 1 USDX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Deposit Fee:</span>
                      <span style={{fontSize: '12px'}}>1% (&lt;500k) • 0.5% (≥500k)</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Minimum Deposit:</span>
                      <span>100 USDC</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="jupiter-info-item">
                      <span>EURC Reserves:</span>
                      <span>{eurcReserves ? Number(formatUnits(eurcReserves as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} EURC</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>EURX Backed:</span>
                      <span>{totalEurxBacked ? Number(formatUnits(totalEurxBacked as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} EURX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Rate:</span>
                      <span>1 USDC = ~{(usdToEurRate * 0.995).toFixed(2)} EURX</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Mint Fee:</span>
                      <span>0.5%</span>
                    </div>
                    <div className="jupiter-info-item">
                      <span>Minimum Deposit:</span>
                      <span>100 USDC</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <CrossChainSwap />
        )}
      </div>

      {/* Token Info Box - Completely Separate Section */}
      {activeTab === 'same-chain' && (
        <div className="jupiter-swap-card" style={{ marginTop: '24px' }}>
          <div style={{
            padding: '24px',
            background: 'linear-gradient(135deg, #f5f1e8 0%, #faf8f3 100%)',
            borderRadius: '16px',
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#000000',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '0.5px',
            }}>
              Add {selectedToken.token === 'usdx' ? 'USDX' : 'EURX'} to Your Wallet
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#000000',
                  minWidth: '130px',
                }}>Contract Address</span>
                <button
                  onClick={() => {
                    let address: string;
                    if (selectedToken.token === 'usdx') {
                      address = selectedToken.chain === 'solana'
                        ? SOLANA_CONTRACTS.USDX_MINT
                        : CONTRACTS.USDX_TOKEN;
                    } else {
                      address = EURX_TOKEN_ADDRESS;
                    }
                    handleCopy(address, 'address');
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    background: copiedField === 'address' ? 'linear-gradient(135deg, #d4af37 0%, #f4e4a6 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)',
                    border: `2px solid ${copiedField === 'address' ? '#d4af37' : '#e0e0e0'}`,
                    borderRadius: '10px',
                    color: copiedField === 'address' ? '#000000' : '#666666',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    transition: 'all 0.2s ease',
                    boxShadow: copiedField === 'address' ? '0 2px 8px rgba(212, 175, 55, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)',
                  }}
                  onMouseEnter={(e) => {
                    if (copiedField !== 'address') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #faf8f3 0%, #ffffff 100%)';
                      e.currentTarget.style.borderColor = '#d4af37';
                      e.currentTarget.style.color = '#333333';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (copiedField !== 'address') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)';
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.color = '#666666';
                    }
                  }}
                >
                  {copiedField === 'address' ? '✓ Copied' : (() => {
                    let address: string;
                    if (selectedToken.token === 'usdx') {
                      address = selectedToken.chain === 'solana'
                        ? SOLANA_CONTRACTS.USDX_MINT
                        : CONTRACTS.USDX_TOKEN;
                    } else {
                      address = EURX_TOKEN_ADDRESS;
                    }
                    return `${address.slice(0, 8)}...${address.slice(-6)}`;
                  })()}
                </button>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#000000',
                  minWidth: '130px',
                }}>Symbol</span>
                <button
                  onClick={() => handleCopy(selectedToken.token === 'usdx' ? 'USDX' : 'EURX', 'symbol')}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    background: copiedField === 'symbol' ? 'linear-gradient(135deg, #d4af37 0%, #f4e4a6 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)',
                    border: `2px solid ${copiedField === 'symbol' ? '#d4af37' : '#e0e0e0'}`,
                    borderRadius: '10px',
                    color: copiedField === 'symbol' ? '#000000' : '#666666',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: copiedField === 'symbol' ? '0 2px 8px rgba(212, 175, 55, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)',
                  }}
                  onMouseEnter={(e) => {
                    if (copiedField !== 'symbol') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #faf8f3 0%, #ffffff 100%)';
                      e.currentTarget.style.borderColor = '#d4af37';
                      e.currentTarget.style.color = '#333333';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (copiedField !== 'symbol') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)';
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.color = '#666666';
                    }
                  }}
                >
                  {copiedField === 'symbol' ? '✓ Copied' : (selectedToken.token === 'usdx' ? 'USDX' : 'EURX')}
                </button>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#000000',
                  minWidth: '130px',
                }}>Decimals</span>
                <button
                  onClick={() => handleCopy('6', 'decimals')}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    background: copiedField === 'decimals' ? 'linear-gradient(135deg, #d4af37 0%, #f4e4a6 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)',
                    border: `2px solid ${copiedField === 'decimals' ? '#d4af37' : '#e0e0e0'}`,
                    borderRadius: '10px',
                    color: copiedField === 'decimals' ? '#000000' : '#666666',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: copiedField === 'decimals' ? '0 2px 8px rgba(212, 175, 55, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)',
                  }}
                  onMouseEnter={(e) => {
                    if (copiedField !== 'decimals') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #faf8f3 0%, #ffffff 100%)';
                      e.currentTarget.style.borderColor = '#d4af37';
                      e.currentTarget.style.color = '#333333';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (copiedField !== 'decimals') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)';
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.color = '#666666';
                    }
                  }}
                >
                  {copiedField === 'decimals' ? '✓ Copied' : '6'}
                </button>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#000000',
                  minWidth: '130px',
                }}>Network</span>
                <div style={{
                  flex: 1,
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #f5f1e8 0%, #faf8f3 100%)',
                  border: '2px solid #d4af37',
                  borderRadius: '10px',
                  color: '#333333',
                  fontSize: '13px',
                  fontWeight: '500',
                  textAlign: 'center',
                }}>
                  {selectedToken.chain === 'solana' ? 'Solana (Mainnet)' : 'Base (8453)'}
                </div>
              </div>
            </div>
            <div style={{
              marginTop: '18px',
              fontSize: '12px',
              color: '#666666',
              lineHeight: '1.6',
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              Click any field to copy. Use these details to manually add {selectedToken.token === 'usdx' ? 'USDX' : 'EURX'} to your wallet.
            </div>
          </div>
        </div>
      )}

      {/* Solana Bridge Instructions - Completely Separate Section */}
      {/* TODO: Re-enable when Wormhole automatic bridge is implemented
      {activeTab === 'cross-chain' && address && (
        <div className="jupiter-swap-card" style={{ marginTop: '24px' }}>
          <div style={{
            padding: '24px',
            background: 'linear-gradient(135deg, #f5f1e8 0%, #faf8f3 100%)',
            borderRadius: '16px',
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#000000',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '0.5px',
            }}>
              How Solana Bridge Works
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontSize: '14px',
              color: '#333333',
            }}>
              <div>
                <strong style={{ color: '#000000' }}>Step 1:</strong> Connect both wallets (Solana + Base)
              </div>
              <div>
                <strong style={{ color: '#000000' }}>Step 2:</strong> Enter amount and click "Bridge from Solana"
              </div>
              <div>
                <strong style={{ color: '#000000' }}>Step 3:</strong> Wormhole Portal opens in new tab
              </div>
              <div style={{
                padding: '12px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#000000' }}>
                  In the Wormhole Portal:
                </div>
                <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#333333' }}>
                  <li>Connect your Solana wallet</li>
                  <li style={{ marginTop: '4px' }}>
                    Set <strong>Target Address</strong> to:<br />
                    <code style={{
                      color: '#8b7355',
                      fontSize: '11px',
                      wordBreak: 'break-all',
                      background: '#f5f5f5',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}>
                      0xE58737841e269c78a3ec86D0b33445B631e5Fc70
                    </code>
                  </li>
                  <li style={{ marginTop: '4px' }}>
                    Set <strong>Payload (hex)</strong> to:<br />
                    <code style={{
                      color: '#8b7355',
                      fontSize: '11px',
                      wordBreak: 'break-all',
                      background: '#f5f5f5',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}>
                      {address}
                    </code>
                  </li>
                  <li style={{ marginTop: '4px' }}>Confirm the bridge transaction</li>
                </ol>
              </div>
              <div style={{
                padding: '12px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#000000' }}>
                  What Happens Automatically:
                </div>
                <ul style={{ margin: '0', paddingLeft: '20px', color: '#333333' }}>
                  <li>Wormhole delivers USDC to Base</li>
                  <li>Contract mints USDX for you</li>
                  <li>Contract swaps 20% fee (~$0.10) for ETH</li>
                  <li>You receive USDX + ETH on Base!</li>
                </ul>
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#333333' }}>
                  <strong>Time:</strong> 2-5 minutes<br />
                  <strong>Total Fees:</strong> ~$3 (Wormhole) + $0.10-$0.11 (Stable)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      */}
    </div>
  );
};

export default Swap;