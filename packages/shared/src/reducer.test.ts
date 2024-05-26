import { describe, expect, it } from 'vitest';
import {
  applyOp,
  cardsInColumn,
  OpError,
  sortedColumns,
  stateFromSnapshot,
  tryApplyOp,
  type BoardState,
} from './reducer.js';

function board(): BoardState {
  return stateFromSnapshot({
    id: 'b1',
    title: 'Test',
    revision: 0,
    columns: [
      { id: 'todo', title: 'Todo', position: 'F' },
      { id: 'done', title: 'Done', position: 'V' },
    ],
    cards: [
      { id: 'c1', columnId: 'todo', title: 'one', description: '', position: 'F' },
      { id: 'c2', columnId: 'todo', title: 'two', description: '', position: 'V' },
    ],
  });
}

describe('applyOp', () => {
  it('creates a card', () => {
    const next = applyOp(board(), {
      type: 'card.create',
      card: { id: 'c3', columnId: 'done', title: 'three', description: '', position: 'V' },
    });
    expect(cardsInColumn(next, 'done').map((c) => c.id)).toEqual(['c3']);
  });

  it('moves a card between columns', () => {
    const next = applyOp(board(), { type: 'card.move', id: 'c1', columnId: 'done', position: 'V' });
    expect(cardsInColumn(next, 'todo').map((c) => c.id)).toEqual(['c2']);
    expect(cardsInColumn(next, 'done').map((c) => c.id)).toEqual(['c1']);
  });

  it('reorders within a column', () => {
    const next = applyOp(board(), { type: 'card.move', id: 'c1', columnId: 'todo', position: 'l' });
    expect(cardsInColumn(next, 'todo').map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('updates only the provided fields', () => {
    const next = applyOp(board(), { type: 'card.update', id: 'c1', description: 'hello' });
    expect(next.cards.c1).toMatchObject({ title: 'one', description: 'hello' });
  });

  it('deletes a card', () => {
    const next = applyOp(board(), { type: 'card.delete', id: 'c2' });
    expect(next.cards.c2).toBeUndefined();
  });

  it('creates and renames columns', () => {
    let s = applyOp(board(), { type: 'column.create', id: 'doing', title: 'Doing', position: 'N' });
    s = applyOp(s, { type: 'column.rename', id: 'doing', title: 'In progress' });
    expect(sortedColumns(s).map((c) => c.title)).toEqual(['Todo', 'In progress', 'Done']);
  });

  it('does not mutate the input', () => {
    const s = board();
    const before = JSON.stringify(s);
    applyOp(s, { type: 'card.move', id: 'c1', columnId: 'done', position: 'V' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('throws OpError for invalid ops', () => {
    expect(() => applyOp(board(), { type: 'card.delete', id: 'nope' })).toThrow(OpError);
    expect(() =>
      applyOp(board(), { type: 'card.move', id: 'c1', columnId: 'nope', position: 'V' }),
    ).toThrow(OpError);
    expect(() =>
      applyOp(board(), {
        type: 'card.create',
        card: { id: 'c1', columnId: 'todo', title: 'dup', description: '', position: 'a' },
      }),
    ).toThrow(OpError);
  });
});

describe('tryApplyOp', () => {
  it('returns the same state when the op no longer applies', () => {
    const s = board();
    expect(tryApplyOp(s, { type: 'card.update', id: 'gone', title: 'x' })).toBe(s);
  });
});
