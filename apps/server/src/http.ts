import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { keysBetween } from '@kanban/shared';
import { bearerToken, signToken, verifyToken, type AuthUser } from './auth.js';
import type { Config } from './config.js';
import { log } from './log.js';
import type { BoardStore } from './store.js';

const loginSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[\w .-]+$/, 'letters, digits, spaces, . _ - only'),
});

const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

const DEFAULT_COLUMNS = ['Todo', 'In progress', 'Done'];
const MAX_BODY = 16 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'body too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid json');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createHttpHandler(config: Config, store: BoardStore) {
  function requireUser(req: IncomingMessage): AuthUser {
    const token = bearerToken(req.headers.authorization);
    const user = token ? verifyToken(token, config.JWT_SECRET) : null;
    if (!user) throw new HttpError(401, 'unauthorized');
    return user;
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = `${req.method} ${url.pathname}`;

    if (key === 'GET /health') return send(res, 200, { ok: true });

    if (key === 'POST /auth/login') {
      // FIXME: name-only login, no password. Fine for a demo, not for anything real.
      const body = loginSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? 'bad request');
      const user = await store.upsertUser(body.data.name);
      return send(res, 200, { token: signToken(user, config.JWT_SECRET), user });
    }

    if (key === 'GET /boards') {
      requireUser(req);
      return send(res, 200, { boards: await store.listBoards() });
    }

    if (key === 'POST /boards') {
      const user = requireUser(req);
      const body = createBoardSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, 'title is required');
      const positions = keysBetween(null, null, DEFAULT_COLUMNS.length);
      const columns = DEFAULT_COLUMNS.map((title, i) => ({
        id: randomUUID(),
        title,
        position: positions[i]!,
      }));
      const board = await store.createBoard(user.id, body.data.title, columns);
      return send(res, 201, { board });
    }

    throw new HttpError(404, 'not found');
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('access-control-allow-origin', config.CORS_ORIGIN);
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    try {
      await route(req, res);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      log.error('http handler failed', { url: req.url, err: String(err) });
      send(res, 500, { error: 'internal error' });
    }
  };
}
