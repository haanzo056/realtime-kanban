import type { PresenceUser } from '@kanban/shared';
import type { Client } from './rooms.js';

const PALETTE = [
  '#e11d48',
  '#d97706',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#475569',
];

// Stable per user so someone keeps their colour across reconnects and tabs.
export function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function presenceList(clients: Iterable<Client>): PresenceUser[] {
  const out: PresenceUser[] = [];
  for (const c of clients) {
    out.push({
      connectionId: c.id,
      userId: c.user.id,
      name: c.user.name,
      color: colorFor(c.user.id),
    });
  }
  return out;
}
