import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { keysBetween } from '@kanban/shared';

const prisma = new PrismaClient();

const columns: Record<string, string[]> = {
  Todo: ['Write README', 'Add card descriptions', 'Column reordering'],
  'In progress': ['Presence cursors'],
  Done: ['Fractional indexing', 'Reconnect + resync'],
};

async function main() {
  const user = await prisma.user.upsert({
    where: { name: 'demo' },
    create: { name: 'demo' },
    update: {},
  });

  const existing = await prisma.board.findFirst({ where: { title: 'Demo board' } });
  if (existing) {
    console.log(`demo board already exists: ${existing.id}`);
    return;
  }

  const board = await prisma.board.create({ data: { title: 'Demo board', ownerId: user.id } });
  const colKeys = keysBetween(null, null, Object.keys(columns).length);

  for (const [i, [title, cards]] of Object.entries(columns).entries()) {
    const column = await prisma.column.create({
      data: { id: randomUUID(), boardId: board.id, title, position: colKeys[i]! },
    });
    const cardKeys = keysBetween(null, null, cards.length);
    await prisma.card.createMany({
      data: cards.map((cardTitle, j) => ({
        id: randomUUID(),
        boardId: board.id,
        columnId: column.id,
        title: cardTitle,
        position: cardKeys[j]!,
      })),
    });
  }

  console.log(`seeded demo board: ${board.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
