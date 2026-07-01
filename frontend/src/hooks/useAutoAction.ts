import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../stores/gameStore';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
  DECK_ADDRESS, DECK_ABI,
  DEVIL_DECK_ADDRESS, DEVIL_DECK_ABI,
  CHAOS_DECK_ADDRESS, CHAOS_DECK_ABI,
} from '../lib/contracts';

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

function getDeckContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_DECK_ADDRESS, abi: DEVIL_DECK_ABI };
  if (mode === 'chaos') return { address: CHAOS_DECK_ADDRESS, abi: CHAOS_DECK_ABI };
  return { address: DECK_ADDRESS, abi: DECK_ABI };
}

/**
 * Handles two auto-action scenarios:
 *
 * 1. DEALING state — sequentially calls dealNextPlayer until all players
 *    are dealt (3 calls after initDeal). Any participant can drive this.
 *    First player to detect Dealing state drives it; others skip if already in progress.
 *
 * 2. PlayerTurn timeout — auto-play first unplayed card after 55s.
 */
export function useAutoAction() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const state = useGameStore((s) => s.state);
  const round = useGameStore((s) => s.round);
  const players = useGameStore((s) => s.players);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const playedCards = useGameStore((s) => s.playedCards);
  const lastClaimant = useGameStore((s) => s.lastClaimant);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const autoActedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealingRef = useRef(false);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  const isParticipant = players.some(p => p.addr?.toLowerCase() === address?.toLowerCase());

  // Reset flags on state/turn change
  useEffect(() => {
    autoActedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [state, currentTurnIndex]);

  // ─── Dealing state: only host (player[0]) drives dealNextPlayer calls ──
  // Other players don't touch this — they just wait for state to move to PlayerTurn.
  // This eliminates the "5 popups per player" problem.
  const isHost = players[0]?.addr?.toLowerCase() === address?.toLowerCase();

  useEffect(() => {
    if (state !== 'Dealing') { dealingRef.current = false; return; }
    if (!publicClient || gameId === null || !address) return;
    if (!isHost) return; // only host drives dealing
    if (dealingRef.current) return;

    dealingRef.current = true;

    const driveDealing = async () => {
      const { address: gameAddr, abi } = getContracts(gameMode);
      const { address: deckAddr, abi: deckAbi } = getDeckContracts(gameMode);
      const rid = BigInt(gameId) * 100n + BigInt(round);

      for (let i = 0; i < 3; i++) {
        // Re-read fresh state — game may have already advanced
        if (useGameStore.getState().state !== 'Dealing') break;

        try {
          const [nextPlayerIndex, active] = await publicClient.readContract({
            address: deckAddr, abi: deckAbi,
            functionName: 'getDealState',
            args: [rid],
          }) as [number, boolean];

          if (!active) break; // all players already dealt

          await writeContractAsync({
            address: gameAddr, abi,
            functionName: 'dealNextPlayer',
            args: [BigInt(gameId)],
          });

          // Wait for chain to process before next call
          await new Promise(r => setTimeout(r, 3000));
        } catch (e: any) {
          if (/User rejected|denied/i.test(e?.message || '')) break;
          console.warn(`[autoAction] dealNextPlayer ${i + 1} failed:`, e?.message);
          await new Promise(r => setTimeout(r, 4000));
          // Retry once
          try {
            if (useGameStore.getState().state !== 'Dealing') break;
            await writeContractAsync({
              address: gameAddr, abi,
              functionName: 'dealNextPlayer',
              args: [BigInt(gameId)],
            });
            await new Promise(r => setTimeout(r, 3000));
          } catch { break; }
        }
      }
      dealingRef.current = false;
    };

    driveDealing();
  }, [state, gameId, gameMode, round, address, isHost, publicClient, writeContractAsync]);

  // ─── PlayerTurn timeout: auto-play after 55s ──────────────────────────
  useEffect(() => {
    if (!publicClient || gameId === null || !address) return;
    if (state !== 'PlayerTurn' || !isMyTurn) return;
    if (autoActedRef.current) return;

    timerRef.current = setTimeout(async () => {
      if (autoActedRef.current) return;
      autoActedRef.current = true;

      try {
        const { address: gameAddr, abi } = getContracts(gameMode);
        const freshState = useGameStore.getState();
        const freshPlayedCards = freshState.playedCards;
        const freshLastClaimant = freshState.lastClaimant;
        const hasClaimToChallenge = freshLastClaimant &&
          freshLastClaimant !== '0x0000000000000000000000000000000000000000' &&
          freshLastClaimant.toLowerCase() !== address.toLowerCase();

        const maxCards = gameMode === 'chaos' ? 3 : 5;
        const unplayedIndex = Array.from({ length: maxCards }, (_, i) => i)
          .find((i) => !freshPlayedCards.includes(i));

        if (unplayedIndex !== undefined) {
          console.log('[autoAction] timer expired, auto-playing card', unplayedIndex);
          if (gameMode === 'chaos') {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCard', args: [BigInt(gameId), unplayedIndex] });
          } else {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCards', args: [BigInt(gameId), [unplayedIndex]] });
          }
          markCardsPlayed([unplayedIndex]);
        } else if (hasClaimToChallenge) {
          console.log('[autoAction] timer expired, auto-calling liar');
          await writeContractAsync({ address: gameAddr, abi, functionName: 'callLiar', args: [BigInt(gameId)] });
        }
      } catch (e) {
        console.error('[autoAction] failed:', e);
      }
    }, 55000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, isMyTurn, gameId, address, publicClient, writeContractAsync, playedCards, lastClaimant, markCardsPlayed, gameMode]);
}
