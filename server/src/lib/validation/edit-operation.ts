import { z } from "zod";

/**
 * Mirrors the EditOperation union in types/edit-operation.ts. The client
 * generates `id`/`createdAt` (so undo can reference the exact row to
 * delete); the server only validates shape and timestamp sanity here —
 * bounds checking against real video duration belongs to the future
 * Validator Agent (claude.md section 5), not this endpoint.
 */
export const editOperationSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("cut"),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    reason: z.string().max(500).optional(),
    createdAt: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("trim"),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    createdAt: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("split"),
    timestamp: z.number().nonnegative(),
    createdAt: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("caption"),
    text: z.string().max(2000),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    createdAt: z.number(),
  }),
]);
