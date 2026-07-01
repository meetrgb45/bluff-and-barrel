import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;

// HTTP server for health checks (keeps Render from sleeping)
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

// rooms: Map<gameId, Set<ws>>
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // Join a game room
      if (msg.type === 'join') {
        const roomId = String(msg.gameId);
        currentRoom = roomId;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        ws.send(JSON.stringify({ type: 'joined', gameId: roomId, peers: rooms.get(roomId).size }));
        return;
      }

      // Broadcast game event to all peers in the room
      if (msg.type === 'event' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        const payload = JSON.stringify({ type: 'event', data: msg.data });
        for (const peer of room) {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(payload);
          }
        }
        return;
      }

      // Notify room that state changed (triggers peers to re-poll)
      if (msg.type === 'stateChanged' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        const payload = JSON.stringify({ type: 'stateChanged', from: msg.from });
        for (const peer of room) {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(payload);
          }
        }
        return;
      }
    } catch {}
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`WS relay + health check running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
