// Zama fhEVM on Ethereum Sepolia uses standard EVM gas estimation.
// Do NOT pass manual gas overrides — the Zama RPC rejects transactions
// where the estimated gas limit exceeds its HCU (Homomorphic Computation Unit) cap.
// Let wagmi/MetaMask estimate gas naturally for all FHE operations.

export async function gasFor(_fn?: string, _publicClient?: unknown): Promise<Record<string, never>> {
  return {};
}

export const getGasOverrides = gasFor;
export const getHeavyGasOverrides = gasFor;
