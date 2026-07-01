import { WagmiProvider, useSwitchChain, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ZamaProvider } from '@zama-fhe/react-sdk';
import { web } from '@zama-fhe/sdk/web';
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi';
import { sepolia as sepoliaFhe, type FheChain } from '@zama-fhe/sdk/chains';
import { sepolia } from 'wagmi/chains';
import { config as wagmiConfig } from './lib/wagmi';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Roadmap from './pages/Roadmap';

const queryClient = new QueryClient();

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: 'https://relayer.testnet.zama.org',
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// ─── Network Guard ─────────────────────────────────────────────────────────
// Shown whenever a wallet is connected on the wrong network.
// Roadmap and Landing are public pages — no guard needed there.
function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  // Only block when wallet is connected AND on the wrong network
  // walletChainId is undefined when disconnected — pass through freely
  if (isConnected && walletChainId !== sepolia.id) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#120c08',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2 style={{ color: '#c9a84c', fontSize: '1.5rem', margin: 0 }}>
          Wrong Network
        </h2>
        <p style={{ color: '#8b7b5a', fontSize: '0.9rem', maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
          Bluff and Barrel runs on <strong style={{ color: '#fff7db' }}>Ethereum Sepolia</strong>.
          Your wallet is connected to a different network.
        </p>
        <button
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isPending}
          style={{
            background: isPending ? '#5a4a2a' : '#c9a84c',
            color: '#1a110d',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 2rem',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            cursor: isPending ? 'not-allowed' : 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          {isPending ? 'Switching...' : 'Switch to Ethereum Sepolia'}
        </button>
        <p style={{ color: '#5a4a3a', fontSize: '0.75rem', margin: 0 }}>
          Chain ID: 11155111
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <BrowserRouter>
            <NetworkGuard>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/lobby" element={<Lobby />} />
                <Route path="/roadmap" element={<Roadmap />} />
                <Route path="/game/:mode/:id" element={<GameRoom />} />
              </Routes>
            </NetworkGuard>
          </BrowserRouter>
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
