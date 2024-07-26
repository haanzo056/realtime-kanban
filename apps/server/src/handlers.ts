import {
  applyOp,
  cardsInColumn,
  keyBetween,
  validateOp,
  type AppliedEvent,
  type BoardState,
  type Op,
} from '@kanban/shared';
import type { AuthUser } from './auth.js';
import type { Room } from './rooms.js';
import type { BoardStore } from './store.js';

export type OpResult =
  | { kind: 'applied'; event: AppliedEvent }
  | { kind: 'duplicate'; revision: number }
  | { kind: 'rejected'; reason: string };

export function handleOp(
  room: Room,
  store: BoardStore,
  actor: AuthUser,
  opId: string,
  op: Op,
): Promise<OpResult> {
  return room.enqueue(() => applyInRoom(room, store, actor, opId, op));
}

async function applyInRoom(
  room: Room,
  store: BoardStore,
  actor: AuthUser,
  opId: string,
  op: Op,
): Promise<OpResult> {
  // Clients resend pending ops after a reconnect, and some of those may have
  // been applied just before the socket dropped. Without this a retried
  // card.create came back as "card already exists" and the client rolled it
  // back, and a retried move/update got applied twice.
  const seen = room.revisionForOp(opId) ?? (await store.findRevisionByOpId(room.boardId, opId));
  if (seen !== null) return { kind: 'duplicate', revision: seen };

  const reason = validateOp(room.state, op);
  if (reason) return { kind: 'rejected', reason };

  const event: AppliedEvent = {
    revision: room.revision + 1,
    opId,
    actorId: actor.id,
    op: resolvePositionTie(room.state, op),
  };

  // Persist first. If the write fails the in-memory room stays at the old
  // revision and the client's op is rejected, so nobody sees a phantom change.
  try {
    await store.commit(room.boardId, event);
  } catch {
    return { kind: 'rejected', reason: 'write failed' };
  }

  room.state = applyOp(room.state, event.op);
  room.revision = event.revision;
  room.record(event);
  return { kind: 'applied', event };
}

// Two clients inserting into the same gap compute the same key from the same
// neighbours. Whoever lands second gets nudged just after the existing card;
// the event carries the adjusted position, so every client (including the
// author, once its pending op is replaced) converges on it.
export function resolvePositionTie(state: BoardState, op: Op): Op {
  let cardId: string;
  let columnId: string;
  let position: string;
  if (op.type === 'card.create') {
    ({ id: cardId, columnId, position } = op.card);
  } else if (op.type === 'card.move') {
    ({ id: cardId, columnId, position } = op);
  } else {
    return op;
  }

  const siblings = cardsInColumn(state, columnId).filter((c) => c.id !== cardId);
  const idx = siblings.findIndex((c) => c.position === position);
  if (idx === -1) return op;

  // Skip past any run of equal keys (shouldn't happen, but cheap to handle).
  let j = idx;
  while (siblings[j + 1]?.position === position) j++;
  const next = siblings[j + 1]?.position ?? null;
  const fixed = keyBetween(position, next);

  return op.type === 'card.create'
    ? { ...op, card: { ...op.card, position: fixed } }
    : { ...op, position: fixed };
}
