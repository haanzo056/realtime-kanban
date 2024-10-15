'use client';

import type { ConnectionStatus } from '@/lib/socket';

const styles: Record<ConnectionStatus, { dot: string; label: string }> = {
  live: { dot: 'bg-emerald-500', label: 'Live' },
  connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Connecting' },
  offline: { dot: 'bg-slate-400', label: 'Offline' },
};

export function ConnectionBadge({
  status,
  pendingCount,
}: {
  status: ConnectionStatus;
  pendingCount: number;
}) {
  const s = styles[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" data-testid="connection">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
      {pendingCount > 0 && <span className="text-slate-400">({pendingCount} unsynced)</span>}
    </span>
  );
}
