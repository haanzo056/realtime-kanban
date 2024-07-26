import { randomUUID } from 'node:crypto';
import {
  applyOp,
  stateFromSnapshot,
  type AppliedEvent,
  type BoardSnapshot,
  type Column,
} from '@kanban/shared';
import type { BoardStore } from './store.js';

// In-memory BoardStore for tests. Mirrors the Prisma store's behaviour closely
// enough for handler tests; it is not meant for running the server.
export class MemoryBoardStore implements BoardStore {
  users = new Map<string, { id: string; name: string }>();
  boards = new Map<string, BoardSnapshot>();
  events = new Map<string, AppliedEvent[]>();
  failNextCommit = false;
  commitDelayMs = 0;

  async upsertUser(name: string) {
    let user = this.users.get(name);
    if (!user) {
      user = { id: randomUUID(), name };
      this.users.set(name, user);
    }
    return user;
  }

  async listBoards() {
    return [...this.boards.values()].map(({ id, title, revision }) => ({ id, title, revision }));
  }

  async createBoard(_ownerId: string, title: string, columns: Column[]) {
    const board: BoardSnapshot = { id: randomUUID(), title, revision: 0, columns, cards: [] };
    this.boards.set(board.id, board);
    this.events.set(board.id, []);
    return structuredClone(board);
  }

  async loadBoard(boardId: string) {
    const b = this.boards.get(boardId);
    return b ? structuredClone(b) : null;
  }

  async commit(boardId: string, event: AppliedEvent) {
    if (this.commitDelayMs) await new Promise((r) => setTimeout(r, this.commitDelayMs));
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('simulated failure');
    }
    const board = this.boards.get(boardId);
    if (!board) throw new Error('no board');
    const log = this.events.get(boardId)!;
    if (log.some((e) => e.revision === event.revision || e.opId === event.opId)) {
      throw new Error(`unique violation: revision ${event.revision} / op ${event.opId}`);
    }
    const next = applyOp(stateFromSnapshot(board), event.op);
    this.boards.set(boardId, {
      ...board,
      revision: event.revision,
      columns: Object.values(next.columns),
      cards: Object.values(next.cards),
    });
    log.push(event);
  }

  async eventsSince(boardId: string, since: number, limit: number) {
    const all = (this.events.get(boardId) ?? []).filter((e) => e.revision > since);
    return all.length > limit ? null : all;
  }

  async findRevisionByOpId(boardId: string, opId: string) {
    return this.events.get(boardId)?.find((e) => e.opId === opId)?.revision ?? null;
  }
}
