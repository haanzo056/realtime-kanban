import { z } from 'zod';
import {
  boardSnapshotSchema,
  cardSchema,
  idSchema,
  positionSchema,
  presenceUserSchema,
} from './schemas.js';

export const opSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('card.create'),
    card: cardSchema,
  }),
  z.object({
    type: z.literal('card.move'),
    id: idSchema,
    columnId: idSchema,
    position: positionSchema,
  }),
  z.object({
    type: z.literal('card.update'),
    id: idSchema,
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
  }),
  z.object({
    type: z.literal('card.delete'),
    id: idSchema,
  }),
  z.object({
    type: z.literal('column.create'),
    id: idSchema,
    title: z.string().min(1).max(80),
    position: positionSchema,
  }),
  z.object({
    type: z.literal('column.rename'),
    id: idSchema,
    title: z.string().min(1).max(80),
  }),
]);

export type Op = z.infer<typeof opSchema>;
export type OpType = Op['type'];

export const appliedEventSchema = z.object({
  revision: z.number().int().positive(),
  opId: z.string(),
  actorId: idSchema,
  op: opSchema,
});

export type AppliedEvent = z.infer<typeof appliedEventSchema>;

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    boardId: idSchema,
    sinceRevision: z.number().int().nonnegative().optional(),
  }),
  z.object({
    t: z.literal('op'),
    opId: z.string().min(1).max(64),
    op: opSchema,
  }),
  z.object({
    t: z.literal('cursor'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  z.object({ t: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('snapshot'), board: boardSnapshotSchema }),
  z.object({ t: z.literal('events'), events: z.array(appliedEventSchema) }),
  z.object({ t: z.literal('ack'), opId: z.string(), revision: z.number().int() }),
  z.object({ t: z.literal('reject'), opId: z.string(), reason: z.string() }),
  z.object({ t: z.literal('presence'), users: z.array(presenceUserSchema) }),
  z.object({
    t: z.literal('cursor'),
    connectionId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({ t: z.literal('error'), message: z.string() }),
  z.object({ t: z.literal('pong') }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const result = serverMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
