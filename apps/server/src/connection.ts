import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { parseClientMessage, type ClientMessage, type ServerMessage } from '@kanban/shared';
import type { AuthUser } from './auth.js';
import { handleOp } from './handlers.js';
import { log } from './log.js';
import { presenceList } from './presence.js';
import type { Client, Room, RoomManager } from './rooms.js';
import type { BoardStore } from './store.js';

export function handleConnection(
  ws: WebSocket,
  user: AuthUser,
  rooms: RoomManager,
  store: BoardStore,
) {
  const client: Client = {
    id: randomUUID(),
    user,
    send(msg: ServerMessage) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };

  let room: Room | null = null;
  let lastCursorAt = 0;

  async function onHello(msg: Extract<ClientMessage, { t: 'hello' }>) {
    if (room) {
      // A second hello on the same socket is a resync request (client noticed
      // a revision gap). Answer from the room we're already in.
      sendCatchUp(room, msg.sinceRevision);
      return;
    }
    const joined = await rooms.join(msg.boardId, client);
    if (!joined) {
      client.send({ t: 'error', message: 'board not found' });
      ws.close(4404, 'board not found');
      return;
    }
    if (ws.readyState !== ws.OPEN) {
      // Socket died while the room was loading.
      rooms.leave(joined, client);
      return;
    }
    room = joined;
    sendCatchUp(room, msg.sinceRevision);
    room.broadcast({ t: 'presence', users: presenceList(room.clients) });
    log.debug('joined', { boardId: room.boardId, user: user.name, clientId: client.id });
  }

  function sendCatchUp(r: Room, since: number | undefined) {
    const events = since === undefined ? null : r.eventsSince(since);
    if (events) {
      client.send({ t: 'events', events });
    } else {
      client.send({ t: 'snapshot', board: r.snapshot() });
    }
  }

  async function onOp(msg: Extract<ClientMessage, { t: 'op' }>) {
    if (!room) return;
    const result = await handleOp(room, store, user, msg.opId, msg.op);
    switch (result.kind) {
      case 'applied':
        room.broadcast({ t: 'events', events: [result.event] });
        break;
      case 'duplicate':
        client.send({ t: 'ack', opId: msg.opId, revision: result.revision });
        break;
      case 'rejected':
        client.send({ t: 'reject', opId: msg.opId, reason: result.reason });
        break;
    }
  }

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      client.send({ t: 'error', message: 'invalid message' });
      return;
    }
    const run = async () => {
      switch (msg.t) {
        case 'hello':
          return onHello(msg);
        case 'op':
          return onOp(msg);
        case 'ping':
          return client.send({ t: 'pong' });
        case 'cursor': {
          // Clients throttle already; this just stops a misbehaving one from
          // flooding the room.
          const now = Date.now();
          if (!room || now - lastCursorAt < 30) return;
          lastCursorAt = now;
          room.broadcast({ t: 'cursor', connectionId: client.id, x: msg.x, y: msg.y }, client);
          return;
        }
      }
    };
    run().catch((err) => log.error('message handler failed', { err: String(err) }));
  });

  ws.on('close', () => {
    if (!room) return;
    const r = room;
    room = null;
    rooms.leave(r, client);
    r.broadcast({ t: 'presence', users: presenceList(r.clients) });
  });
}
