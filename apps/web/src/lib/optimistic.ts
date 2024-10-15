import {
  stateFromSnapshot,
  tryApplyOp,
  type AppliedEvent,
  type BoardSnapshot,
  type BoardState,
  type Op,
} from '@kanban/shared';
import type { ConnectionStatus } from './socket';

export interface PendingOp {
  opId: string;
  op: Op;
}

// `confirmed` is exactly what the server has told us, at `revision`. The UI
// renders confirmed + pending ops replayed on top, so a server event that lands
// underneath a local change doesn't clobber it.
export interface SyncState {
  status: ConnectionStatus;
  confirmed: BoardState | null;
  revision: number;
  pending: PendingOp[];
  needsResync: boolean;
  // Set when a (re)connect sends hello; cleared by the first snapshot/events
  // reply. Pending ops are only resent after that, so anything the server
  // already applied has been matched by opId and dropped first.
  awaitingCatchUp: boolean;
  flushSeq: number;
  lastError: string | null;
}

export type SyncAction =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'local'; opId: string; op: Op }
  | { type: 'snapshot'; board: BoardSnapshot }
  | { type: 'events'; events: AppliedEvent[] }
  | { type: 'ack'; opId: string }
  | { type: 'reject'; opId: string; reason: string }
  | { type: 'clearError' };

export const initialSyncState: SyncState = {
  status: 'connecting',
  confirmed: null,
  revision: 0,
  pending: [],
  needsResync: false,
  awaitingCatchUp: true,
  flushSeq: 0,
  lastError: null,
};

function caughtUp(state: SyncState): Partial<SyncState> {
  return state.awaitingCatchUp ? { awaitingCatchUp: false, flushSeq: state.flushSeq + 1 } : {};
}

export function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'status':
      return {
        ...state,
        status: action.status,
        awaitingCatchUp: action.status === 'live' ? true : state.awaitingCatchUp,
      };

    case 'local':
      return { ...state, pending: [...state.pending, { opId: action.opId, op: action.op }] };

    case 'snapshot':
      return {
        ...state,
        confirmed: stateFromSnapshot(action.board),
        revision: action.board.revision,
        needsResync: false,
        ...caughtUp(state),
      };

    case 'events': {
      if (!state.confirmed) return state;
      let confirmed = state.confirmed;
      let revision = state.revision;
      let pending = state.pending;
      let gap = false;
      for (const e of action.events) {
        if (e.revision <= revision) continue;
        if (e.revision !== revision + 1) {
          gap = true;
          break;
        }
        confirmed = tryApplyOp(confirmed, e.op);
        revision = e.revision;
        pending = pending.filter((p) => p.opId !== e.opId);
      }
      return { ...state, confirmed, revision, pending, needsResync: gap, ...caughtUp(state) };
    }

    // Server already had this op (retry after reconnect). Its effect is in
    // confirmed state via replay/snapshot, so just stop tracking it.
    case 'ack':
      return { ...state, pending: state.pending.filter((p) => p.opId !== action.opId) };

    case 'reject':
      return {
        ...state,
        pending: state.pending.filter((p) => p.opId !== action.opId),
        lastError: action.reason,
      };

    case 'clearError':
      return state.lastError === null ? state : { ...state, lastError: null };
  }
}

export function viewState(state: Pick<SyncState, 'confirmed' | 'pending'>): BoardState | null {
  if (!state.confirmed) return null;
  return state.pending.reduce((s, p) => tryApplyOp(s, p.op), state.confirmed);
}
