'use client';

import { useState } from 'react';

export function NewCardForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  if (!open) {
    return (
      <button
        className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-200"
        onClick={() => setOpen(true)}
      >
        + Add card
      </button>
    );
  }

  function submit() {
    const t = title.trim();
    if (t) onAdd(t);
    setTitle('');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        className="w-full resize-none rounded border border-slate-300 p-2 text-sm"
        rows={2}
        placeholder="Card title"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
          Add
        </button>
        <button
          type="button"
          className="px-2 text-sm text-slate-500"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
