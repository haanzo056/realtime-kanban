'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { Card as CardT } from '@kanban/shared';

interface Props {
  card: CardT;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function CardBody({ title, dragging }: { title: string; dragging?: boolean }) {
  return (
    <div
      className={`rounded bg-white p-2 text-sm shadow-sm ${dragging ? 'rotate-2 shadow-lg' : ''}`}
    >
      {title}
    </div>
  );
}

export function Card({ card, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' },
    disabled: editing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== card.title) onRename(t);
    else setDraft(card.title);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group rounded bg-white p-2 text-sm shadow-sm ${isDragging ? 'opacity-40' : ''}`}
      data-testid="card"
    >
      {editing ? (
        <input
          className="w-full rounded border border-slate-300 px-1"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Keep space/enter from reaching the keyboard drag sensor.
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(card.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <span
            className="flex-1 break-words"
            onDoubleClick={() => {
              setDraft(card.title);
              setEditing(true);
            }}
          >
            {card.title}
          </span>
          <button
            aria-label="Delete card"
            className="invisible text-slate-400 hover:text-red-600 group-hover:visible"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}
