'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Op, PresenceUser } from '@kanban/shared';
import { SERVER_URL } from './api';
import { initialSyncState, syncReducer, viewState } from './optimistic';
import { BoardConnection } from './socket';

export interface RemoteCursor {
  x: number;
  y: number;
  at: number;
}

const CURSOR_INTERVAL_MS = 50;

export function useBoard(boardId: string, token: string) {
  const [state, dispatch] = useReducer(syncReducer, initialSyncState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const connRef = useRef<BoardConnection | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const lastCursorSent = useRef(0);

  useEffect(() => {
    const conn = new BoardConnection({
      url: SERVER_URL.replace(/^http/, 'ws'),
      token,
      boardId,
      getRevision: () => (stateRef.current.confirmed ? stateRef.current.revision : undefined),
      onStatus: (status) => {
        dispatch({ type: 'status', status });
        // Presence from before a disconnect is stale; the server resends on join.
        if (status !== 'live') setPresence([]);
      },
      onMessage: (msg) => {
        switch (msg.t) {
          case 'snapshot':
            dispatch({ type: 'snapshot', board: msg.board });
            break;
          case 'events':
            dispatch({ type: 'events', events: msg.events });
            break;
          case 'ack':
            dispatch({ type: 'ack', opId: msg.opId });
            break;
          case 'reject':
            dispatch({ type: 'reject', opId: msg.opId, reason: msg.reason });
            break;
          case 'presence': {
            setPresence(msg.users);
            const live = new Set(msg.users.map((u) => u.connectionId));
            setCursors((prev) =>
              Object.fromEntries(Object.entries(prev).filter(([id]) => live.has(id))),
            );
            break;
          }
          case 'cursor':
            setCursors((prev) => ({
              ...prev,
              [msg.connectionId]: { x: msg.x, y: msg.y, at: Date.now() },
            }));
            break;
        }
      },
    });
    connRef.current = conn;
    conn.connect();
    return () => {
      conn.close();
      connRef.current = null;
    };
  }, [boardId, token]);

  useEffect(() => {
    if (state.needsResync) connRef.current?.resync();
  }, [state.needsResync]);

  useEffect(() => {
    if (!state.lastError) return;
    const t = setTimeout(() => dispatch({ type: 'clearError' }), 4000);
    return () => clearTimeout(t);
  }, [state.lastError]);

  useEffect(() => {
    if (state.flushSeq === 0) return;
    const conn = connRef.current;
    if (!conn) return;
    for (const p of stateRef.current.pending) {
      conn.send({ t: 'op', opId: p.opId, op: p.op });
    }
  }, [state.flushSeq]);

  const board = useMemo(
    () => viewState({ confirmed: state.confirmed, pending: state.pending }),
    [state.confirmed, state.pending],
  );

  const submit = useCallback((op: Op) => {
    const opId = crypto.randomUUID();
    dispatch({ type: 'local', opId, op });
    // If the socket is down the op stays pending and goes out on reconnect.
    connRef.current?.send({ t: 'op', opId, op });
  }, []);

  const sendCursor = useCallback((x: number, y: number) => {
    const now = performance.now();
    if (now - lastCursorSent.current < CURSOR_INTERVAL_MS) return;
    lastCursorSent.current = now;
    connRef.current?.send({ t: 'cursor', x, y });
  }, []);

  return {
    board,
    status: state.status,
    pendingCount: state.pending.length,
    presence,
    cursors,
    sendCursor,
    lastError: state.lastError,
    submit,
  };
}
