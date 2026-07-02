import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const MAX_RECONNECT_DELAY = 10000;

/**
 * wsNotify: called after any local tx to trigger an immediate re-poll.
 * Works even with no WS server — fires a local event directly.
 * If WS is connected, also notifies peers so they re-poll too.
 */
let _wsRef: WebSocket | null = null;

export function wsNotify() {
  // Always fire locally immediately — don't wait for WS round-trip
  window.dispatchEvent(new Event('state-changed'));
  // Also notify peers if WS is up (best-effort, not required)
  if (_wsRef?.readyState === WebSocket.OPEN) {
    try { _wsRef.send(JSON.stringify({ type: 'stateChanged' })); } catch {}
  }
}

export function useWebSocket() {
  const gameId = useGameStore((s) => s.gameId);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (gameId === null) return;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        _wsRef = ws;

        ws.onopen = () => {
          attemptsRef.current = 0;
          ws.send(JSON.stringify({ type: 'join', gameId }));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            // Peer notified us — trigger a poll
            if (msg.type === 'stateChanged') {
              window.dispatchEvent(new Event('state-changed'));
            }
          } catch {}
        };

        ws.onclose = () => {
          wsRef.current = null;
          _wsRef = null;
          // Reconnect with backoff — but game still works without it
          const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_RECONNECT_DELAY);
          attemptsRef.current++;
          reconnectRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => ws.close();
      } catch {
        // WS server not available — that's fine, polling works standalone
      }
    };

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      _wsRef = null;
    };
  }, [gameId]);

  const notifyStateChanged = useCallback(() => wsNotify(), []);
  return { notifyStateChanged };
}
