export const GAME_ADDRESS = (import.meta.env.VITE_GAME_ADDRESS || '0xF25Dd58FbA7137d6C304a727989C7E644eB2Fd35') as `0x${string}`;
export const DECK_ADDRESS = (import.meta.env.VITE_DECK_ADDRESS || '0x0A2732A99d157f255F1ae471f7F229466c0118B0') as `0x${string}`;
export const REVOLVER_ADDRESS = (import.meta.env.VITE_REVOLVER_ADDRESS || '0x4A815ecf4F76d64D7972827F76b42f97051b3910') as `0x${string}`;
export const DEVIL_GAME_ADDRESS = (import.meta.env.VITE_DEVIL_GAME_ADDRESS || '0x85bcE43026505DC48185C1e07E200BEa11667442') as `0x${string}`;
export const DEVIL_DECK_ADDRESS = (import.meta.env.VITE_DEVIL_DECK_ADDRESS || '0x4cD88c69d6cb0C7CDE8aF9c43f1035Fcc7E74818') as `0x${string}`;
export const CHAOS_GAME_ADDRESS = (import.meta.env.VITE_CHAOS_GAME_ADDRESS || '0x3C7b6B93E8fc5891A55AE683eD37A465Dc49cFDb') as `0x${string}`;
export const CHAOS_DECK_ADDRESS = (import.meta.env.VITE_CHAOS_DECK_ADDRESS || '0x0b1dBC98A1c8a77d031e689eCa606CB342D6ab11') as `0x${string}`;
export const USDC_ADDRESS = (import.meta.env.VITE_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as `0x${string}`;

// Zama: publishChallengeResult/publishSpinResult take (bool, bytes, bytes) instead of (uint256, uint256, bytes)
const BASE_GAME_ABI = [
  { type: 'function', name: 'createGame', inputs: [{ name: 'characterId', type: 'uint8' }, { name: 'stakeAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'joinGame', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'characterId', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'startGame', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'callLiar', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'publishChallengeResult', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'allValid', type: 'bool' }, { name: 'abiEncoded', type: 'bytes' }, { name: 'proof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'publishCardReveal', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'cardValues', type: 'uint8[]' }, { name: 'abiEncoded', type: 'bytes' }, { name: 'proof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'publishSpinResult', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'fired', type: 'bool' }, { name: 'abiEncoded', type: 'bytes' }, { name: 'proof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'forceTimeout', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'dealNextPlayer', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'nextGameId', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getGameState', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ name: 'state', type: 'uint8' }, { name: 'round', type: 'uint8' }, { name: 'targetCard', type: 'uint8' }, { name: 'currentTurnIndex', type: 'uint8' }, { name: 'aliveCount', type: 'uint8' }, { name: 'winner', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getPlayer', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'index', type: 'uint8' }], outputs: [{ name: 'addr', type: 'address' }, { name: 'alive', type: 'bool' }, { name: 'points', type: 'uint8' }, { name: 'usedExecute', type: 'bool' }, { name: 'usedDoubleSpin', type: 'bool' }, { name: 'characterId', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getLastClaim', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ name: 'claimant', type: 'address' }, { name: 'count', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getPendingSpinner', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getTurnDeadline', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getStakeAmount', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getPendingChallengeHandle', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'getPendingSpinHandle', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'getRevealHandles', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getRevealedCards', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'uint8[]' }], stateMutability: 'view' },
  { type: 'event', name: 'GameCreated', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'host', type: 'address', indexed: true }] },
  { type: 'event', name: 'PlayerJoined', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'index', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'GameStarted', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'RoundStarted', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'round', type: 'uint8', indexed: false }, { name: 'targetCard', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'CardsPlayed', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'count', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'LiarCalled', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'accuser', type: 'address', indexed: true }, { name: 'accused', type: 'address', indexed: true }] },
  { type: 'event', name: 'ChallengeResolved', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'lieConfirmed', type: 'bool', indexed: false }, { name: 'spinner', type: 'address', indexed: false }] },
  { type: 'event', name: 'SpinTriggered', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'isDoubleSpin', type: 'bool', indexed: false }] },
  { type: 'event', name: 'SpinResult', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'fired', type: 'bool', indexed: false }] },
  { type: 'event', name: 'PlayerEliminated', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'cause', type: 'string', indexed: false }] },
  { type: 'event', name: 'GameOver', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'winner', type: 'address', indexed: true }] },
  { type: 'event', name: 'CardsRevealed', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'cardValues', type: 'uint8[]', indexed: false }] },
] as const;

export const GAME_ABI = [
  ...BASE_GAME_ABI,
  { type: 'function', name: 'playCards', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'cardIndices', type: 'uint8[]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'useDoubleSpin', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'useExecute', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'publishDoubleSpinResult', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'fired', type: 'bool' }, { name: 'abiEncoded', type: 'bytes' }, { name: 'proof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'event', name: 'PointsUpdated', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'delta', type: 'int8', indexed: false }] },
  { type: 'event', name: 'ExecuteUsed', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'executor', type: 'address', indexed: true }, { name: 'target', type: 'address', indexed: true }] },
] as const;

export const DEVIL_GAME_ABI = [
  ...BASE_GAME_ABI,
  { type: 'function', name: 'playCards', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'cardIndices', type: 'uint8[]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getPendingSpinners', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getMultiSpinHandle', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'event', name: 'MultiSpinTriggered', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }] },
] as const;

export const CHAOS_GAME_ABI = [
  ...BASE_GAME_ABI,
  { type: 'function', name: 'playCard', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'cardIndex', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  // Chaos publishCardReveal takes single uint8 cardValue
  { type: 'function', name: 'publishCardReveal', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'cardValue', type: 'uint8' }, { name: 'abiEncoded', type: 'bytes' }, { name: 'proof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'chooseTarget', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'target', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'chooseTargetMulti', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'target', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getShooter', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getMultiShooters', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getPendingRevealHandle', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'event', name: 'CardRevealed', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'cardValue', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'TargetChosen', inputs: [{ name: 'gameId', type: 'uint256', indexed: true }, { name: 'shooter', type: 'address', indexed: true }, { name: 'target', type: 'address', indexed: true }] },
] as const;

export const DECK_ABI = [
  { type: 'function', name: 'getHandHashes', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'bytes32[5]' }], stateMutability: 'view' },
  { type: 'function', name: 'remainingCards', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

export const DEVIL_DECK_ABI = DECK_ABI;

export const CHAOS_DECK_ABI = [
  { type: 'function', name: 'getHandHashes', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'bytes32[3]' }], stateMutability: 'view' },
  { type: 'function', name: 'remainingCards', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

export const REVOLVER_ABI = [
  { type: 'function', name: 'getChamberPointer', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getPendingSpinHandle', inputs: [{ name: 'gameId', type: 'uint256' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
] as const;

export const USDC_ABI = [
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;
