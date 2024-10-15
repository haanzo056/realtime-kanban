import { describe, expect, it } from 'vitest';
import type { AppliedEvent, BoardSnapshot, Op } from '@kanban/shared';
import { initialSyncState, syncReducer, viewState, type SyncState } from './optimistic';

const snapshot: BoardSnapshot = {
  id: 'b1',
  title: 'Board',
  revision: 3,
  columns: [
    { id: 'todo', title: 'Todo', position: 'F' },
    { id: 'done', title: 'Done', position: 'V' },
  ],
  cards: [{ id: 'c1', columnId: 'todo', title: 'one', description: '', position: 'V' }],
};

function loaded(): SyncState {
  return syncReducer(initialSyncState, { type: 'snapshot', board: snapshot });
}

const move = (columnId: string, position = 'V'): Op => ({
  type: 'card.move',
  id: 'c1',
  columnId,
  position,
});

const event = (revision: number, op: Op, opId = `srv-${revision}`): AppliedEvent => ({
  revision,
  opId,
  actorId: 'someone',
  op,
});

describe('syncReducer', () => {
  it('shows local ops immediately', () => {
    const s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    expect(viewState(s)!.cards.c1!.columnId).toBe('done');
    expect(s.confirmed!.cards.c1!.columnId).toBe('todo');
  });

  it('drops a pending op once the server echoes it back', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    s = syncReducer(s, { type: 'events', events: [event(4, move('done'), 'o1')] });
    expect(s.pending).toHaveLength(0);
    expect(s.revision).toBe(4);
    expect(s.confirmed!.cards.c1!.columnId).toBe('done');
  });

  it('keeps local ops on top of remote events', () => {
    let s = syncReducer(loaded(), {
      type: 'local',
      opId: 'o1',
      op: { type: 'card.update', id: 'c1', title: 'mine' },
    });
    s = syncReducer(s, {
      type: 'events',
      events: [event(4, { type: 'card.update', id: 'c1', title: 'theirs' })],
    });
    expect(s.confirmed!.cards.c1!.title).toBe('theirs');
    expect(viewState(s)!.cards.c1!.title).toBe('mine');
  });

  it('rolls back a rejected op', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    s = syncReducer(s, { type: 'reject', opId: 'o1', reason: 'nope' });
    expect(viewState(s)!.cards.c1!.columnId).toBe('todo');
    expect(s.lastError).toBe('nope');
  });

  it('ignores events it already has', () => {
    const s = syncReducer(loaded(), { type: 'events', events: [event(3, move('done'))] });
    expect(s.confirmed!.cards.c1!.columnId).toBe('todo');
    expect(s.revision).toBe(3);
  });

  it('flags a revision gap instead of applying out of order', () => {
    const s = syncReducer(loaded(), { type: 'events', events: [event(6, move('done'))] });
    expect(s.needsResync).toBe(true);
    expect(s.revision).toBe(3);
  });

  it('survives a pending op whose target was deleted remotely', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    s = syncReducer(s, { type: 'events', events: [event(4, { type: 'card.delete', id: 'c1' })] });
    expect(viewState(s)!.cards.c1).toBeUndefined();
  });

  it('only signals a flush after the reconnect catch-up arrives', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    const before = s.flushSeq;
    s = syncReducer(s, { type: 'status', status: 'offline' });
    s = syncReducer(s, { type: 'status', status: 'live' });
    expect(s.awaitingCatchUp).toBe(true);
    expect(s.flushSeq).toBe(before);
    s = syncReducer(s, { type: 'events', events: [] });
    expect(s.awaitingCatchUp).toBe(false);
    expect(s.flushSeq).toBe(before + 1);
  });

  it('does not resend an op the replay shows was already applied', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    s = syncReducer(s, { type: 'status', status: 'live' });
    s = syncReducer(s, { type: 'events', events: [event(4, move('done'), 'o1')] });
    expect(s.pending).toHaveLength(0);
  });

  it('drops a pending op on ack', () => {
    let s = syncReducer(loaded(), { type: 'local', opId: 'o1', op: move('done') });
    s = syncReducer(s, { type: 'ack', opId: 'o1' });
    expect(s.pending).toHaveLength(0);
  });
});
