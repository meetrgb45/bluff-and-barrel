import type { PublicClient } from 'viem';

// Eth Sepolia has standard gas estimation — no explicit limits needed.
// Just ensure maxFeePerGas is above current baseFee.
export async function gasFor(_fn: string, publicClient?: PublicClient): Promise<Record<string, bigint>> {
  if (!publicClient) return {};
  try {
    const block = await publicClient.getBlock();
    const baseFee = block.baseFeePerGas ?? 2_000_000_000n;
    return {
      maxFeePerGas: baseFee * 2n,
      maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei tip
    };
  } catch {
    return {};
  }
}

export async function getGasOverrides(publicClient?: PublicClient) { return gasFor('', publicClient); }
export const getHeavyGasOverrides = getGasOverrides;
