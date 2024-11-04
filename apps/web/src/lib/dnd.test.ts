import { describe, expect, it } from 'vitest';
import { applyOp, cardsInColumn, stateFromSnapshot } from '@kanban/shared';
import { computeMove } from './dnd';

const board = stateFromSnapshot({
  id: 'b',
  title: 'b',
  revision: 0,
  columns: [
    { id: 'todo', title: 'Todo', position: 'F' },
    { id: 'done', title: 'Done', position: 'V' },
  ],
  cards: [
    { id: 'a', columnId: 'todo', title: 'a', description: '', position: 'F' },
    { id: 'b', columnId: 'todo', title: 'b', description: '', position: 'V' },
    { id: 'c', columnId: 'todo', title: 'c', description: '', position: 'l' },
    { id: 'x', columnId: 'done', title: 'x', description: '', position: 'V' },
  ],
});

function order(op: ReturnType<typeof computeMove>, column: string) {
  expect(op).not.toBeNull();
  return cardsInColumn(applyOp(board, op!), column).map((c) => c.id);
}

describe('computeMove', () => {
  it('moves a card down within a column', () => {
    expect(order(computeMove(board, 'a', { type: 'card', cardId: 'b' }), 'todo')).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('moves a card up within a column', () => {
    expect(order(computeMove(board, 'c', { type: 'card', cardId: 'a' }), 'todo')).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('drops before the hovered card in another column', () => {
    expect(order(computeMove(board, 'b', { type: 'card', cardId: 'x' }), 'done')).toEqual([
      'b',
      'x',
    ]);
  });

  it('appends when dropped on a column', () => {
    expect(order(computeMove(board, 'a', { type: 'column', columnId: 'done' }), 'done')).toEqual([
      'x',
      'a',
    ]);
  });

  it('returns null when nothing changes', () => {
    expect(computeMove(board, 'c', { type: 'column', columnId: 'todo' })).toBeNull();
    expect(computeMove(board, 'a', { type: 'card', cardId: 'a' })).toBeNull();
  });
});
