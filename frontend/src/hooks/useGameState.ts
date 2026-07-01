import { useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
} from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';
import { getStateMap } from '../stores/gameStore';

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

export function useGameState() {
  const publicClient = usePublicClient();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const updateFromChain = useGameStore((s) => s.updateFromChain);
  const setPlayers = useGameStore((s) => s.setPlayers);
  const setLastClaim = useGameStore((s) => s.setLastClaim);
  const setPendingSpinner = useGameStore((s) => s.setPendingSpinner);
  const setStakeAmount = useGameStore((s) => s.setStakeAmount);

  useEffect(() => {
    if (gameId === null || !publicClient) return;
    const { address, abi } = getContracts(gameMode);

    const poll = async () => {
      try {
        const [state, round, targetCard, currentTurnIndex, aliveCount, winner] = await publicClient.readContract({
          address, abi, functionName: 'getGameState', args: [BigInt(gameId)],
        }) as [number, number, number, number, number, string];
        updateFromChain({ state, round, targetCard, currentTurnIndex, aliveCount, winner });

        // Clear revealedCards when entering a new challenge or new round
        const prevState = useGameStore.getState().state;
        const currentRound = useGameStore.getState().round;
        const newState = getStateMap(gameMode)[state] || 'WaitingForPlayers';
        if (newState === 'Challenging' && prevState !== 'Challenging') {
          useGameStore.getState().setRevealedCards([]);
        }
        if ((newState === 'Spinning' || newState === 'MultiSpinning' || newState === 'Targeting' || newState === 'Shooting') && prevState === 'Challenging') {
          useGameStore.getState().setRevealedCards([]);
        }
        if (Number(round) !== currentRound) {
          useGameStore.getState().setRevealedCards([]);
        }

        // Fetch players
        const players = await Promise.all([0, 1, 2, 3].map(async (i) => {
          const result = await publicClient.readContract({
            address, abi, functionName: 'getPlayer', args: [BigInt(gameId), i],
          }) as any[];
          // Basic mode returns 6 fields, devil/chaos return 3
          return {
            addr: result[0] as string,
            alive: result[1] as boolean,
            points: result[2] !== undefined && result.length > 3 ? Number(result[2]) : 0,
            usedExecute: result[3] ?? false,
            usedDoubleSpin: result[4] ?? false,
            characterId: Number(result[result.length - 1]) || 0,
          };
        }));
        setPlayers(players);

        // Last claim
        const [claimant, count] = await publicClient.readContract({
          address, abi, functionName: 'getLastClaim', args: [BigInt(gameId)],
        }) as [string, number];
        setLastClaim(claimant, gameMode === 'chaos' ? 1 : Number(count));

        // Pending spinner (basic/devil only)
        if (gameMode !== 'chaos') {
          try {
            const spinner = await publicClient.readContract({
              address, abi, functionName: 'getPendingSpinner', args: [BigInt(gameId)],
            }) as string;
            setPendingSpinner(spinner);
          } catch {}
        } else {
          // Chaos: read shooter
          try {
            const shooter = await publicClient.readContract({
              address, abi, functionName: 'getShooter', args: [BigInt(gameId)],
            }) as string;
            setPendingSpinner(shooter); // reuse pendingSpinner for shooter
          } catch {}
        }

        // Stake amount
        try {
          const stake = await publicClient.readContract({
            address, abi, functionName: 'getStakeAmount', args: [BigInt(gameId)],
          }) as bigint;
          setStakeAmount(stake);
        } catch {}

      } catch (e) { console.error('Poll error:', e); }
    };
    poll();
    const interval = setInterval(poll, 3000);
    const onWsChange = () => poll();
    window.addEventListener('ws-state-changed', onWsChange);
    return () => { clearInterval(interval); window.removeEventListener('ws-state-changed', onWsChange); };
  }, [gameId, gameMode, publicClient, updateFromChain, setPlayers, setLastClaim, setPendingSpinner]);
}
