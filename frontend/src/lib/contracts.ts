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

export const GAME_ADDRESS         = (import.meta.env.VITE_GAME_ADDRESS         || '0xF4605cCd9a48f46a4AfD9d976b70386DccFC40F7') as `0x${string}`;
export const DECK_ADDRESS         = (import.meta.env.VITE_DECK_ADDRESS         || '0xA34345bBA0AcB2fd69323B41d66902201C635102') as `0x${string}`;
export const REVOLVER_ADDRESS     = (import.meta.env.VITE_REVOLVER_ADDRESS     || '0x92be89Da8D869B2e57C4A0CA027b35735e9BF484') as `0x${string}`;
export const DEVIL_GAME_ADDRESS   = (import.meta.env.VITE_DEVIL_GAME_ADDRESS   || '0xc4069f5Bb67aB8f59F98AdBf2d3787b2Cf7201E6') as `0x${string}`;
export const DEVIL_DECK_ADDRESS   = (import.meta.env.VITE_DEVIL_DECK_ADDRESS   || '0x8E0603b91813a745f224858590a41F403e61CDf0') as `0x${string}`;
export const CHAOS_GAME_ADDRESS   = (import.meta.env.VITE_CHAOS_GAME_ADDRESS   || '0xe47942b6028Dc5F5f729b5Da5e07BD880be11b9A') as `0x${string}`;
export const CHAOS_DECK_ADDRESS   = (import.meta.env.VITE_CHAOS_DECK_ADDRESS   || '0x298a552447f1aCe190B545D16503126b41092131') as `0x${string}`;
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
