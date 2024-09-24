'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import Link from 'next/link';
import { useState } from 'react';
import { cardsInColumn, keyBetween, sortedColumns } from '@kanban/shared';
import type { Session } from '@/lib/api';
import { computeMove, type DropTarget } from '@/lib/dnd';
import { useBoard } from '@/lib/useBoard';
import { CardBody } from './Card';
import { Column } from './Column';
import { ConnectionBadge } from './ConnectionBadge';
import { Cursors } from './Cursors';
import { PresenceBar } from './PresenceBar';

export function Board({ boardId, session }: { boardId: string; session: Session }) {
  const { board, status, pendingCount, lastError, presence, cursors, sendCursor, submit } =
    useBoard(boardId, session.token);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // Small distance so clicks and double-click-to-edit still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!board) {
    return <p className="p-8 text-slate-500">Loading board...</p>;
  }

  const columns = sortedColumns(board);
  const activeCard = activeId ? board.cards[activeId] : undefined;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!board || !e.over) return;
    const data = e.over.data.current as { type?: string; columnId?: string } | undefined;
    const target: DropTarget =
      data?.type === 'column'
        ? { type: 'column', columnId: data.columnId! }
        : { type: 'card', cardId: String(e.over.id) };
    const op = computeMove(board, String(e.active.id), target);
    if (op) submit(op);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          Boards
        </Link>
        <h1 className="font-semibold">{board.title}</h1>
        <div className="ml-auto flex items-center gap-3">
          <PresenceBar users={presence} selfId={session.user.id} />
          <ConnectionBadge status={status} pendingCount={pendingCount} />
        </div>
      </header>

      {lastError && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          Last change was rejected by the server: {lastError}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <main className="flex-1 overflow-x-auto p-4">
          <div
            className="relative flex w-max min-w-full gap-4"
            onPointerMove={(e) => {
              // Normalised to the board content, not the viewport, so the cursor
              // lands on roughly the same column for people with other window
              // sizes. Card heights still differ, so vertical is approximate.
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              if (x >= 0 && x <= 1 && y >= 0 && y <= 1) sendCursor(x, y);
            }}
          >
            {columns.map((col) => {
              const cards = cardsInColumn(board, col.id);
              return (
                <Column
                  key={col.id}
                  column={col}
                  cards={cards}
                  onAddCard={(title) =>
                    submit({
                      type: 'card.create',
                      card: {
                        id: crypto.randomUUID(),
                        columnId: col.id,
                        title,
                        description: '',
                        position: keyBetween(cards.at(-1)?.position ?? null, null),
                      },
                    })
                  }
                  onRenameCard={(id, title) => submit({ type: 'card.update', id, title })}
                  onDeleteCard={(id) => submit({ type: 'card.delete', id })}
                />
              );
            })}
            <Cursors cursors={cursors} presence={presence} />
          </div>
        </main>
        {/* TODO: cards in the target column don't shift while dragging across columns,
            only on drop. Needs onDragOver bookkeeping like the dnd-kit multi-container example. */}
        <DragOverlay>
          {activeCard ? <CardBody title={activeCard.title} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
