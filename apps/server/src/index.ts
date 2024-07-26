import { createServer } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyToken } from './auth.js';
import { loadConfig } from './config.js';
import { handleConnection } from './connection.js';
import { createHttpHandler } from './http.js';
import { log, setLogLevel } from './log.js';
import { RoomManager } from './rooms.js';
import { PrismaBoardStore } from './store.js';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);

const prisma = new PrismaClient();
const store = new PrismaBoardStore(prisma);
const rooms = new RoomManager(store, config.EVENT_REPLAY_LIMIT);

const server = createServer(createHttpHandler(config, store));
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

const alive = new WeakMap<WebSocket, boolean>();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  // Browsers can't set headers on a WebSocket handshake, so the token rides
  // in the query string.
  const user = verifyToken(url.searchParams.get('token') ?? '', config.JWT_SECRET);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    handleConnection(ws, user, rooms, store);
  });
});

// Drop sockets that stopped answering pings (laptop lid closed, network gone)
// so their presence entry doesn't linger.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 15_000);

server.listen(config.PORT, () => {
  log.info('listening', { port: config.PORT });
});

async function shutdown(signal: string) {
  log.info('shutting down', { signal });
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
