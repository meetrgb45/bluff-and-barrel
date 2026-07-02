import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useDecryptPublicValues } from '@zama-fhe/react-sdk';
import { GAME_ADDRESS, GAME_ABI, DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI, CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';
import { gasFor } from '../lib/gas';
import { wsNotify } from './useWebSocket';

function getGameContract(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

export function useChallenge() {
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const setRevealedCards = useGameStore((s) => s.setRevealedCards);
  const [resolving, setResolving] = useState(false);

  // useDecryptPublicValues: mutation hook for publicly decryptable FHE values.
  // No wallet signature needed — values marked makePubliclyDecryptable() are open.
  const decryptPublicValues = useDecryptPublicValues();

  const resolveChallenge = useCallback(async () => {
    if (!publicClient || gameId === null || !isConnected || resolving) return;

    setResolving(true);
    const { address: contractAddr, abi } = getGameContract(gameMode);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));

        // Step 1: Get challenge handle from contract
        const challengeHandle = await publicClient.readContract({
          address: contractAddr, abi, functionName: 'getPendingChallengeHandle', args: [BigInt(gameId)],
        }) as `0x${string}`;

        const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
        if (!challengeHandle || challengeHandle === ZERO) { setResolving(false); return; }

        // Step 2: Public decrypt via @zama-fhe/react-sdk (no signature needed)
        const results = await decryptPublicValues.mutateAsync([challengeHandle]);
        const allValid = Boolean(results.clearValues[challengeHandle]);

        // Step 3: Submit proof on-chain
        await writeContractAsync({
          address: contractAddr, abi,
          functionName: 'publishChallengeResult',
          args: [BigInt(gameId), allValid, results.abiEncodedClearValues, results.decryptionProof],
          ...(await gasFor('publishChallengeResult', publicClient)),
        });
        wsNotify();

        // Step 4: Decrypt played cards client-side — no on-chain tx, purely for display.
        // revealHandles were set by callLiar (deck.revealCards → makePubliclyDecryptable).
        try {
          const handles = await publicClient.readContract({
            address: contractAddr, abi,
            functionName: 'getRevealHandles',
            args: [BigInt(gameId)],
          }) as `0x${string}`[];

          if (handles?.length) {
            const cardResults = await decryptPublicValues.mutateAsync(handles);
            const cards = handles.map(h => Number(cardResults.clearValues[h]));
            setRevealedCards(cards);
          }
        } catch (e) {
          console.warn('[challenge] card reveal decrypt failed (non-fatal):', e);
        }

        setResolving(false);
        return;
      } catch (e: any) {
        if (/User rejected|denied/i.test(e?.message || '')) { setResolving(false); return; }
        console.warn(`[challenge] attempt ${attempt + 1} failed:`, e?.message);
      }
    }
    setResolving(false);
  }, [publicClient, gameId, gameMode, isConnected, resolving, decryptPublicValues, writeContractAsync, setRevealedCards]);

  return { resolveChallenge, resolving };
}
