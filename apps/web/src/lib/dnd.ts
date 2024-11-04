import { cardsInColumn, keyBetween, type BoardState, type Op } from '@kanban/shared';

export type DropTarget = { type: 'card'; cardId: string } | { type: 'column'; columnId: string };

// Turns a drop into a card.move op, or null if nothing would change.
export function computeMove(board: BoardState, activeId: string, target: DropTarget): Op | null {
  const active = board.cards[activeId];
  if (!active) return null;

  let columnId: string;
  let index: number;
  let list;

  if (target.type === 'column') {
    columnId = target.columnId;
    list = cardsInColumn(board, columnId).filter((c) => c.id !== activeId);
    index = list.length;
  } else {
    const over = board.cards[target.cardId];
    if (!over || over.id === activeId) return null;
    columnId = over.columnId;
    const full = cardsInColumn(board, columnId);
    const overIndex = full.findIndex((c) => c.id === over.id);
    const activeIndex = full.findIndex((c) => c.id === activeId);
    list = full.filter((c) => c.id !== activeId);
    // Matches what verticalListSortingStrategy shows: dragging down within a
    // column lands after the hovered card, everything else lands before it.
    const movingDown = activeIndex !== -1 && activeIndex < overIndex;
    index = list.findIndex((c) => c.id === over.id) + (movingDown ? 1 : 0);
  }

  const prev = list[index - 1] ?? null;
  const next = list[index] ?? null;

  if (columnId === active.columnId) {
    const current = cardsInColumn(board, columnId);
    const i = current.findIndex((c) => c.id === activeId);
    if (current[i - 1]?.id === prev?.id && current[i + 1]?.id === next?.id) return null;
  }

  let position: string;
  try {
    position = keyBetween(prev?.position ?? null, next?.position ?? null);
  } catch {
    // prev and next share a key (two optimistic inserts collided before the
    // server resolved it). Drop after prev; the server will fix up any tie.
    position = keyBetween(prev?.position ?? null, null);
  }

  return { type: 'card.move', id: activeId, columnId, position };
}
