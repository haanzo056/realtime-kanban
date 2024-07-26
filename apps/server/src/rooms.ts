import {
  stateFromSnapshot,
  type AppliedEvent,
  type BoardSnapshot,
  type BoardState,
  type ServerMessage,
} from '@kanban/shared';
import type { AuthUser } from './auth.js';
import { log } from './log.js';
import type { BoardStore } from './store.js';

export interface Client {
  id: string;
  user: AuthUser;
  send(msg: ServerMessage): void;
}

export class Room {
  state: BoardState;
  revision: number;
  readonly clients = new Set<Client>();
  // Recent events kept in memory so a reconnecting client can be caught up
  // synchronously. If we went to the DB here, new events could be broadcast to
  // the client while the replay query is in flight and arrive out of order.
  private recent: AppliedEvent[];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly boardId: string,
    snapshot: BoardSnapshot,
    recent: AppliedEvent[],
    private readonly replayLimit: number,
  ) {
    this.state = stateFromSnapshot(snapshot);
    this.revision = snapshot.revision;
    this.recent = recent;
  }

  snapshot(): BoardSnapshot {
    return {
      id: this.state.id,
      title: this.state.title,
      revision: this.revision,
      columns: Object.values(this.state.columns),
      cards: Object.values(this.state.cards),
    };
  }

  // Ops for a board run one at a time. Validation and revision assignment read
  // room state before the DB await, so two interleaved ops would both claim
  // revision N+1 and one would fail on the unique index.
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  record(event: AppliedEvent) {
    this.recent.push(event);
    if (this.recent.length > this.replayLimit) {
      this.recent.splice(0, this.recent.length - this.replayLimit);
    }
  }

  revisionForOp(opId: string): number | null {
    // Linear scan is fine at replay-window sizes (hundreds).
    for (let i = this.recent.length - 1; i >= 0; i--) {
      if (this.recent[i]!.opId === opId) return this.recent[i]!.revision;
    }
    return null;
  }

  // null means we can't bridge the gap from memory.
  eventsSince(revision: number): AppliedEvent[] | null {
    if (revision === this.revision) return [];
    if (revision > this.revision) return null;
    const first = this.recent[0];
    if (!first || first.revision > revision + 1) return null;
    return this.recent.filter((e) => e.revision > revision);
  }

  broadcast(msg: ServerMessage, except?: Client) {
    for (const c of this.clients) {
      if (c !== except) c.send(msg);
    }
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room | null>>();

  constructor(
    private readonly store: BoardStore,
    private readonly replayLimit: number,
  ) {}

  get(boardId: string): Room | undefined {
    return this.rooms.get(boardId);
  }

  async join(boardId: string, client: Client): Promise<Room | null> {
    const room = await this.load(boardId);
    room?.clients.add(client);
    return room;
  }

  leave(room: Room, client: Client) {
    room.clients.delete(client);
    if (room.clients.size === 0) {
      this.rooms.delete(room.boardId);
      log.debug('room closed', { boardId: room.boardId });
    }
  }

  private load(boardId: string): Promise<Room | null> {
    const existing = this.rooms.get(boardId);
    if (existing) return Promise.resolve(existing);

    // Two clients joining a cold board at the same time must end up in the
    // same Room instance, so share the in-flight load.
    let pending = this.loading.get(boardId);
    if (!pending) {
      pending = this.createRoom(boardId).finally(() => this.loading.delete(boardId));
      this.loading.set(boardId, pending);
    }
    return pending;
  }

  private async createRoom(boardId: string): Promise<Room | null> {
    const snapshot = await this.store.loadBoard(boardId);
    if (!snapshot) return null;
    const from = Math.max(0, snapshot.revision - this.replayLimit);
    const recent = (await this.store.eventsSince(boardId, from, this.replayLimit)) ?? [];
    const room = new Room(boardId, snapshot, recent, this.replayLimit);
    this.rooms.set(boardId, room);
    log.debug('room opened', { boardId, revision: snapshot.revision });
    return room;
  }
}
