/**
 * contracts.ts
 *
 * ABIs are imported directly from compiled Hardhat artifacts.
 * Run `node contracts/scripts/copy-abis.js` after any contract change
 * to regenerate the JSON files in src/lib/abis/.
 *
 * Addresses come from .env — fall back to latest known deployment.
 */

// ─── Addresses ────────────────────────────────────────────────────────────────

export const GAME_ADDRESS         = (import.meta.env.VITE_GAME_ADDRESS         || '0x86B8216A3dc0eB74D66373eeF5E289d5f86574aE') as `0x${string}`;
export const DECK_ADDRESS         = (import.meta.env.VITE_DECK_ADDRESS         || '0x3cE4d64BA8aF772D7c37066979ac170109559B93') as `0x${string}`;
export const REVOLVER_ADDRESS     = (import.meta.env.VITE_REVOLVER_ADDRESS     || '0x05124ab1fE9a87DEcbDCCcA4Ee53569F390cA793') as `0x${string}`;
export const DEVIL_GAME_ADDRESS   = (import.meta.env.VITE_DEVIL_GAME_ADDRESS   || '0x5EE0fc1d9E960Cc6730b9EF8077Ce7Cd26645481') as `0x${string}`;
export const DEVIL_DECK_ADDRESS   = (import.meta.env.VITE_DEVIL_DECK_ADDRESS   || '0xd5ae9Fee299646823014Db68940c99d0236BF332') as `0x${string}`;
export const CHAOS_GAME_ADDRESS   = (import.meta.env.VITE_CHAOS_GAME_ADDRESS   || '0x3c071b3D5C7E2844bb3081605F6F772AA2A2e8aC') as `0x${string}`;
export const CHAOS_DECK_ADDRESS   = (import.meta.env.VITE_CHAOS_DECK_ADDRESS   || '0xB5ed3491f39FEb287931e7CC912601132Ed1A1ff') as `0x${string}`;
export const USDC_ADDRESS         = (import.meta.env.VITE_USDC_ADDRESS         || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as `0x${string}`;

// ─── ABIs (from compiled artifacts) ──────────────────────────────────────────

import LiarsBarGameArtifact      from './abis/LiarsBarGame.json';
import LiarsBarDeckArtifact      from './abis/LiarsBarDeck.json';
import LiarsBarRevolverArtifact  from './abis/LiarsBarRevolver.json';
import LiarsBarDevilGameArtifact from './abis/LiarsBarDevilGame.json';
import LiarsBarDevilDeckArtifact from './abis/LiarsBarDevilDeck.json';
import LiarsBarChaosGameArtifact from './abis/LiarsBarChaosGame.json';
import LiarsBarChaosDeckArtifact from './abis/LiarsBarChaosDeck.json';

export const GAME_ABI        = LiarsBarGameArtifact      as typeof LiarsBarGameArtifact;
export const DECK_ABI        = LiarsBarDeckArtifact      as typeof LiarsBarDeckArtifact;
export const REVOLVER_ABI    = LiarsBarRevolverArtifact  as typeof LiarsBarRevolverArtifact;
export const DEVIL_GAME_ABI  = LiarsBarDevilGameArtifact as typeof LiarsBarDevilGameArtifact;
export const DEVIL_DECK_ABI  = LiarsBarDevilDeckArtifact as typeof LiarsBarDevilDeckArtifact;
export const CHAOS_GAME_ABI  = LiarsBarChaosGameArtifact as typeof LiarsBarChaosGameArtifact;
export const CHAOS_DECK_ABI  = LiarsBarChaosDeckArtifact as typeof LiarsBarChaosDeckArtifact;

export const USDC_ABI = [
  { type: 'function', name: 'approve',   inputs: [{ name: 'spender', type: 'address' }, { name: 'amount',   type: 'uint256' }], outputs: [{ type: 'bool'    }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner',   type: 'address' }, { name: 'spender',  type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view'       },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }],                                        outputs: [{ type: 'uint256' }], stateMutability: 'view'       },
] as const;
