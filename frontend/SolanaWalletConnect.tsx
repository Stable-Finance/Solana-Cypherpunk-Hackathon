import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface SolanaWalletConnectProps {
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const SolanaWalletConnect: React.FC<SolanaWalletConnectProps> = ({ onConnect, onDisconnect }) => {
  const { connected, publicKey } = useWallet();

  React.useEffect(() => {
    if (connected && publicKey && onConnect) {
      onConnect();
    } else if (!connected && onDisconnect) {
      onDisconnect();
    }
  }, [connected, publicKey, onConnect, onDisconnect]);

  return (
    <div className="solana-wallet-connect">
      <WalletMultiButton className="solana-wallet-button" />
      {connected && publicKey && (
        <div className="solana-wallet-info">
          <span className="solana-wallet-address">
            {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
          </span>
        </div>
      )}
    </div>
  );
};

export default SolanaWalletConnect;