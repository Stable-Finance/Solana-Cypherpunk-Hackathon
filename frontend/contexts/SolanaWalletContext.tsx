import React, { createContext, useContext, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles that can be overridden by your app
require('@solana/wallet-adapter-react-ui/styles.css');

interface SolanaWalletContextType {
  network: WalletAdapterNetwork;
  endpoint: string;
}

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(undefined);

export const useSolanaWallet = () => {
  const context = useContext(SolanaWalletContext);
  if (context === undefined) {
    throw new Error('useSolanaWallet must be used within a SolanaWalletProvider');
  }
  return context;
};

interface SolanaWalletProviderProps {
  children: ReactNode;
}

export const SolanaWalletProvider: React.FC<SolanaWalletProviderProps> = ({ children }) => {
  // Use mainnet for production, devnet for development
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = clusterApiUrl(network);

  // Initialize wallet adapters
  const wallets = [
    new PhantomWalletAdapter(),
  ];

  const contextValue: SolanaWalletContextType = {
    network,
    endpoint,
  };

  return (
    <SolanaWalletContext.Provider value={contextValue}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={true}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </SolanaWalletContext.Provider>
  );
};