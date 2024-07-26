import { beforeEach, describe, expect, it } from 'vitest';
import type { Op } from '@kanban/shared';
import { handleOp, resolvePositionTie } from './handlers.js';
import { MemoryBoardStore } from './memoryStore.js';
import { RoomManager, type Client, type Room } from './rooms.js';

const alice = { id: 'u-alice', name: 'alice' };

function fakeClient(): Client {
  return { id: 'conn-1', user: alice, send: () => {} };
}

const createCard = (id: string, position = 'V'): Op => ({
  type: 'card.create',
  card: { id, columnId: 'todo', title: id, description: '', position },
});

describe('handleOp', () => {
  let store: MemoryBoardStore;
  let room: Room;

  beforeEach(async () => {
    store = new MemoryBoardStore();
    const board = await store.createBoard(alice.id, 'test', [
      { id: 'todo', title: 'Todo', position: 'F' },
      { id: 'done', title: 'Done', position: 'V' },
    ]);
    const rooms = new RoomManager(store, 100);
    room = (await rooms.join(board.id, fakeClient()))!;
  });

  it('applies an op and bumps the revision', async () => {
    const result = await handleOp(room, store, alice, 'op-1', createCard('c1'));
    expect(result).toMatchObject({ kind: 'applied', event: { revision: 1, opId: 'op-1' } });
    expect(room.revision).toBe(1);
    expect(room.state.cards.c1).toBeDefined();
    expect((await store.loadBoard(room.boardId))!.revision).toBe(1);
  });

  it('rejects ops that do not validate', async () => {
    const result = await handleOp(room, store, alice, 'op-1', { type: 'card.delete', id: 'nope' });
    expect(result).toEqual({ kind: 'rejected', reason: 'card not found' });
    expect(room.revision).toBe(0);
  });

  it('leaves the room untouched when the write fails', async () => {
    store.failNextCommit = true;
    const result = await handleOp(room, store, alice, 'op-1', createCard('c1'));
    expect(result.kind).toBe('rejected');
    expect(room.revision).toBe(0);
    expect(room.state.cards.c1).toBeUndefined();
  });

  it('assigns sequential revisions to concurrent ops', async () => {
    store.commitDelayMs = 5;
    const results = await Promise.all([
      handleOp(room, store, alice, 'op-1', createCard('c1', 'F')),
      handleOp(room, store, alice, 'op-2', createCard('c2', 'V')),
      handleOp(room, store, alice, 'op-3', createCard('c3', 'l')),
    ]);
    expect(results.map((r) => r.kind)).toEqual(['applied', 'applied', 'applied']);
    expect(room.revision).toBe(3);
  });

  it('treats a retried op as a duplicate instead of applying it again', async () => {
    await handleOp(room, store, alice, 'op-1', createCard('c1'));
    const retry = await handleOp(room, store, alice, 'op-1', createCard('c1'));
    expect(retry).toEqual({ kind: 'duplicate', revision: 1 });
    expect(room.revision).toBe(1);
  });

  it('finds duplicates outside the in-memory window via the store', async () => {
    await handleOp(room, store, alice, 'op-1', createCard('c1'));
    const rooms = new RoomManager(store, 0);
    const cold = (await rooms.join(room.boardId, fakeClient()))!;
    expect(cold.revisionForOp('op-1')).toBeNull();
    const retry = await handleOp(cold, store, alice, 'op-1', createCard('c1'));
    expect(retry).toEqual({ kind: 'duplicate', revision: 1 });
  });

  it('nudges a card that lands on an existing position', async () => {
    await handleOp(room, store, alice, 'op-1', createCard('c1', 'V'));
    await handleOp(room, store, alice, 'op-2', createCard('c2', 'l'));
    const result = await handleOp(room, store, alice, 'op-3', createCard('c3', 'V'));
    expect(result.kind).toBe('applied');
    const pos = room.state.cards.c3!.position;
    expect(pos > 'V' && pos < 'l').toBe(true);
  });

  it('records events for replay', async () => {
    await handleOp(room, store, alice, 'op-1', createCard('c1'));
    await handleOp(room, store, alice, 'op-2', createCard('c2', 'l'));
    expect(room.eventsSince(0)?.map((e) => e.opId)).toEqual(['op-1', 'op-2']);
    expect(room.eventsSince(1)?.map((e) => e.opId)).toEqual(['op-2']);
    expect(room.eventsSince(2)).toEqual([]);
    expect(room.eventsSince(5)).toBeNull();
  });
});

describe('resolvePositionTie', () => {
  const state = {
    id: 'b',
    title: 'b',
    columns: { todo: { id: 'todo', title: 'Todo', position: 'V' } },
    cards: {
      a: { id: 'a', columnId: 'todo', title: 'a', description: '', position: 'V' },
    },
  };

  it('leaves non-colliding ops alone', () => {
    const op: Op = { type: 'card.move', id: 'b', columnId: 'todo', position: 'F' };
    expect(resolvePositionTie(state, op)).toBe(op);
  });

  it('ignores the moving card itself', () => {
    const op: Op = { type: 'card.move', id: 'a', columnId: 'todo', position: 'V' };
    expect(resolvePositionTie(state, op)).toBe(op);
  });

  it('moves a colliding card after the existing one', () => {
    const op: Op = { type: 'card.move', id: 'b', columnId: 'todo', position: 'V' };
    const fixed = resolvePositionTie(state, op);
    expect(fixed.type === 'card.move' && fixed.position > 'V').toBe(true);
  });
});
