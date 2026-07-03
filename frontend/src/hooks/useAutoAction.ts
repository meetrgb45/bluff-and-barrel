import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../stores/gameStore';
import { wsNotify } from './useWebSocket';
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
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);

  const autoActedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealAbortRef = useRef<AbortController | null>(null);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  const isHost = players[0]?.addr?.toLowerCase() === address?.toLowerCase();

  // If the host (player[0]) got eliminated, the first alive player drives dealing instead.
  // dealNextPlayer on-chain only requires _isParticipant, not host.
  const firstAliveAddr = players.find(p =>
    p.alive && p.addr !== '0x0000000000000000000000000000000000000000'
  )?.addr?.toLowerCase();
  const isDealer = firstAliveAddr === address?.toLowerCase();

  // Reset auto-act flag on turn/state change
  useEffect(() => {
    autoActedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [state, currentTurnIndex]);

  // ─── Dealing: host drives dealNextPlayer, abort on state exit ────────────
  useEffect(() => {
    if (state !== 'Dealing') {
      dealAbortRef.current?.abort();
      return;
    }
    if (!publicClient || gameId === null || !address || !isDealer) return;

    const ctrl = new AbortController();
    dealAbortRef.current = ctrl;

    const driveDealing = async () => {
      // Wait until spin overlay is dismissed before starting deal txs
      // This preserves the drama — player must see click/bang before dealing begins
      while (useGameStore.getState().spinOverlayActive) {
        if (ctrl.signal.aborted) return;
        await new Promise(r => setTimeout(r, 300));
      }
      if (ctrl.signal.aborted) return;
      const { address: gameAddr, abi } = getContracts(gameMode);
      const { address: deckAddr, abi: deckAbi } = getDeckContracts(gameMode);
      const rid = BigInt(gameId) * 100n + BigInt(round);

      for (let i = 0; i < 3; i++) {
        if (ctrl.signal.aborted) return;
        if (useGameStore.getState().state !== 'Dealing') return;

        try {
          // Check on-chain whether next player is still needed
          const [nextPlayerIndex, active] = await publicClient.readContract({
            address: deckAddr, abi: deckAbi,
            functionName: 'getDealState',
            args: [rid],
          }) as [number, boolean];

          if (!active) return; // all dealt

          if (ctrl.signal.aborted) return;

          const hash = await writeContractAsync({
            address: gameAddr, abi,
            functionName: 'dealNextPlayer',
            args: [BigInt(gameId)],
          });

          wsNotify();

          // Wait for confirmation before dealing the next player
          await publicClient.waitForTransactionReceipt({ hash });

          if (ctrl.signal.aborted) return;

        } catch (e: any) {
          if (ctrl.signal.aborted) return;
          if (/User rejected|denied/i.test(e?.message || '')) return;
          console.warn(`[autoAction] dealNextPlayer ${i + 1} failed:`, e?.message);
          // Brief backoff before retry
          await new Promise(r => setTimeout(r, 2000));
          if (ctrl.signal.aborted) return;
          // Retry once
          try {
            if (useGameStore.getState().state !== 'Dealing') return;
            const hash = await writeContractAsync({
              address: gameAddr, abi,
              functionName: 'dealNextPlayer',
              args: [BigInt(gameId)],
            });
            wsNotify();
            await publicClient.waitForTransactionReceipt({ hash });
          } catch { return; }
        }
      }
    };

    driveDealing();
    return () => ctrl.abort();
  }, [state, gameId, gameMode, round, address, isHost, publicClient, writeContractAsync]);

  // ─── PlayerTurn timeout: auto-play after 55s ─────────────────────────────
  useEffect(() => {
    if (!publicClient || gameId === null || !address) return;
    if (state !== 'PlayerTurn' || !isMyTurn) return;
    if (autoActedRef.current) return;

    timerRef.current = setTimeout(async () => {
      if (autoActedRef.current) return;
      autoActedRef.current = true;

      try {
        const { address: gameAddr, abi } = getContracts(gameMode);
        // Read fresh from store inside callback — avoids stale closure
        const freshState = useGameStore.getState();
        const freshPlayedCards = freshState.playedCards;
        const freshLastClaimant = freshState.lastClaimant;
        const hasClaimToChallenge = freshLastClaimant &&
          freshLastClaimant !== '0x0000000000000000000000000000000000000000' &&
          freshLastClaimant.toLowerCase() !== address.toLowerCase();

        const maxCards = gameMode === 'chaos' ? 3 : 5;
        const unplayedIndex = Array.from({ length: maxCards }, (_, i) => i)
          .find(i => !freshPlayedCards.includes(i));

        if (unplayedIndex !== undefined) {
          if (gameMode === 'chaos') {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCard', args: [BigInt(gameId), unplayedIndex] });
          } else {
            await writeContractAsync({ address: gameAddr, abi, functionName: 'playCards', args: [BigInt(gameId), [unplayedIndex]] });
          }
          wsNotify();
          markCardsPlayed([unplayedIndex]);
        } else if (hasClaimToChallenge) {
          await writeContractAsync({ address: gameAddr, abi, functionName: 'callLiar', args: [BigInt(gameId)] });
          wsNotify();
        }
      } catch (e) {
        console.error('[autoAction] failed:', e);
      }
    }, 55000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // playedCards and lastClaimant intentionally NOT in deps — read fresh from store inside callback
  }, [state, isMyTurn, gameId, address, publicClient, writeContractAsync, markCardsPlayed, gameMode]);
}
