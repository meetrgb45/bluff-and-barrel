import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { getInstance } from '../lib/fhevm';
import { GAME_ADDRESS, GAME_ABI, DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI, CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';
import { gasFor } from '../lib/gas';

function getGameContract(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

export function useChallenge() {
  const { address } = usePublicClient() as any;
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const fhevmReady = useGameStore((s) => s.fhevmReady);
  const setRevealedCards = useGameStore((s) => s.setRevealedCards);
  const [resolving, setResolving] = useState(false);

  const resolveChallenge = useCallback(async () => {
    if (!publicClient || gameId === null || !fhevmReady || resolving) return;
    const instance = getInstance();
    if (!instance) return;

    setResolving(true);
    const { address: contractAddr, abi } = getGameContract(gameMode);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));

        // Step 1: Get challenge handle from contract
        const challengeHandle = await publicClient.readContract({
          address: contractAddr, abi, functionName: 'getPendingChallengeHandle', args: [BigInt(gameId)],
        }) as `0x${string}`;

        if (!challengeHandle || challengeHandle === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          setResolving(false); return;
        }

        // Step 2: Off-chain public decrypt via Zama KMS
        const results = await instance.publicDecrypt([challengeHandle]);
        const allValid = Boolean(results.clearValues[challengeHandle]);

        // Step 3: Submit proof on-chain
        await writeContractAsync({
          address: contractAddr, abi,
          functionName: 'publishChallengeResult',
          args: [BigInt(gameId), allValid, results.abiEncodedClearValues, results.decryptionProof],
          ...(await gasFor('publishChallengeResult', publicClient)),
        });

        // Also decrypt and reveal cards
        try {
          const revealHandles = await publicClient.readContract({
            address: contractAddr, abi, functionName: 'getRevealHandles', args: [BigInt(gameId)],
          }) as `0x${string}`[];

          if (revealHandles?.length) {
            const cardResults = await instance.publicDecrypt(revealHandles);
            const cards = revealHandles.map(h => Number(cardResults.clearValues[h]));
            await writeContractAsync({
              address: contractAddr, abi,
              functionName: 'publishCardReveal',
              args: [BigInt(gameId), cards, cardResults.abiEncodedClearValues, cardResults.decryptionProof],
              ...(await gasFor('publishCardReveal', publicClient)),
            });
            setRevealedCards(cards);
          }
        } catch (e) { console.warn('[challenge] card reveal failed:', e); }

        setResolving(false);
        return;
      } catch (e: any) {
        if (/User rejected|denied/i.test(e?.message || '')) { setResolving(false); return; }
        console.warn(`[challenge] attempt ${attempt + 1} failed:`, e?.message);
      }
    }
    setResolving(false);
  }, [publicClient, gameId, gameMode, fhevmReady, resolving, writeContractAsync, setRevealedCards]);

  return { resolveChallenge, resolving };
}
