import { create } from 'zustand';

export type GameState = 'WaitingForPlayers' | 'Dealing' | 'PlayerTurn' | 'Challenging' | 'Spinning' | 'MultiSpinning' | 'Targeting' | 'MultiTargeting' | 'Shooting' | 'GameOver';

const BASIC_STATE_MAP: GameState[] = ['WaitingForPlayers', 'Dealing', 'PlayerTurn', 'Challenging', 'Spinning', 'GameOver'];
const DEVIL_STATE_MAP: GameState[] = ['WaitingForPlayers', 'Dealing', 'PlayerTurn', 'Challenging', 'Spinning', 'MultiSpinning', 'GameOver'];
const CHAOS_STATE_MAP: GameState[] = ['WaitingForPlayers', 'Dealing', 'PlayerTurn', 'Challenging', 'Targeting', 'MultiTargeting', 'Shooting', 'GameOver'];

export function getStateMap(mode: string): GameState[] {
  if (mode === 'devil') return DEVIL_STATE_MAP;
  if (mode === 'chaos') return CHAOS_STATE_MAP;
  return BASIC_STATE_MAP;
}

export interface PlayerInfo {
  addr: string;
  alive: boolean;
  points: number;
  usedExecute: boolean;
  usedDoubleSpin: boolean;
  characterId: number;
}

interface GameStore {
  gameId: number | null;
  gameMode: 'basic' | 'devil' | 'chaos';
  state: GameState;
  round: number;
  targetCard: number;
  currentTurnIndex: number;
  aliveCount: number;
  winner: string;
  players: PlayerInfo[];
  myHand: (number | null)[];
  playedCards: number[]; // indices of cards already played this round
  selectedCards: number[];
  lastClaimant: string;
  lastClaimCount: number;
  chamberPointer: number;
  chamberPointers: Record<string, number>;
  pendingSpinner: string;
  revealedCards: number[];
  myCharacter: number;
  stakeAmount: bigint; // index into CHARACTERS array
  // Actions
  setGameId: (id: number | null) => void;
  setGameMode: (mode: 'basic' | 'devil' | 'chaos') => void;
  setMyCharacter: (idx: number) => void;
  setStakeAmount: (amount: bigint) => void;
  setMyHand: (hand: (number | null)[]) => void;
  toggleCard: (index: number) => void;
  clearSelection: () => void;
  markCardsPlayed: (indices: number[]) => void;
  resetPlayedCards: () => void;
  updateFromChain: (data: { state: number; round: number; targetCard: number; currentTurnIndex: number; aliveCount: number; winner: string }) => void;
  setPlayers: (players: PlayerInfo[]) => void;
  setLastClaim: (claimant: string, count: number) => void;
  setChamberPointer: (ptr: number) => void;
  setChamberPointers: (pointers: Record<string, number>) => void;
  setPendingSpinner: (addr: string) => void;
  setRevealedCards: (cards: number[]) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  gameMode: 'basic',
  state: 'WaitingForPlayers',
  round: 0,
  targetCard: 0,
  currentTurnIndex: 0,
  aliveCount: 0,
  winner: '',
  players: [],
  myHand: [null, null, null, null, null],
  playedCards: [],
  selectedCards: [],
  lastClaimant: '',
  lastClaimCount: 0,
  chamberPointer: 0,
  chamberPointers: {},
  pendingSpinner: '',
  revealedCards: [],
  myCharacter: 0,
  stakeAmount: 0n,
  setGameId: (id) => set({ gameId: id }),
  setGameMode: (mode) => set({ gameMode: mode }),
  setMyCharacter: (idx) => set({ myCharacter: idx }),
  setStakeAmount: (amount) => set({ stakeAmount: amount }),
  setMyHand: (hand) => set({ myHand: hand }),
  toggleCard: (index) => set((s) => {
    if (s.playedCards.includes(index)) return s;
    if (s.state !== 'PlayerTurn') return s;
    const maxSelect = s.gameMode === 'chaos' ? 1 : 3;
    const sel = s.selectedCards.includes(index)
      ? s.selectedCards.filter((i) => i !== index)
      : s.selectedCards.length < maxSelect ? [...s.selectedCards, index] : s.selectedCards;
    return { selectedCards: sel };
  }),
  clearSelection: () => set({ selectedCards: [] }),
  markCardsPlayed: (indices) => set((s) => ({ playedCards: [...s.playedCards, ...indices], selectedCards: [] })),
  resetPlayedCards: () => set((s) => ({ playedCards: [], selectedCards: [], myHand: Array(s.gameMode === 'chaos' ? 3 : 5).fill(null), revealedCards: [] })),
  updateFromChain: (data) => set((s) => {
    const newState = getStateMap(s.gameMode)[Number(data.state)] ?? 'WaitingForPlayers';
    const clearReveal = newState === 'PlayerTurn' || newState === 'Dealing';
    return {
      state: newState,
      round: data.round,
      targetCard: data.targetCard,
      currentTurnIndex: data.currentTurnIndex,
      aliveCount: data.aliveCount,
      winner: data.winner,
      // Clear stale revealed cards whenever we enter a non-challenge/spin state
      ...(clearReveal ? { revealedCards: [] } : {}),
    };
  }),
  setPlayers: (players) => set({ players }),
  setLastClaim: (claimant, count) => set({ lastClaimant: claimant, lastClaimCount: count }),
  setChamberPointer: (ptr) => set({ chamberPointer: ptr }),
  setChamberPointers: (pointers) => set({ chamberPointers: pointers }),
  setPendingSpinner: (addr) => set({ pendingSpinner: addr }),
  setRevealedCards: (cards) => set({ revealedCards: cards }),
}));
