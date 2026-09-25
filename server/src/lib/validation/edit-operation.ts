import { z } from "zod";
import {
  CARD_MAX_SECONDS,
  CARD_MIN_SECONDS,
  CARD_SUBTITLE_MAX,
  CARD_TEMPLATES,
  CARD_TITLE_MAX,
} from "@/types/edit-operation";

/**
 * Card text is burned in through a generated ASS file: braces and
 * backslashes would be read as override tags, and control characters or
 * newlines would break the event line. The client strips these before
 * sending; the server refuses anything that slips through.
 */
const cardText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[{}\\\u0000-\u001f\u007f]/.test(s), "Card text can't contain braces, backslashes or line breaks.");

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
    groupId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("trim"),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    createdAt: z.number(),
    groupId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("split"),
    timestamp: z.number().nonnegative(),
    title: z.string().trim().max(80).optional(),
    source: z.enum(["manual", "ai", "shot"]).optional(),
    createdAt: z.number(),
    groupId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("card"),
    at: z.number().nonnegative(),
    duration: z.number().min(CARD_MIN_SECONDS).max(CARD_MAX_SECONDS),
    template: z.enum(CARD_TEMPLATES),
    title: cardText(CARD_TITLE_MAX).pipe(z.string().min(1)),
    subtitle: cardText(CARD_SUBTITLE_MAX).optional(),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    createdAt: z.number(),
    groupId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("caption"),
    text: z.string().max(2000),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    createdAt: z.number(),
    groupId: z.string().min(1).max(100).optional(),
  }),
]);
