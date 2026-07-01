import { createConfig, http, fallback } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
];

export const config = createConfig({
  chains: [sepolia],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [sepolia.id]: fallback([
      http('https://ethereum-sepolia-rpc.publicnode.com'),
      http('https://rpc.sepolia.org'),
    ]),
  },
});
