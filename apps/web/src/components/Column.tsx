'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card as CardT, Column as ColumnT } from '@kanban/shared';
import { Card } from './Card';
import { NewCardForm } from './NewCardForm';

interface Props {
  column: ColumnT;
  cards: CardT[];
  onAddCard: (title: string) => void;
  onRenameCard: (id: string, title: string) => void;
  onDeleteCard: (id: string) => void;
}

export function columnDropId(columnId: string) {
  return `column:${columnId}`;
}

export function Column({ column, cards, onAddCard, onRenameCard, onDeleteCard }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column.id),
    data: { type: 'column', columnId: column.id },
  });

  return (
    <section
      className={`flex w-72 shrink-0 flex-col rounded-lg p-2 transition-colors ${
        isOver ? 'bg-slate-300/70' : 'bg-slate-200/70'
      }`}
      data-testid={`column-${column.title}`}
    >
      <h2 className="mb-2 px-1 text-sm font-medium text-slate-700">
        {column.title} <span className="text-slate-400">{cards.length}</span>
      </h2>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {/* min-h so an empty column still has something to drop onto */}
        <div ref={setNodeRef} className="flex min-h-12 flex-col gap-2">
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              onRename={(title) => onRenameCard(card.id, title)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
        </div>
      </SortableContext>
      <div className="mt-2">
        <NewCardForm onAdd={onAddCard} />
      </div>
    </section>
  );
}
