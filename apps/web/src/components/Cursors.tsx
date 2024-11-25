'use client';

import { useEffect, useState } from 'react';
import type { PresenceUser } from '@kanban/shared';
import type { RemoteCursor } from '@/lib/useBoard';

const STALE_MS = 5000;

export function Cursors({
  cursors,
  presence,
}: {
  cursors: Record<string, RemoteCursor>;
  presence: PresenceUser[];
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const byConnection = new Map(presence.map((p) => [p.connectionId, p]));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Object.entries(cursors).map(([connectionId, c]) => {
        const user = byConnection.get(connectionId);
        if (!user || now - c.at > STALE_MS) return null;
        return (
          <div
            key={connectionId}
            className="absolute transition-[left,top] duration-75 ease-linear"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill={user.color}>
              <path d="M0 0 L0 12 L4 9 L7 15 L9 14 L6 8 L11 8 Z" />
            </svg>
            <span
              className="ml-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] text-white"
              style={{ backgroundColor: user.color }}
            >
              {user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
