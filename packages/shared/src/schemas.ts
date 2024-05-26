import { z } from 'zod';

export const idSchema = z.string().min(1).max(64);

// Position keys are opaque base-62 strings produced by keyBetween().
export const positionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[0-9A-Za-z]*[1-9A-Za-z]$/, 'invalid position key');

export const cardSchema = z.object({
  id: idSchema,
  columnId: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  position: positionSchema,
});

export const columnSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(80),
  position: positionSchema,
});

export const boardSnapshotSchema = z.object({
  id: idSchema,
  title: z.string(),
  revision: z.number().int().nonnegative(),
  columns: z.array(columnSchema),
  cards: z.array(cardSchema),
});

export const presenceUserSchema = z.object({
  connectionId: z.string(),
  userId: idSchema,
  name: z.string(),
  color: z.string(),
});

export type Card = z.infer<typeof cardSchema>;
export type Column = z.infer<typeof columnSchema>;
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type PresenceUser = z.infer<typeof presenceUserSchema>;
