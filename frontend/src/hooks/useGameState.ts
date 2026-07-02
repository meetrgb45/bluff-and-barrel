import { useEffect, useRef } from 'react';
import { usePublicClient, useAccount } from 'wagmi';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
  REVOLVER_ADDRESS, REVOLVER_ABI,
} from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';
import { getStateMap } from '../stores/gameStore';

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

// Polling interval by game state — fast during active phases, slow when idle
function pollInterval(stateName: string): number {
  switch (stateName) {
    case 'Challenging':
    case 'Spinning':
    case 'MultiSpinning':
    case 'Shooting':
    case 'Targeting':
    case 'MultiTargeting':
      return 1500; // active resolution phases — poll fast
    case 'Dealing':
      return 2000; // dealing in progress
    case 'PlayerTurn':
      return 3000; // someone's turn
    case 'WaitingForPlayers':
      return 5000; // lobby — no hurry
    default:
      return 5000;
  }
}

export function useGameState() {
  const publicClient = usePublicClient();
  const { address: walletAddress } = useAccount();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const updateFromChain = useGameStore((s) => s.updateFromChain);
  const setPlayers = useGameStore((s) => s.setPlayers);
  const setLastClaim = useGameStore((s) => s.setLastClaim);
  const setPendingSpinner = useGameStore((s) => s.setPendingSpinner);
  const setStakeAmount = useGameStore((s) => s.setStakeAmount);
  const setChamberPointer = useGameStore((s) => s.setChamberPointer);
  const setChamberPointers = useGameStore((s) => s.setChamberPointers);

  const revealDispatchedRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIntervalMs = useRef<number>(5000);

  useEffect(() => {
    if (gameId === null || !publicClient) return;
    const { address: contractAddress, abi } = getContracts(gameMode);

    const poll = async () => {
      try {
        // All reads in parallel — single network round-trip
        const [
          gameStateRaw,
          playerResults,
          claimRaw,
          ptrRaw,
          spinnerRaw,
          stakeRaw,
        ] = await Promise.all([
          publicClient.readContract({ address: contractAddress, abi, functionName: 'getGameState', args: [BigInt(gameId)] }),
          Promise.all([0, 1, 2, 3].map(i =>
            publicClient.readContract({ address: contractAddress, abi, functionName: 'getPlayer', args: [BigInt(gameId), i] })
          )),
          publicClient.readContract({ address: contractAddress, abi, functionName: 'getLastClaim', args: [BigInt(gameId)] }),
          walletAddress
            ? publicClient.readContract({ address: REVOLVER_ADDRESS, abi: REVOLVER_ABI, functionName: 'getChamberPointer', args: [BigInt(gameId), walletAddress as `0x${string}`] }).catch(() => null)
            : Promise.resolve(null),
          gameMode !== 'chaos'
            ? publicClient.readContract({ address: contractAddress, abi, functionName: 'getPendingSpinner', args: [BigInt(gameId)] }).catch(() => null)
            : publicClient.readContract({ address: contractAddress, abi, functionName: 'getShooter', args: [BigInt(gameId)] }).catch(() => null),
          publicClient.readContract({ address: contractAddress, abi, functionName: 'getStakeAmount', args: [BigInt(gameId)] }).catch(() => null),
        ]);

        const [state, round, targetCard, currentTurnIndex, aliveCount, winner] = gameStateRaw as [number, number, number, number, number, string];
        updateFromChain({ state, round, targetCard, currentTurnIndex, aliveCount, winner });

        const players = (playerResults as any[][]).map(result => ({
          addr: result[0] as string,
          alive: result[1] as boolean,
          points: result.length > 3 ? Number(result[2]) : 0,
          usedExecute: result[3] ?? false,
          usedDoubleSpin: result[4] ?? false,
          characterId: Number(result[result.length - 1]) || 0,
        }));
        setPlayers(players);

        const [claimant, count] = claimRaw as [string, number];
        setLastClaim(claimant, gameMode === 'chaos' ? 1 : Number(count));

        if (ptrRaw !== null) setChamberPointer(Number(ptrRaw));
        if (spinnerRaw) setPendingSpinner(spinnerRaw as string);
        if (stakeRaw !== null) setStakeAmount(stakeRaw as bigint);

        // Fetch all players' chamber pointers in parallel (for opponent display)
        const validPlayers = players.filter(p => p.addr && p.addr !== '0x0000000000000000000000000000000000000000');
        const ptrResults = await Promise.all(
          validPlayers.map(p =>
            publicClient.readContract({
              address: REVOLVER_ADDRESS, abi: REVOLVER_ABI,
              functionName: 'getChamberPointer',
              args: [BigInt(gameId), p.addr as `0x${string}`],
            }).catch(() => 0)
          )
        );
        const pointers: Record<string, number> = {};
        validPlayers.forEach((p, i) => { pointers[p.addr.toLowerCase()] = Number(ptrResults[i]); });
        setChamberPointers(pointers);
        if (walletAddress && pointers[walletAddress.toLowerCase()] !== undefined) {
          setChamberPointer(pointers[walletAddress.toLowerCase()]);
        }

        // Adapt polling interval to current state
        const stateName = getStateMap(gameMode)[state] || 'WaitingForPlayers';
        const targetInterval = pollInterval(stateName);
        if (targetInterval !== currentIntervalMs.current) {
          currentIntervalMs.current = targetInterval;
          // Reschedule with new interval
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(poll, targetInterval);
        }

        // Card reveal dispatch for all players
        const revealKey = `${gameId}-${round}-${stateName}`;
        const isSpinState = stateName === 'Spinning' || stateName === 'MultiSpinning';
        // Dispatch during Challenging too — so non-accusers see cards at the same time as accuser
        const needsReveal = (isSpinState || stateName === 'Challenging') && gameMode !== 'chaos';
        if (needsReveal && revealDispatchedRef.current !== revealKey) {
          try {
            const handles = await publicClient.readContract({
              address: contractAddress, abi, functionName: 'getRevealHandles', args: [BigInt(gameId)],
            }) as `0x${string}`[];
            if (handles?.length) {
              revealDispatchedRef.current = revealKey;
              window.dispatchEvent(new CustomEvent('reveal-handles-ready', { detail: { handles } }));
            }
          } catch {}
        }
        if (stateName === 'PlayerTurn' || stateName === 'Dealing') {
          revealDispatchedRef.current = '';
        }

      } catch (e) { console.error('Poll error:', e); }
    };

    // Start polling
    poll();
    currentIntervalMs.current = 3000;
    intervalRef.current = setInterval(poll, 3000);

    // Immediate re-poll on any local tx or WS peer notification
    const onStateChanged = () => poll();
    window.addEventListener('state-changed', onStateChanged);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('state-changed', onStateChanged);
    };
  }, [gameId, gameMode, publicClient, walletAddress, updateFromChain, setPlayers, setLastClaim, setChamberPointer, setChamberPointers, setPendingSpinner, setStakeAmount]);
}
