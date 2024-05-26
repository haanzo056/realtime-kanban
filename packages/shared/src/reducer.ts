import type { Op } from './events.js';
import { comparePositions } from './fractional.js';
import type { BoardSnapshot, Card, Column } from './schemas.js';

export interface BoardState {
  id: string;
  title: string;
  columns: Record<string, Column>;
  cards: Record<string, Card>;
}

export function stateFromSnapshot(snapshot: BoardSnapshot): BoardState {
  const columns: Record<string, Column> = {};
  const cards: Record<string, Card> = {};
  for (const c of snapshot.columns) columns[c.id] = c;
  for (const c of snapshot.cards) cards[c.id] = c;
  return { id: snapshot.id, title: snapshot.title, columns, cards };
}

export class OpError extends Error {}

// Returns an error string if the op can't be applied to this state. The server
// uses this to reject ops; the client ignores failures silently because a
// pending op may legitimately target something another user just deleted.
export function validateOp(state: BoardState, op: Op): string | null {
  switch (op.type) {
    case 'card.create':
      if (state.cards[op.card.id]) return 'card already exists';
      if (!state.columns[op.card.columnId]) return 'column not found';
      return null;
    case 'card.move':
      if (!state.cards[op.id]) return 'card not found';
      if (!state.columns[op.columnId]) return 'column not found';
      return null;
    case 'card.update':
    case 'card.delete':
      return state.cards[op.id] ? null : 'card not found';
    case 'column.create':
      return state.columns[op.id] ? 'column already exists' : null;
    case 'column.rename':
      return state.columns[op.id] ? null : 'column not found';
  }
}

export function applyOp(state: BoardState, op: Op): BoardState {
  const err = validateOp(state, op);
  if (err) throw new OpError(err);

  switch (op.type) {
    case 'card.create':
      return { ...state, cards: { ...state.cards, [op.card.id]: op.card } };

    case 'card.move': {
      const card = state.cards[op.id]!;
      return {
        ...state,
        cards: {
          ...state.cards,
          [op.id]: { ...card, columnId: op.columnId, position: op.position },
        },
      };
    }

    case 'card.update': {
      const card = state.cards[op.id]!;
      return {
        ...state,
        cards: {
          ...state.cards,
          [op.id]: {
            ...card,
            title: op.title ?? card.title,
            description: op.description ?? card.description,
          },
        },
      };
    }

    case 'card.delete': {
      const { [op.id]: _removed, ...rest } = state.cards;
      return { ...state, cards: rest };
    }

    case 'column.create':
      return {
        ...state,
        columns: {
          ...state.columns,
          [op.id]: { id: op.id, title: op.title, position: op.position },
        },
      };

    case 'column.rename': {
      const col = state.columns[op.id]!;
      return { ...state, columns: { ...state.columns, [op.id]: { ...col, title: op.title } } };
    }
  }
}

export function tryApplyOp(state: BoardState, op: Op): BoardState {
  try {
    return applyOp(state, op);
  } catch (e) {
    if (e instanceof OpError) return state;
    throw e;
  }
}

export function sortedColumns(state: BoardState): Column[] {
  return Object.values(state.columns).sort(comparePositions);
}

export function cardsInColumn(state: BoardState, columnId: string): Card[] {
  return Object.values(state.cards)
    .filter((c) => c.columnId === columnId)
    .sort(comparePositions);
}
