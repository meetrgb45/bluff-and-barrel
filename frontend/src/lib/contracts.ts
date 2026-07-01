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

export const GAME_ADDRESS         = (import.meta.env.VITE_GAME_ADDRESS         || '0x6095B5f82E4C2c7a1462c58830E26380f52Ae2da') as `0x${string}`;
export const DECK_ADDRESS         = (import.meta.env.VITE_DECK_ADDRESS         || '0x26EaacD58C550562A15F8849D77952Fe4B90AdA3') as `0x${string}`;
export const REVOLVER_ADDRESS     = (import.meta.env.VITE_REVOLVER_ADDRESS     || '0xA3420AaC92888b2f8ee69af03c0943c2A0746192') as `0x${string}`;
export const DEVIL_GAME_ADDRESS   = (import.meta.env.VITE_DEVIL_GAME_ADDRESS   || '0x85bcE43026505DC48185C1e07E200BEa11667442') as `0x${string}`;
export const DEVIL_DECK_ADDRESS   = (import.meta.env.VITE_DEVIL_DECK_ADDRESS   || '0x4cD88c69d6cb0C7CDE8aF9c43f1035Fcc7E74818') as `0x${string}`;
export const CHAOS_GAME_ADDRESS   = (import.meta.env.VITE_CHAOS_GAME_ADDRESS   || '0x3C7b6B93E8fc5891A55AE683eD37A465Dc49cFDb') as `0x${string}`;
export const CHAOS_DECK_ADDRESS   = (import.meta.env.VITE_CHAOS_DECK_ADDRESS   || '0x0b1dBC98A1c8a77d031e689eCa606CB342D6ab11') as `0x${string}`;
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
