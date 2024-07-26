import { Prisma, PrismaClient } from '@prisma/client';
import type { AppliedEvent, BoardSnapshot, Column, Op } from '@kanban/shared';
import { opSchema } from '@kanban/shared';

export interface BoardSummary {
  id: string;
  title: string;
  revision: number;
}

export interface BoardStore {
  upsertUser(name: string): Promise<{ id: string; name: string }>;
  listBoards(): Promise<BoardSummary[]>;
  createBoard(ownerId: string, title: string, columns: Column[]): Promise<BoardSnapshot>;
  loadBoard(boardId: string): Promise<BoardSnapshot | null>;
  // Persists the op's effect, appends it to the event log and bumps the board
  // revision, all or nothing.
  commit(boardId: string, event: AppliedEvent): Promise<void>;
  // Events with revision > since, or null if there are more than `limit` of
  // them (caller should fall back to a snapshot).
  eventsSince(boardId: string, since: number, limit: number): Promise<AppliedEvent[] | null>;
  findRevisionByOpId(boardId: string, opId: string): Promise<number | null>;
}

type Tx = Prisma.TransactionClient;

async function applyToDb(tx: Tx, boardId: string, op: Op) {
  switch (op.type) {
    case 'card.create':
      await tx.card.create({ data: { ...op.card, boardId } });
      return;
    case 'card.move':
      await tx.card.update({
        where: { id: op.id },
        data: { columnId: op.columnId, position: op.position },
      });
      return;
    case 'card.update':
      await tx.card.update({
        where: { id: op.id },
        data: { title: op.title, description: op.description },
      });
      return;
    case 'card.delete':
      await tx.card.delete({ where: { id: op.id } });
      return;
    case 'column.create':
      await tx.column.create({
        data: { id: op.id, boardId, title: op.title, position: op.position },
      });
      return;
    case 'column.rename':
      await tx.column.update({ where: { id: op.id }, data: { title: op.title } });
      return;
  }
}

export class PrismaBoardStore implements BoardStore {
  constructor(private readonly db: PrismaClient) {}

  async upsertUser(name: string) {
    return this.db.user.upsert({
      where: { name },
      create: { name },
      update: {},
      select: { id: true, name: true },
    });
  }

  async listBoards() {
    return this.db.board.findMany({
      select: { id: true, title: true, revision: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createBoard(ownerId: string, title: string, columns: Column[]) {
    const board = await this.db.board.create({
      data: {
        title,
        ownerId,
        columns: { create: columns },
      },
      include: { columns: true },
    });
    return {
      id: board.id,
      title: board.title,
      revision: board.revision,
      columns: board.columns.map(({ id, title, position }) => ({ id, title, position })),
      cards: [],
    };
  }

  async loadBoard(boardId: string): Promise<BoardSnapshot | null> {
    const board = await this.db.board.findUnique({
      where: { id: boardId },
      include: { columns: true, cards: true },
    });
    if (!board) return null;
    return {
      id: board.id,
      title: board.title,
      revision: board.revision,
      columns: board.columns.map(({ id, title, position }) => ({ id, title, position })),
      cards: board.cards.map(({ id, columnId, title, description, position }) => ({
        id,
        columnId,
        title,
        description,
        position,
      })),
    };
  }

  async commit(boardId: string, event: AppliedEvent) {
    await this.db.$transaction(async (tx) => {
      await applyToDb(tx, boardId, event.op);
      await tx.boardEvent.create({
        data: {
          boardId,
          revision: event.revision,
          opId: event.opId,
          actorId: event.actorId,
          payload: event.op as Prisma.InputJsonValue,
        },
      });
      await tx.board.update({ where: { id: boardId }, data: { revision: event.revision } });
    });
  }

  async eventsSince(boardId: string, since: number, limit: number) {
    // TODO: prune BoardEvent rows older than the replay window; the table only grows right now.
    const rows = await this.db.boardEvent.findMany({
      where: { boardId, revision: { gt: since } },
      orderBy: { revision: 'asc' },
      take: limit + 1,
    });
    if (rows.length > limit) return null;
    return rows.map((r) => ({
      revision: r.revision,
      opId: r.opId,
      actorId: r.actorId,
      op: opSchema.parse(r.payload),
    }));
  }

  async findRevisionByOpId(boardId: string, opId: string) {
    const row = await this.db.boardEvent.findUnique({
      where: { boardId_opId: { boardId, opId } },
      select: { revision: true },
    });
    return row?.revision ?? null;
  }
}
