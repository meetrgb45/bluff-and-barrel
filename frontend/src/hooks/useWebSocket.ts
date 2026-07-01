import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const MAX_RECONNECT_DELAY = 10000;

export function useWebSocket() {
  const gameId = useGameStore((s) => s.gameId);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (gameId === null) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'join', gameId }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'stateChanged') {
          window.dispatchEvent(new Event('ws-state-changed'));
        }
      } catch {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Reconnect with exponential backoff
      const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_RECONNECT_DELAY);
      attemptsRef.current++;
      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { ws.close(); };
  }, [gameId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const notifyStateChanged = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stateChanged', from: 'me' }));
    }
  }, []);

  return { notifyStateChanged };
}
