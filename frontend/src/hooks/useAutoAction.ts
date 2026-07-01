import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../stores/gameStore';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
} from '../lib/contracts';
import { getGasOverrides } from '../lib/gas';

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

/**
 * Auto-acts when the turn timer expires:
 * - PlayerTurn (my turn): auto-play first unplayed card
 * - Challenging (I'm challenger): auto-resolve is already handled
 * - Spinning (I'm spinner): auto-pull trigger
 */
export function useAutoAction() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const state = useGameStore((s) => s.state);
  const players = useGameStore((s) => s.players);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const playedCards = useGameStore((s) => s.playedCards);
  const lastClaimant = useGameStore((s) => s.lastClaimant);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const autoActedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();

  // Reset auto-acted flag when turn/state changes
  useEffect(() => {
    autoActedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [state, currentTurnIndex]);

  // Set 30s timer for auto-action on MY turn
  useEffect(() => {
    if (!publicClient || gameId === null || !address) return;
    if (state !== 'PlayerTurn' || !isMyTurn) return;
    if (autoActedRef.current) return;

    timerRef.current = setTimeout(async () => {
      if (autoActedRef.current) return;
      autoActedRef.current = true;

      try {
        const gas = await getGasOverrides(publicClient);
        const { address: gameAddr, abi } = getContracts(gameMode);
        // Read fresh state to avoid stale closure
        const freshState = useGameStore.getState();
        const freshPlayedCards = freshState.playedCards;
        const freshLastClaimant = freshState.lastClaimant;
        const hasClaimToChallenge = freshLastClaimant && freshLastClaimant !== '0x0000000000000000000000000000000000000000' && freshLastClaimant.toLowerCase() !== address.toLowerCase();

        const maxCards = gameMode === 'chaos' ? 3 : 5;
        const unplayedIndex = Array.from({ length: maxCards }, (_, i) => i).find((i) => !freshPlayedCards.includes(i));

        if (unplayedIndex !== undefined) {
          console.log('[autoAction] timer expired, auto-playing card', unplayedIndex);
          if (gameMode === 'chaos') {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCard', args: [BigInt(gameId), unplayedIndex], ...gas });
          } else {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCards', args: [BigInt(gameId), [unplayedIndex]], ...gas });
          }
          markCardsPlayed([unplayedIndex]);
        } else if (hasClaimToChallenge) {
          console.log('[autoAction] timer expired, auto-calling liar');
          await writeContractAsync({ address: gameAddr, abi, functionName: 'callLiar', args: [BigInt(gameId)], ...gas });
        }
      } catch (e) {
        console.error('[autoAction] failed:', e);
      }
    }, 55000); // 55 seconds (contract has 30s but we give extra time for decrypt)

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, isMyTurn, gameId, address, publicClient, writeContractAsync, playedCards, lastClaimant, markCardsPlayed]);
}
