import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ZamaProvider } from '@zama-fhe/react-sdk';
import { web } from '@zama-fhe/sdk/web';
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi';
import { sepolia as sepoliaFhe, type FheChain } from '@zama-fhe/sdk/chains';
import { config as wagmiConfig } from './lib/wagmi';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Roadmap from './pages/Roadmap';

const queryClient = new QueryClient();

// Zama Sepolia FHE chain — relayer URL from docs.zama.org contract addresses page
const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: 'https://relayer.testnet.zama.org',
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/lobby" element={<Lobby />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/game/:mode/:id" element={<GameRoom />} />
            </Routes>
          </BrowserRouter>
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
