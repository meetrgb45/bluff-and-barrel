import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { usePublicClient } from 'wagmi';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
} from '../../lib/contracts';

function getContracts(mode: string) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

const FALLBACK_TIMEOUT = 300; // match contract TURN_TIMEOUT (300s recommended)

export default function Timer() {
  const state = useGameStore((s) => s.state);
  const gameId = useGameStore((s) => s.gameId);
  const gameMode = useGameStore((s) => s.gameMode);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const publicClient = usePublicClient();

  const [timeLeft, setTimeLeft] = useState(FALLBACK_TIMEOUT);
  const deadlineRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch actual deadline from chain on every state/turn change
  useEffect(() => {
    if (!publicClient || gameId === null) return;
    if (state === 'WaitingForPlayers' || state === 'GameOver' || state === 'Dealing') return;

    const { address, abi } = getContracts(gameMode);
    publicClient.readContract({
      address, abi, functionName: 'getTurnDeadline', args: [BigInt(gameId)],
    }).then((deadline) => {
      const deadlineSec = Number(deadline as bigint);
      deadlineRef.current = deadlineSec;
      const now = Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, deadlineSec - now));
    }).catch(() => {
      setTimeLeft(FALLBACK_TIMEOUT);
    });
  }, [state, currentTurnIndex, gameId, gameMode, publicClient]);

  // Count down from the synced deadline
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (state === 'WaitingForPlayers' || state === 'GameOver' || state === 'Dealing') return;

    intervalRef.current = setInterval(() => {
      if (deadlineRef.current > 0) {
        const now = Math.floor(Date.now() / 1000);
        setTimeLeft(Math.max(0, deadlineRef.current - now));
      } else {
        setTimeLeft((t) => Math.max(0, t - 1));
      }
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state, currentTurnIndex]);

  if (state === 'WaitingForPlayers' || state === 'GameOver' || state === 'Dealing') return null;

  const total = FALLBACK_TIMEOUT;
  const pct = Math.min(100, (timeLeft / total) * 100);
  const isLow = timeLeft <= 30;
  const isCritical = timeLeft <= 10;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: 80, height: 6, background: '#2a1a0a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          transition: 'width 1s linear, background 0.5s',
          width: `${pct}%`,
          background: isCritical ? '#e94560' : isLow ? '#f97316' : '#c9a84c',
        }} />
      </div>
      <span style={{
        fontSize: '0.85rem', fontFamily: 'monospace',
        color: isCritical ? '#e94560' : isLow ? '#f97316' : '#8b7b5a',
        animation: isCritical ? 'pulse 0.5s infinite' : 'none',
      }}>
        {timeLeft}s
      </span>
    </div>
  );
}
