'use client';

import type { PresenceUser } from '@kanban/shared';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function PresenceBar({ users, selfId }: { users: PresenceUser[]; selfId: string }) {
  // Same person in two tabs shows up once.
  const unique = [...new Map(users.map((u) => [u.userId, u])).values()];

  return (
    <div className="flex items-center -space-x-2" data-testid="presence">
      {unique.map((u) => (
        <div
          key={u.userId}
          title={u.userId === selfId ? `${u.name} (you)` : u.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-medium text-white"
          style={{ backgroundColor: u.color }}
          data-testid="presence-avatar"
        >
          {initials(u.name)}
        </div>
      ))}
    </div>
  );
}
