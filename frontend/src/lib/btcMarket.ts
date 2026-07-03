/**
 * btcMarket.ts
 * BtcMiniMarket contract integration — 1-minute UP/DOWN prediction market.
 * Direction is FHE-encrypted euint8 (1=UP, 0=DOWN).
 *
 * Deployed via: cd contracts && npx hardhat run scripts/deploy-btc-market.ts --network eth-sepolia
 */
import BtcMiniMarketArtifact from './abis/BtcMiniMarket.json';

export const BTC_MARKET_ABI = BtcMiniMarketArtifact as typeof BtcMiniMarketArtifact;

// Deployed address — set after running deploy-btc-market.ts
// Fallback to the old UpDown60 contract until new one is deployed
export const BTC_MARKET_ADDRESS = (
  import.meta.env.VITE_BTC_MINI_MARKET_ADDRESS ||
  '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const ROUND_SECONDS = 60;
export const STAKE_ETH     = 0.01;

export type RoundResult = 0 | 1 | 2 | 3; // 0=Pending, 1=UP, 2=DOWN, 3=TIE

export const RESULT_LABEL: Record<number, string> = {
  0: 'Pending',
  1: '▲ UP',
  2: '▼ DOWN',
  3: 'TIE',
};

export const RESULT_COLOR: Record<number, string> = {
  0: '#8b7b5a',
  1: '#15803d',
  2: '#b91c1c',
  3: '#c9a84c',
};

/** Fetch live BTC/USDT price from Binance public API */
export async function fetchBtcPrice(): Promise<number | null> {
  try {
    const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

export function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatEth(wei: bigint | number): string {
  const eth = Number(typeof wei === 'bigint' ? wei : BigInt(wei)) / 1e18;
  return eth.toFixed(4) + ' ETH';
}

export function timeUntilRoundEnd(endTime: number): string {
  const secs = endTime - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'Ended';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
