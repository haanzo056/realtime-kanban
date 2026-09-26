# realtime-kanban

[![CI](https://github.com/haanzo056/realtime-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/haanzo056/realtime-kanban/actions/workflows/ci.yml) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![License](https://img.shields.io/github/license/haanzo056/realtime-kanban)

A kanban board several people can edit at once. Cards move between columns with drag and drop, changes show up immediately for whoever made them and a moment later for everyone else, and you can see who else has the board open and where their cursor is.

```
apps/web         Next.js 14 (App Router), Tailwind, dnd-kit
apps/server      Node + ws, Prisma/Postgres, JWT
packages/shared  zod schemas, op/event types, fractional indexing, board reducer
```

## Running it

With Docker:

```sh
docker compose up --build
```

Then open http://localhost:3000, sign in with any name, create a board, and open the same URL in a second browser (or a private window) signed in as someone else.

Without Docker you need Node 20, pnpm 9 and a Postgres you can reach:

```sh
pnpm install
cp .env.example apps/server/.env      # point DATABASE_URL at your Postgres
pnpm --filter server db:migrate
pnpm --filter server db:seed          # optional, creates a "Demo board"
pnpm dev                              # server on :4000, web on :3000
```

Tests:

```sh
pnpm test                 # vitest: fractional indexing, reducers, server handlers
pnpm e2e                  # playwright, needs Postgres; starts both apps itself
```

## How sync works

Every change is an op (`card.create`, `card.move`, ...) defined in `packages/shared`. The client applies it locally right away, keeps it in a pending list, and sends it over the socket with a random `opId`. The server keeps one in-memory room per open board. It runs ops for a board one at a time: validate against the current state, give the op the next revision number, write it to Postgres (the card/column change, a row in `BoardEvent`, and the board's revision, all in one transaction), then broadcast it to everyone in the room, including the sender.

The client keeps two things: the last state the server confirmed, with its revision, and the pending ops. What you see on screen is the confirmed state with the pending ops applied on top. When a server event comes in, it is applied to the confirmed state, and if its `opId` matches a pending op, that op is dropped. So a remote change that lands under your own unconfirmed edit doesn't wipe the edit out, and your edit doesn't flicker when the server confirms it. If the server rejects an op, dropping it from the pending list is the whole rollback.

Events have to arrive in revision order. If the client sees a gap (it is at 12 and gets 14), it asks for a resync instead of applying 14. On reconnect it sends `hello` with its last revision. The server answers from a buffer of recent events kept in the room, or with a full snapshot if the client is too far behind. Pending ops are resent only once that answer has been applied. By then, any op that had reached the server before the connection dropped shows up in the replay and is gone from the pending list. The server also checks every `opId` it has seen, so a retry that slips through gets an `ack` and is not applied twice.

## Card ordering

Each card has a `position` string, and a column is sorted by comparing those strings. To put a card between two others, the client makes a new key that sorts between their keys (`keyBetween(prev, next)` in `packages/shared/src/fractional.ts`). A move is then one field on one card. Nothing else in the column gets renumbered, so two people reordering different cards never touch the same rows.

Keys are base-62 digit strings, read as fractions: `"V"` is about 0.5, `"0V"` is about 0.008. There is always a key between any two distinct keys, as long as no key ends in `"0"` (then `"a"` and `"a0"` would be the same number but different strings). The algorithm follows Figma's and David Greenspan's write-ups, but leaves out the integer-part prefix, so a key gets about one character longer every five or six inserts at the same end. That is fine for a kanban column. A long-lived list that people only ever append to would want the prefix, or an occasional rebalance.

Two clients that drop into the same gap at the same moment compute the same key. The server spots that when the second op arrives, moves that card just after the first, and broadcasts the adjusted position. Clients sort ties by card id in the meantime, so everyone at least shows the same order.

## Known limitations / TODO

- Auth is a name and a JWT. There are no passwords, and anyone signed in can open any board. It's enough to tell users apart, not to protect anything.
- The server holds each open board in memory, so it runs as a single process. More than one instance would need sticky routing per board, or a pub/sub layer (Redis, Postgres LISTEN/NOTIFY) in front of the rooms.
- Conflicts are resolved by last write wins, field by field. Two people editing the same card title at once: the later one wins, and nobody is told.
- `BoardEvent` is never pruned.
- While you drag a card across columns, the target column doesn't open a gap for it. The card only lands on drop.
- Columns can't be reordered or deleted from the UI yet, though the op types for creating and renaming them exist.
- Cursor positions are scaled to the board's size, so they are only approximately right for people whose windows are a different size.
