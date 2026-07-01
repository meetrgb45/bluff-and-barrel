import { useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useZamaSDK } from '@zama-fhe/react-sdk';
import { DECK_ADDRESS, DECK_ABI, DEVIL_DECK_ADDRESS, DEVIL_DECK_ABI, CHAOS_DECK_ADDRESS, CHAOS_DECK_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';

function getDeckContract(mode: string) {
  if (mode === 'devil') return { address: DEVIL_DECK_ADDRESS, abi: DEVIL_DECK_ABI };
  if (mode === 'chaos') return { address: CHAOS_DECK_ADDRESS, abi: CHAOS_DECK_ABI };
  return { address: DECK_ADDRESS, abi: DECK_ABI };
}

export function useMyHand() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const sdk = useZamaSDK();
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const round = useGameStore((s) => s.round);
  const setMyHand = useGameStore((s) => s.setMyHand);
  const fhevmReady = useGameStore((s) => s.fhevmReady);

  const decryptHand = useCallback(async () => {
    if (!address || !publicClient || gameId === null || !fhevmReady) return;

    const deckGameId = BigInt(gameId) * 100n + BigInt(round);
    const { address: deckAddr, abi: deckAbi } = getDeckContract(gameMode);

    try {
      // Step 1: fetch encrypted handles from contract
      const handles = await publicClient.readContract({
        address: deckAddr,
        abi: deckAbi,
        functionName: 'getHandHashes',
        args: [deckGameId, address],
      }) as `0x${string}`[];

      const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
      if (handles.every(h => h === ZERO)) return;

      // Step 2: decrypt using @zama-fhe/sdk — sdk.decryption.decryptValues handles
      // keypair generation, EIP-712, permit management, and caching automatically.
      // Batches all handles into one relayer call per contract.
      const inputs = handles
        .filter(h => h !== ZERO)
        .map(h => ({ encryptedValue: h, contractAddress: deckAddr }));

      if (inputs.length === 0) return;

      const result = await sdk.decryption.decryptValues(inputs);

      const hand: (number | null)[] = handles.map(h => {
        if (h === ZERO) return null;
        const val = result[h];
        return val !== undefined ? Number(val) : null;
      });

      setMyHand(hand);
    } catch (e) {
      console.error('[useMyHand] decrypt error:', e);
    }
  }, [address, publicClient, sdk, gameId, gameMode, round, fhevmReady, setMyHand]);

  return { decryptHand };
}
