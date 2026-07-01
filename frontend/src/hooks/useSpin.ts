import { useCallback, useState } from 'react';
import { usePublicClient, useWriteContract } from 'wagmi';
import { getInstance } from '../lib/fhevm';
import { GAME_ADDRESS, GAME_ABI, DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI, CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';
import { gasFor } from '../lib/gas';

export type SpinOutcome = 'click' | 'bang' | null;

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

export function useSpin() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const fhevmReady = useGameStore((s) => s.fhevmReady);
  const pendingSpinner = useGameStore((s) => s.pendingSpinner);
  const { address } = usePublicClient() as any;
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<SpinOutcome>(null);

  const isMySpinTurn = false; // determined by game state in GameRoom

  const resolveSpin = useCallback(async () => {
    if (!publicClient || gameId === null || !fhevmReady || spinning) return;
    const instance = getInstance();
    if (!instance) return;

    setSpinning(true);
    setOutcome(null);
    const { address: gameAddr, abi } = getContracts(gameMode);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));

        // Get spin result handle (marked publicly decryptable by contract)
        const spinHandle = await publicClient.readContract({
          address: gameAddr, abi, functionName: 'getPendingSpinHandle', args: [BigInt(gameId)],
        }) as `0x${string}`;

        if (!spinHandle || spinHandle === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          setSpinning(false); return;
        }

        // Off-chain public decrypt
        const results = await instance.publicDecrypt([spinHandle]);
        const fired = Boolean(results.clearValues[spinHandle]);

        // Submit proof on-chain
        await writeContractAsync({
          address: gameAddr, abi,
          functionName: 'publishSpinResult',
          args: [BigInt(gameId), fired, results.abiEncodedClearValues, results.decryptionProof],
          ...(await gasFor('publishSpinResult', publicClient)),
        });

        setOutcome(fired ? 'bang' : 'click');
        setSpinning(false);
        return;
      } catch (e: any) {
        if (/User rejected|denied/i.test(e?.message || '')) { setSpinning(false); return; }
        console.warn(`[spin] attempt ${attempt + 1} failed:`, e?.message);
      }
    }
    setSpinning(false);
  }, [publicClient, gameId, gameMode, fhevmReady, spinning, writeContractAsync]);

  const clearOutcome = useCallback(() => setOutcome(null), []);
  return { resolveSpin, spinning, outcome, clearOutcome, isMySpinTurn };
}
